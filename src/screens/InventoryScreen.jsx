import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

export default function InventoryScreen({ catches, inventory, effects, teams, player, team, sessionId, onClose }) {
  const [tab, setTab] = useState('pokemon') // pokemon | items
  const [evolving, setEvolving] = useState(null)

  const myCatches = catches.filter(c => c.team_id === team?.id)
  const myItems = inventory.filter(i => i.team_id === team?.id)

  async function handleEvolve(catchItem) {
    if (!catchItem) return
    const pokemon = catchItem.pokemon_definitions
    const chain = pokemon?.evolution_chain || []
    if (catchItem.evolution_stage >= chain.length - 1) return

    setEvolving(catchItem.id)
    await supabase.from('catches').update({
      evolution_stage: catchItem.evolution_stage + 1,
    }).eq('id', catchItem.id)

    await supabase.from('evolution_log').insert({
      game_session_id: sessionId,
      catch_id: catchItem.id,
      team_id: team.id,
      from_stage: catchItem.evolution_stage,
      to_stage: catchItem.evolution_stage + 1,
      used_rare_candy: false,
    })

    setEvolving(null)
  }

  async function useItem(item) {
    // Simpele item-activatie — Moonstone als voorbeeld
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

      // Notificeer tegenstander
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
        <button
          onClick={() => setTab('pokemon')}
          style={{
            flex: 1, padding: '12px 0', background: 'none', border: 'none',
            color: tab === 'pokemon' ? 'var(--accent)' : 'var(--text2)',
            fontWeight: 700, fontSize: 14,
            borderBottom: tab === 'pokemon' ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          ⚡ Bokémon ({myCatches.length})
        </button>
        <button
          onClick={() => setTab('items')}
          style={{
            flex: 1, padding: '12px 0', background: 'none', border: 'none',
            color: tab === 'items' ? 'var(--accent)' : 'var(--text2)',
            fontWeight: 700, fontSize: 14,
            borderBottom: tab === 'items' ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
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
              const chain = p.evolution_chain || []
              const currentName = chain[c.evolution_stage] || p.name
              const canEvolve = c.evolution_stage < chain.length - 1
              const typeInfo = POKEMON_TYPES[p.pokemon_type] || {}
              return (
                <div key={c.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 40, filter: c.is_shiny ? 'drop-shadow(0 0 6px gold)' : 'none' }}>
                    {c.is_mystery && !c.mystery_revealed ? '❓' : p.sprite_emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>{currentName}</span>
                      {c.is_shiny && <span style={{ color: 'gold', fontSize: 12 }}>✨</span>}
                      <span className={`badge badge-${p.pokemon_type}`}>{typeInfo.emoji}</span>
                    </div>
                    <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 18 }}>{c.cp} CP</div>
                    <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>
                      Evolutie: {chain.map((n, i) => (
                        <span key={i} style={{ color: i === c.evolution_stage ? 'var(--text)' : 'var(--border)', fontWeight: i === c.evolution_stage ? 700 : 400 }}>
                          {i > 0 ? ' → ' : ''}{n}
                        </span>
                      ))}
                    </div>
                    {canEvolve && (
                      <div style={{ marginTop: 8 }}>
                        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                          🍺 Drink {p.linked_beer} als team om te evolueren
                        </p>
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => handleEvolve(c)}
                          disabled={evolving === c.id}
                          style={{ width: 'auto', padding: '8px 16px' }}
                        >
                          {evolving === c.id ? '⏳' : '⬆️ Evolueer'}
                        </button>
                      </div>
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
