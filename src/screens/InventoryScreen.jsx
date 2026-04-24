import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ITEM_DETAILS } from '../lib/itemDetails'
import TeamEmoji from '../components/TeamEmoji'

// ─────────────────────────────────────────────────────────────
// InventoryScreen — "Rugzak" — toont uitsluitend items (Bokémon
// zitten in de Pokédex). Elke item-kaart is uitklapbaar met
// gedetailleerde uitleg (waarvoor dient 't, wanneer, hoe lang…).
//
// Item-flows (mode):
//  - moon_stone   → info_only (gebruik in EvolutionScreen)
//  - silph_scope  → confirm → activate active_effect (X min) + notify enemy
//  - protect      → kies eigen Bokémon → shield_active=true
//  - double_team  → kies teamgenoot → fake locatie genereren (active_effect)
//  - snatch       → kies Bokémon van tegenstander → direct gestolen
//  - mirror_coat  → toggle 'gereserveerd' (active_effect, verbruikt door StealFlow)
//  - pickup       → roll 3 random items → toevoegen aan inventory
//  - poke_lure    → confirm → kaart toont Lure-modus (3 min)
//  - pokemon_egg  → info_only (recepten in Pokédex)
//  - master_ball  → confirm → markeer "next_catch_auto" (active_effect)
//
// Patroon: eigen LIVE state via realtime sub (stale-prop pattern)
// ─────────────────────────────────────────────────────────────

// Welke items kunnen via Pickup uitkomen + relatieve gewichten (admin-tweakbaar later)
const PICKUP_POOL = [
  { key: 'silph_scope', weight: 10 },
  { key: 'protect',     weight: 15 },
  { key: 'double_team', weight: 10 },
  { key: 'snatch',      weight:  6 },
  { key: 'mirror_coat', weight:  8 },
  { key: 'poke_lure',   weight:  8 },
  { key: 'moon_stone',  weight:  4 },
  // 'master_ball' bewust uitgesloten — alleen via challenge te krijgen
]

function pickupRoll(n = 3) {
  const total = PICKUP_POOL.reduce((s, x) => s + x.weight, 0)
  const result = []
  for (let i = 0; i < n; i++) {
    let r = Math.random() * total
    for (const item of PICKUP_POOL) {
      r -= item.weight
      if (r <= 0) { result.push(item.key); break }
    }
  }
  return result
}

// Random klein offset voor decoy-locatie (Double Team)
function offsetLatLng(lat, lng, meters = 80) {
  const dLat = (Math.random() - 0.5) * (meters / 111000) * 2
  const dLng = (Math.random() - 0.5) * (meters / (111000 * Math.cos(lat * Math.PI/180))) * 2
  return { lat: +(lat + dLat).toFixed(7), lng: +(lng + dLng).toFixed(7) }
}

// Kleur + label voor fase-badge
function phaseBadge(phase) {
  const map = {
    collecting: { bg: '#14350f', fg: '#86efac', label: '🌿 Verzamel' },
    training:   { bg: '#1c2e1a', fg: '#86efac', label: '🧪 Training'  },
    tournament: { bg: '#2d1a0e', fg: '#fbbf24', label: '🏆 Toernooi'  },
    both:       { bg: '#1e1e3a', fg: '#c7d2fe', label: '♾️ Altijd'    },
  }
  return map[phase] || map.both
}

