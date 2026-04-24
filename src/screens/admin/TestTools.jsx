// ═══════════════════════════════════════════════════════════════════
// 🧪 TestTools — Scenario-seeders, reset-knoppen, item-editor, speed-mode
// ───────────────────────────────────────────────────────────────────
// Enkel zichtbaar als session.is_test_mode === true.
// Alle acties gaan rechtstreeks naar Supabase en vragen bevestiging
// voor destructieve operaties.
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const ITEM_KEYS = [
  'moon_stone', 'silph_scope', 'protect', 'double_team', 'snatch',
  'mirror_coat', 'pickup', 'poke_lure', 'pokemon_egg', 'master_ball',
]

// Speed-mode presets
const NORMAL_TIMES = {
  catch_wait_seconds: 90,
  moonstone_duration_minutes: 6,
  admin_confirm_timeout_seconds: 15,
  spawn_interval_min_minutes: 8,
  spawn_interval_max_minutes: 12,
}
const TURBO_TIMES = {
  catch_wait_seconds: 10,
  moonstone_duration_minutes: 1,
  admin_confirm_timeout_seconds: 5,
  spawn_interval_min_minutes: 1,
  spawn_interval_max_minutes: 2,
}

function rnd(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

// Willekeurig element uit array
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export default function TestTools({ session, sessionId, teams, pokemons, catches, onDone }) {
  const [busy, setBusy] = useState(null)  // string met welke actie bezig is
  const [toast, setToast] = useState(null)
  const [itemDefs, setItemDefs] = useState([])
  const [inventory, setInventory] = useState([])  // [{team_id, item_key, quantity}]

  // ───────────── Item definities + inventaris laden (realtime) ─────────────
  useEffect(() => {
    supabase.from('item_definitions').select('*').then(({ data }) => {
      if (data) setItemDefs(data)
    })
  }, [])

  useEffect(() => {
    if (!sessionId) return
    async function loadInv() {
      const { data } = await supabase
        .from('team_inventory')
        .select('*')
        .eq('game_session_id', sessionId)
      setInventory(data || [])
    }
    loadInv()
    const ch = supabase.channel(`testtools-inv-${sessionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_inventory',
        filter: `game_session_id=eq.${sessionId}`,
      }, loadInv)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sessionId])

  function showToast(msg, kind = 'success') {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2800)
  }

  async function withBusy(key, fn, successMsg) {
    setBusy(key)
    try {
      await fn()
      if (successMsg) showToast(successMsg)
    } catch (e) {
      showToast('Fout: ' + (e.message || e), 'danger')
    } finally {
      setBusy(null)
      if (onDone) onDone()
    }
  }

  function itemQty(teamId, itemKey) {
    return inventory.find(i => i.team_id === teamId && i.item_key === itemKey)?.quantity || 0
  }

  async function setItemQty(teamId, itemKey, qty) {
    const q = Math.max(0, qty)
    await supabase.from('team_inventory').upsert({
      game_session_id: sessionId,
      team_id: teamId,
      item_key: itemKey,
      quantity: q,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'team_id,item_key' })
  }

  // ════════════════════════════════════════════════════════════════════
  //  SEEDERS — voeg catches toe aan teams
  // ════════════════════════════════════════════════════════════════════

  // Bouw een catch-object voor insert
  function buildCatch(pokemon, teamId, opts = {}) {
    const cp = opts.cp ?? rnd(pokemon.cp_min, pokemon.cp_max)
    const chainLen = Array.isArray(pokemon.evolution_chain) ? pokemon.evolution_chain.length : 1
    const evolutionStage = opts.evolutionStage != null
      ? Math.min(opts.evolutionStage, Math.max(0, chainLen - 1))
      : 0
    return {
      game_session_id: sessionId,
      team_id: teamId,
      pokemon_definition_id: pokemon.id,
      cp,
      is_shiny: !!opts.shiny,
      is_mystery: false,
      mystery_revealed: false,
      evolution_stage: evolutionStage,
      shield_active: false,
    }
  }

  // Filter: enkel reguliere Bokémon (geen special spawns zoals Pikachu/Mewtwo)
  function regularPokemons() {
    return pokemons.filter(p => !p.is_special_spawn)
  }

  async function seedRandomPerTeam(count) {
    const reg = regularPokemons()
    if (reg.length === 0 || teams.length === 0) throw new Error('Geen teams of Bokémon beschikbaar')
    const rows = []
    for (const t of teams) {
      for (let i = 0; i < count; i++) {
        rows.push(buildCatch(pick(reg), t.id))
      }
    }
    const { error } = await supabase.from('catches').insert(rows)
    if (error) throw error
  }

  async function seedPerType(countPerType) {
    const reg = regularPokemons()
    const types = ['water', 'fire', 'electric', 'grass', 'ghost', 'dragon']
    const rows = []
    for (const t of teams) {
      for (const type of types) {
        const pool = reg.filter(p => p.pokemon_type === type)
        if (pool.length === 0) continue
        for (let i = 0; i < countPerType; i++) {
          rows.push(buildCatch(pick(pool), t.id))
        }
      }
    }
    const { error } = await supabase.from('catches').insert(rows)
    if (error) throw error
  }

  async function seedFullPokedex() {
    const reg = regularPokemons()
    const rows = []
    for (const t of teams) {
      for (const p of reg) {
        // 2 exemplaren per soort — basis + stage 1
        rows.push(buildCatch(p, t.id, { evolutionStage: 0 }))
        rows.push(buildCatch(p, t.id, { evolutionStage: 1 }))
      }
    }
    const { error } = await supabase.from('catches').insert(rows)
    if (error) throw error
  }

  async function seedTournamentReady() {
    const reg = regularPokemons()
    const rows = []
    for (const t of teams) {
      // 10 Bokémon, helft stage 1, een paar stage 2, mix van types
      for (let i = 0; i < 10; i++) {
        const p = pick(reg)
        const chainLen = Array.isArray(p.evolution_chain) ? p.evolution_chain.length : 1
        // Stage: mix tussen 1 en 2
        const maxStage = Math.max(0, chainLen - 1)
        const evolutionStage = Math.min(maxStage, i < 6 ? 1 : 2)
        // Hogere CP: boven midden van range
        const midCp = Math.floor((p.cp_min + p.cp_max) / 2)
        const cp = rnd(midCp, p.cp_max)
        rows.push(buildCatch(p, t.id, { evolutionStage, cp, shiny: i === 0 }))
      }
      // + 2 items per team (Protect + Rare Candy-equivalent: moon_stone)
      await setItemQty(t.id, 'protect', 2)
      await setItemQty(t.id, 'moon_stone', 1)
    }
    const { error } = await supabase.from('catches').insert(rows)
    if (error) throw error
  }

  async function seedFinaleReady() {
    // Elk team krijgt een sterk team + een speciaal Bokémon (Pikachu/Mewtwo)
    // Team 1 (eerste) krijgt Pikachu, Team 2 krijgt Mewtwo
    const pikachu = pokemons.find(p => p.name?.toLowerCase() === 'pikachu' || p.is_special_spawn && p.pokemon_type === 'electric')
    const mewtwo  = pokemons.find(p => p.name?.toLowerCase().includes('mew') && p.is_special_spawn)
    const reg = regularPokemons()
    const rows = []
    teams.forEach((t, idx) => {
      // 8 sterke reguliere
      for (let i = 0; i < 8; i++) {
        const p = pick(reg)
        const chainLen = Array.isArray(p.evolution_chain) ? p.evolution_chain.length : 1
        rows.push(buildCatch(p, t.id, { evolutionStage: Math.max(0, chainLen - 1), cp: p.cp_max }))
      }
      // Speciaal
      const special = idx === 0 ? pikachu : mewtwo
      if (special) {
        rows.push(buildCatch(special, t.id, { evolutionStage: 0, cp: special.cp_max }))
      }
    })
    const { error } = await supabase.from('catches').insert(rows)
    if (error) throw error
    // Shields voor beide teams
    for (const t of teams) {
      await setItemQty(t.id, 'protect', 3)
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  RESETS
  // ════════════════════════════════════════════════════════════════════

  async function resetSpawns() {
    const { error } = await supabase.from('active_spawns')
      .update({ status: 'expired' })
      .eq('game_session_id', sessionId)
      .in('status', ['active', 'catching'])
    if (error) throw error
  }

  async function resetCatches() {
    // Volgorde: evolution_requests + evolution_log hangen aan catches → eerst die
    await supabase.from('evolution_requests').delete().eq('game_session_id', sessionId)
    await supabase.from('evolution_log').delete().eq('game_session_id', sessionId)
    const { error } = await supabase.from('catches').delete().eq('game_session_id', sessionId)
    if (error) throw error
  }

  async function resetItems() {
    await supabase.from('active_effects').delete().eq('game_session_id', sessionId)
    const { error } = await supabase.from('team_inventory').delete().eq('game_session_id', sessionId)
    if (error) throw error
  }

  async function resetTournament() {
    await supabase.from('tournament_matchups').delete().eq('game_session_id', sessionId)
    await supabase.from('tournament_results').delete().eq('game_session_id', sessionId)
    await supabase.from('tournament_state').delete().eq('game_session_id', sessionId)
    await supabase.from('finale_picks').delete().eq('game_session_id', sessionId)
    await supabase.from('finale_state').delete().eq('game_session_id', sessionId)
  }

  async function resetEvents() {
    await supabase.from('events_log').delete().eq('game_session_id', sessionId)
  }

  async function resetSteals() {
    await supabase.from('steal_challenges').delete().eq('game_session_id', sessionId)
  }

  async function resetNotifications() {
    await supabase.from('notifications').delete().eq('game_session_id', sessionId)
  }

  async function resetHqProgress() {
    await supabase.from('hq_progress').delete().eq('game_session_id', sessionId)
  }

  async function fullReset() {
    // In deze volgorde om FK-constraints te respecteren
    await resetCatches()
    await resetSpawns()
    await resetItems()
    await resetTournament()
    await resetEvents()
    await resetSteals()
    await resetNotifications()
    await resetHqProgress()
    // Sessie terug naar setup + legendary vlag uit
    const { error } = await supabase.from('game_sessions')
      .update({
        status: 'setup',
        legendary_phase_started_at: null,
        mobile_shop_active: false,
      })
      .eq('id', sessionId)
    if (error) throw error
  }

  // ════════════════════════════════════════════════════════════════════
  //  SPEED-MODE
  // ════════════════════════════════════════════════════════════════════

  const isTurbo = (session?.catch_wait_seconds || 90) <= TURBO_TIMES.catch_wait_seconds + 1 &&
                  (session?.moonstone_duration_minutes || 6) <= TURBO_TIMES.moonstone_duration_minutes + 0

  async function toggleTurbo() {
    const preset = isTurbo ? NORMAL_TIMES : TURBO_TIMES
    const { error } = await supabase.from('game_sessions')
      .update(preset)
      .eq('id', sessionId)
    if (error) throw error
  }

  // ════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════

  const totalCatches = catches?.length || 0
  const catchesByTeam = teams.map(t => ({
    team: t,
    count: catches?.filter(c => c.team_id === t.id).length || 0,
  }))

  return (
    <div className="scroll-area" style={{ paddingBottom: 80 }}>
      {/* Intro banner */}
      <div className="card" style={{ borderLeft: '3px solid #a855f7', background: 'rgba(168,85,247,0.05)' }}>
        <h2 style={{ margin: 0, marginBottom: 6, fontSize: 18 }}>🧪 Test &amp; Simulatie</h2>
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0, lineHeight: 1.5 }}>
          Vul catches, wis state en versnel timers om fases los te testen. Alles hier schrijft rechtstreeks naar de DB — gebruik dit alleen in een testsessie.
        </p>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)' }}>
          Huidige state: <strong style={{ color: 'var(--text)' }}>{totalCatches}</strong> catches · {catchesByTeam.map(({ team, count }) => (
            <span key={team.id} style={{ marginLeft: 6, color: team.color }}>{team.emoji} {count}</span>
          ))}
        </div>
      </div>

      {/* ═══════════ Speed-mode ═══════════ */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, marginBottom: 4 }}>{isTurbo ? '🐇 Turbo-modus actief' : '🐢 Normale timers'}</h3>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              {isTurbo
                ? 'Wachttijd 10s · Silph Scope 1 min · spawn-interval 1–2 min'
                : 'Wachttijd 90s · Silph Scope 6 min · spawn-interval 8–12 min'}
            </p>
          </div>
          <button
            disabled={busy === 'turbo'}
            onClick={() => withBusy('turbo', toggleTurbo, isTurbo ? '🐢 Normale timers actief' : '🐇 Turbo-modus actief!')}
            style={{
              padding: '10px 16px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: 13, minWidth: 100,
              background: isTurbo ? '#f59e0b' : 'var(--bg3)',
              color: isTurbo ? '#000' : 'var(--text2)',
            }}
          >
            {isTurbo ? 'Zet UIT' : 'Zet AAN'}
          </button>
        </div>
      </div>

      {/* ═══════════ Scenario-seeders ═══════════ */}
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>🌱 Scenario-seeders</h3>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
          Voegt catches toe aan bestaande teams (verwijdert niets). Reset eerst met "Wis catches" als je schoon wil beginnen.
        </p>
        <SeedBtn
          emoji="🎲" label="8 random catches per team"
          subtitle="16 catches totaal, random type & CP"
          busy={busy === 'seed-random-8'}
          onClick={() => withBusy('seed-random-8', () => seedRandomPerTeam(8), '+16 catches toegevoegd')}
        />
        <SeedBtn
          emoji="🎯" label="Per type: 2 per team per type"
          subtitle="12 catches per team — evenwichtig voor type-voordeel tests"
          busy={busy === 'seed-per-type'}
          onClick={() => withBusy('seed-per-type', () => seedPerType(2), 'Per-type catches toegevoegd')}
        />
        <SeedBtn
          emoji="📖" label="Volledige Pokédex × 2 stages"
          subtitle="Alle reguliere Bokémon × 2 exemplaren (stage 0 + 1) per team"
          busy={busy === 'seed-pokedex'}
          onClick={() => withBusy('seed-pokedex', seedFullPokedex, 'Volledige Pokédex geseed')}
        />
        <SeedBtn
          emoji="🏆" label="Toernooi-ready"
          subtitle="10 evolved Bokémon + 2 protects + 1 moon stone per team"
          busy={busy === 'seed-tournament'}
          onClick={() => withBusy('seed-tournament', seedTournamentReady, 'Toernooi-scenario geladen')}
        />
        <SeedBtn
          emoji="⚔️" label="Finale-ready"
          subtitle="8 sterke + Pikachu (team 1) / Mewtwo (team 2) + 3 shields"
          busy={busy === 'seed-finale'}
          onClick={() => withBusy('seed-finale', seedFinaleReady, 'Finale-scenario geladen')}
        />
      </div>

      {/* ═══════════ Item-editor ═══════════ */}
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>🎒 Item-inventaris</h3>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          Geef teams items om specifieke mechanics te testen (Shield, Silph Scope, Moon Stone…).
        </p>
        {teams.length === 0 && <p style={{ fontSize: 12, color: 'var(--text2)' }}>Geen teams in sessie.</p>}
        {teams.map(t => (
          <div key={t.id} style={{
            marginBottom: 12, padding: 10, borderRadius: 10,
            background: 'var(--bg3)', border: `1px solid ${t.color}44`,
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: t.color, marginBottom: 8 }}>
              {t.emoji} {t.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {ITEM_KEYS.map(key => {
                const def = itemDefs.find(d => d.key === key)
                if (!def) return null
                const q = itemQty(t.id, key)
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'var(--card)', borderRadius: 8, padding: '4px 6px',
                    border: q > 0 ? `1px solid ${t.color}77` : '1px solid transparent',
                  }}>
                    <span style={{ fontSize: 16 }}>{def.emoji}</span>
                    <span style={{ fontSize: 10, color: 'var(--text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {def.name}
                    </span>
                    <button
                      onClick={() => setItemQty(t.id, key, q - 1)}
                      disabled={q <= 0}
                      style={{ width: 22, height: 22, padding: 0, borderRadius: 6, border: 'none', background: q > 0 ? 'var(--bg2)' : '#333', color: 'var(--text)', cursor: q > 0 ? 'pointer' : 'default', fontWeight: 800 }}
                    >−</button>
                    <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 800, fontSize: 13 }}>{q}</span>
                    <button
                      onClick={() => setItemQty(t.id, key, q + 1)}
                      style={{ width: 22, height: 22, padding: 0, borderRadius: 6, border: 'none', background: 'var(--bg2)', color: 'var(--text)', cursor: 'pointer', fontWeight: 800 }}
                    >+</button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════ Reset-knoppen ═══════════ */}
      <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
        <h3 style={{ marginBottom: 4, color: 'var(--danger)' }}>🧹 Reset</h3>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          Wis state om een fase opnieuw te testen. Alle reset-acties vragen bevestiging.
        </p>
        <ResetBtn
          label="Wis spawns" subtitle="Zet alle actieve spawns op 'expired'"
          busy={busy === 'r-spawns'}
          onClick={() => {
            if (!window.confirm('Alle actieve spawns op expired zetten?')) return
            withBusy('r-spawns', resetSpawns, 'Spawns gewist')
          }}
        />
        <ResetBtn
          label="Wis catches" subtitle="+ evolution-logs en -verzoeken"
          busy={busy === 'r-catches'}
          onClick={() => {
            if (!window.confirm('⚠️ ALLE catches verwijderen (beide teams)?')) return
            withBusy('r-catches', resetCatches, 'Catches gewist')
          }}
        />
        <ResetBtn
          label="Wis items" subtitle="Team-inventarissen + actieve effecten"
          busy={busy === 'r-items'}
          onClick={() => {
            if (!window.confirm('Alle team-items verwijderen?')) return
            withBusy('r-items', resetItems, 'Items gewist')
          }}
        />
        <ResetBtn
          label="Wis toernooi + finale" subtitle="Alle matchups, rondes, picks, HP-state"
          busy={busy === 'r-tourn'}
          onClick={() => {
            if (!window.confirm('Toernooi- en finale-state verwijderen?')) return
            withBusy('r-tourn', resetTournament, 'Toernooi gewist')
          }}
        />
        <ResetBtn
          label="Wis events + notificaties" subtitle="Events-log + oude banners"
          busy={busy === 'r-evt'}
          onClick={() => {
            if (!window.confirm('Events-log en notificaties verwijderen?')) return
            withBusy('r-evt', async () => { await resetEvents(); await resetNotifications() }, 'Events gewist')
          }}
        />
        <ResetBtn
          label="Wis steals + HQ-progress" subtitle="RPS-challenges + HQ-kamer voortgang"
          busy={busy === 'r-misc'}
          onClick={() => {
            if (!window.confirm('Steal-challenges en HQ-progress verwijderen?')) return
            withBusy('r-misc', async () => { await resetSteals(); await resetHqProgress() }, 'Steals + HQ gewist')
          }}
        />
        <div style={{ height: 8 }} />
        <button
          disabled={busy === 'r-all'}
          onClick={() => {
            if (!window.confirm('💣 VOLLEDIGE RESET\n\nAlle catches, spawns, items, toernooi, finale, events, steals en HQ-progress worden verwijderd. Sessie gaat terug naar setup.\n\nZeker weten?')) return
            if (!window.confirm('Absoluut zeker? Dit is niet omkeerbaar.')) return
            withBusy('r-all', fullReset, '💣 Volledige reset uitgevoerd')
          }}
          style={{
            width: '100%', padding: 14, borderRadius: 10,
            background: busy === 'r-all' ? '#7f1d1d' : 'var(--danger)', color: '#fff',
            border: 'none', fontWeight: 900, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 0 14px rgba(239,68,68,0.4)',
          }}
        >
          💣 VOLLEDIGE RESET naar setup
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 18px', borderRadius: 99, zIndex: 1000,
          background: toast.kind === 'danger' ? 'var(--danger)' : '#16a34a',
          color: '#fff', fontWeight: 700, fontSize: 13,
          boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Herbruikbare knoppen
// ═══════════════════════════════════════════════════════════════════
function SeedBtn({ emoji, label, subtitle, busy, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', marginBottom: 8, borderRadius: 10,
        background: busy ? '#0d1226' : 'var(--bg3)',
        border: '1px solid var(--border)', cursor: busy ? 'wait' : 'pointer',
        textAlign: 'left', color: 'var(--text)',
      }}
    >
      <div style={{ fontSize: 24 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{busy ? '⏳ Bezig…' : label}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  )
}

function ResetBtn({ label, subtitle, busy, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', marginBottom: 6, borderRadius: 10,
        background: busy ? '#1a0a0a' : 'transparent',
        border: '1px solid rgba(239,68,68,0.3)', cursor: busy ? 'wait' : 'pointer',
        textAlign: 'left', color: 'var(--text)',
      }}
    >
      <div style={{ fontSize: 18 }}>🗑️</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{busy ? '⏳ Bezig…' : label}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </button>
  )
}
