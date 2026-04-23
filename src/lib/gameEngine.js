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

  if (!session || session.status !== 'collecting') return

  // Bereken metrics
  const teams = {}
  for (const c of catches || []) {
    if (!teams[c.team_id]) teams[c.team_id] = { totalCP: 0, count: 0 }
    teams[c.team_id].totalCP += c.cp
    teams[c.team_id].count++
  }

  const teamIds = Object.keys(teams)
  const cpValues = teamIds.map(id => teams[id].totalCP)
  const maxCP = Math.max(...cpValues, 1)
  const minCP = Math.min(...cpValues, 0)
  const cpDiffPercent = maxCP > 0 ? ((maxCP - minCP) / maxCP) * 100 : 0

  // Bereken tijdspercentage
  let timePercent = 0
  if (session.target_end_time) {
    const start = new Date(session.created_at)
    const end = new Date(session.target_end_time)
    const total = end - start
    const elapsed = now - start
    timePercent = Math.min(100, Math.max(0, (elapsed / total) * 100))
  }

  const metrics = { cpDiffPercent, timePercent, teamCount: teamIds.length }

  // Bepaal suggesties
  const suggestions = []

  if (cpDiffPercent > 40) {
    suggestions.push({ type: 'spawn', reason: 'CP-verschil te groot', priority: 'high' })
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

// Spawn een Bokémon op een willekeurige locatie binnen het speelveld,
// rekening houdend met biome-zones (biome-type krijgt voorkeur).
export async function autoSpawnPokemon(sessionId) {
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

  // Haal alle Pokémon op
  const { data: pokemons } = await supabase
    .from('pokemon_definitions')
    .select('*')
    .eq('is_enabled', true)
    .eq('is_special_spawn', false)

  if (!pokemons || pokemons.length === 0) return null

  // Kies Pokémon: 70% kans op biome-type, 30% volledig random
  let pokemon
  if (detectedBiomeType && Math.random() < 0.7) {
    const biomePool = pokemons.filter(p => p.pokemon_type === detectedBiomeType)
    pokemon = biomePool.length > 0
      ? biomePool[Math.floor(Math.random() * biomePool.length)]
      : pokemons[Math.floor(Math.random() * pokemons.length)]
  } else {
    pokemon = pokemons[Math.floor(Math.random() * pokemons.length)]
  }

  const cp = Math.floor(pokemon.cp_min + Math.random() * (pokemon.cp_max - pokemon.cp_min))

  // Bepaal spawn type
  const isShiny = Math.random() * 100 < (pokemon.shiny_chance || 5)
  const spawnType = isShiny ? 'shiny' : 'normal'

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
        message: `Een wilde ${pokemon.name} is op de kaart verschenen (${pokemon.cp_min}–${pokemon.cp_max} CP)`,
        emoji: pokemon.sprite_emoji, type: 'info',
      }
  }
}
