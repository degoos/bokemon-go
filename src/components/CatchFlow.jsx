import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'
import ChallengeCard from './ChallengeCard'

// NIET session.admin_confirm_timeout_seconds gebruiken (default=15, bedoeld voor iets anders)
const AUTO_ASSIGN_SECONDS = 60

const POKEBALL_CSS = `
@keyframes pokeball-shake {
  0%,100%{transform:rotate(0deg) scale(1)}
  10%{transform:rotate(-12deg) scale(1.06)}
  20%{transform:rotate(10deg) scale(1.06)}
  30%{transform:rotate(-8deg) scale(1.04)}
  40%{transform:rotate(6deg) scale(1.04)}
  50%{transform:rotate(-4deg)}
  60%{transform:rotate(3deg)}
  70%{transform:rotate(-2deg)}
  85%{transform:rotate(1deg)}
}
.pokeball-anim { animation: pokeball-shake 0.9s ease-in-out infinite; display:inline-block; }
`

export default function CatchFlow({ spawn, player, team, teams = [], session, onClose, onCaught }) {
  const [phase, setPhase]             = useState('arriving')
  const [waitSeconds, setWaitSeconds] = useState(session?.catch_wait_seconds || 90)
  const [opdrachtType, setOpdrachtType] = useState(null)
  const [opdracht, setOpdracht]       = useState(null)
  const [resolvedData, setResolvedData] = useState({})
  const [result, setResult]           = useState(null)
  const [arriving, setArriving]       = useState(false)
  const [pendingSeconds, setPendingSeconds] = useState(0)
  const [battleIntro, setBattleIntro] = useState(false)
  const [pokeballDone, setPokeballDone] = useState(false)

  // Team 1 is er al wanneer wij (team 2) de CatchFlow openen → urgency countdown
  const team1AlreadyThere = !!spawn?.catch_team1_arrived_at && !spawn?.active_opdracht_type
  const [urgentSeconds, setUrgentSeconds] = useState(() => {
    if (!spawn?.catch_team1_arrived_at || spawn?.active_opdracht_type) return null
    const elapsed = Math.floor((Date.now() - new Date(spawn.catch_team1_arrived_at).getTime()) / 1000)
    return Math.max(0, (session?.catch_wait_seconds || 90) - elapsed)
  })

  // ── Refs: altijd actuele waarde in realtime-closure ──────────
  const phaseRef        = useRef('arriving')
  const opdrachtTypeRef = useRef(null)
  const autoAssignedRef = useRef(false)
  phaseRef.current        = phase
  opdrachtTypeRef.current = opdrachtType

  const pokemon = spawn?.pokemon_definitions

  // ── Urgency countdown (team 2 die laat aankomt) ──────────────
  useEffect(() => {
    if (phase !== 'arriving' || urgentSeconds === null || urgentSeconds <= 0) return
    const t = setTimeout(() => setUrgentSeconds(s => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(t)
  }, [phase, urgentSeconds])

  // ── Pokéball animatie → succes na 2.5s ──────────────────────
  useEffect(() => {
    if (result !== 'won') return
    const t = setTimeout(() => setPokeballDone(true), 2500)
    return () => clearTimeout(t)
  }, [result])

  // ── Wachttimer (eerste team wacht op team 2) ─────────────────
  useEffect(() => {
    if (phase !== 'waiting') return
    if (waitSeconds <= 0) {
      supabase.from('active_spawns')
        .update({ active_opdracht_type: 1 })
        .eq('id', spawn.id)
        .is('active_opdracht_type', null)
        .then(() => {})
      setOpdrachtType(1)
      setPhase('opdracht_pending')
      return
    }
    const t = setTimeout(() => setWaitSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, waitSeconds, spawn.id])

  // ── Pending timer ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'opdracht_pending') return
    const t = setTimeout(() => setPendingSeconds(s => s + 1), 1000)
    return () => clearTimeout(t)
  }, [phase, pendingSeconds])

  // ── Auto-assign als admin niet reageert (slechts 1×) ─────────
  useEffect(() => {
    if (phase !== 'opdracht_pending') return
    if (pendingSeconds < AUTO_ASSIGN_SECONDS) return
    if (autoAssignedRef.current) return
    autoAssignedRef.current = true

    async function autoAssign() {
      const type = opdrachtTypeRef.current || 1
      const { data } = await supabase
        .from('opdracht_definitions').select('*')
        .in('type', type === 2 ? [2, 3] : [1, 3])
        .eq('is_enabled', true).eq('auto_assignable', true)
      if (!data || !data.length) return
      const chosen = data[Math.floor(Math.random() * data.length)]
      const autoResolved = {}
      for (const v of chosen.variabelen || []) {
        if (v.type === 'kwantitatief') autoResolved[v.naam] = v.default
        else if (['random_lijst', 'keuze'].includes(v.type))
          autoResolved[v.naam] = v.opties[Math.floor(Math.random() * v.opties.length)]
      }
      await supabase.from('active_spawns').update({
        opdracht_id: chosen.id,
        opdracht_resolved_data: { ...autoResolved, drinks_loser: chosen.drinks_loser },
        challenge_auto_assigned: true,
        challenge_assigned_at: new Date().toISOString(),
      }).eq('id', spawn.id)
    }
    autoAssign()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSeconds])

  // ── Laad opdracht ─────────────────────────────────────────────
  async function loadOpdracht(spawnData) {
    const opId = spawnData.opdracht_id
    const resolved = spawnData.opdracht_resolved_data || {}
    const type = spawnData.active_opdracht_type || opdrachtTypeRef.current || 1
    if (!opId) return
    const { data } = await supabase.from('opdracht_definitions').select('*').eq('id', opId).single()
    if (data) {
      setOpdracht(data)
      setResolvedData(resolved)
      setOpdrachtType(type)
      setPhase('opdracht')
    }
  }

  // ── Realtime: luister naar updates van spawn ──────────────────
  useEffect(() => {
    if (!spawn?.id) return

    if (spawn.opdracht_id && spawn.active_opdracht_type) loadOpdracht(spawn)

    const ch = supabase.channel(`catch-${spawn.id}-${team?.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'active_spawns',
        filter: `id=eq.${spawn.id}`,
      }, (payload) => {
        const updated = payload.new

        if (updated.status === 'caught') {
          setResult(updated.caught_by_team_id === team?.id ? 'won' : 'lost')
          setPhase('result')
          return
        }

        // T2T-upgrade (ook vanuit opdracht_pending)
        if (updated.active_opdracht_type === 2 &&
            (phaseRef.current === 'waiting' || phaseRef.current === 'opdracht_pending') &&
            opdrachtTypeRef.current !== 2) {
          setOpdrachtType(2)
          if (phaseRef.current === 'waiting') setPhase('opdracht_pending')
          autoAssignedRef.current = false
        }

        // Admin koppelt opdracht → ALLEEN laden als we al in opdracht_pending zitten
        // NIET in 'waiting' fase: dat zou de challenge tonen vóór de timer afloopt
        if (updated.opdracht_id && phaseRef.current === 'opdracht_pending') {
          loadOpdracht(updated)
        }
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawn?.id, team?.id])

  // ── Wij zijn er! ──────────────────────────────────────────────
  async function handleMarkArrived() {
    setArriving(true)
    const now = new Date().toISOString()
    const { data: fresh } = await supabase
      .from('active_spawns')
      .select('catch_team1_arrived_at, active_opdracht_type, opdracht_id, opdracht_resolved_data')
      .eq('id', spawn.id).single()

    if (!fresh) { setArriving(false); return }

    if (fresh.active_opdracht_type) {
      if (fresh.opdracht_id) await loadOpdracht(fresh)
      else { setOpdrachtType(fresh.active_opdracht_type); setPhase('opdracht_pending') }
      setArriving(false); return
    }

    if (!fresh.catch_team1_arrived_at) {
      await supabase.from('active_spawns').update({ catch_team1_arrived_at: now, status: 'catching' }).eq('id', spawn.id)
      // Stuur notificatie naar het andere team zodat zij weten dat ze zich moeten haasten
      const waitSec = session?.catch_wait_seconds || 90
      const otherTeam = teams.find(t => t.id !== team.id)
      if (otherTeam) {
        await supabase.from('notifications').insert({
          game_session_id: spawn.game_session_id,
          target_team_id: otherTeam.id,
          title: `⚡ ${team.emoji} ${team.name} gooide een Pokébal!`,
          message: `${pokemon?.name || 'Bokémon'} wordt gevangen! Kom snel — jullie hebben ${waitSec} seconden voor een T2T battle!`,
          type: 'warning', emoji: '🏃',
        })
      }
      setPhase('waiting')
    } else {
      await supabase.from('active_spawns').update({ catch_team2_arrived_at: now, active_opdracht_type: 2 }).eq('id', spawn.id)
      setOpdrachtType(2)
      if (fresh.opdracht_id) await loadOpdracht({ ...fresh, active_opdracht_type: 2 })
      else setPhase('opdracht_pending')
    }
    setArriving(false)
  }

  // ── Opdracht voltooid → vangst vastleggen ─────────────────────
  async function handleCompleteOpdracht() {
    await supabase.from('catches').insert({
      game_session_id: spawn.game_session_id,
      team_id: team.id,
      pokemon_definition_id: spawn.pokemon_definition_id,
      spawn_id: spawn.id, cp: spawn.cp,
      is_shiny: spawn.spawn_type === 'shiny',
      is_mystery: spawn.spawn_type === 'mystery',
    })
    await supabase.from('active_spawns').update({ status: 'caught', caught_by_team_id: team.id }).eq('id', spawn.id)
    await supabase.from('notifications').insert({
      game_session_id: spawn.game_session_id,
      title: `${team.emoji} ${team.name} heeft ${pokemon?.name} gevangen!`,
      message: `CP: ${spawn.cp}${spawn.spawn_type === 'shiny' ? ' ✨ SHINY!' : ''}`,
      type: 'success', emoji: pokemon?.sprite_emoji,
    })
    setResult('won')
    setPhase('result')
    if (onCaught) onCaught()
  }

  async function handleFailOpdracht() {
    setResult('lost')
    setPhase('result')
    if (onClose) onClose()
  }

  if (!pokemon) return null
  const typeInfo = POKEMON_TYPES[pokemon.pokemon_type] || {}

  return (
    <div className={`catch-screen${battleIntro ? ' battle-intro' : ''}`}>
      <style>{POKEBALL_CSS}</style>

      {/* Header */}
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3 style={{ color: 'var(--text)' }}>
          {phase === 'arriving' || phase === 'waiting' ? '🎯 Pokébal gegooid!'
            : phase === 'opdracht_pending' ? '⏳ Opdracht...'
            : phase === 'opdracht' ? '⚡ Opdracht!'
            : '🏁 Resultaat'}
        </h3>
        <div />
      </div>

      {/* Pokémon info */}
      <div className="catch-pokemon-card">
        <div className="emoji" style={{ filter: spawn.spawn_type === 'shiny' ? 'drop-shadow(0 0 12px gold)' : 'none' }}>
          {spawn.spawn_type === 'mystery' ? '❓' : pokemon.sprite_emoji}
        </div>
        {spawn.spawn_type !== 'mystery' && (
          <h2 style={{ marginBottom: 8 }}>{spawn.spawn_type === 'shiny' ? '✨ ' : ''}{pokemon.name}</h2>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <span className={`badge badge-${pokemon.pokemon_type}`}>{typeInfo.emoji} {typeInfo.label}</span>
        </div>
        <div className="cp-big">{spawn.cp} CP</div>
      </div>

      <div className="scroll-area" style={{ paddingTop: 0 }}>

        {/* Fase: aankomen */}
        {phase === 'arriving' && (
          <div className="card" style={{ textAlign: 'center', margin: 16 }}>
            {urgentSeconds !== null ? (
              /* Team 1 is er al — urgency voor team 2 */
              <>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⚡ Het andere team is er al!</div>
                <div style={{
                  fontSize: 52, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                  color: urgentSeconds < 20 ? 'var(--danger)' : 'var(--warning)',
                  marginBottom: 8,
                }}>
                  {urgentSeconds}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                  seconden nog — kom snel! Anders spelen zij solo.
                </p>
                <button className="btn btn-primary" onClick={handleMarkArrived} disabled={arriving} style={{ background: 'var(--danger)' }}>
                  {arriving ? '⏳' : '🏃 Wij zijn er ook!'}
                </button>
              </>
            ) : (
              /* Normaal: eerste team */
              <>
                <p style={{ color: 'var(--text2)', marginBottom: 16 }}>
                  Bevestig dat je team aanwezig is op de locatie
                </p>
                <button className="btn btn-primary" onClick={handleMarkArrived} disabled={arriving}>
                  {arriving ? '⏳ Even wachten...' : '📍 Wij zijn er!'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Fase: wachten op tweede team */}
        {phase === 'waiting' && (
          <div>
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{
                fontSize: 56, fontWeight: 900,
                color: waitSeconds < 15 ? 'var(--danger)' : 'var(--warning)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {waitSeconds}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>seconden</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>⏳ Wachten op het andere team...</p>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                Komen ze op tijd? → ⚔️ Team vs Team!<br />
                Komen ze niet? → 🎯 Solo opdracht.
              </p>
            </div>
          </div>
        )}

        {/* Fase: wachten op opdracht */}
        {phase === 'opdracht_pending' && (
          <div>
            <div style={{
              textAlign: 'center', padding: '20px 16px',
              background: opdrachtType === 2 ? 'rgba(245,158,11,0.12)' : 'rgba(124,58,237,0.12)',
              borderBottom: `2px solid ${opdrachtType === 2 ? 'var(--warning)' : 'var(--accent)'}`,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{opdrachtType === 2 ? '⚔️' : '🎯'}</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
                {opdrachtType === 2 ? 'Team vs Team!' : 'Solo Opdracht'}
              </div>
              {opdrachtType === 2 && (
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>Beide teams aanwezig — beste team wint!</div>
              )}
            </div>
            <div className="card" style={{ textAlign: 'center', margin: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>Opdracht wordt gekozen...</p>
              {pendingSeconds < AUTO_ASSIGN_SECONDS ? (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Automatisch over:</p>
                  <div style={{
                    fontSize: 40, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                    color: AUTO_ASSIGN_SECONDS - pendingSeconds <= 10 ? 'var(--danger)' : 'var(--warning)',
                  }}>
                    {AUTO_ASSIGN_SECONDS - pendingSeconds}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>Opdracht wordt automatisch toegewezen...</p>
              )}
            </div>
          </div>
        )}

        {/* Fase: opdracht actief */}
        {phase === 'opdracht' && (
          opdracht ? (
            <ChallengeCard
              opdracht={opdracht} resolvedData={resolvedData}
              opdrachtType={opdrachtType}
              onComplete={handleCompleteOpdracht} onFail={handleFailOpdracht}
            />
          ) : (
            <div className="card" style={{ textAlign: 'center', margin: 16, color: 'var(--text2)' }}>
              ⏳ Opdracht laden...
            </div>
          )
        )}

        {/* Fase: resultaat */}
        {phase === 'result' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            {result === 'won' && !pokeballDone ? (
              /* Pokébal animatie */
              <>
                <div style={{ fontSize: 88, marginBottom: 16 }} className="pokeball-anim">⚾</div>
                <p style={{ color: 'var(--text2)', fontSize: 14 }}>Pokébal is gegooid...</p>
              </>
            ) : result === 'won' ? (
              /* Succes */
              <>
                <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
                <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>Gevangen!</h2>
                <p style={{ color: 'var(--text2)' }}>{pokemon.name} ({spawn.cp} CP) is toegevoegd aan jullie team!</p>
                {pokemon.linked_beer && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--card)', borderRadius: 12 }}>
                    <p style={{ color: 'var(--text2)', fontSize: 13 }}>Evolutie-bier:</p>
                    <p style={{ fontWeight: 700, fontSize: 16 }}>🍺 {pokemon.linked_beer}</p>
                  </div>
                )}
                <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={onClose}>Terug naar kaart</button>
              </>
            ) : (
              /* Verloren */
              <>
                <div style={{ fontSize: 72, marginBottom: 16 }}>😢</div>
                <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Verloren!</h2>
                <p style={{ color: 'var(--text2)' }}>Het andere team was sneller of beter.</p>
                <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={onClose}>Terug naar kaart</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
