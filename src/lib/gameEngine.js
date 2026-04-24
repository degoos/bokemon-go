import { supabase } from './supabase'
import { pointInPolygon, getBoundsFromGeoJSON, randomPointInBounds } from './geo'

// Game engine: berekent spelstate metrics en stelt events voor
export async function runGameEngine(sessionId) {
  const now = new Date()

  // Haal data op
  const [{ data: session }, { data: catches }, { data: players }, { data: effects }] = await Promise.all([
    supabase.from('game_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('catches').select('*, pokemon_definitions(cp_min, cp_max)').eq('game_session_id', sessionId),
    supabase.from('players').select('*').eq('game_session_id', sessionId),
    supabase.from('active_effects').select('*').eq('game_session_id', sessionId).eq('is_active', true),
  ])

  if (!session || !['collecting', 'training'].includes(session.status)) return

  // Bereken metrics
  const teams = {}
  for (const c of catches || []) {
    if (!teams[c.team_id]) teams[c.team_id] = { totalXP: 0, count: 0 }
    teams[c.team_id].totalXP += c.cp
    teams[c.team_id].count++
  }

  const teamIds = Object.keys(teams)
  const xpValues = teamIds.map(id => teams[id].totalXP)
  const maxXP = Math.max(...xpValues, 1)
  const minXP = Math.min(...xpValues, 0)
  const xpDiffPercent = maxXP > 0 ? ((maxXP - minXP) / maxXP) * 100 : 0

  // Bereken tijdspercentage
  let timePercent = 0
  if (session.target_end_time) {
    const start = new Date(session.created_at)
    const end = new Date(session.target_end_time)
    const total = end - start
    const elapsed = now - start
    timePercent = Math.min(100, Math.max(0, (elapsed / total) * 100))
  }

  const metrics = { xpDiffPercent, timePercent, teamCount: teamIds.length }

  // Bepaal suggesties
  const suggestions = []

  if (xpDiffPercent > 40) {
    suggestions.push({ type: 'spawn', reason: 'XP-verschil te groot', priority: 'high' })
  }

  if (timePercent > 20 && timePercent < 60 && Math.random() < 0.3) {
    suggestions.push({ type: 'event', key: 'blood_moon', reason: 'Weinig actie middenfase' })
  }

  if (timePercent > 80) {
    suggestions.push({ type: 'event', key: 'legendary', reason: 'Eindfase bereikt' })
  }

  // Log naar database
  if (suggestions.length > 0) {
    await supabase.from('game_engine_log').insert({
      game_session_id: sessionId,
      metric_snapshot: metrics,
      suggestion_type: suggestions[0].type,
      suggestion_data: suggestions[0],
    })

    // Maak pending event aan als event-suggestie
    for (const s of suggestions.filter(s => s.type === 'event')) {
      const existing = await supabase
        .from('events_log')
        .select('id')
        .eq('game_session_id', sessionId)
        .eq('event_key', s.key)
        .eq('status', 'pending')
        .single()

      if (!existing.data) {
        await supabase.from('events_log').insert({
          game_session_id: sessionId,
          event_key: s.key,
          triggered_by: 'engine',
          status: 'pending',
          data: { reason: s.reason },
        })
      }
    }
  }

  return { metrics, suggestions }
}

// ── Legendarische Eindfase starten ───────────────────────────────
// Zet legendary_phase_started_at op de sessie en spawnt Pikachu
// automatisch op een willekeurige locatie binnen het speelveld.
export async function startLegendaryPhase(sessionId) {
  // 1. Zet timestamp op sessie
  const { error } = await supabase
    .from('game_sessions')
    .update({ legendary_phase_started_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) { console.error('startLegendaryPhase:', error); return null }

  // 2. Haal Pikachu op (is_special_spawn = true)
  const { data: pikachu } = await supabase
    .from('pokemon_definitions')
    .select('*')
    .eq('name', 'Pikachu')
    .single()

  if (!pikachu) { console.warn('Pikachu niet gevonden in DB'); return null }

  // 3. Zoek een willekeurige locatie binnen het speelveld
  const { data: areas } = await supabase
    .from('game_areas')
    .select('*')
    .eq('game_session_id', sessionId)

  const boundary = areas?.find(a => a.type === 'boundary')
  if (!boundary) return null

  const bounds = getBoundsFromGeoJSON(boundary.geojson)
  const boundaryCoords = (boundary.geojson?.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon])

  let lat, lon, attempts = 0
  do {
    const pt = randomPointInBounds(bounds)
    lat = pt.lat; lon = pt.lon
    attempts++
  } while (boundaryCoords.length > 2 && !pointInPolygon([lat, lon], boundaryCoords) && attempts < 30)

  const cp = Math.floor(pikachu.cp_min + Math.random() * (pikachu.cp_max - pikachu.cp_min))

  // 4. Spawn Pikachu als legendary
  //    catch_radius_meters: 10 — legendary vereist dat speler fysiek dichtbij komt (fuzzy zone mechanic)
  const { data: spawn } = await supabase.from('active_spawns').insert({
    game_session_id: sessionId,
    pokemon_definition_id: pikachu.id,
    latitude: lat,
    longitude: lon,
    spawn_type: 'legendary',
    cp,
    requires_opdracht: true,
    catch_radius_meters: 10,
    status: 'active',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 60 min (eindigt met fase)
  }).select().single()

  // 5. Dramatische notificatie naar alle spelers
  await supabase.from('notifications').insert({
    game_session_id: sessionId,
    title: '👑 De Legendarische Eindfase is begonnen!',
    message: '⚡ Pikachu is ergens op de kaart gespot — volg het gele cirkelgebied en laat de warmer/kouder-indicator je gidsen. Je moet binnen 10 meter komen om hem te vangen!',
    type: 'warning',
    emoji: '⚡',
  })

  return spawn
}

// Spawn een Bokémon op een willekeurige locatie binnen het speelveld,
// rekening houdend met biome-zones (biome-type krijgt voorkeur).
// Tijdens de legendarische eindfase worden alle spawns automatisch legendary.
export async function autoSpawnPokemon(sessionId, isLegendaryPhase = false) {
  // Haal speelveld EN biome-zones op in één query
  const { data: areas } = await supabase
    .from('game_areas')
    .select('*')
    .eq('game_session_id', sessionId)

  if (!areas || areas.length === 0) return null
  const boundary = areas.find(a => a.type === 'boundary')
  if (!boundary) return null

  // Bounding box van speelveld
  const bounds = getBoundsFromGeoJSON(boundary.geojson)
  const boundaryCoords = (boundary.geojson?.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon])
  if (boundaryCoords.length === 0) return null

  // Kies random punt in bounding box (max 20 pogingen om binnen speelveld te landen)
  let lat, lon
  for (let i = 0; i < 20; i++) {
    const pt = randomPointInBounds(bounds)
    if (pointInPolygon(pt.lat, pt.lon, boundaryCoords)) { lat = pt.lat; lon = pt.lon; break }
  }
  if (lat === undefined) {
    // Fallback: midden van het speelveld
    lat = (bounds.minLat + bounds.maxLat) / 2
    lon = (bounds.minLon + bounds.maxLon) / 2
  }

  // Bepaal in welke biome dit punt valt
  const biomes = areas.filter(a => a.type === 'biome')
  let detectedBiomeType = null
  for (const biome of biomes) {
    const biomeCoords = (biome.geojson?.geometry?.coordinates?.[0] || []).map(([blon, blat]) => [blat, blon])
    if (pointInPolygon(lat, lon, biomeCoords)) { detectedBiomeType = biome.pokemon_type; break }
  }

  // Haal alle Bokémon op
  const { data: pokemons } = await supabase
    .from('pokemon_definitions')
    .select('*')
    .eq('is_enabled', true)
    .eq('is_special_spawn', false)

  if (!pokemons || pokemons.length === 0) return null

  // Kies Bokémon: altijd het type van de biome waarin het punt valt.
  // Alleen als het punt buiten alle biome-zones valt (of geen biomes ingesteld),
  // kies dan volledig random.
  let pokemon
  if (detectedBiomeType) {
    const biomePool = pokemons.filter(p => p.pokemon_type === detectedBiomeType)
    pokemon = biomePool.length > 0
      ? biomePool[Math.floor(Math.random() * biomePool.length)]
      : pokemons[Math.floor(Math.random() * pokemons.length)]
  } else {
    pokemon = pokemons[Math.floor(Math.random() * pokemons.length)]
  }

  const cp = Math.floor(pokemon.cp_min + Math.random() * (pokemon.cp_max - pokemon.cp_min))

  // Bepaal spawn type: legendary fase overschrijft alles
  const isShiny = !isLegendaryPhase && Math.random() * 100 < (pokemon.shiny_chance || 5)
  const spawnType = isLegendaryPhase ? 'legendary' : isShiny ? 'shiny' : 'normal'

  const { data: spawn } = await supabase.from('active_spawns').insert({
    game_session_id: sessionId,
    pokemon_definition_id: pokemon.id,
    latitude: lat,
    longitude: lon,
    spawn_type: spawnType,
    cp,
    status: 'active',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select().single()

  // Stuur notificatie (geen naam bij mystery)
  if (spawn) {
    const { title, message, emoji, type } = buildSpawnNotification(pokemon, spawnType)
    await supabase.from('notifications').insert({
      game_session_id: sessionId, title, message, type, emoji,
    })
  }

  return spawn
}

// ═════════════════════════════════════════════════════════════════
// SAVE & PAUSE — voortgang tussen fases bewaren en later hervatten
// ═════════════════════════════════════════════════════════════════
//
// Model:
//   • Pauze = tijdelijk stopzetten binnen dezelfde sessie. Alle data
//     blijft staan; trainers zien een wachtscherm. Bij hervatten gaat
//     iedereen verder waar ze gestopt waren.
//   • Snapshot = volledig kopie-exemplaar van de gameplay-state op één
//     moment. Kan gebruikt worden om een NIEUWE sessie op te starten
//     met dezelfde teams/catches/items (bv. ander weekend, andere
//     devices), of als veiligheidsnet als er iets misgaat.
//
// Tabellen die worden meegenomen in een snapshot:
//   game_sessions (enkel config-kolommen), teams, players (zonder GPS),
//   catches, team_inventory, active_effects (enkel is_active),
//   evolution_log, tournament_rounds, events_log, game_areas,
//   pokemon_definitions (enkel sessie-specifiek)

// Huidige snapshot-versie — bump wanneer format wijzigt
const SNAPSHOT_VERSION = 1

/** Bouw een volledige snapshot van een sessie op het huidige moment. */
export async function buildSnapshot(sessionId) {
  const [
    { data: session }, { data: teams }, { data: players },
    { data: catches }, { data: inventory }, { data: effects },
    { data: evolutionLog }, { data: tournamentRounds }, { data: eventsLog },
    { data: areas }, { data: pokemonDefs },
  ] = await Promise.all([
    supabase.from('game_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('teams').select('*').eq('game_session_id', sessionId),
    supabase.from('players').select('*').eq('game_session_id', sessionId),
    supabase.from('catches').select('*').eq('game_session_id', sessionId),
    supabase.from('team_inventory').select('*').eq('game_session_id', sessionId),
    supabase.from('active_effects').select('*').eq('game_session_id', sessionId).eq('is_active', true),
    supabase.from('evolution_log').select('*').eq('game_session_id', sessionId),
    supabase.from('tournament_rounds').select('*').eq('game_session_id', sessionId),
    supabase.from('events_log').select('*').eq('game_session_id', sessionId),
    supabase.from('game_areas').select('*').eq('game_session_id', sessionId),
    supabase.from('pokemon_definitions').select('*').eq('game_session_id', sessionId),
  ])

  return {
    version: SNAPSHOT_VERSION,
    session: session || null,
    teams: teams || [],
    players: (players || []).map(p => ({ ...p, latitude: null, longitude: null, is_online: false })),
    catches: catches || [],
    team_inventory: inventory || [],
    active_effects: effects || [],
    evolution_log: evolutionLog || [],
    tournament_rounds: tournamentRounds || [],
    events_log: eventsLog || [],
    game_areas: areas || [],
    pokemon_definitions: pokemonDefs || [],
  }
}

/** Korte samenvatting voor admin-overzicht. */
function summarizeSnapshot(snapshot) {
  const catches = snapshot.catches || []
  const inv = snapshot.team_inventory || []
  const teamCounts = {}
  for (const c of catches) {
    teamCounts[c.team_id] = (teamCounts[c.team_id] || 0) + 1
  }
  return {
    total_catches: catches.length,
    team_counts: teamCounts,
    items_total: inv.reduce((s, i) => s + (i.quantity || 0), 0),
    evolution_events: (snapshot.evolution_log || []).length,
  }
}

/** Maak een snapshot-rij in de DB. */
export async function createSnapshot(sessionId, { name, isAuto = false } = {}) {
  const snapshot = await buildSnapshot(sessionId)
  if (!snapshot.session) return { error: 'Sessie niet gevonden' }
  const status = snapshot.session.status || 'setup'
  const finalName = name?.trim() || defaultSnapshotName(status)
  const { data, error } = await supabase.from('save_snapshots').insert({
    game_session_id: sessionId,
    name: finalName,
    status_at_save: status,
    is_auto: isAuto,
    snapshot,
    summary: summarizeSnapshot(snapshot),
  }).select().single()
  if (error) console.error('createSnapshot:', error)
  return { data, error }
}

function defaultSnapshotName(status) {
  const now = new Date()
  const stamp = now.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit' }) +
                ' ' + now.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
  const label = status === 'collecting' ? 'Einde verzamelfase'
              : status === 'training'   ? 'Einde trainingsfase'
              : status === 'tournament' ? 'Tijdens toernooi'
              : 'Snapshot'
  return `${label} — ${stamp}`
}

/** Pauzeer een sessie. Maakt automatisch een snapshot. */
export async function pauseSession(sessionId, { message = '', withSnapshot = true } = {}) {
  const { data: session } = await supabase
    .from('game_sessions').select('status').eq('id', sessionId).single()
  const status = session?.status || null

  if (withSnapshot) {
    await createSnapshot(sessionId, { isAuto: true })
  }

  const { error } = await supabase.from('game_sessions').update({
    is_paused: true,
    paused_at: new Date().toISOString(),
    paused_at_status: status,
    paused_message: message || null,
  }).eq('id', sessionId)

  if (!error) {
    await supabase.from('notifications').insert({
      game_session_id: sessionId,
      title: '⏸️ Spel gepauzeerd',
      message: message || 'Team Rocket heeft het spel gepauzeerd. We hervatten later.',
      emoji: '⏸️',
      type: 'info',
    })
  }
  return { error }
}

/** Hervat een gepauzeerde sessie. */
export async function resumeSession(sessionId) {
  const { error } = await supabase.from('game_sessions').update({
    is_paused: false,
    paused_at: null,
    paused_message: null,
    // paused_at_status bewust niet leegmaken — handig als log
  }).eq('id', sessionId)

  if (!error) {
    await supabase.from('notifications').insert({
      game_session_id: sessionId,
      title: '▶️ Spel hervat',
      message: 'Team Rocket heeft het spel hervat. Jullie kunnen verder.',
      emoji: '▶️',
      type: 'success',
    })
  }
  return { error }
}

/** Verwijder een snapshot. */
export async function deleteSnapshot(snapshotId) {
  return supabase.from('save_snapshots').delete().eq('id', snapshotId)
}

/** Haal snapshots op voor een sessie (of alle, mits sessie = null). */
export async function listSnapshots(sessionId = null, limit = 50) {
  let q = supabase.from('save_snapshots')
    .select('id, game_session_id, name, status_at_save, is_auto, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (sessionId) q = q.eq('game_session_id', sessionId)
  const { data, error } = await q
  return { data: data || [], error }
}

/** Laad één snapshot volledig (incl. snapshot-blob). */
export async function getSnapshot(snapshotId) {
  return supabase.from('save_snapshots').select('*').eq('id', snapshotId).single()
}

/**
 * Maak een nieuwe game_session op basis van een snapshot.
 * Gebruik deze flow als trainers op andere devices inloggen, of als
 * een nieuwe game_code gewenst is. De originele sessie blijft intact.
 *
 * Remapping: teams en pokemon_definitions krijgen nieuwe id's, en alle
 * afhankelijke rijen (catches, inventory, effects) worden hernummerd.
 */
export async function createSessionFromSnapshot(snapshotId, { newName = null } = {}) {
  const { data: snapRow, error: loadErr } = await getSnapshot(snapshotId)
  if (loadErr || !snapRow) return { error: loadErr || 'Snapshot niet gevonden' }
  const snap = snapRow.snapshot
  if (!snap?.session) return { error: 'Snapshot ongeldig (geen sessie)' }

  // 1) Nieuwe game_session (game_code laat Postgres genereren)
  const cfg = snap.session
  const { data: newSess, error: sessErr } = await supabase.from('game_sessions').insert({
    name: newName || `${cfg.name || 'Bokémon GO'} (Vervolg)`,
    status: cfg.status || 'setup',
    phase: cfg.phase || 'setup',
    moonstone_duration_minutes: cfg.moonstone_duration_minutes,
    catch_wait_seconds: cfg.catch_wait_seconds,
    admin_confirm_timeout_seconds: cfg.admin_confirm_timeout_seconds,
    spawn_interval_min_minutes: cfg.spawn_interval_min_minutes,
    spawn_interval_max_minutes: cfg.spawn_interval_max_minutes,
    abandoned_shop_name: cfg.abandoned_shop_name,
    is_test_mode: cfg.is_test_mode || false,
  }).select().single()
  if (sessErr || !newSess) return { error: sessErr || 'Kon sessie niet aanmaken' }

  const newSessionId = newSess.id

  // 2) Teams opnieuw invoegen, bouw oldTeamId → newTeamId map
  const teamMap = {}
  for (const t of snap.teams || []) {
    const { data: nt } = await supabase.from('teams').insert({
      game_session_id: newSessionId,
      name: t.name, color: t.color, emoji: t.emoji,
    }).select().single()
    if (nt) teamMap[t.id] = nt.id
  }

  // 3) Pokemon_definitions: enkel sessie-specifieke rijen overbrengen.
  //    De globale (game_session_id = null) rijen blijven gedeeld.
  const pokemonMap = {}
  for (const pd of snap.pokemon_definitions || []) {
    const { data: np } = await supabase.from('pokemon_definitions').insert({
      game_session_id: newSessionId,
      dex_number: pd.dex_number, name: pd.name, pokemon_type: pd.pokemon_type,
      cp_min: pd.cp_min, cp_max: pd.cp_max, linked_beer: pd.linked_beer,
      evolution_chain: pd.evolution_chain, shiny_chance: pd.shiny_chance,
      is_enabled: pd.is_enabled, is_special_spawn: pd.is_special_spawn,
      sprite_emoji: pd.sprite_emoji,
    }).select().single()
    if (np) pokemonMap[pd.id] = np.id
  }

  // 4) Game areas (speelveld + biomes)
  for (const a of snap.game_areas || []) {
    await supabase.from('game_areas').insert({
      game_session_id: newSessionId,
      type: a.type, name: a.name, pokemon_type: a.pokemon_type,
      geojson: a.geojson, spawn_chance_in_zone: a.spawn_chance_in_zone,
      spawn_chance_outside_zone: a.spawn_chance_outside_zone,
      color: a.color, opacity: a.opacity,
    })
  }

  // 5) Catches — remap team_id + evt. pokemon_definition_id
  const catchMap = {}
  for (const c of snap.catches || []) {
    const newTeamId = teamMap[c.team_id]
    if (!newTeamId) continue
    const pokemonId = pokemonMap[c.pokemon_definition_id] || c.pokemon_definition_id
    const { data: nc } = await supabase.from('catches').insert({
      game_session_id: newSessionId,
      team_id: newTeamId,
      pokemon_definition_id: pokemonId,
      cp: c.cp,
      is_shiny: c.is_shiny,
      is_mystery: c.is_mystery,
      mystery_revealed: c.mystery_revealed,
      evolution_stage: c.evolution_stage,
      nickname: c.nickname,
      stolen_from_team_id: teamMap[c.stolen_from_team_id] || null,
      shield_active: c.shield_active,
    }).select().single()
    if (nc) catchMap[c.id] = nc.id
  }

  // 6) Inventory
  for (const i of snap.team_inventory || []) {
    const newTeamId = teamMap[i.team_id]
    if (!newTeamId) continue
    await supabase.from('team_inventory').insert({
      game_session_id: newSessionId,
      team_id: newTeamId,
      item_key: i.item_key,
      quantity: i.quantity,
    })
  }

  // 7) Active effects (enkel de blijvende zoals Shield op een catch)
  for (const eff of snap.active_effects || []) {
    const newTeamId = teamMap[eff.team_id]
    if (!newTeamId) continue
    const newTargetCatchId = eff.target_catch_id ? catchMap[eff.target_catch_id] : null
    await supabase.from('active_effects').insert({
      game_session_id: newSessionId,
      team_id: newTeamId,
      item_key: eff.item_key,
      target_catch_id: newTargetCatchId,
      decoy_latitude: eff.decoy_latitude,
      decoy_longitude: eff.decoy_longitude,
      expires_at: eff.expires_at,
      is_active: eff.is_active,
    })
  }

  return { data: newSess, error: null, teamMap, catchMap }
}

// ─────────────────────────────────────────────────────────────────

// Bouw de juiste notificatietekst op basis van spawn type
export function buildSpawnNotification(pokemon, spawnType) {
  switch (spawnType) {
    case 'shiny':
      return {
        title: `✨ Blinkende ${pokemon.name} verschenen!`,
        message: `Een zeldzame blinkende ${pokemon.name} is gespot op de kaart!`,
        emoji: '✨', type: 'success',
      }
    case 'mystery':
      return {
        title: `❓ Mysterieuze Bokémon verschenen!`,
        message: `Iets raars beweegt op de kaart... Wat zou het zijn?`,
        emoji: '❓', type: 'info',
      }
    case 'legendary':
      return {
        title: `👑 ${pokemon.name} is neergedaald!`,
        message: `De legendarische ${pokemon.name} staat op de kaart — dit is jullie kans!`,
        emoji: '👑', type: 'warning',
      }
    default:
      return {
        title: `${pokemon.sprite_emoji} ${pokemon.name} verschenen!`,
        message: `Een wilde ${pokemon.name} is op de kaart verschenen (${pokemon.cp_min}–${pokemon.cp_max} XP)`,
        emoji: pokemon.sprite_emoji, type: 'info',
      }
  }
}
