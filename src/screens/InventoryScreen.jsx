import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

// ─────────────────────────────────────────────────────────────
// InventoryScreen — twee tabs (Bokémon + Items) + item-flows
//
// Items en hun gebruiksflows:
//  - moon_stone   → in EvolutionScreen (niet hier inzetten)
//  - silph_scope  → confirm → activate active_effect (X min) + notify enemy
//  - protect      → kies eigen Bokémon → shield_active=true
//  - double_team  → kies teamgenoot → fake locatie genereren (active_effect)
//  - snatch       → kies Bokémon van tegenstander → direct gestolen
//  - mirror_coat  → toggle 'gereserveerd' (active_effect) — wordt geconsumeerd door StealFlow
//  - pickup       → roll 3 random items → toevoegen aan inventory
//  - poke_lure    → confirm → markeer "lure ready" (active_effect) → kaart toont Lure-modus
//  - pokemon_egg  → toon recepten in Pokédex-modus
//  - master_ball  → bevestig → markeer "next_catch_auto" (active_effect)
//
// Patroon: eerst LIVE inventory ophalen via eigen sub (stale-prop pattern),
// daarna pas useItem oproepen — zo voorkomen we race-conditions met realtime.
// ─────────────────────────────────────────────────────────────

const ITEM_USAGE = {
  moon_stone:  { hint: 'Gebruik in trainingsfase — kies in Evolutie-scherm welke Bokémon evolueert.', mode: 'info_only' },
  silph_scope: { hint: 'Activeer om tegenstanders X minuten te zien op de kaart.',                     mode: 'confirm' },
  protect:     { hint: 'Kies één eigen Bokémon — wordt beschermd tegen steal.',                       mode: 'pick_own_catch' },
  double_team: { hint: 'Kies een teamgenoot — er verschijnt een nep-locatie op de vijandelijke kaart.', mode: 'pick_teammate' },
  snatch:      { hint: 'Kies een Bokémon van de tegenstander — wordt direct gestolen.',               mode: 'pick_enemy_catch' },
  mirror_coat: { hint: 'Markeer als ready — bij verlies van de eerstvolgende RPS draait deze om.',    mode: 'toggle_ready' },
  pickup:      { hint: 'Krijg 3 random items uit de pot.',                                            mode: 'roll_items' },
  poke_lure:   { hint: 'Activeer en tik daarna op de spawn die je naar je toe wil halen.',           mode: 'confirm_lure' },
  pokemon_egg: { hint: 'Recepten staan in de Pokédex onder "Ei-recepten".',                          mode: 'info_only' },
  master_ball: { hint: 'Activeer — je eerstvolgende vangst gaat automatisch.',                        mode: 'confirm_master' },
}

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

