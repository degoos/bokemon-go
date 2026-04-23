import { supabase } from './supabase'

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

// Spawn een Bokémon op een willekeurige locatie binnen het speelveld
export async function autoSpawnPokemon(sessionId) {
  const { data: areas } = await supabase
    .from('game_areas')
    .select('*')
    .eq('game_session_id', sessionId)
    .eq('type', 'boundary')

  if (!areas || areas.length === 0) return null

  const boundary = areas[0]
  const coords = boundary.geojson?.geometry?.coordinates?.[0] || []
  if (coords.length === 0) return null

  // Bereken bounding box
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lon, lat] of coords) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }

  // Kies random Pokémon
  const { data: pokemons } = await supabase
    .from('pokemon_definitions')
    .select('*')
    .eq('is_enabled', true)
    .eq('is_special_spawn', false)

  if (!pokemons || pokemons.length === 0) return null

  const pokemon = pokemons[Math.floor(Math.random() * pokemons.length)]
  const cp = Math.floor(pokemon.cp_min + Math.random() * (pokemon.cp_max - pokemon.cp_min))

  // Random locatie in bounding box (simpel)
  const lat = minLat + Math.random() * (maxLat - minLat)
  const lon = minLon + Math.random() * (maxLon - minLon)

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
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
  }).select().single()

  // Stuur notificatie
  if (spawn) {
    await supabase.from('notifications').insert({
      game_session_id: sessionId,
      title: `A wild ${isShiny ? '✨ shiny ' : ''}${pokemon.name} appeared!`,
      message: `Een wilde ${isShiny ? 'glinsterende ' : ''}${pokemon.name} is op de kaart verschenen!`,
      type: isShiny ? 'success' : 'info',
      emoji: pokemon.sprite_emoji,
    })
  }

  return spawn
}
