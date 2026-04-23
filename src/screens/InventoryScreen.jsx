import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

export default function InventoryScreen({ catches, inventory, effects, teams, player, team, sessionId, currentPhase, onClose }) {
  const [tab, setTab] = useState('pokemon') // pokemon | items
  const [submitting, setSubmitting] = useState(null)
  const [evoRequests, setEvoRequests] = useState([])

  const isTrainingPhase = currentPhase === 'training'
  const myCatches = catches.filter(c => c.team_id === team?.id)
  const myItems = inventory.filter(i => i.team_id === team?.id)

  // ── Realtime evolution requests ────────────────────────────────
  useEffect(() => {
    if (!sessionId || !team?.id) return
    supabase.from('evolution_requests')
      .select('*')
      .eq('game_session_id', sessionId)
      .eq('team_id', team.id)
      .then(({ data }) => setEvoRequests(data || []))

    const ch = supabase.channel(`inv-evo-${sessionId}-${team.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'evolution_requests',
        filter: `game_session_id=eq.${sessionId}`,
      }, (payload) => {
        setEvoRequests(prev => {
          const idx = prev.findIndex(r => r.id === payload.new?.id)
          if (payload.eventType === 'INSERT') return [payload.new, ...prev]
          if (payload.eventType === 'UPDATE' && idx >= 0) {
            const updated = [...prev]; updated[idx] = payload.new; return updated
          }
          return prev
        })
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sessionId, team?.id])

  function getEvoRequest(catchId) {
    const pending = evoRequests.find(r => r.catch_id === catchId && r.status === 'pending')
    if (pending) return pending
    const recent = evoRequests
      .filter(r => r.catch_id === catchId && r.resolved_at)
      .sort((a, b) => new Date(b.resolved_at) - new Date(a.resolved_at))[0]
    if (recent && Date.now() - new Date(recent.resolved_at).getTime() < 20_000) return recent
    return null
  }

  // ── Bier-evolutie verzoek (admin goedkeuring nodig) ───────────
  async function handleEvolve(catchItem) {
    if (!catchItem || !team || !isTrainingPhase) return
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

  // ── Item gebruiken (Moonstone = tegenstanders volgen) ─────────
  async function useItem(item) {
    if (item.item_key === 'moonstone') {
      await supabase.from('active_effects').insert({
        game_session_id: sessionId,
        team_id: team.id,
        item_key: 'moonstone',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 60 * 1000).toISOString(),
        is_active: true,
      })
      await supabase.from('team_inventory').update({
        quantity: Math.max(0, item.quantity - 1),
      }).eq('id', item.id)

      await supabase.from('notifications').insert({
        game_session_id: sessionId,
        title: '⚠️ Jullie zijn opgejaagd!',
        message: 'Het andere team heeft een Moonstone gebruikt. Pas op!',
        type: 'warning',
        emoji: '🌙',
        target_team_id: teams.find(t => t.id !== team?.id)?.id || null,
      })
    }
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3>🎒 Inventaris</h3>
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>
          {team?.emoji} {team?.name}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setTab('pokemon')} style={{
          flex: 1, padding: '12px 0', background: 'none', border: 'none',
          color: tab === 'pokemon' ? 'var(--accent)' : 'var(--text2)',
          fontWeight: 700, fontSize: 14,
          borderBottom: tab === 'pokemon' ? '2px solid var(--accent)' : '2px solid transparent',
        }}>
          ⚡ Bokémon ({myCatches.length})
        </button>
        <button onClick={() => setTab('items')} style={{
          flex: 1, padding: '12px 0', background: 'none', border: 'none',
          color: tab === 'items' ? 'var(--accent)' : 'var(--text2)',
          fontWeight: 700, fontSize: 14,
          borderBottom: tab === 'items' ? '2px solid var(--accent)' : '2px solid transparent',
        }}>
          🎒 Items ({myItems.filter(i => i.quantity > 0).length})
        </button>
      </div>

      <div className="scroll-area">
        {tab === 'pokemon' && (
          myCatches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
              <p>Nog geen Bokémon gevangen.</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Race naar de volgende spawn op de kaart!</p>
            </div>
          ) : (
            myCatches.map(c => {
              const p = c.pokemon_definitions
              if (!p) return null
              const chain       = p.evolution_chain || []
              const currentName = chain[c.evolution_stage] || p.name
              const nextName    = chain[c.evolution_stage + 1] || null
              const canEvolve   = c.evolution_stage < chain.length - 1
              const typeInfo    = POKEMON_TYPES[p.pokemon_type] || {}
              const req         = getEvoRequest(c.id)
              const isPending   = req?.status === 'pending'
              const isApproved  = req?.status === 'approved'
              const isRejected  = req?.status === 'rejected'
              return (
                <div key={c.id} className="card" style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  borderLeft: isApproved ? '3px solid var(--success)'
                            : isPending  ? '3px solid var(--warning)'
                            : isRejected ? '3px solid var(--danger)'
                            : '3px solid transparent',
                }}>
                  <div style={{ fontSize: 40, filter: c.is_shiny ? 'drop-shadow(0 0 6px gold)' : 'none' }}>
                    {c.is_mystery && !c.mystery_revealed ? '❓' : p.sprite_emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>{currentName}</span>
                      {c.is_shiny && <span style={{ color: 'gold', fontSize: 12 }}>✨</span>}
                      <span className={`badge badge-${p.pokemon_type}`}>{typeInfo.emoji}</span>
                    </div>
                    <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 18 }}>{c.cp} XP</div>
                    <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>
                      {chain.map((n, i) => (
                        <span key={i} style={{ color: i === c.evolution_stage ? 'var(--text)' : 'var(--border)', fontWeight: i === c.evolution_stage ? 700 : 400 }}>
                          {i > 0 ? ' → ' : ''}{n}
                        </span>
                      ))}
                    </div>

                    {canEvolve && (
                      <div style={{ marginTop: 8 }}>
                        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                          🍺 {p.linked_beer}{nextName ? ` → ${nextName}` : ''}
                        </p>
                        {!isTrainingPhase ? (
                          <div style={{ fontSize: 12, color: 'var(--text2)' }}>🔒 Evolueren tijdens trainingsfase</div>
                        ) : isApproved ? (
                          <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 700 }}>✅ Evolutie goedgekeurd!</div>
                        ) : isPending ? (
                          <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 700 }}>⏳ Wacht op Team Rocket…</div>
                        ) : (
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => handleEvolve(c)}
                            disabled={submitting === c.id}
                            style={{ width: 'auto', padding: '8px 16px' }}
                          >
                            {submitting === c.id ? '⏳' : '⬆️ Evolueer'}
                          </button>
                        )}
                        {isRejected && isTrainingPhase && (
                          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>
                            ❌ Geweigerd{req?.admin_note ? `: ${req.admin_note}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                    {!canEvolve && chain.length > 1 && (
                      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>✅ Max evolutie</div>
                    )}
                    {c.shield_active && (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--info)' }}>🛡️ Shield actief</div>
                    )}
                  </div>
                </div>
              )
            })
          )
        )}

        {tab === 'items' && (
          myItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎒</div>
              <p>Geen items in bezit.</p>
            </div>
          ) : (
            <div className="inv-grid">
              {myItems.filter(i => i.quantity > 0).map(item => (
                <button
                  key={item.id}
                  className="inv-card"
                  onClick={() => useItem(item)}
                  style={{ cursor: 'pointer', border: '1px solid var(--border)' }}
                >
                  <div className="item-emoji">{item.item_definitions?.emoji}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, margin: '6px 0 2px' }}>
                    {item.item_definitions?.name}
                  </div>
                  <div className="item-qty">×{item.quantity}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                    {item.item_definitions?.description}
                  </div>
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