export default function InventoryScreen({
  catches: catchesProp, inventory: inventoryProp, effects: effectsProp,
  teams, players, player, team, sessionId, currentPhase, onClose,
}) {
  const [submitting, setSubmitting] = useState(null)
  const [activeFlow, setActiveFlow] = useState(null)   // {item, mode}
  const [pickupResult, setPickupResult] = useState(null) // [keys] na roll
  const [feedback, setFeedback] = useState(null) // {kind:'ok'|'err', msg}
  const [expandedKey, setExpandedKey] = useState(null) // welke item-kaart is uitgeklapt
  const feedbackTimer = useRef(null)

  // ── Eigen LIVE state — stale-prop patroon (zie memory) ──
  const [liveInventory, setLiveInventory] = useState(inventoryProp || [])
  const [liveCatches,   setLiveCatches]   = useState(catchesProp   || [])
  const [liveEffects,   setLiveEffects]   = useState(effectsProp   || [])

  useEffect(() => {
    if (!sessionId) return
    async function loadAll() {
      const [{ data: inv }, { data: cat }, { data: eff }] = await Promise.all([
        supabase.from('team_inventory').select('*, item_definitions(*)').eq('game_session_id', sessionId),
        supabase.from('catches').select('*, pokemon_definitions(*), teams(name,color)').eq('game_session_id', sessionId),
        supabase.from('active_effects').select('*').eq('game_session_id', sessionId).eq('is_active', true),
      ])
      if (inv) setLiveInventory(inv)
      if (cat) setLiveCatches(cat)
      if (eff) setLiveEffects(eff)
    }
    loadAll()
    const ch = supabase.channel(`inv-live-${sessionId}-${player.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_inventory',
        filter: `game_session_id=eq.${sessionId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catches',
        filter: `game_session_id=eq.${sessionId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_effects',
        filter: `game_session_id=eq.${sessionId}` }, () => loadAll())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sessionId, player.id])

  const myCatches    = liveCatches.filter(c => c.team_id === team?.id)
  const enemyCatches = liveCatches.filter(c => c.team_id && c.team_id !== team?.id && !c.shield_active)
  const myItems      = liveInventory.filter(i => i.team_id === team?.id)
  const myTeammates  = (players || []).filter(p => p.team_id === team?.id && p.id !== player.id)

  // Helper: actieve effect van mijn team voor een gegeven key
  function myActiveEffect(key) {
    return liveEffects.find(e =>
      e.team_id === team?.id && e.item_key === key && e.is_active &&
      (!e.expires_at || new Date(e.expires_at) > new Date())
    )
  }

  function flash(msg, kind = 'ok') {
    setFeedback({ msg, kind })
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2200)
  }

  // ── Item gebruik: dispatch op mode ─────────────────────────────
  function startUseItem(invRow) {
    const key = invRow.item_key
    const mode = ITEM_DETAILS[key]?.mode || 'confirm'

    // Voor "info only" (moon_stone, pokemon_egg): toon alleen hint, geen flow
    if (mode === 'info_only') {
      flash(ITEM_DETAILS[key]?.when || 'Kan niet rechtstreeks vanuit de Rugzak worden ingezet', 'ok')
      return
    }

    // Pickup → onmiddellijk rollen
    if (mode === 'roll_items') {
      doPickup(invRow); return
    }

    // Anders: open flow-modal
    setActiveFlow({ inv: invRow, key, mode })
    setPickupResult(null)
  }

  // Helper: verbruik 1 van het item uit inventory
  async function consumeOne(invRow) {
    const newQty = Math.max(0, (invRow.quantity || 0) - 1)
    if (newQty === 0) {
      await supabase.from('team_inventory').delete().eq('id', invRow.id)
    } else {
      await supabase.from('team_inventory').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', invRow.id)
    }
  }

  // Helper: voeg N van een item toe aan team_inventory (upsert)
  async function grantItem(itemKey, n = 1) {
    const { data: existing } = await supabase.from('team_inventory')
      .select('*').eq('game_session_id', sessionId).eq('team_id', team.id).eq('item_key', itemKey).maybeSingle()
    if (existing) {
      await supabase.from('team_inventory')
        .update({ quantity: (existing.quantity || 0) + n, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('team_inventory').insert({
        game_session_id: sessionId, team_id: team.id, item_key: itemKey, quantity: n,
      })
    }
  }

  // ── Item-handlers ──────────────────────────────────────────────

  async function doSilphScope(invRow) {
    setSubmitting(invRow.id)
    const minutes = 6  // TODO: configureerbaar via session
    const enemyTeam = teams.find(t => t.id !== team?.id)
    await supabase.from('active_effects').insert({
      game_session_id: sessionId,
      team_id: team.id,
      item_key: 'silph_scope',
      target_team_id: enemyTeam?.id || null,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
      is_active: true,
    })
    await consumeOne(invRow)
    if (enemyTeam) {
      await supabase.from('notifications').insert({
        game_session_id: sessionId,
        title: '⚠️ Jullie zijn opgejaagd!',
        message: 'Het andere team heeft een Silph Scope geactiveerd — ze zien jullie locaties.',
        type: 'warning', emoji: '🔭',
        target_team_id: enemyTeam.id,
      })
    }
    setSubmitting(null); setActiveFlow(null)
    flash('🔭 Silph Scope actief voor 6 minuten')
  }

  async function doProtect(invRow, catchItem) {
    setSubmitting(invRow.id)
    await supabase.from('catches').update({ shield_active: true }).eq('id', catchItem.id)
    await supabase.from('active_effects').insert({
      game_session_id: sessionId, team_id: team.id, item_key: 'protect',
      target_catch_id: catchItem.id,
      payload: { catch_id: catchItem.id },
      started_at: new Date().toISOString(),
      is_active: true,
    })
    await consumeOne(invRow)
    setSubmitting(null); setActiveFlow(null)
    flash(`🛡️ ${catchItem.pokemon_definitions?.name || 'Bokémon'} is nu beschermd`)
  }

  async function doDoubleTeam(invRow, teammate) {
    if (!teammate?.latitude || !teammate?.longitude) {
      flash('Teamgenoot heeft geen GPS-locatie', 'err'); return
    }
    setSubmitting(invRow.id)
    const fake = offsetLatLng(+teammate.latitude, +teammate.longitude, 100)
    const enemyTeam = teams.find(t => t.id !== team?.id)
    await supabase.from('active_effects').insert({
      game_session_id: sessionId, team_id: team.id, item_key: 'double_team',
      target_player_id: teammate.id,
      target_team_id: enemyTeam?.id || null,
      decoy_latitude: fake.lat, decoy_longitude: fake.lng,
      payload: { teammate_name: teammate.name },
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
      is_active: true,
    })
    await consumeOne(invRow)
    setSubmitting(null); setActiveFlow(null)
    flash(`🎭 Decoy van ${teammate.name} geplaatst`)
  }

  async function doSnatch(invRow, enemyCatch) {
    setSubmitting(invRow.id)
    // Direct overhevelen — geen RPS
    await supabase.from('catches').update({
      team_id: team.id,
      stolen_from_team_id: enemyCatch.team_id,
    }).eq('id', enemyCatch.id)
    await consumeOne(invRow)
    const enemyTeam = teams.find(t => t.id === enemyCatch.team_id)
    await supabase.from('notifications').insert({
      game_session_id: sessionId,
      title: '🧲 Bokémon gestolen via Snatch!',
      message: `${team?.name || 'Vijand'} heeft ${enemyCatch.pokemon_definitions?.name || 'een Bokémon'} gepakt.`,
      type: 'danger', emoji: '🧲',
      target_team_id: enemyTeam?.id || null,
    })
    setSubmitting(null); setActiveFlow(null)
    flash(`🧲 ${enemyCatch.pokemon_definitions?.name || 'Bokémon'} gestolen!`)
  }

  async function toggleMirrorCoat(invRow) {
    const existing = myActiveEffect('mirror_coat')
    if (existing) {
      // Uitzetten — geen verbruik
      await supabase.from('active_effects').update({ is_active: false }).eq('id', existing.id)
      flash('🪞 Mirror Coat uitgezet')
    } else {
      await supabase.from('active_effects').insert({
        game_session_id: sessionId, team_id: team.id, item_key: 'mirror_coat',
        started_at: new Date().toISOString(),
        is_active: true,
      })
      flash('🪞 Mirror Coat ready — wordt verbruikt bij eerste verloren RPS')
    }
    setActiveFlow(null)
  }

  async function doPickup(invRow) {
    setSubmitting(invRow.id)
    const rolled = pickupRoll(3)
    // Aggregeren per key
    const counts = rolled.reduce((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc }, {})
    for (const [key, n] of Object.entries(counts)) {
      await grantItem(key, n)
    }
    await consumeOne(invRow)
    setSubmitting(null)
    setPickupResult(rolled)
    setActiveFlow({ inv: invRow, key: 'pickup', mode: 'roll_items' })
  }

  async function doPokeLure(invRow) {
    setSubmitting(invRow.id)
    await supabase.from('active_effects').insert({
      game_session_id: sessionId, team_id: team.id, item_key: 'poke_lure',
      target_player_id: player.id,
      payload: { activated_by: player.name },
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      is_active: true,
    })
    await consumeOne(invRow)
    setSubmitting(null); setActiveFlow(null)
    flash('🎣 Lure ready — tik op een spawn op de kaart om te teleporteren (3 min)')
  }

  async function doMasterBall(invRow) {
    setSubmitting(invRow.id)
    await supabase.from('active_effects').insert({
      game_session_id: sessionId, team_id: team.id, item_key: 'master_ball',
      payload: { activated_by: player.name },
      started_at: new Date().toISOString(),
      is_active: true,
    })
    await consumeOne(invRow)
    setSubmitting(null); setActiveFlow(null)
    flash('🏆 Master Ball ready — eerstvolgende vangst is automatisch!')
  }

  // ── Active effects banner ─────────────────────────────────────
  const activeEffectsMine = liveEffects.filter(e => e.team_id === team?.id && e.is_active)

  // Sorteer items: kan-ingezet-nu bovenaan, info-only onderaan
  const sortedItems = [...myItems.filter(i => i.quantity > 0)].sort((a, b) => {
    const aInfo = ITEM_DETAILS[a.item_key]?.mode === 'info_only' ? 1 : 0
    const bInfo = ITEM_DETAILS[b.item_key]?.mode === 'info_only' ? 1 : 0
    return aInfo - bInfo
  })

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3>🎒 Rugzak</h3>
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>
          <TeamEmoji emoji={team?.emoji} /> {team?.name}
        </div>
      </div>

      {/* Floating feedback toast */}
      {feedback && (
        <div style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: feedback.kind === 'err' ? 'var(--danger)' : 'var(--accent)',
          color: 'white', padding: '10px 16px', borderRadius: 12, fontWeight: 700,
          fontSize: 13, zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          maxWidth: 320, textAlign: 'center',
        }}>
          {feedback.msg}
        </div>
      )}

      <div className="scroll-area">
        {/* Active effects banner */}
        {activeEffectsMine.length > 0 && (
          <div className="card" style={{
            background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
            border: '1px solid #6366f1',
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#c7d2fe', marginBottom: 6 }}>
              ⚡ Actief in jullie team
            </div>
            {activeEffectsMine.map(e => {
              const def = liveInventory.find(i => i.item_key === e.item_key)?.item_definitions
              const details = ITEM_DETAILS[e.item_key] || {}
              const remaining = e.expires_at
                ? Math.max(0, Math.ceil((new Date(e.expires_at) - Date.now()) / 60000))
                : null
              return (
                <div key={e.id} style={{ fontSize: 13, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{def?.emoji || details.emoji || '⭐'}</span>
                  <span style={{ fontWeight: 700 }}>{def?.name || details.name || e.item_key}</span>
                  {remaining !== null && <span style={{ color: '#818cf8' }}>· nog {remaining} min</span>}
                  {!e.expires_at && <span style={{ color: '#818cf8' }}>· ready</span>}
                </div>
              )
            })}
          </div>
        )}

        {sortedItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎒</div>
            <p>Je rugzak is leeg.</p>
            <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              Items vind je via de Mobiele Shop (Team Rocket) of door het Team Rocket HQ binnen te dringen.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedItems.map(item => {
              const key = item.item_key
              const def = item.item_definitions
              const details = ITEM_DETAILS[key] || {}
              const isExpanded = expandedKey === key
              const isMirrorReady = key === 'mirror_coat' && !!myActiveEffect('mirror_coat')
              const phase = phaseBadge(details.phase)
              const canUse = details.mode && details.mode !== 'info_only'
              const phaseBlocked =
                (details.phase === 'collecting' && currentPhase !== 'collecting') ||
                (details.phase === 'training'   && currentPhase !== 'training')   ||
                (details.phase === 'tournament' && currentPhase !== 'tournament')

              return (
                <div
                  key={item.id}
                  className="card"
                  style={{
                    padding: 0,
                    border: isMirrorReady ? '2px solid #c084fc' : '1px solid var(--border)',
                    background: isMirrorReady ? 'rgba(168,85,247,0.12)' : undefined,
                    overflow: 'hidden',
                  }}
                >
                  {/* Klikbare kop — altijd zichtbaar */}
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    style={{
                      width: '100%', background: 'none', border: 'none', color: 'var(--text)',
                      padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{ fontSize: 32, flexShrink: 0 }}>{def?.emoji || details.emoji || '⭐'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>
                          {def?.name || details.name || key}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 800,
                          background: phase.bg, color: phase.fg,
                          padding: '2px 7px', borderRadius: 99,
                        }}>
                          {phase.label}
                        </span>
                        {isMirrorReady && <span style={{ color: '#c084fc', fontSize: 11, fontWeight: 700 }}>READY</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.3 }}>
                        {details.short || def?.description || ''}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0,
                    }}>
                      <div style={{
                        fontWeight: 900, fontSize: 16, color: 'var(--warning)',
                        minWidth: 32, textAlign: 'center',
                      }}>×{item.quantity}</div>
                      <div style={{ fontSize: 14, color: 'var(--text2)' }}>
                        {isExpanded ? '▲' : '▼'}
                      </div>
                    </div>
                  </button>

                  {/* Uitgeklapte details */}
                  {isExpanded && (
                    <div style={{
                      padding: '4px 14px 14px 14px',
                      borderTop: '1px solid var(--border)',
                      background: 'rgba(0,0,0,0.15)',
                    }}>
                      {details.what && (
                        <InfoRow icon="🎯" label="Wat doet het?" text={details.what} />
                      )}
                      {details.when && (
                        <InfoRow icon="⏰" label="Wanneer inzetten?" text={details.when} />
                      )}
                      {details.effect && (
                        <InfoRow icon="✨" label="Effect" text={details.effect} />
                      )}
                      {details.note && (
                        <InfoRow icon="ℹ️" label="Let op" text={details.note} />
                      )}

                      {/* Gebruik-knop (indien toepasbaar) */}
                      {canUse && (
                        <div style={{ marginTop: 12 }}>
                          {phaseBlocked ? (
                            <div style={{
                              fontSize: 12, color: 'var(--text2)', textAlign: 'center',
                              padding: 10, background: 'rgba(148,163,184,0.12)',
                              borderRadius: 8, border: '1px dashed var(--border)',
                            }}>
                              🔒 Alleen te gebruiken tijdens de {phase.label.toLowerCase()}fase
                            </div>
                          ) : (
                            <button
                              className="btn btn-success"
                              onClick={() => startUseItem(item)}
                              disabled={submitting === item.id}
                              style={{ width: '100%' }}
                            >
                              {submitting === item.id ? '⏳' : `${def?.emoji || details.emoji || '⭐'} Inzetten`}
                            </button>
                          )}
                        </div>
                      )}
                      {!canUse && (
                        <div style={{
                          marginTop: 10, fontSize: 12, color: 'var(--text2)', textAlign: 'center',
                          padding: 10, background: 'rgba(59,130,246,0.08)',
                          borderRadius: 8, border: '1px dashed #334155',
                        }}>
                          ℹ️ Dit item wordt automatisch ingezet op de juiste plek in het spel.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── ITEM-FLOW MODAL ─────────────────────────────────────── */}
      {activeFlow && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5,5,16,0.85)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div style={{
            background: '#1e1e3a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
            width: '100%', maxHeight: '85vh', overflowY: 'auto',
            padding: 20, paddingBottom: 32, border: '1px solid var(--border)',
          }}>
            <ItemFlowBody
              flow={activeFlow}
              pickupResult={pickupResult}
              myCatches={myCatches}
              enemyCatches={enemyCatches}
              myTeammates={myTeammates}
              myActiveEffect={myActiveEffect}
              submitting={submitting}
              onCancel={() => { setActiveFlow(null); setPickupResult(null) }}
              onSilph={() => doSilphScope(activeFlow.inv)}
              onProtect={(c) => doProtect(activeFlow.inv, c)}
              onDouble={(p) => doDoubleTeam(activeFlow.inv, p)}
              onSnatch={(c) => doSnatch(activeFlow.inv, c)}
              onMirror={() => toggleMirrorCoat(activeFlow.inv)}
              onLure={() => doPokeLure(activeFlow.inv)}
              onMaster={() => doMasterBall(activeFlow.inv)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, label, text }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ color: 'var(--text)' }}>{text}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Subcomponent: bodies per flow-mode
// ─────────────────────────────────────────────────────────────
function ItemFlowBody({
  flow, pickupResult, myCatches, enemyCatches, myTeammates,
  myActiveEffect, submitting,
  onCancel, onSilph, onProtect, onDouble, onSnatch, onMirror, onLure, onMaster,
}) {
  const def = flow.inv?.item_definitions
  const details = ITEM_DETAILS[flow.key] || {}
  const headerEmoji = def?.emoji || details.emoji || '⭐'
  const headerName  = def?.name  || details.name  || flow.key

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 36 }}>{headerEmoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{headerName}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{details.short || def?.description}</div>
        </div>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* Silph Scope: bevestiging */}
      {flow.mode === 'confirm' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 16, lineHeight: 1.5 }}>
            Activeer Silph Scope? De tegenstander krijgt een waarschuwing en jullie zien hen 6 minuten lang op de kaart.
          </p>
          <button className="btn btn-success" disabled={!!submitting} onClick={onSilph}>
            🔭 Activeer Silph Scope
          </button>
        </>
      )}

      {/* Protect: kies eigen catch */}
      {flow.mode === 'pick_own_catch' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
            Kies de Bokémon die je wil beschermen tegen steal:
          </p>
          {myCatches.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>Je hebt nog geen Bokémon.</p>
          ) : myCatches.map(c => (
            <button key={c.id} className="card"
              disabled={!!submitting}
              style={{ textAlign: 'left', cursor: 'pointer', width: '100%', marginBottom: 8 }}
              onClick={() => onProtect(c)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 30 }}>{c.pokemon_definitions?.sprite_emoji || '❓'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{c.pokemon_definitions?.name}</div>
                  <div style={{ color: 'var(--warning)', fontSize: 13 }}>{c.cp} XP {c.is_shiny && '✨'}</div>
                </div>
                {c.shield_active && <span style={{ color: 'var(--info)', fontSize: 12 }}>🛡️ al actief</span>}
              </div>
            </button>
          ))}
        </>
      )}

      {/* Double Team: kies teammate */}
      {flow.mode === 'pick_teammate' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
            Kies een teamgenoot — er verschijnt een nep-locatie van die persoon op de kaart van de tegenstander.
          </p>
          {myTeammates.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>Geen teamgenoten online.</p>
          ) : myTeammates.map(p => (
            <button key={p.id} className="card"
              disabled={!!submitting || !p.latitude}
              style={{ textAlign: 'left', cursor: 'pointer', width: '100%', marginBottom: 8 }}
              onClick={() => onDouble(p)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 28 }}>📍</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {p.latitude ? 'GPS beschikbaar' : 'Geen GPS — niet bruikbaar'}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </>
      )}

      {/* Snatch: kies enemy catch */}
      {flow.mode === 'pick_enemy_catch' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
            Kies welke Bokémon je steelt — geen RPS nodig.
          </p>
          {enemyCatches.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>Tegenstander heeft geen onbeschermde Bokémon.</p>
          ) : enemyCatches.map(c => (
            <button key={c.id} className="card"
              disabled={!!submitting}
              style={{ textAlign: 'left', cursor: 'pointer', width: '100%', marginBottom: 8 }}
              onClick={() => onSnatch(c)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 30 }}>{c.pokemon_definitions?.sprite_emoji || '❓'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{c.pokemon_definitions?.name}</div>
                  <div style={{ color: 'var(--warning)', fontSize: 13 }}>{c.cp} XP {c.is_shiny && '✨'}</div>
                </div>
                <span style={{ fontSize: 22 }}>🧲</span>
              </div>
            </button>
          ))}
        </>
      )}

      {/* Mirror Coat: toggle */}
      {flow.mode === 'toggle_ready' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12, lineHeight: 1.5 }}>
            Mirror Coat wordt geactiveerd als "ready". Bij de eerstvolgende verloren RPS draait deze automatisch om — en wordt verbruikt.
          </p>
          {myActiveEffect('mirror_coat') ? (
            <button className="btn btn-danger" onClick={onMirror}>🪞 Mirror Coat uitzetten</button>
          ) : (
            <button className="btn btn-success" onClick={onMirror}>🪞 Mirror Coat ready</button>
          )}
        </>
      )}

      {/* Pickup: roll resultaat */}
      {flow.mode === 'roll_items' && pickupResult && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12, textAlign: 'center' }}>
            Pickup resultaat:
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            {pickupResult.map((key, i) => {
              const meta = ITEM_DETAILS[key] || { emoji: '❓', name: key }
              return (
                <div key={i} style={{
                  background: '#0d1226', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 14, textAlign: 'center', minWidth: 92,
                  animation: `bokePulse 1.${i}s ease-in-out infinite`,
                }}>
                  <div style={{ fontSize: 36 }}>{meta.emoji}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{meta.name}</div>
                </div>
              )
            })}
          </div>
          <button className="btn btn-success" onClick={onCancel}>OK — toegevoegd aan rugzak</button>
        </>
      )}

      {/* Poké Lure: bevestiging */}
      {flow.mode === 'confirm_lure' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 16, lineHeight: 1.5 }}>
            Lure activeren? Je hebt daarna <strong>3 minuten</strong> om op een Bokémon-spawn op de kaart te tikken — die wordt naar jouw locatie geteleporteerd.
          </p>
          <button className="btn btn-success" disabled={!!submitting} onClick={onLure}>
            🎣 Activeer Poké Lure
          </button>
        </>
      )}

      {/* Master Ball: bevestiging */}
      {flow.mode === 'confirm_master' && (
        <>
          <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 16, lineHeight: 1.5 }}>
            Master Ball activeren? Jullie volgende vangst is <strong>automatisch</strong> — geen opdracht, geen wachten op het andere team. Eén per spel.
          </p>
          <button className="btn btn-warning" disabled={!!submitting} onClick={onMaster}>
            🏆 Activeer Master Ball
          </button>
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <button onClick={onCancel} className="btn btn-ghost" style={{ width: '100%' }}>Annuleer</button>
      </div>
    </>
  )
}