export default function InventoryScreen({
  catches: catchesProp, inventory: inventoryProp, effects: effectsProp,
  teams, players, player, team, sessionId, currentPhase, onClose,
}) {
  const [tab, setTab] = useState('pokemon')
  const [submitting, setSubmitting] = useState(null)
  const [evoRequests, setEvoRequests] = useState([])
  const [activeFlow, setActiveFlow] = useState(null)   // {item, mode}
  const [pickupResult, setPickupResult] = useState(null) // [keys] na roll
  const [feedback, setFeedback] = useState(null) // {kind:'ok'|'err', msg}
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

  const isTrainingPhase = currentPhase === 'training'
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

  // ── Realtime evolution requests (voor labels op Bokémon) ───────
  useEffect(() => {
    if (!sessionId || !team?.id) return
    supabase.from('evolution_requests')
      .select('*').eq('game_session_id', sessionId).eq('team_id', team.id)
      .then(({ data }) => setEvoRequests(data || []))
    const ch = supabase.channel(`inv-evo-${sessionId}-${team.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evolution_requests',
        filter: `game_session_id=eq.${sessionId}` }, (payload) => {
        setEvoRequests(prev => {
          const idx = prev.findIndex(r => r.id === payload.new?.id)
          if (payload.eventType === 'INSERT') return [payload.new, ...prev]
          if (payload.eventType === 'UPDATE' && idx >= 0) {
            const updated = [...prev]; updated[idx] = payload.new; return updated
          }
          return prev
        })
      }).subscribe()
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

  // ── Evolutie aanvragen (bier) ──────────────────────────────────
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

  // ── Item gebruik: dispatch op mode ─────────────────────────────
  function startUseItem(invRow) {
    const key = invRow.item_key
    const mode = ITEM_USAGE[key]?.mode || 'confirm'

    // Voor "info only" (moon_stone, pokemon_egg): toon alleen hint, geen flow
    if (mode === 'info_only') {
      flash(ITEM_USAGE[key].hint, 'ok')
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

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
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
        {/* ── BOKÉMON TAB ─────────────────────────────────────── */}
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
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--info)' }}>🛡️ Protect actief</div>
                    )}
                  </div>
                </div>
              )
            })
          )
        )}

        {/* ── ITEMS TAB ────────────────────────────────────────── */}
        {tab === 'items' && (
          <>
            {/* Active effects banner */}
            {liveEffects.filter(e => e.team_id === team?.id && e.is_active).length > 0 && (
              <div className="card" style={{
                background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
                border: '1px solid #6366f1', marginBottom: 12,
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#c7d2fe', marginBottom: 6 }}>
                  ⚡ Actief in jullie team
                </div>
                {liveEffects.filter(e => e.team_id === team?.id && e.is_active).map(e => {
                  const def = liveInventory.find(i => i.item_key === e.item_key)?.item_definitions
                  const remaining = e.expires_at
                    ? Math.max(0, Math.ceil((new Date(e.expires_at) - Date.now()) / 60000))
                    : null
                  return (
                    <div key={e.id} style={{ fontSize: 13, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{def?.emoji || '⭐'}</span>
                      <span style={{ fontWeight: 700 }}>{def?.name || e.item_key}</span>
                      {remaining !== null && <span style={{ color: '#818cf8' }}>· nog {remaining} min</span>}
                      {!e.expires_at && <span style={{ color: '#818cf8' }}>· ready</span>}
                    </div>
                  )
                })}
              </div>
            )}

            {myItems.filter(i => i.quantity > 0).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text2)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎒</div>
                <p>Geen items in bezit.</p>
                <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
                  Items vind je via de Mobiele Shop (Team Rocket) of door het Team Rocket HQ binnen te dringen.
                </p>
              </div>
            ) : (
              <div className="inv-grid">
                {myItems.filter(i => i.quantity > 0).map(item => {
                  const key  = item.item_key
                  const def  = item.item_definitions
                  const hint = ITEM_USAGE[key]?.hint
                  const isMirrorReady = key === 'mirror_coat' && !!myActiveEffect('mirror_coat')
                  return (
                    <button
                      key={item.id}
                      className="inv-card"
                      onClick={() => startUseItem(item)}
                      disabled={submitting === item.id}
                      style={{
                        cursor: 'pointer',
                        border: isMirrorReady ? '2px solid #c084fc' : '1px solid var(--border)',
                        background: isMirrorReady ? 'rgba(168,85,247,0.15)' : undefined,
                        opacity: submitting === item.id ? 0.6 : 1,
                      }}
                    >
                      <div className="item-emoji">{def?.emoji}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, margin: '6px 0 2px' }}>
                        {def?.name}
                        {isMirrorReady && <span style={{ color: '#c084fc', marginLeft: 4 }}>✓</span>}
                      </div>
                      <div className="item-qty">×{item.quantity}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                        {def?.description}
                      </div>
                      {hint && (
                        <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.3 }}>
                          {hint}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
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

// ─────────────────────────────────────────────────────────────
// Subcomponent: bodies per flow-mode
// ─────────────────────────────────────────────────────────────
function ItemFlowBody({
  flow, pickupResult, myCatches, enemyCatches, myTeammates,
  myActiveEffect, submitting,
  onCancel, onSilph, onProtect, onDouble, onSnatch, onMirror, onLure, onMaster,
}) {
  const def = flow.inv?.item_definitions
  const headerEmoji = def?.emoji || '⭐'
  const headerName  = def?.name  || flow.key

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 36 }}>{headerEmoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{headerName}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{def?.description}</div>
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
              const meta = {
                silph_scope: ['🔭','Silph Scope'], protect: ['🛡️','Protect'], double_team: ['🎭','Double Team'],
                snatch: ['🧲','Snatch'], mirror_coat: ['🪞','Mirror Coat'], poke_lure: ['🎣','Poké Lure'],
                moon_stone: ['🌙','Moon Stone'],
              }[key] || ['❓', key]
              return (
                <div key={i} style={{
                  background: '#0d1226', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 14, textAlign: 'center', minWidth: 92,
                  animation: `bokePulse 1.${i}s ease-in-out infinite`,
                }}>
                  <div style={{ fontSize: 36 }}>{meta[0]}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{meta[1]}</div>
                </div>
              )
            })}
          </div>
          <button className="btn btn-success" onClick={onCancel}>OK — toegevoegd aan inventaris</button>
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
