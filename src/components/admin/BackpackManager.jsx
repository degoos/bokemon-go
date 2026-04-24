import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { ITEM_DETAILS, INVENTORY_ITEM_KEYS } from '../../lib/itemDetails'
import TeamEmoji from '../TeamEmoji'

// ─────────────────────────────────────────────────────────────
// BackpackManager — admin-UI voor item-inventaris per team
//
// Spiegelt het patroon van de admin-Pokédex:
//  - Overzicht per team (emoji + aantal)
//  - Uitklap → volledige item-editor
//  - Elk item klikbaar om info-uitleg open te klappen (zelfde
//    dropdown-stijl als in speler-rugzak)
//  - +/− knoppen per item met directe DB-update
//  - 🗑️-knop om een item volledig uit team_inventory te verwijderen
//  - Notificatie naar team bij elke wijziging
//
// Realtime: eigen state + supabase-sub op team_inventory —
// zodat wijzigingen live zichtbaar zijn ook als een speler in de
// app iets gebruikt of HQ-loot binnenkomt.
// ─────────────────────────────────────────────────────────────

export default function BackpackManager({ sessionId, teams }) {
  const [inventory, setInventory] = useState([])
  const [itemDefs, setItemDefs] = useState([])
  const [expandedTeam, setExpandedTeam] = useState(null) // team-id of null
  const [expandedItem, setExpandedItem] = useState(null) // `${teamId}:${key}` of null
  const [busyKey, setBusyKey] = useState(null)

  // Itemdefinities (emoji + naam) ophalen
  useEffect(() => {
    supabase.from('item_definitions').select('*').then(({ data }) => {
      if (data) setItemDefs(data)
    })
  }, [])

  // Inventaris + realtime sub
  useEffect(() => {
    if (!sessionId) return
    async function load() {
      const { data } = await supabase
        .from('team_inventory')
        .select('*')
        .eq('game_session_id', sessionId)
      setInventory(data || [])
    }
    load()
    const ch = supabase.channel(`admin-backpack-${sessionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_inventory',
        filter: `game_session_id=eq.${sessionId}`,
      }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sessionId])

  // Helpers
  function qtyFor(teamId, key) {
    return inventory.find(i => i.team_id === teamId && i.item_key === key)?.quantity || 0
  }

  function itemMeta(key) {
    const fromDb = itemDefs.find(d => d.key === key)
    const details = ITEM_DETAILS[key] || {}
    return {
      emoji: fromDb?.emoji || details.emoji || '⭐',
      name:  fromDb?.name  || details.name  || key,
      description: fromDb?.description || details.short || '',
      details,
    }
  }

  async function sendNotice(teamId, title, message, emoji = '🎁', kind = 'info') {
    await supabase.from('notifications').insert({
      game_session_id: sessionId,
      title, message,
      type: kind, emoji,
      target_team_id: teamId,
    })
  }

  // +1
  async function addOne(teamId, key) {
    const team = teams.find(t => t.id === teamId)
    const meta = itemMeta(key)
    setBusyKey(`${teamId}:${key}`)
    const { data: existing } = await supabase.from('team_inventory')
      .select('*').eq('game_session_id', sessionId)
      .eq('team_id', teamId).eq('item_key', key).maybeSingle()
    if (existing) {
      await supabase.from('team_inventory').update({
        quantity: (existing.quantity || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('team_inventory').insert({
        game_session_id: sessionId, team_id: teamId, item_key: key, quantity: 1,
      })
    }
    await sendNotice(teamId,
      `🎁 ${meta.emoji} ${meta.name} ontvangen`,
      `Team Rocket heeft ${meta.name} aan ${team?.name || 'jullie'} toegevoegd.`,
      meta.emoji, 'success',
    )
    setBusyKey(null)
  }

  // -1
  async function removeOne(teamId, key) {
    const team = teams.find(t => t.id === teamId)
    const meta = itemMeta(key)
    setBusyKey(`${teamId}:${key}`)
    const { data: existing } = await supabase.from('team_inventory')
      .select('*').eq('game_session_id', sessionId)
      .eq('team_id', teamId).eq('item_key', key).maybeSingle()
    if (existing) {
      const newQty = Math.max(0, (existing.quantity || 0) - 1)
      if (newQty === 0) {
        await supabase.from('team_inventory').delete().eq('id', existing.id)
      } else {
        await supabase.from('team_inventory').update({
          quantity: newQty, updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      }
      await sendNotice(teamId,
        `🗑️ ${meta.emoji} ${meta.name} verwijderd`,
        `Team Rocket heeft 1× ${meta.name} uit ${team?.name || 'jullie rugzak'} weggenomen.`,
        meta.emoji, 'warning',
      )
    }
    setBusyKey(null)
  }

  // Volledige rij wissen (alle kwantiteit van dit item)
  async function wipeItem(teamId, key) {
    const team = teams.find(t => t.id === teamId)
    const meta = itemMeta(key)
    const current = qtyFor(teamId, key)
    if (current === 0) return
    if (!window.confirm(`Alle ${current}× ${meta.name} uit ${team?.name} verwijderen?`)) return
    setBusyKey(`${teamId}:${key}`)
    await supabase.from('team_inventory')
      .delete()
      .eq('game_session_id', sessionId)
      .eq('team_id', teamId)
      .eq('item_key', key)
    await sendNotice(teamId,
      `🗑️ ${meta.emoji} ${meta.name} geconfisqueerd`,
      `Team Rocket heeft alle ${meta.name} uit ${team?.name || 'jullie rugzak'} weggenomen.`,
      meta.emoji, 'danger',
    )
    setBusyKey(null)
  }

  // ── Render ───────────────────────────────────────────────
  if (teams.length === 0) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>🎒 Rugzak per team</h3>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>Geen teams in sessie.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 12 }}>🎒 Rugzak per team</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {teams.map(t => {
          const ownedEntries = INVENTORY_ITEM_KEYS
            .map(k => ({ key: k, qty: qtyFor(t.id, k) }))
            .filter(e => e.qty > 0)
          const totalItems = ownedEntries.reduce((s, e) => s + e.qty, 0)
          const isOpen = expandedTeam === t.id

          return (
            <div
              key={t.id}
              style={{
                border: `1px solid ${t.color}44`,
                borderLeft: `3px solid ${t.color}`,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {/* Kop — klikbaar om uit te klappen */}
              <button
                onClick={() => setExpandedTeam(isOpen ? null : t.id)}
                style={{
                  width: '100%', background: 'none', border: 'none', color: 'var(--text)',
                  padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14, color: t.color }}>
                  <TeamEmoji emoji={t.emoji} /> {t.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {ownedEntries.length} {ownedEntries.length === 1 ? 'soort' : 'soorten'} · {totalItems} items
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 11, color: t.color, fontWeight: 700 }}>
                  {isOpen ? 'Inklappen ▲' : 'Beheer →'}
                </div>
              </button>

              {/* Preview chips wanneer ingeklapt */}
              {!isOpen && ownedEntries.length > 0 && (
                <div style={{ padding: '0 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ownedEntries.map(e => {
                    const meta = itemMeta(e.key)
                    return (
                      <span key={e.key} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 8px', borderRadius: 99,
                        background: 'var(--bg3)', border: '1px solid var(--border)',
                        fontSize: 12,
                      }}>
                        <span style={{ fontSize: 14 }}>{meta.emoji}</span>
                        <span style={{ fontWeight: 600 }}>{meta.name}</span>
                        <span style={{ color: 'var(--warning)', fontWeight: 800 }}>×{e.qty}</span>
                      </span>
                    )
                  })}
                </div>
              )}
              {!isOpen && ownedEntries.length === 0 && (
                <div style={{ padding: '0 12px 10px', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
                  Rugzak leeg
                </div>
              )}

              {/* Uitgeklapte editor */}
              {isOpen && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {INVENTORY_ITEM_KEYS.map(key => {
                      const q = qtyFor(t.id, key)
                      const meta = itemMeta(key)
                      const itemExpanded = expandedItem === `${t.id}:${key}`
                      const busy = busyKey === `${t.id}:${key}`
                      const phase = phaseLabel(meta.details.phase)

                      return (
                        <div
                          key={key}
                          style={{
                            background: 'var(--bg3)',
                            border: q > 0 ? `1px solid ${t.color}77` : '1px solid var(--border)',
                            borderRadius: 8, overflow: 'hidden',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                            {/* Info-toggle */}
                            <button
                              onClick={() => setExpandedItem(itemExpanded ? null : `${t.id}:${key}`)}
                              title={itemExpanded ? 'Info inklappen' : 'Info tonen'}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text)', flex: 1, textAlign: 'left', padding: 0,
                              }}
                            >
                              <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{meta.name}</span>
                              {phase && (
                                <span style={{
                                  fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                                  background: phase.bg, color: phase.fg,
                                  padding: '1px 6px', borderRadius: 99,
                                }}>{phase.label}</span>
                              )}
                              <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 'auto' }}>
                                {itemExpanded ? '▲' : 'ℹ️'}
                              </span>
                            </button>

                            {/* +/- controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button
                                onClick={() => removeOne(t.id, key)}
                                disabled={q <= 0 || busy}
                                style={{
                                  width: 26, height: 26, padding: 0, borderRadius: 6, border: 'none',
                                  background: q > 0 ? 'var(--bg2)' : '#2a2a3a',
                                  color: q > 0 ? 'var(--text)' : 'var(--text2)',
                                  cursor: q > 0 ? 'pointer' : 'default',
                                  fontWeight: 800, fontSize: 14,
                                }}
                              >−</button>
                              <span style={{
                                minWidth: 24, textAlign: 'center', fontWeight: 900, fontSize: 14,
                                color: q > 0 ? 'var(--warning)' : 'var(--text2)',
                              }}>{q}</span>
                              <button
                                onClick={() => addOne(t.id, key)}
                                disabled={busy}
                                style={{
                                  width: 26, height: 26, padding: 0, borderRadius: 6, border: 'none',
                                  background: 'var(--bg2)', color: 'var(--text)',
                                  cursor: 'pointer', fontWeight: 800, fontSize: 14,
                                }}
                              >+</button>
                              <button
                                onClick={() => wipeItem(t.id, key)}
                                disabled={q <= 0 || busy}
                                title="Alle instanties verwijderen"
                                style={{
                                  width: 26, height: 26, padding: 0, borderRadius: 6,
                                  border: '1px solid rgba(239,68,68,0.4)',
                                  background: q > 0 ? 'rgba(239,68,68,0.12)' : 'transparent',
                                  color: q > 0 ? '#ef4444' : 'var(--text2)',
                                  cursor: q > 0 ? 'pointer' : 'default',
                                  fontSize: 12,
                                }}
                              >🗑️</button>
                            </div>
                          </div>

                          {/* Uitleg-dropdown */}
                          {itemExpanded && (
                            <div style={{
                              padding: '2px 10px 10px',
                              borderTop: '1px solid var(--border)',
                              background: 'rgba(0,0,0,0.18)',
                              fontSize: 12, lineHeight: 1.5, color: 'var(--text)',
                            }}>
                              {meta.details.what && (
                                <AdminInfoRow icon="🎯" label="Wat doet het?" text={meta.details.what} />
                              )}
                              {meta.details.when && (
                                <AdminInfoRow icon="⏰" label="Wanneer inzetten?" text={meta.details.when} />
                              )}
                              {meta.details.effect && (
                                <AdminInfoRow icon="✨" label="Effect" text={meta.details.effect} />
                              )}
                              {meta.details.note && (
                                <AdminInfoRow icon="ℹ️" label="Let op" text={meta.details.note} />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function phaseLabel(phase) {
  const map = {
    collecting: { bg: '#14350f', fg: '#86efac', label: 'VERZAMEL' },
    training:   { bg: '#1c2e1a', fg: '#86efac', label: 'TRAINING' },
    tournament: { bg: '#2d1a0e', fg: '#fbbf24', label: 'TOERNOOI' },
    both:       { bg: '#1e1e3a', fg: '#c7d2fe', label: 'ALTIJD'   },
  }
  return map[phase] || null
}

function AdminInfoRow({ icon, label, text }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <div style={{ flexShrink: 0, width: 18, fontSize: 14 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 1 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text)' }}>{text}</div>
      </div>
    </div>
  )
}
