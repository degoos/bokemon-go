import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

/**
 * EvolutionScreen — trainerscreen voor de trainingsfase.
 *
 * Trainers kunnen hun Bokémon op twee manieren laten evolueren:
 *  1. 🌙 Moon Stone inzetten → automatische goedkeuring, geen bier nodig
 *  2. 🍺 Bier drinken → Team Rocket moet bevestigen
 *
 * Dit scherm is alleen actief tijdens de 'training'-fase.
 */
export default function EvolutionScreen({ sessionId, team, catches: catchesProp, inventory, currentPhase, onClose }) {
  const [requests, setRequests]         = useState([])
  const [submitting, setSubmitting]     = useState(null)  // catch id bezig
  const [justEvolved, setJustEvolved]   = useState(new Set())
  // Eigen catches-state zodat we altijd actuele data hebben (prop kan stale zijn)
  const [liveCatches, setLiveCatches]   = useState(catchesProp || [])

  useEffect(() => {
    if (!sessionId || !team?.id) return
    async function loadCatches() {
      const { data } = await supabase
        .from('catches')
        .select('*, pokemon_definitions(*)')
        .eq('game_session_id', sessionId)
        .eq('team_id', team.id)
      if (data) setLiveCatches(data)
    }
    loadCatches()
    const ch = supabase.channel(`evo-catches-${sessionId}-${team.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catches',
        filter: `game_session_id=eq.${sessionId}` }, () => loadCatches())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sessionId, team?.id])

  const isTrainingPhase = currentPhase === 'training'

  // ── Moon Stones in teaminventaris ──────────────────────────────
  const moonStoneItem = (inventory || []).find(
    i => i.team_id === team?.id && i.item_key === 'moonstone' && (i.quantity || 0) > 0
  )
  const moonStoneCount = moonStoneItem?.quantity || 0

  // ── Laad bestaande verzoeken + realtime ───────────────────────
  useEffect(() => {
    if (!sessionId || !team?.id) return

    supabase
      .from('evolution_requests')
      .select('*')
      .eq('game_session_id', sessionId)
      .eq('team_id', team.id)
      .order('requested_at', { ascending: false })
      .then(({ data }) => setRequests(data || []))

    const ch = supabase.channel(`evo-req-${sessionId}-${team.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'evolution_requests',
        filter: `game_session_id=eq.${sessionId}`,
      }, (payload) => {
        setRequests(prev => {
          const idx = prev.findIndex(r => r.id === payload.new?.id)
          if (payload.eventType === 'INSERT') return [payload.new, ...prev]
          if (payload.eventType === 'UPDATE') {
            // Goedkeuringsanimatie
            if (payload.new?.status === 'approved' && payload.old?.status === 'pending') {
              setJustEvolved(s => new Set([...s, payload.new.catch_id]))
              setTimeout(() => setJustEvolved(s => {
                const n = new Set(s); n.delete(payload.new.catch_id); return n
              }), 4000)
            }
            if (idx >= 0) {
              const updated = [...prev]; updated[idx] = payload.new; return updated
            }
            return [payload.new, ...prev]
          }
          return prev
        })
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [sessionId, team?.id])

  // ── Geef huidige request terug voor een catch ─────────────────
  function getRequest(catchId) {
    const pending = requests.find(r => r.catch_id === catchId && r.status === 'pending')
    if (pending) return pending
    // Recent afgehandeld (<30s geleden) ook tonen
    const recent = requests
      .filter(r => r.catch_id === catchId && r.resolved_at)
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))[0]
    if (recent && Date.now() - new Date(recent.resolved_at).getTime() < 30_000) return recent
    return null
  }

  // ── 🌙 Moon Stone evolutie — direct, geen admin nodig ─────────
  async function evolveWithMoonStone(catchItem) {
    if (!catchItem || !team || !moonStoneItem) return
    const chain = catchItem.pokemon_definitions?.evolution_chain || []
    if (catchItem.evolution_stage >= chain.length - 1) return

    setSubmitting(catchItem.id)

    // 1. Evolutiestap direct ophogen
    await supabase.from('catches')
      .update({ evolution_stage: catchItem.evolution_stage + 1 })
      .eq('id', catchItem.id)

    // 2. Moon Stone verbruiken
    await supabase.from('team_inventory')
      .update({ quantity: moonStoneItem.quantity - 1 })
      .eq('id', moonStoneItem.id)

    // 3. Log bijhouden (als evolution_request met auto-approved status)
    await supabase.from('evolution_requests').insert({
      game_session_id:  sessionId,
      catch_id:         catchItem.id,
      team_id:          team.id,
      from_stage:       catchItem.evolution_stage,
      to_stage:         catchItem.evolution_stage + 1,
      used_moon_stone:  true,
      status:           'approved',
      resolved_at:      new Date().toISOString(),
    })

    // 4. Evolutielog
    await supabase.from('evolution_log').insert({
      game_session_id: sessionId,
      catch_id:        catchItem.id,
      team_id:         team.id,
      from_stage:      catchItem.evolution_stage,
      to_stage:        catchItem.evolution_stage + 1,
      used_rare_candy: false,
    })

    // Flash-animatie
    setJustEvolved(s => new Set([...s, catchItem.id]))
    setTimeout(() => setJustEvolved(s => {
      const n = new Set(s); n.delete(catchItem.id); return n
    }), 4000)

    setSubmitting(null)
  }

  // ── 🍺 Bier evolutie — verzoek insturen, wacht op admin ───────
  async function requestBeerEvolution(catchItem) {
    if (!catchItem || !team) return
    const chain = catchItem.pokemon_definitions?.evolution_chain || []
    if (catchItem.evolution_stage >= chain.length - 1) return

    setSubmitting(catchItem.id)
    await supabase.from('evolution_requests').insert({
      game_session_id: sessionId,
      catch_id:        catchItem.id,
      team_id:         team.id,
      from_stage:      catchItem.evolution_stage,
      to_stage:        catchItem.evolution_stage + 1,
      used_moon_stone: false,
      status:          'pending',
    })
    setSubmitting(null)
  }

  // ── Pokémon sorteren: eerst evolutie-kandidaten ───────────────
  const myCatches = (liveCatches || [])
    .filter(c => c.team_id === team?.id)
    .sort((a, b) => {
      const aEvo = canEvolve(a), bEvo = canEvolve(b)
      if (aEvo && !bEvo) return -1
      if (!aEvo && bEvo) return 1
      return (b.cp || 0) - (a.cp || 0)
    })

  function canEvolve(c) {
    const chain = c.pokemon_definitions?.evolution_chain || []
    return c.evolution_stage < chain.length - 1
  }

  const canEvolveCount = myCatches.filter(canEvolve).length

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="screen">
      {/* Topbar */}
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3 style={{ color: 'var(--text)' }}>🌿 Trainingsfase</h3>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {canEvolveCount > 0
            ? <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{canEvolveCount} kunnen evolueren</span>
            : <span style={{ color: 'var(--success)', fontWeight: 700 }}>Volledig getraind</span>
          }
        </div>
      </div>

      <div className="scroll-area">

        {/* Niet-trainingsfase melding */}
        {!isTrainingPhase && (
          <div className="card" style={{ background: 'rgba(239,68,68,0.1)', borderLeft: '4px solid var(--danger)' }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>⏳ Wacht op trainingsfase</div>
            <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
              Evolueren is alleen mogelijk tijdens de trainingsfase. Team Rocket start deze na de verzamelfase.
            </p>
          </div>
        )}

        {/* Uitleg */}
        {isTrainingPhase && (
          <div className="card" style={{ background: 'var(--bg3)', borderLeft: '4px solid #166534' }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>🌿 Hoe evolueren?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>🍺</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Bier drinken</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Drink het bijhorende bier als team. Druk op Evolueer. Team Rocket bevestigt dat jullie echt gedronken hebben.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>🌙</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Moon Stone {moonStoneCount > 0 ? `(${moonStoneCount}×)` : '(0 — geen in bezit)'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Gebruik een Moon Stone voor directe evolutie zonder bier. Automatisch goedgekeurd.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Leeg */}
        {myCatches.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
            <p>Geen Bokémon in jullie team.</p>
          </div>
        )}

        {/* Pokémon lijst */}
        {myCatches.map(c => {
          const def      = c.pokemon_definitions
          if (!def) return null
          const chain    = def.evolution_chain || []
          const typeInfo = POKEMON_TYPES[def.pokemon_type] || {}
          const curName  = chain[c.evolution_stage] || def.name
          const nextName = chain[c.evolution_stage + 1] || null
          const atMax    = c.evolution_stage >= chain.length - 1
          const req      = getRequest(c.id)
          const isPending  = req?.status === 'pending'
          const isApproved = req?.status === 'approved' || justEvolved.has(c.id)
          const isRejected = req?.status === 'rejected'
          const isSubmitting = submitting === c.id

          return (
            <div
              key={c.id}
              className="card"
              style={{
                borderLeft: isApproved   ? '4px solid var(--success)'
                          : isPending    ? '4px solid var(--warning)'
                          : isRejected   ? '4px solid var(--danger)'
                          : atMax        ? '4px solid var(--border)'
                          : isTrainingPhase ? '4px solid #166534'
                          : '4px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Sprite */}
                <div style={{ fontSize: 42, flexShrink: 0, filter: c.is_shiny ? 'drop-shadow(0 0 8px gold)' : 'none' }}>
                  {def.sprite_emoji}
                  {c.is_shiny && <span style={{ fontSize: 14, marginLeft: 2 }}>✨</span>}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Naam + type + XP */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{curName}</span>
                    <span className={`badge badge-${def.pokemon_type}`}>{typeInfo.emoji}</span>
                    <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 14 }}>{c.cp} XP</span>
                  </div>

                  {/* Evolutieketen */}
                  {chain.length > 1 && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                      {chain.map((name, i) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {i > 0 && <span style={{ color: 'var(--border)' }}>→</span>}
                          <span style={{
                            fontWeight: i === c.evolution_stage ? 800 : 400,
                            color: i < c.evolution_stage  ? 'var(--success)'
                                 : i === c.evolution_stage ? 'var(--text)'
                                 : 'var(--text2)',
                          }}>
                            {i < c.evolution_stage ? '✓ ' : ''}{name}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bier-label */}
                  {!atMax && def.linked_beer && (
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
                      🍺 <strong style={{ color: 'var(--text)' }}>{def.linked_beer}</strong>
                      {nextName && <span style={{ color: 'var(--text2)' }}> → {nextName}</span>}
                    </div>
                  )}

                  {/* Actiezone */}
                  {!atMax && isTrainingPhase && (
                    <>
                      {isApproved ? (
                        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.15)', color: 'var(--success)', fontWeight: 700, fontSize: 14 }}>
                          ✅ Geëvolueerd naar {nextName || chain[c.evolution_stage + 1]}!
                        </div>
                      ) : isPending ? (
                        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(234,179,8,0.12)', color: 'var(--warning)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>⏳</span> Wacht op bevestiging van Team Rocket…
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {/* Bier-knop */}
                          <button
                            className="btn btn-warning btn-sm"
                            disabled={isSubmitting}
                            onClick={() => requestBeerEvolution(c)}
                            style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
                          >
                            {isSubmitting ? '⏳' : `🍺 Evolueer via ${def.linked_beer}`}
                          </button>
                          {/* Moon Stone knop */}
                          {moonStoneCount > 0 && (
                            <button
                              className="btn btn-sm"
                              style={{ width: '100%', padding: '10px 0', fontSize: 14, background: '#1e293b', border: '1px solid #475569', color: '#94a3b8' }}
                              disabled={isSubmitting}
                              onClick={() => evolveWithMoonStone(c)}
                            >
                              🌙 Moon Stone gebruiken ({moonStoneCount}×)
                            </button>
                          )}
                          {isRejected && (
                            <div style={{ fontSize: 12, color: 'var(--danger)', padding: '4px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)' }}>
                              ❌ Geweigerd{req?.admin_note ? `: ${req.admin_note}` : ' — probeer opnieuw'}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Niet in trainingsfase maar kan nog evolueren */}
                  {!atMax && !isTrainingPhase && (
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      🔒 Evolueren mogelijk tijdens trainingsfase
                    </div>
                  )}

                  {/* Max evolutie */}
                  {atMax && chain.length > 1 && (
                    <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>
                      ✅ Maximale evolutie bereikt
                    </div>
                  )}

                  {c.shield_active && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--info)' }}>🛡️ Shield actief</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
