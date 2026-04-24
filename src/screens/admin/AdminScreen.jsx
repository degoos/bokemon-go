import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import { useGameSession } from '../../hooks/useGameSession'
import { usePlayerLocation } from '../../hooks/usePlayerLocation'
import { POKEMON_TYPES, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../lib/constants'
import { getPolygonCenter, pointInPolygon } from '../../lib/geo'
import { autoSpawnPokemon, startLegendaryPhase, buildSpawnNotification } from '../../lib/gameEngine'
import NotificationBanner from '../../components/NotificationBanner'
import ChallengeSelector from '../../components/ChallengeSelector'
import ChallengeLibrary from '../../components/ChallengeLibrary'
import HandicapPicker from '../../components/HandicapPicker'
import PokedexScreen from '../PokedexScreen'
import TournamentScreen from '../TournamentScreen'
import FinaleScreen from '../FinaleScreen'
import TestTools from './TestTools'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function makeEmojiIcon(emoji, size = 36) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8));">${emoji}</div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -size/2], className: '',
  })
}

// Zelfde countdown-icon als MapScreen (gedeeld via copy zodat geen extra import nodig is)
function makeCountdownIcon(emoji, totalSeconds, elapsedSeconds) {
  const r = 10
  const circ = +(2 * Math.PI * r).toFixed(2)
  const fraction = Math.min(1, Math.max(0, elapsedSeconds / totalSeconds))
  const offset = +(circ * (1 - fraction)).toFixed(2)
  const remaining = Math.max(0, totalSeconds - elapsedSeconds)
  return L.divIcon({
    html: `<div style="position:relative;width:44px;height:58px;">
      <div style="font-size:44px;line-height:1;text-align:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.9));animation:bokePulse 1.2s ease-in-out infinite;">
        ${emoji}
      </div>
      <svg viewBox="0 0 44 44" width="44" height="44" style="position:absolute;top:0;left:0;pointer-events:none;">
        <circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(20,20,20,0.7)"
          stroke-width="${r * 2}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          transform="rotate(-90 22 22)"
          style="animation:bokeCountdown ${remaining.toFixed(1)}s linear forwards;" />
      </svg>
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);border-radius:6px;padding:1px 7px;font-size:11px;font-weight:800;color:#ef4444;white-space:nowrap;">
        ⏱ ${Math.ceil(remaining)}s
      </div>
    </div>`,
    iconSize: [44, 58], iconAnchor: [22, 22], className: '',
  })
}

// Klik op kaart voor spawn of polygon
function MapClickHandler({ mode, onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) })
  return null
}

function MapAutoCenter({ areas, position }) {
  const map = useMap()
  const gpsCenteredRef = useRef(false)
  const fieldCenteredRef = useRef(false)
  useEffect(() => {
    if (!position || gpsCenteredRef.current) return
    map.setView([position.lat, position.lon], 17)
    gpsCenteredRef.current = true
  }, [position, map])
  useEffect(() => {
    if (gpsCenteredRef.current || fieldCenteredRef.current) return
    const boundary = areas.find(a => a.type === 'boundary')
    if (boundary) {
      const coords = boundary.geojson?.geometry?.coordinates?.[0] || []
      if (coords.length > 0) {
        const lats = coords.map(([, lat]) => lat)
        const lons = coords.map(([lon]) => lon)
        map.setView([(Math.min(...lats)+Math.max(...lats))/2, (Math.min(...lons)+Math.max(...lons))/2], 17)
        fieldCenteredRef.current = true
      }
    }
  }, [areas, map])
  return null
}

export default function AdminScreen({ player, session: initialSession, onSignOut }) {
  const { session, teams, players, spawns, events, effects, notifications, refetch } = useGameSession(initialSession.id)
  const { position } = usePlayerLocation(player.id, initialSession.id)
  const [tab, setTab] = useState('dashboard')
  const [mapMode, setMapMode] = useState('view') // view | spawn | boundary | biome
  const [drawingPoints, setDrawingPoints] = useState([])
  const [selectedBiomeType, setSelectedBiomeType] = useState('grass')
  const [areas, setAreas] = useState([])
  const [pokemons, setPokemons] = useState([])
  const [spawnForm, setSpawnForm] = useState({ pokemonId: '', spawnType: 'normal', requiresOpdracht: true, catchRadius: 50 })
  const [pendingSpawnLoc, setPendingSpawnLoc] = useState(null)
  const [detectedBiomeType, setDetectedBiomeType] = useState(null)
  const [selectedSpawn, setSelectedSpawn] = useState(null) // spawn geselecteerd op kaart
  const [deletingSpawn, setDeletingSpawn] = useState(false)
  const [pendingFadeSeconds, setPendingFadeSeconds] = useState(60)
  const [nowMs, setNowMs] = useState(Date.now())
  const [shopActive, setShopActive] = useState(false)
  // Mobiele Shop catalog (configureerbare items + prijs) — gesynced met session.mobile_shop_items
  const [shopItems, setShopItems] = useState([])
  // HQ-locatie state (lat/lng), gesynced met session.hq_location
  const [hqLatLng, setHqLatLng] = useState({ lat: '', lng: '' })
  const [challenges, setChallenges] = useState([])
  const [challengeSelectorSpawn, setChallengeSelectorSpawn] = useState(null)
  // pokedexView: 'both' | <teamId>
  const [pokedexView, setPokedexView] = useState('both')
  // Evolutieverzoeken van trainers
  const [evoRequests, setEvoRequests] = useState([])
  const [resolvingEvo, setResolvingEvo] = useState(null) // id van request dat verwerkt wordt
  // NB: Direct toewijzen is verplaatst naar de gedetailleerde Pokédex per team (PokedexScreen)

  // ── Eigen catches-state voor dashboard (onafhankelijk van useGameSession) ──
  // useGameSession.catches is mogelijk stale als de catches-tabel niet in
  // Supabase realtime publication zit. Hier fetchen we zelf met een live
  // subscription zodat teamScores en teamPokedex altijd up-to-date zijn.
  const [catches, setCatches] = useState([])

  useEffect(() => {
    if (!initialSession.id) return
    async function loadCatches() {
      const { data } = await supabase
        .from('catches')
        .select('*, pokemon_definitions(*)')
        .eq('game_session_id', initialSession.id)
      if (data) setCatches(data)
    }
    loadCatches()

    const ch = supabase.channel(`admin-catches-live-${initialSession.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'catches',
        filter: `game_session_id=eq.${initialSession.id}`,
      }, () => loadCatches())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [initialSession.id])

  // Biome-keuze flow na speelveld opslaan
  const [showBiomeChoice, setShowBiomeChoice] = useState(false) // 'choice' | 'auto-preview' | false
  const [biomeChoiceStep, setBiomeChoiceStep] = useState('choice') // 'choice' | 'auto-preview'
  const [savedBoundaryPoints, setSavedBoundaryPoints] = useState(null)
  const [autoZonesPreview, setAutoZonesPreview] = useState([]) // [{ points, type }]
  const [activeAutoZoneIdx, setActiveAutoZoneIdx] = useState(null) // index van geselecteerde zone in preview

  // Klok-ticker voor fading spawns in admin-kaart
  const adminFadingKey = spawns.filter(s => s.fade_duration_seconds).map(s => s.id + s.expires_at).join(',')
  useEffect(() => {
    if (!adminFadingKey) return
    const iv = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [adminFadingKey])
  const mapRef = useRef(null)

  useEffect(() => {
    Promise.all([
      supabase.from('game_areas').select('*').eq('game_session_id', initialSession.id),
      supabase.from('pokemon_definitions').select('*').eq('is_enabled', true).eq('is_special_spawn', false),
      supabase.from('opdracht_definitions').select('*').order('title'),
    ]).then(([{ data: a }, { data: p }, { data: c }]) => {
      if (a) setAreas(a)
      if (p) setPokemons(p)
      if (c) setChallenges(c)
    })
  }, [initialSession.id])

  async function refreshChallenges() {
    const { data } = await supabase.from('opdracht_definitions').select('*').order('title')
    if (data) setChallenges(data)
  }

  // ── Evolutieverzoeken laden + realtime ─────────────────────────
  useEffect(() => {
    if (!initialSession.id) return
    supabase
      .from('evolution_requests')
      .select('*, catches(*, pokemon_definitions(*)), teams(name, emoji, color)')
      .eq('game_session_id', initialSession.id)
      .order('requested_at', { ascending: true })
      .then(({ data }) => setEvoRequests(data || []))

    const ch = supabase.channel(`admin-evo-${initialSession.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'evolution_requests',
        filter: `game_session_id=eq.${initialSession.id}`,
      }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          // Haal de volledige joined record op
          const { data } = await supabase
            .from('evolution_requests')
            .select('*, catches(*, pokemon_definitions(*)), teams(name, emoji, color)')
            .eq('id', payload.new.id)
            .single()
          if (data) setEvoRequests(prev => [...prev, data])
        } else if (payload.eventType === 'UPDATE') {
          setEvoRequests(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [initialSession.id])

  // ── Evolutieverzoek goedkeuren ─────────────────────────────────
  async function approveEvolution(req) {
    if (!req) return
    setResolvingEvo(req.id)
    const catchItem = req.catches

    // 1. Evolutiestap ophogen
    await supabase.from('catches')
      .update({ evolution_stage: req.to_stage })
      .eq('id', req.catch_id)

    // 2. Log bijhouden
    await supabase.from('evolution_log').insert({
      game_session_id: initialSession.id,
      catch_id:        req.catch_id,
      team_id:         req.team_id,
      from_stage:      req.from_stage,
      to_stage:        req.to_stage,
      used_moon_stone: req.used_moon_stone,
    })

    // 3. Request als goedgekeurd markeren
    await supabase.from('evolution_requests')
      .update({ status: 'approved', resolved_at: new Date().toISOString() })
      .eq('id', req.id)

    // 4. Notificatie naar het team
    const def  = catchItem?.pokemon_definitions
    const chain = def?.evolution_chain || []
    const newName = chain[req.to_stage] || def?.name || 'Bokémon'
    await supabase.from('notifications').insert({
      game_session_id: initialSession.id,
      target_team_id:  req.team_id,
      title:           `⬆️ Evolutie goedgekeurd!`,
      message:         `${def?.sprite_emoji || '⬆️'} ${chain[req.from_stage] || def?.name} is geëvolueerd naar ${newName}!`,
      type:            'success',
      emoji:           '⬆️',
    })

    setResolvingEvo(null)
  }

  // ── Evolutieverzoek weigeren ───────────────────────────────────
  async function rejectEvolution(req, note = '') {
    setResolvingEvo(req.id)
    await supabase.from('evolution_requests')
      .update({ status: 'rejected', resolved_at: new Date().toISOString(), admin_note: note || null })
      .eq('id', req.id)

    const def = req.catches?.pokemon_definitions
    await supabase.from('notifications').insert({
      game_session_id: initialSession.id,
      target_team_id:  req.team_id,
      title:           `❌ Evolutie geweigerd`,
      message:         `De evolutie van ${def?.name || 'je Bokémon'} is nog niet goedgekeurd. Drink eerst het bier!`,
      type:            'warning',
      emoji:           '❌',
    })
    setResolvingEvo(null)
  }

  // Detecteer spawns waarbij catch-type bepaald is (solo of T2T) maar nog geen opdracht
  // Toon popup ALLEEN als active_opdracht_type al gezet is (wachttijd voorbij of beide teams aanwezig)
  useEffect(() => {
    const readyWithoutChallenge = spawns.filter(
      s => s.status === 'catching' &&
           s.requires_opdracht &&
           !s.opdracht_id &&
           !s.challenge_assigned_at &&
           s.active_opdracht_type !== null &&
           s.active_opdracht_type !== undefined
    )
    if (readyWithoutChallenge.length > 0 && !challengeSelectorSpawn) {
      setChallengeSelectorSpawn(readyWithoutChallenge[0])
    }
  }, [spawns]) // eslint-disable-line react-hooks/exhaustive-deps

  // Genereer 6 rechthoekige biome-zones (2 rijen × 3 kolommen) over de bounding box van het speelveld
  function generateAutoZones(pts) {
    const lats = pts.map(([lat]) => lat)
    const lons = pts.map(([, lon]) => lon)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const latMid = (minLat + maxLat) / 2
    const l1 = minLon + (maxLon - minLon) / 3
    const l2 = minLon + 2 * (maxLon - minLon) / 3
    // Noord (top) → links: water, midden: vuur, rechts: elektro
    // Zuid (bottom) → links: gras, midden: draak, rechts: geest
    const cells = [
      { latMin: latMid, latMax: maxLat, lonMin: minLon, lonMax: l1,     type: 'water' },
      { latMin: latMid, latMax: maxLat, lonMin: l1,     lonMax: l2,     type: 'fire' },
      { latMin: latMid, latMax: maxLat, lonMin: l2,     lonMax: maxLon, type: 'electric' },
      { latMin: minLat, latMax: latMid, lonMin: minLon, lonMax: l1,     type: 'grass' },
      { latMin: minLat, latMax: latMid, lonMin: l1,     lonMax: l2,     type: 'dragon' },
      { latMin: minLat, latMax: latMid, lonMin: l2,     lonMax: maxLon, type: 'ghost' },
    ]
    return cells.map(cell => ({
      points: [
        [cell.latMax, cell.lonMin],
        [cell.latMax, cell.lonMax],
        [cell.latMin, cell.lonMax],
        [cell.latMin, cell.lonMin],
      ],
      type: cell.type,
    }))
  }

  async function saveAutoZones() {
    for (const zone of autoZonesPreview) {
      const coords = [...zone.points, zone.points[0]].map(([lat, lon]) => [lon, lat])
      const geojson = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }
      const { data } = await supabase.from('game_areas').insert({
        game_session_id: initialSession.id,
        type: 'biome',
        pokemon_type: zone.type,
        name: `${POKEMON_TYPES[zone.type]?.label} Zone`,
        geojson,
        color: POKEMON_TYPES[zone.type]?.mapColor || '#7c3aed',
      }).select().single()
      if (data) setAreas(prev => [...prev, data])
    }
    setShowBiomeChoice(false)
    setBiomeChoiceStep('choice')
    setAutoZonesPreview([])
    setSavedBoundaryPoints(null)
  }

  async function deleteBiomeZone(areaId) {
    await supabase.from('game_areas').delete().eq('id', areaId)
    setAreas(prev => prev.filter(a => a.id !== areaId))
  }

  function detectBiomeAtPoint(latlng) {
    const biomes = areas.filter(a => a.type === 'biome')
    for (const biome of biomes) {
      const coords = biome.geojson?.geometry?.coordinates?.[0] || []
      // GeoJSON is [lon, lat], pointInPolygon verwacht [lat, lon]
      const latLngCoords = coords.map(([lon, lat]) => [lat, lon])
      if (pointInPolygon(latlng.lat, latlng.lng, latLngCoords)) {
        return biome.pokemon_type
      }
    }
    return null
  }

  function handleMapClick(latlng) {
    if (mapMode === 'spawn') {
      const biome = detectBiomeAtPoint(latlng)
      setDetectedBiomeType(biome)
      setPendingSpawnLoc(latlng)
    } else if (mapMode === 'boundary' || mapMode === 'biome') {
      setDrawingPoints(prev => [...prev, [latlng.lat, latlng.lng]])
    } else if (mapMode === 'hq_location') {
      saveHqLocation(latlng.lat, latlng.lng)
      setMapMode('view')
    }
  }

  async function savePolygon() {
    if (drawingPoints.length < 3) return
    const coords = [...drawingPoints, drawingPoints[0]].map(([lat, lon]) => [lon, lat])
    const geojson = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }
    const { data } = await supabase.from('game_areas').insert({
      game_session_id: initialSession.id,
      type: mapMode === 'boundary' ? 'boundary' : 'biome',
      pokemon_type: mapMode === 'biome' ? selectedBiomeType : null,
      name: mapMode === 'boundary' ? 'Speelveld' : `${POKEMON_TYPES[selectedBiomeType]?.label} Zone`,
      geojson,
      color: POKEMON_TYPES[selectedBiomeType]?.mapColor || '#7c3aed',
    }).select().single()
    if (data) {
      setAreas(prev => [...prev, data])
      setDrawingPoints([])
      setMapMode('view')
      // Na speelveld opslaan → toon biome-keuze modal
      if (mapMode === 'boundary') {
        setSavedBoundaryPoints(drawingPoints)
        setAutoZonesPreview(generateAutoZones(drawingPoints))
        setBiomeChoiceStep('choice')
        setShowBiomeChoice(true)
      }
    }
  }

  async function spawnPokemon() {
    if (!pendingSpawnLoc || !spawnForm.pokemonId) return
    const pokemon = pokemons.find(p => p.id === spawnForm.pokemonId)
    if (!pokemon) return
    const cp = Math.floor(pokemon.cp_min + Math.random() * (pokemon.cp_max - pokemon.cp_min))
    // Tijdens legendary fase: altijd legendary type, ongeacht keuze in form
    const effectiveSpawnType = isLegendaryPhase ? 'legendary' : spawnForm.spawnType
    await supabase.from('active_spawns').insert({
      game_session_id: initialSession.id,
      pokemon_definition_id: pokemon.id,
      latitude: pendingSpawnLoc.lat,
      longitude: pendingSpawnLoc.lng,
      spawn_type: effectiveSpawnType,
      cp,
      requires_opdracht: spawnForm.requiresOpdracht,
      catch_radius_meters: spawnForm.catchRadius || 50,
      status: 'active',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    const notif = buildSpawnNotification(pokemon, effectiveSpawnType)
    await supabase.from('notifications').insert({
      game_session_id: initialSession.id,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      emoji: notif.emoji,
    })
    setPendingSpawnLoc(null)
    setMapMode('view')
  }

  async function handlePhaseChange(newPhase) {
    const { error } = await supabase
      .from('game_sessions')
      .update({ status: newPhase })
      .eq('id', initialSession.id)
    if (!error) {
      // Optimistic update zodat UI direct reageert (ongeacht realtime)
      refetch()
    }
  }

  async function confirmEvent(eventId) {
    await supabase.from('events_log').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', eventId)
    await supabase.from('events_log').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', eventId)
  }

  async function rejectEvent(eventId) {
    await supabase.from('events_log').update({ status: 'rejected' }).eq('id', eventId)
  }

  async function triggerEvent(key) {
    // Shuffle: extra confirmatie (onomkeerbaar — herverdeelt alle catches)
    if (key === 'shuffle') {
      const ok = window.confirm(
        '🔀 Shuffle zal ALLE gevangen Bokémon random herverdelen tussen beide teams.\n\n' +
        'Dit is onomkeerbaar. Doorgaan?'
      )
      if (!ok) return
      await runShuffle()
      return // runShuffle logt zelf events_log + notificatie
    }

    await supabase.from('events_log').insert({
      game_session_id: initialSession.id,
      event_key: key,
      triggered_by: 'admin',
      status: 'active',
      started_at: new Date().toISOString(),
    })
    // Verstuur notificatie
    const eventNames = {
      blood_moon:  'Ponyta Sky 🔥',
      shuffle:     'Shuffle 🔀',
      legendary:   'Legendary Spawn 👑',
      shiny_hunt:  'Shiny Hunt ✨',
    }
    const eventMessages = {
      blood_moon: 'A wild Ponyta appeared and lit the sky! Iedereen is zichtbaar voor iedereen (3 min).',
      legendary:  'Een Legendary Bokémon is verschenen — de verzamelfase loopt af!',
      shiny_hunt: 'Een zeldzame Shiny Bokémon is gespot — zoek snel!',
    }
    await supabase.from('notifications').insert({
      game_session_id: initialSession.id,
      title: `⚡ Event: ${eventNames[key] || key}`,
      message: eventMessages[key] || 'Team Rocket heeft een event getriggerd!',
      type: 'event', emoji: '⚡',
    })
  }

  // ── Shuffle: herverdeel alle catches random tussen teams ────────
  async function runShuffle() {
    if (!teams || teams.length < 2) return
    // Verse fetch om zeker te zijn dat we alle recente catches meenemen
    const { data: allCatches } = await supabase.from('catches')
      .select('id, team_id')
      .eq('game_session_id', initialSession.id)

    if (!allCatches || allCatches.length === 0) {
      await supabase.from('notifications').insert({
        game_session_id: initialSession.id,
        title: '🔀 Shuffle mislukt',
        message: 'Geen Bokémon om te shufflen.',
        type: 'warning', emoji: '🔀',
      })
      return
    }

    // Random herverdeling: per catch 50/50 welk team
    const teamIds = teams.map(t => t.id)
    const updates = allCatches.map(c => ({
      id: c.id,
      new_team: teamIds[Math.floor(Math.random() * teamIds.length)],
    }))

    // Batch-update — geen upsert (zou created_at verkrachten), per-rij update
    for (const u of updates) {
      if (u.new_team !== allCatches.find(c => c.id === u.id)?.team_id) {
        await supabase.from('catches').update({ team_id: u.new_team }).eq('id', u.id)
      }
    }

    // Log in events_log
    await supabase.from('events_log').insert({
      game_session_id: initialSession.id,
      event_key: 'shuffle',
      triggered_by: 'admin',
      status: 'active',
      started_at: new Date().toISOString(),
      data: { shuffled_count: allCatches.length },
    })

    // Notificatie voor ALLE spelers (geen target_team_id)
    await supabase.from('notifications').insert({
      game_session_id: initialSession.id,
      title: '🔀 SHUFFLE!',
      message: `${allCatches.length} Bokémon zijn random herverdeeld. Check je inventaris!`,
      type: 'event', emoji: '🔀',
    })

    refetch()
  }

  async function toggleShop() {
    const newActive = !shopActive
    setShopActive(newActive)
    // Schrijf naar DB zodat speler-app dit ook ziet
    await supabase.from('game_sessions')
      .update({ mobile_shop_active: newActive })
      .eq('id', initialSession.id)
    if (newActive) {
      await supabase.from('notifications').insert({
        game_session_id: initialSession.id,
        title: '🏪 Mobiele Shop is open!',
        message: 'Team Rocket heeft de shop geopend. Kom snel!',
        type: 'success', emoji: '🏪',
      })
    }
  }

  // Sync state met session-velden zodra die binnenkomen
  useEffect(() => {
    if (!session) return
    if (typeof session.mobile_shop_active === 'boolean' && session.mobile_shop_active !== shopActive) {
      setShopActive(session.mobile_shop_active)
    }
    if (Array.isArray(session.mobile_shop_items)) {
      setShopItems(session.mobile_shop_items)
    }
    if (session.hq_location && session.hq_location.lat && session.hq_location.lng) {
      setHqLatLng({ lat: String(session.hq_location.lat), lng: String(session.hq_location.lng) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.mobile_shop_active, session?.hq_location, session?.mobile_shop_items])

  async function saveShopItems(items) {
    setShopItems(items)
    await supabase.from('game_sessions')
      .update({ mobile_shop_items: items })
      .eq('id', initialSession.id)
  }

  async function saveHqLocation(lat, lng) {
    if (!lat || !lng) return
    const loc = { lat: +lat, lng: +lng }
    setHqLatLng({ lat: String(lat), lng: String(lng) })
    await supabase.from('game_sessions')
      .update({ hq_location: loc })
      .eq('id', initialSession.id)
  }

  const teamScores = teams.map(t => {
    const tc = catches.filter(c => c.team_id === t.id)
    return { ...t, pokemonCount: tc.length, totalXP: tc.reduce((sum, c) => sum + c.cp, 0) }
  })

  // Opdracht-executie statistieken op basis van catches (catches hebben opdracht_id)
  const opdrachtStats = (() => {
    const out = {}
    for (const c of catches || []) {
      if (!c.opdracht_id) continue
      if (!out[c.opdracht_id]) out[c.opdracht_id] = { count: 0, last: null }
      out[c.opdracht_id].count += 1
      const ts = c.created_at
      if (ts && (!out[c.opdracht_id].last || ts > out[c.opdracht_id].last)) {
        out[c.opdracht_id].last = ts
      }
    }
    return out
  })()

  // Per-team Pokédex: { teamId: { [pokemonKey]: { name, emoji, count, topXP } } }
  const teamPokedex = (() => {
    const out = {}
    for (const t of teams) out[t.id] = {}
    for (const c of catches || []) {
      const pd = c.pokemon_definitions
      if (!pd || !c.team_id) continue
      const bucket = out[c.team_id] || (out[c.team_id] = {})
      const key = pd.id || pd.name
      if (!bucket[key]) {
        bucket[key] = { name: pd.name, emoji: pd.sprite_emoji, count: 0, topXP: 0 }
      }
      bucket[key].count += 1
      if ((c.cp || 0) > bucket[key].topXP) bucket[key].topXP = c.cp || 0
    }
    return out
  })()

  const currentPhase = session?.status || 'setup'
  const isLegendaryPhase = !!(session?.legendary_phase_started_at)
  const pendingEvents = events.filter(e => e.status === 'pending')

  return (
    <div className="screen">
      <NotificationBanner notifications={notifications} />

      {/* Topbar */}
      <div className="topbar">
        <div style={{ fontWeight: 800 }}>👑 Team Rocket</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          Code: <strong style={{ color: 'var(--warning)' }}>{session?.game_code}</strong>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700,
          background: currentPhase === 'collecting' ? '#14350f'
                    : currentPhase === 'training'   ? '#1c2e1a'
                    : currentPhase === 'tournament' ? '#2d1a0e'
                    : currentPhase === 'setup'      ? '#1e1e3a' : '#3f1515',
          color: currentPhase === 'collecting' ? 'var(--success)'
               : currentPhase === 'training'   ? '#86efac'
               : currentPhase === 'tournament' ? 'var(--warning)'
               : 'var(--text2)',
        }}>
          { currentPhase === 'collecting' ? '🟢 Verzamelfase'
          : currentPhase === 'training'   ? '🌿 Trainingsfase'
          : currentPhase === 'tournament' ? '🏆 Toernooifase'
          : currentPhase === 'finished'   ? '⏹️ Afgelopen'
          : '⚙️ Setup' }
        </div>
      </div>

      {/* Tab navigatie */}
      {(() => {
        const pendingEvoCount = evoRequests.filter(r => r.status === 'pending').length
        const isTestMode = !!session?.is_test_mode
        const baseTabs = [['dashboard','📊'], ['map','🗺️'], ['events','⚡'], ['pokedex','📖'], ['tournament','🏆'], ['finale','⚔️'], ['setup','⚙️']]
        const tabs = isTestMode ? [...baseTabs, ['test','🧪']] : baseTabs
        return (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
            {tabs.map(([key, icon]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === key ? 'var(--accent)' : 'var(--text2)', fontSize: 20,
                position: 'relative',
              }}>
                {icon}
                {key === 'dashboard' && pendingEvoCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: '18%',
                    background: 'var(--warning)', color: '#000',
                    borderRadius: 99, fontSize: 10, fontWeight: 900,
                    width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}>
                    {pendingEvoCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Dashboard */}
      {tab === 'dashboard' && (
        <div className="scroll-area">
          {/* Team scores */}
          {teamScores.map(t => (
            <div key={t.id} className="card" style={{ borderLeft: `4px solid ${t.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{t.emoji} {t.name}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 2 }}>
                    {t.pokemonCount} Bokémon
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--warning)' }}>
                  {t.totalXP} XP
                </div>
              </div>
            </div>
          ))}

          {/* Per-team Pokédex */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>📘 Pokédex per team</h3>
            {teams.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>Geen teams.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {teams.map(t => {
                  const bucket = teamPokedex[t.id] || {}
                  const entries = Object.values(bucket).sort((a, b) => b.count - a.count || b.topXP - a.topXP)
                  const totalCount = entries.reduce((s, e) => s + e.count, 0)
                  const openDetail = () => { setPokedexView(t.id); setTab('pokedex') }
                  return (
                    <div
                      key={t.id}
                      onClick={openDetail}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openDetail() }}
                      style={{
                        borderLeft: `3px solid ${t.color}`, paddingLeft: 10,
                        cursor: 'pointer', borderRadius: 6,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{t.emoji} {t.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                          {entries.length} soorten · {totalCount} gevangen
                        </div>
                        <div style={{ marginLeft: 'auto', fontSize: 11, color: t.color, fontWeight: 700 }}>
                          Beheer →
                        </div>
                      </div>
                      {entries.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
                          Nog niets gevangen
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {entries.map(e => (
                            <div key={e.name} style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 9px', borderRadius: 99,
                              background: 'var(--bg3)', border: '1px solid var(--border)',
                              fontSize: 12,
                            }}>
                              <span style={{ fontSize: 16, lineHeight: 1 }}>{e.emoji || '❓'}</span>
                              <span style={{ fontWeight: 600 }}>{e.name}</span>
                              {e.count > 1 && (
                                <span style={{
                                  fontSize: 10, fontWeight: 800, color: 'var(--warning)',
                                  background: 'rgba(245,158,11,0.15)', padding: '0 6px',
                                  borderRadius: 99,
                                }}>×{e.count}</span>
                              )}
                              <span style={{ fontSize: 10, color: 'var(--text2)' }}>
                                {e.topXP} XP
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Opdrachten wachten op toewijzing (enkel als type bepaald is) */}
          {spawns.filter(s =>
            s.status === 'catching' && s.requires_opdracht && !s.opdracht_id && !s.challenge_assigned_at &&
            s.active_opdracht_type !== null && s.active_opdracht_type !== undefined
          ).map(s => {
            const pok = s.pokemon_definitions
            const isT2T = s.active_opdracht_type === 2
            return (
              <div key={s.id} className="card" style={{ borderColor: 'var(--warning)', borderWidth: 2, background: 'rgba(245,158,11,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{pok?.sprite_emoji || '❓'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      ⚡ {pok?.name} — {isT2T ? '⚔️ T2T opdracht nodig!' : '🎯 Solo opdracht nodig!'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      {isT2T ? 'Beide teams aanwezig — trainers wachten' : 'Één team aanwezig — trainers wachten'}
                    </div>
                  </div>
                  <button onClick={() => setChallengeSelectorSpawn(s)} style={{
                    padding: '8px 14px', borderRadius: 10, background: 'var(--warning)',
                    border: 'none', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  }}>🎯 Wijs toe</button>
                </div>
              </div>
            )
          })}

          {/* Spawns waarbij wachttijd loopt (team 1 er, team 2 nog onderweg) */}
          {spawns.filter(s =>
            s.status === 'catching' && (s.active_opdracht_type === null || s.active_opdracht_type === undefined)
          ).map(s => {
            const pok = s.pokemon_definitions
            const elapsed = s.catch_team1_arrived_at ? Math.floor((Date.now() - new Date(s.catch_team1_arrived_at).getTime()) / 1000) : 0
            const remaining = Math.max(0, (session?.catch_wait_seconds || 90) - elapsed)
            return (
              <div key={s.id} className="card" style={{ borderColor: 'var(--info)', background: 'rgba(59,130,246,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{pok?.sprite_emoji || '❓'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>⏳ {pok?.name} — wacht op team 2</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      Nog {remaining}s · Opdracht toewijzen wordt straks gevraagd
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Online trainers */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>👥 Trainers</h3>
            {players.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name} {p.is_admin ? '👑' : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {teams.find(t => t.id === p.team_id)?.name || 'Geen team'}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: p.is_online ? 'var(--success)' : 'var(--text2)' }}>
                  {p.is_online ? '● Online' : '○ Offline'}
                </div>
              </div>
            ))}
          </div>

          {/* Fase controls */}
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>🎮 Fase Beheer</h3>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
              Huidige fase: <strong style={{ color: 'var(--text)' }}>
                { currentPhase === 'collecting' ? '🟢 Verzamelfase'
                : currentPhase === 'training'   ? '🌿 Trainingsfase'
                : currentPhase === 'tournament' ? '🏆 Toernooifase'
                : currentPhase === 'finished'   ? '⏹️ Afgelopen'
                : '⚙️ Setup' }
              </strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn btn-success btn-sm"
                onClick={() => handlePhaseChange('collecting')}
                disabled={currentPhase === 'collecting'}
              >
                🟢 Start Verzamelfase
              </button>

              {/* Legendarische Eindfase — alleen tonen tijdens verzamelfase */}
              {currentPhase === 'collecting' && (
                <button
                  className="btn btn-sm"
                  style={{
                    background: isLegendaryPhase ? '#3b2800' : '#1a1200',
                    color: isLegendaryPhase ? '#fbbf24' : '#d97706',
                    border: `1px solid ${isLegendaryPhase ? '#92400e' : '#78350f'}`,
                    opacity: isLegendaryPhase ? 0.6 : 1,
                    cursor: isLegendaryPhase ? 'default' : 'pointer',
                  }}
                  disabled={isLegendaryPhase}
                  onClick={async () => {
                    if (!window.confirm('⚡ Legendarische Eindfase starten?\nPikachu spawnt automatisch op de kaart. Alle volgende spawns worden legendary.')) return
                    await startLegendaryPhase(initialSession.id)
                    refetch()
                  }}
                >
                  {isLegendaryPhase ? '👑 Legendarische Eindfase Actief' : '👑 Start Legendarische Eindfase'}
                </button>
              )}

              <button
                className="btn btn-sm"
                style={{ background: '#166534', color: '#86efac', border: '1px solid #166534' }}
                onClick={() => handlePhaseChange('training')}
                disabled={currentPhase === 'training'}
              >
                🌿 Start Trainingsfase
              </button>
              <button
                className="btn btn-warning btn-sm"
                onClick={() => handlePhaseChange('tournament')}
                disabled={currentPhase === 'tournament'}
              >
                🏆 Start Toernooifase
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handlePhaseChange('finished')}
                disabled={currentPhase === 'finished'}
              >
                ⏹️ Spel Afsluiten
              </button>
            </div>

            {/* ── Test-modus toggle ───────────────────────── */}
            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  🧪 Test-modus
                  {session?.is_test_mode && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, background: '#a855f7', color: '#fff',
                      padding: '1px 6px', borderRadius: 99,
                    }}>AAN</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>
                  Toont de 🧪-tab met seeders, reset-knoppen en item-editor. Niet gebruiken bij live spel.
                </div>
              </div>
              <button
                onClick={async () => {
                  const next = !session?.is_test_mode
                  if (next) {
                    if (!window.confirm('🧪 Test-modus activeren?\n\nDe 🧪-tab verschijnt met tools om catches/items te seeden en de state te wissen. Niet gebruiken tijdens een live spel met echte spelers.')) return
                  }
                  await supabase.from('game_sessions')
                    .update({ is_test_mode: next })
                    .eq('id', initialSession.id)
                  refetch()
                }}
                style={{
                  padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontWeight: 800, fontSize: 12, minWidth: 70, flexShrink: 0,
                  background: session?.is_test_mode ? '#a855f7' : 'var(--bg3)',
                  color: session?.is_test_mode ? '#fff' : 'var(--text2)',
                  boxShadow: session?.is_test_mode ? '0 0 14px #a855f766' : 'none',
                }}
              >
                {session?.is_test_mode ? 'Zet UIT' : 'Zet AAN'}
              </button>
            </div>
          </div>

          {/* ── Evolutieverzoeken ── */}
          {(() => {
            const pendingEvo = evoRequests.filter(r => r.status === 'pending')
            const recentEvo  = evoRequests.filter(r => r.status !== 'pending' &&
              r.resolved_at && Date.now() - new Date(r.resolved_at).getTime() < 60_000)
            if (pendingEvo.length === 0 && recentEvo.length === 0) return null
            return (
              <div className="card" style={{ borderLeft: pendingEvo.length > 0 ? '4px solid var(--warning)' : '4px solid var(--success)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>⬆️ Evolutieverzoeken</h3>
                  {pendingEvo.length > 0 && (
                    <span style={{
                      background: 'var(--warning)', color: '#000',
                      borderRadius: 99, fontSize: 12, fontWeight: 800,
                      padding: '2px 8px', minWidth: 22, textAlign: 'center',
                    }}>
                      {pendingEvo.length}
                    </span>
                  )}
                </div>

                {pendingEvo.map(req => {
                  const catchItem = req.catches
                  const def       = catchItem?.pokemon_definitions
                  const chain     = def?.evolution_chain || []
                  const fromName  = chain[req.from_stage] || def?.name || '?'
                  const toName    = chain[req.to_stage]   || '?'
                  const teamInfo  = req.teams
                  const isResolving = resolvingEvo === req.id
                  return (
                    <div key={req.id} style={{
                      background: 'var(--bg3)', borderRadius: 10, padding: 12,
                      marginBottom: 10, border: '1px solid var(--warning)',
                    }}>
                      {/* Team + Pokémon */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 36 }}>{def?.sprite_emoji || '❓'}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: 15 }}>
                              {fromName} → {toName}
                            </span>
                            {req.used_moon_stone && (
                              <span style={{ fontSize: 11, background: '#facc15', color: '#000', borderRadius: 99, padding: '1px 6px', fontWeight: 700 }}>
                                🌙 Moon Stone
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text2)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ color: teamInfo?.color || 'var(--text)', fontWeight: 700 }}>
                              {teamInfo?.emoji} {teamInfo?.name}
                            </span>
                            {!req.used_moon_stone && def?.linked_beer && (
                              <span>🍺 {def.linked_beer}</span>
                            )}
                            <span>{catchItem?.cp} XP</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                            Aangevraagd {new Date(req.requested_at).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      {/* Instructie voor admin */}
                      {!req.used_moon_stone && (
                        <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600, marginBottom: 8, padding: '6px 10px', background: 'rgba(234,179,8,0.08)', borderRadius: 6 }}>
                          🍺 Bevestig dat de trainers van {teamInfo?.name} echt {def?.linked_beer} gedronken hebben.
                        </div>
                      )}
                      {req.used_moon_stone && (
                        <div style={{ fontSize: 12, color: '#facc15', fontWeight: 600, marginBottom: 8, padding: '6px 10px', background: 'rgba(250,204,21,0.08)', borderRadius: 6 }}>
                          🌙 Moon Stone — geen bier nodig. Direct goedkeuren.
                        </div>
                      )}

                      {/* Actieknoppen */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-success btn-sm"
                          style={{ flex: 2, padding: '10px 0', fontSize: 15 }}
                          disabled={isResolving}
                          onClick={() => approveEvolution(req)}
                        >
                          {isResolving ? '⏳' : `✅ Goedkeuren`}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ flex: 1, padding: '10px 0', fontSize: 15 }}
                          disabled={isResolving}
                          onClick={() => rejectEvolution(req, 'Drink eerst het bier!')}
                        >
                          ❌
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Recent afgehandeld */}
                {recentEvo.map(req => {
                  const def      = req.catches?.pokemon_definitions
                  const chain    = def?.evolution_chain || []
                  const fromName = chain[req.from_stage] || def?.name || '?'
                  const toName   = chain[req.to_stage]   || '?'
                  return (
                    <div key={req.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', borderRadius: 8,
                      background: req.status === 'approved' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                      fontSize: 13, color: req.status === 'approved' ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 600, marginBottom: 6,
                    }}>
                      <span>{req.status === 'approved' ? '✅' : '❌'}</span>
                      <span>{def?.sprite_emoji} {fromName} → {toName}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)' }}>
                        {req.teams?.emoji} {req.teams?.name}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Mobiele shop */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>🏪 Mobiele Shop</h3>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>Volgt jouw GPS locatie</p>
              </div>
              <button
                className={`btn btn-sm ${shopActive ? 'btn-danger' : 'btn-success'}`}
                style={{ width: 'auto', padding: '8px 16px' }}
                onClick={toggleShop}
              >
                {shopActive ? '🔴 Sluiten' : '🟢 Openen'}
              </button>
            </div>
          </div>

          {/* Auto spawn */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => autoSpawnPokemon(initialSession.id)}>
              🎲 Random Spawn
            </button>
            <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={async () => {
              if (!window.confirm('Alle actieve spawns verwijderen?')) return
              await supabase.from('active_spawns')
                .update({ status: 'expired' })
                .in('status', ['active', 'catching'])
                .eq('game_session_id', initialSession.id)
            }}>
              🗑️ Wis alle spawns
            </button>
          </div>

          {/* Direct toewijzen is verplaatst naar de gedetailleerde Pokédex per team (📖) */}
        </div>
      )}

      {/* Live kaart */}
      {tab === 'map' && (
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer
            center={(() => {
              const boundary = areas.find(a => a.type === 'boundary')
              const fieldCenter = boundary ? getPolygonCenter(boundary.geojson) : null
              return position ? [position.lat, position.lon] : (fieldCenter || DEFAULT_CENTER)
            })()}
            zoom={DEFAULT_ZOOM}
            ref={mapRef}
            style={{ height: '100%' }}
            zoomControl={false}
          >
            <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            <MapClickHandler mode={mapMode} onMapClick={handleMapClick} />
            <MapAutoCenter areas={areas} position={position} />

            {/* Gebieden */}
            {areas.filter(a => a.type === 'boundary').map(area => {
              const coords = area.geojson?.geometry?.coordinates?.[0] || []
              const latLngs = coords.map(([lon, lat]) => [lat, lon])
              return latLngs.length > 2 ? <Polygon key={area.id} positions={latLngs} pathOptions={{ color: '#7c3aed', fillOpacity: 0, weight: 3, dashArray: '8,5' }} /> : null
            })}
            {areas.filter(a => a.type === 'biome').map(area => {
              const coords = area.geojson?.geometry?.coordinates?.[0] || []
              const latLngs = coords.map(([lon, lat]) => [lat, lon])
              const typeInfo = POKEMON_TYPES[area.pokemon_type] || {}
              return latLngs.length > 2 ? <Polygon key={area.id} positions={latLngs} pathOptions={{ color: typeInfo.mapColor || '#fff', fillColor: typeInfo.mapColor || '#fff', fillOpacity: 0.15, weight: 1 }} /> : null
            })}

            {/* Tekenen polygon preview */}
            {drawingPoints.length > 1 && (
              <Polygon positions={drawingPoints} pathOptions={{ color: 'var(--warning)', fillOpacity: 0.2, weight: 2, dashArray: '4,4' }} />
            )}
            {drawingPoints.map((p, i) => (
              <Marker key={i} position={p} icon={makeEmojiIcon('📌', 20)} />
            ))}

            {/* Alle trainers */}
            {players.filter(p => p.latitude && p.longitude).map(p => {
              const t = teams.find(t => t.id === p.team_id)
              return (
                <Marker key={p.id} position={[Number(p.latitude), Number(p.longitude)]} icon={makeEmojiIcon(t?.emoji || '👤', 26)}>
                  <Popup><div className="spawn-popup"><h4>{p.name}</h4><p>{t?.name || 'Geen team'}</p></div></Popup>
                </Marker>
              )
            })}

            {/* Spawns — klik opent detail panel buiten Leaflet */}
            {spawns.map(spawn => {
              const pokemon = spawn.pokemon_definitions
              const isSelected = selectedSpawn?.id === spawn.id
              const isFading = spawn.fade_duration_seconds && spawn.expires_at
              let icon
              if (isSelected) {
                icon = makeEmojiIcon('🎯', 38)
              } else if (isFading) {
                const total = spawn.fade_duration_seconds
                const elapsed = Math.max(0, (nowMs - (new Date(spawn.expires_at) - total * 1000)) / 1000)
                icon = makeCountdownIcon(pokemon.sprite_emoji, total, elapsed)
              } else {
                icon = makeEmojiIcon(pokemon.sprite_emoji, 32)
              }
              return pokemon ? (
                <Marker key={spawn.id} position={[Number(spawn.latitude), Number(spawn.longitude)]}
                  icon={icon}
                  eventHandlers={{ click: () => setSelectedSpawn(selectedSpawn?.id === spawn.id ? null : spawn) }}
                />
              ) : null
            })}

            {/* Pending spawn locatie */}
            {pendingSpawnLoc && (
              <Marker position={[pendingSpawnLoc.lat, pendingSpawnLoc.lng]} icon={makeEmojiIcon('⭐', 32)} />
            )}

            {/* HQ-locatie marker (admin-zichtbaar) */}
            {session?.hq_location?.lat && session?.hq_location?.lng && (
              <Marker
                position={[+session.hq_location.lat, +session.hq_location.lng]}
                icon={makeEmojiIcon('🏚️', 36)}
              >
                <Popup><div className="spawn-popup"><h4>🏚️ Team Rocket HQ</h4></div></Popup>
              </Marker>
            )}
          </MapContainer>

          {/* HQ-locatie tap-mode banner */}
          {mapMode === 'hq_location' && (
            <div style={{
              position: 'absolute', top: 12, left: 12, right: 12, zIndex: 600,
              background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 12,
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 20 }}>🏚️</span>
              <div style={{ flex: 1, fontSize: 13, color: '#fca5a5', fontWeight: 700 }}>
                Tik op de kaart om de HQ-locatie te zetten
              </div>
              <button onClick={() => setMapMode('view')} style={{ background: 'none', border: 'none', color: '#fca5a5', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
          )}

          {/* Map mode toolbar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--bg2)', borderTop: '1px solid var(--border)', padding: '10px 12px', zIndex: 500, display: 'flex', gap: 8, overflowX: 'auto' }}>
            <button className={`btn btn-sm ${mapMode === 'spawn' ? 'btn-primary' : 'btn-ghost'}`} style={{ flexShrink: 0 }} onClick={() => setMapMode(mapMode === 'spawn' ? 'view' : 'spawn')}>
              🎯 Spawn
            </button>
            <button className={`btn btn-sm ${mapMode === 'boundary' ? 'btn-primary' : 'btn-ghost'}`} style={{ flexShrink: 0 }} onClick={() => setMapMode(mapMode === 'boundary' ? 'view' : 'boundary')}>
              📐 Speelveld
            </button>
            <button className={`btn btn-sm ${mapMode === 'biome' ? 'btn-primary' : 'btn-ghost'}`} style={{ flexShrink: 0 }} onClick={() => setMapMode(mapMode === 'biome' ? 'view' : 'biome')}>
              🌿 Biome
            </button>
            {areas.some(a => a.type === 'boundary') && (
              <button
                className="btn btn-sm btn-ghost"
                style={{ flexShrink: 0 }}
                onClick={() => {
                  const boundary = areas.find(a => a.type === 'boundary')
                  if (!boundary) return
                  const coords = boundary.geojson?.geometry?.coordinates?.[0] || []
                  const pts = coords.map(([lon, lat]) => [lat, lon])
                  if (pts.length > 1) {
                    setSavedBoundaryPoints(pts.slice(0, -1))
                    setAutoZonesPreview(generateAutoZones(pts.slice(0, -1)))
                    setBiomeChoiceStep('choice')
                    setShowBiomeChoice(true)
                  }
                }}
              >
                🔄 Herindelen
              </button>
            )}
            {(mapMode === 'boundary' || mapMode === 'biome') && drawingPoints.length >= 3 && (
              <button className="btn btn-success btn-sm" style={{ flexShrink: 0 }} onClick={savePolygon}>
                💾 Opslaan
              </button>
            )}
            {(mapMode === 'boundary' || mapMode === 'biome') && drawingPoints.length > 0 && (
              <button className="btn btn-danger btn-sm" style={{ flexShrink: 0 }} onClick={() => setDrawingPoints([])}>
                ✕ Reset
              </button>
            )}
          </div>

          {/* Spawn form popup */}
          {mapMode === 'spawn' && pendingSpawnLoc && (() => {
            const biomeInfo = detectedBiomeType ? POKEMON_TYPES[detectedBiomeType] : null
            const sortedPokemons = detectedBiomeType
              ? [...pokemons].sort((a, b) => {
                  if (a.pokemon_type === detectedBiomeType && b.pokemon_type !== detectedBiomeType) return -1
                  if (b.pokemon_type === detectedBiomeType && a.pokemon_type !== detectedBiomeType) return 1
                  return 0
                })
              : pokemons
            return (
              <div style={{ position: 'absolute', top: 12, left: 12, right: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, zIndex: 600 }}>
                <h3 style={{ marginBottom: 8 }}>🎯 Spawn configureren</h3>
                {biomeInfo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '6px 10px', borderRadius: 99, background: biomeInfo.color + '33', border: `1px solid ${biomeInfo.color}` }}>
                    <span style={{ fontSize: 16 }}>{biomeInfo.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: biomeInfo.color }}>{biomeInfo.label} biome — dat type staat bovenaan</span>
                  </div>
                )}
                <div className="field">
                  <label>Bokémon</label>
                  <select value={spawnForm.pokemonId} onChange={e => setSpawnForm(f => ({ ...f, pokemonId: e.target.value }))}>
                    <option value="">Kies...</option>
                    {(() => {
                      // Groepeer per type; biome-type eerst
                      const typeOrder = detectedBiomeType
                        ? [detectedBiomeType, ...Object.keys(POKEMON_TYPES).filter(t => t !== detectedBiomeType)]
                        : Object.keys(POKEMON_TYPES)
                      return typeOrder.map(typeKey => {
                        const group = pokemons.filter(p => p.pokemon_type === typeKey)
                        if (group.length === 0) return null
                        const tInfo = POKEMON_TYPES[typeKey] || {}
                        const label = typeKey === detectedBiomeType
                          ? `${tInfo.emoji} ${tInfo.label} (aanbevolen voor deze biome)`
                          : `${tInfo.emoji} ${tInfo.label}`
                        return (
                          <optgroup key={typeKey} label={label}>
                            {group.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.sprite_emoji} {p.name} ({p.cp_min}–{p.cp_max} XP)
                              </option>
                            ))}
                          </optgroup>
                        )
                      })
                    })()}
                  </select>
                </div>
                <div className="field">
                  <label>Type</label>
                  {isLegendaryPhase ? (
                    <div style={{
                      padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: '#1a1200', color: '#fbbf24', border: '1px solid #92400e',
                    }}>
                      👑 Automatisch Legendary (eindfase actief)
                    </div>
                  ) : (
                    <select value={spawnForm.spawnType} onChange={e => setSpawnForm(f => ({ ...f, spawnType: e.target.value }))}>
                      <option value="normal">⬜ Normaal</option>
                      <option value="shiny">✨ Blinkend</option>
                      <option value="mystery">❓ Mystery</option>
                    </select>
                  )}
                </div>
                <div className="field">
                  <label>Vangst-radius (meter)</label>
                  <input type="number" min={10} max={500} value={spawnForm.catchRadius}
                    onChange={e => setSpawnForm(f => ({ ...f, catchRadius: Number(e.target.value) }))}
                    style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={spawnPokemon} disabled={!spawnForm.pokemonId}>✅ Spawnen</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setPendingSpawnLoc(null); setDetectedBiomeType(null); setMapMode('view') }}>✕</button>
                </div>
              </div>
            )
          })()}

          {/* Geselecteerde spawn — detail panel onderaan */}
          {selectedSpawn && !pendingSpawnLoc && (() => {
            const pokemon = selectedSpawn.pokemon_definitions
            if (!pokemon) return null
            return (
              <div style={{ position: 'absolute', bottom: 58, left: 0, right: 0, background: 'var(--card)', borderTop: '2px solid var(--border)', padding: '12px 16px', zIndex: 600 }}>
                {/* Header: pokemon info + sluit */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 34, lineHeight: 1 }}>{pokemon.sprite_emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{pokemon.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {selectedSpawn.cp} XP · {selectedSpawn.spawn_type} · {selectedSpawn.catch_radius_meters || 50}m radius
                      {selectedSpawn.fade_duration_seconds ? ` · ⏱ fade actief` : ''}
                    </div>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}
                    onClick={() => setSelectedSpawn(null)}>✕</button>
                </div>

                {/* Acties: twee rijen */}
                {/* Opdracht-status balk */}
                {selectedSpawn.requires_opdracht && (
                  <div style={{
                    marginBottom: 10, padding: '8px 12px', borderRadius: 8,
                    background: selectedSpawn.opdracht_id ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                    border: `1px solid ${selectedSpawn.opdracht_id ? 'var(--success)' : 'var(--warning)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ fontSize: 12 }}>
                      {selectedSpawn.opdracht_id
                        ? <span style={{ color: 'var(--success)' }}>✅ Opdracht gekoppeld{selectedSpawn.challenge_auto_assigned ? ' (auto)' : ''}</span>
                        : <span style={{ color: 'var(--warning)' }}>⚡ Nog geen opdracht</span>
                      }
                    </div>
                    <button
                      onClick={() => setChallengeSelectorSpawn(selectedSpawn)}
                      style={{
                        padding: '4px 10px', borderRadius: 7,
                        background: selectedSpawn.opdracht_id ? 'var(--bg2)' : 'var(--warning)',
                        border: 'none', color: selectedSpawn.opdracht_id ? 'var(--text2)' : '#000',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {selectedSpawn.opdracht_id ? '🔄 Wijzig' : '🎯 Wijs toe'}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Verwijderen */}
                  <button
                    disabled={deletingSpawn}
                    style={{ flex: 1, background: 'var(--danger)', border: 'none', borderRadius: 10, color: 'white', padding: '12px 0', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: deletingSpawn ? 0.5 : 1 }}
                    onClick={async () => {
                      setDeletingSpawn(true)
                      const { error } = await supabase.from('active_spawns')
                        .update({ status: 'expired' })
                        .eq('id', selectedSpawn.id)
                      if (error) alert('Fout: ' + error.message)
                      setSelectedSpawn(null)
                      setDeletingSpawn(false)
                    }}
                  >
                    {deletingSpawn ? '⏳' : '🗑️ Verwijderen'}
                  </button>

                  {/* Fade met timer */}
                  <div style={{ flex: 2, display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg3)', borderRadius: 10, padding: '8px 10px' }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>⏱ Fade na</span>
                    <input
                      type="number" min={5} max={600}
                      value={pendingFadeSeconds}
                      onChange={e => setPendingFadeSeconds(Number(e.target.value))}
                      style={{ width: 52, padding: '4px 6px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, fontWeight: 700, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>sec</span>
                    <button
                      style={{ background: 'var(--warning)', border: 'none', borderRadius: 8, color: '#000', padding: '6px 10px', fontWeight: 800, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                      onClick={async () => {
                        const sec = Math.max(5, pendingFadeSeconds || 60)
                        const expiresAt = new Date(Date.now() + sec * 1000).toISOString()
                        // Probeer met fade_duration_seconds; fallback op enkel expires_at
                        let { error } = await supabase.from('active_spawns')
                          .update({ expires_at: expiresAt, fade_duration_seconds: sec })
                          .eq('id', selectedSpawn.id)
                        if (error) {
                          const { error: err2 } = await supabase.from('active_spawns')
                            .update({ expires_at: expiresAt })
                            .eq('id', selectedSpawn.id)
                          if (err2) { alert('Fout: ' + err2.message); return }
                        }
                        setSelectedSpawn(null)
                      }}
                    >
                      ✓ Instellen
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {mapMode === 'biome' && (
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 12, zIndex: 600 }}>
              <label style={{ marginBottom: 8 }}>Biome type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(POKEMON_TYPES).map(([key, info]) => (
                  <button key={key} onClick={() => setSelectedBiomeType(key)} style={{
                    padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    background: selectedBiomeType === key ? info.color : 'var(--bg3)', color: 'white',
                  }}>{info.emoji} {info.label}</button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                Tik op de kaart om punten toe te voegen. Min. 3 punten → Opslaan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Events tab */}
      {tab === 'events' && (
        <div className="scroll-area">
          {/* Pending events */}
          {pendingEvents.length > 0 && (
            <>
              <h3 style={{ marginBottom: 12, color: 'var(--warning)' }}>⏳ Wacht op bevestiging</h3>
              {pendingEvents.map(ev => (
                <div key={ev.id} className="card" style={{ borderColor: 'var(--warning)' }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{ev.event_key} — {ev.data?.reason || ''}</div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
                    Voorgesteld door: game engine
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => confirmEvent(ev.id)}>✅ Bevestigen</button>
                    <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => rejectEvent(ev.id)}>❌ Weigeren</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Handmatige event triggers */}
          <h3 style={{ marginBottom: 12, marginTop: pendingEvents.length ? 20 : 0 }}>🎮 Manueel Triggeren</h3>
          {[
            { key: 'blood_moon', name: 'Ponyta Sky', emoji: '🔥', desc: 'A wild Ponyta appeared and lit the sky — iedereen zichtbaar voor iedereen (3 min)' },
            { key: 'shuffle', name: 'Shuffle', emoji: '🔀', desc: 'Alle Bokémon worden random herverdeeld tussen teams — onomkeerbaar!' },
            { key: 'shiny_hunt', name: 'Shiny Hunt', emoji: '✨', desc: 'Zeldzame Shiny Bokémon appeared' },
            { key: 'legendary', name: 'Legendary Spawn', emoji: '👑', desc: 'Sterkste Bokémon appeared → eindesignaal' },
          ].map(ev => (
            <div key={ev.key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 32, flexShrink: 0 }}>{ev.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{ev.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{ev.desc}</div>
              </div>
              <button className="btn btn-primary btn-sm" style={{ width: 'auto', flexShrink: 0 }} onClick={() => triggerEvent(ev.key)}>
                ▶
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pokédex tab — beide teams of per team */}
      {tab === 'pokedex' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
            <button onClick={() => setPokedexView('both')} style={{
              padding: '8px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13, flexShrink: 0,
              background: pokedexView === 'both' ? 'var(--accent)' : 'var(--card)',
              color: pokedexView === 'both' ? '#fff' : 'var(--text2)',
            }}>🔀 Beide teams</button>
            {teams.map(t => (
              <button key={t.id} onClick={() => setPokedexView(t.id)} style={{
                padding: '8px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, flexShrink: 0,
                background: pokedexView === t.id ? t.color : 'var(--card)',
                color: pokedexView === t.id ? '#fff' : 'var(--text2)',
                boxShadow: pokedexView === t.id ? `0 0 10px ${t.color}66` : 'none',
              }}>{t.emoji} {t.name}</button>
            ))}
          </div>

          {/* Beide-teams view: alle gevangen pokémon met team-tags */}
          {pokedexView === 'both' && (() => {
            // Bouw een map: pokemon_definition_id → { def, perTeam: { teamId: count } }
            const pokedexMap = {}
            for (const c of catches || []) {
              const pd = c.pokemon_definitions
              if (!pd) continue
              const key = pd.id || pd.name
              if (!pokedexMap[key]) pokedexMap[key] = { def: pd, perTeam: {} }
              pokedexMap[key].perTeam[c.team_id] = (pokedexMap[key].perTeam[c.team_id] || 0) + 1
            }
            const entries = Object.values(pokedexMap).sort((a, b) => {
              const ta = Object.values(a.perTeam).reduce((s, n) => s + n, 0)
              const tb = Object.values(b.perTeam).reduce((s, n) => s + n, 0)
              return tb - ta
            })
            if (entries.length === 0) {
              return (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 40 }}>📭</div>
                  <p>Nog geen Bokémon gevangen</p>
                </div>
              )
            }
            return (
              <div className="scroll-area">
                {entries.map(({ def, perTeam }) => {
                  const total = Object.values(perTeam).reduce((s, n) => s + n, 0)
                  return (
                    <div key={def.id || def.name} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 38, flexShrink: 0 }}>{def.sprite_emoji || '❓'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                          {def.name}
                          <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400, marginLeft: 6 }}>×{total}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {teams.map(t => {
                            const count = perTeam[t.id] || 0
                            if (count === 0) return null
                            return (
                              <span key={t.id} style={{
                                padding: '2px 9px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                                background: t.color + '33', color: t.color,
                                border: `1px solid ${t.color}66`,
                              }}>
                                {t.emoji} {t.name}{count > 1 ? ` ×${count}` : ''}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Per-team view: gebruik PokedexScreen embedded (zonder eigen topbar/wrapper) */}
          {pokedexView !== 'both' && (
            <PokedexScreen
              key={pokedexView}
              sessionId={initialSession.id}
              teamId={pokedexView}
              embedded={true}
              onClose={() => setPokedexView('both')}
              isAdmin={true}
              adminPokemons={pokemons}
              adminTeams={teams}
            />
          )}
        </div>
      )}

      {/* Toernooi tab — admin-view van TournamentScreen */}
      {tab === 'tournament' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <TournamentScreen
            session={session || initialSession}
            sessionId={initialSession.id}
            teams={teams}
            players={players}
            catches={catches}
            player={null}
            team={null}
            isAdmin={true}
            onClose={() => setTab('dashboard')}
            onStartFinale={() => setTab('finale')}
          />
        </div>
      )}

      {/* Legendaire Finale tab — admin-view van FinaleScreen */}
      {tab === 'finale' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <FinaleScreen
            session={session || initialSession}
            sessionId={initialSession.id}
            teams={teams}
            catches={catches}
            player={null}
            team={null}
            isAdmin={true}
            onClose={() => setTab('tournament')}
          />
        </div>
      )}

      {/* Setup tab */}
      {tab === 'setup' && (
        <div className="scroll-area">
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>⚙️ Spel Parameters</h3>
            <div className="field">
              <label>Game code</label>
              <input value={session?.game_code || ''} readOnly style={{ color: 'var(--warning)', fontWeight: 800, letterSpacing: 4, textAlign: 'center' }} />
            </div>
            <div className="field">
              <label>Wachttijd op team 2 (seconden)</label>
              <input
                type="number"
                defaultValue={session?.catch_wait_seconds || 90}
                onBlur={e => supabase.from('game_sessions').update({ catch_wait_seconds: Number(e.target.value) }).eq('id', initialSession.id)}
              />
            </div>
            <div className="field">
              <label>Silph Scope duur (minuten)</label>
              <input
                type="number"
                defaultValue={session?.moonstone_duration_minutes || 6}
                onBlur={e => supabase.from('game_sessions').update({ moonstone_duration_minutes: Number(e.target.value) }).eq('id', initialSession.id)}
              />
            </div>
          </div>

          {/* ── Team Rocket HQ-locatie ───────────────────────── */}
          <div className="card" style={{ borderLeft: '3px solid #ef4444' }}>
            <h3 style={{ marginBottom: 6 }}>🏚️ Team Rocket HQ</h3>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
              Eén vaste GPS-locatie waar trainers het HQ kunnen binnendringen (3 mini-game kamers — komen later).
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                type="number" step="0.0000001"
                placeholder="latitude"
                value={hqLatLng.lat}
                onChange={e => setHqLatLng(l => ({ ...l, lat: e.target.value }))}
                style={{ flex: 1, padding: 8, background: '#0d1226', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
              />
              <input
                type="number" step="0.0000001"
                placeholder="longitude"
                value={hqLatLng.lng}
                onChange={e => setHqLatLng(l => ({ ...l, lng: e.target.value }))}
                style={{ flex: 1, padding: 8, background: '#0d1226', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-success btn-sm" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }}
                onClick={() => saveHqLocation(hqLatLng.lat, hqLatLng.lng)}
                disabled={!hqLatLng.lat || !hqLatLng.lng}>
                💾 Opslaan
              </button>
              {position && (
                <button className="btn btn-ghost btn-sm" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }}
                  onClick={() => saveHqLocation(position.lat, position.lon)}>
                  📍 Hier (mijn GPS)
                </button>
              )}
              <button className="btn btn-ghost btn-sm" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }}
                onClick={() => { setMapMode('hq_location'); setTab('map') }}>
                🗺️ Tik op kaart
              </button>
              {(() => {
                const boundary = areas.find(a => a.type === 'boundary')
                if (!boundary) return null
                return (
                  <button className="btn btn-ghost btn-sm" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }}
                    onClick={() => {
                      const c = getPolygonCenter(boundary.geojson)
                      if (c) saveHqLocation(c[0], c[1])
                    }}>
                    🎯 Centrum speelveld
                  </button>
                )
              })()}
            </div>
            {session?.hq_location?.lat && (
              <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 8 }}>
                ✅ HQ ingesteld op {(+session.hq_location.lat).toFixed(5)}, {(+session.hq_location.lng).toFixed(5)}
              </div>
            )}
          </div>

          {/* ── Mobiele Shop catalog ─────────────────────────── */}
          <div className="card" style={{ borderLeft: '3px solid #facc15' }}>
            <h3 style={{ marginBottom: 6 }}>🚐 Mobiele Shop catalog</h3>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
              Kies welke items beschikbaar zijn en wat de prijs is (slokken / uitdaging). Trainers zien dit als ze op de shop tikken op de kaart.
            </p>
            {shopItems.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginBottom: 8 }}>
                Geen items in catalog — voeg er eentje toe.
              </p>
            )}
            {shopItems.map((it, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6,
                background: '#0d1226', border: '1px solid var(--border)', borderRadius: 8, padding: 6,
              }}>
                <input
                  type="text" placeholder="emoji" value={it.emoji || ''}
                  style={{ width: 38, padding: 6, background: '#1a1a2e', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 14, textAlign: 'center' }}
                  onChange={e => {
                    const next = [...shopItems]; next[idx] = { ...it, emoji: e.target.value }; saveShopItems(next)
                  }}
                />
                <input
                  type="text" placeholder="naam (item)" value={it.name || ''}
                  style={{ flex: 1, padding: 6, background: '#1a1a2e', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
                  onChange={e => { const next = [...shopItems]; next[idx] = { ...it, name: e.target.value }; saveShopItems(next) }}
                />
                <input
                  type="number" placeholder="slok" value={it.prijs_slokken || ''}
                  style={{ width: 50, padding: 6, background: '#1a1a2e', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
                  onChange={e => { const next = [...shopItems]; next[idx] = { ...it, prijs_slokken: e.target.value ? +e.target.value : null }; saveShopItems(next) }}
                />
                <button onClick={() => { const next = shopItems.filter((_, i) => i !== idx); saveShopItems(next) }}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>
                  🗑️
                </button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', padding: '8px', fontSize: 12, marginTop: 4 }}
              onClick={() => saveShopItems([...shopItems, { emoji: '🎁', name: '', prijs_slokken: 3 }])}>
              + Item toevoegen
            </button>
          </div>

          {/* Handicap uitdelen — geselecteerd uit handicap_definitions */}
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>🎭 Handicap Uitdelen</h3>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
              Kies een handicap en het team dat 'm krijgt. Team ontvangt direct een melding.
            </div>
            <HandicapPicker sessionId={initialSession.id} teams={teams} effects={effects} />
          </div>

          {/* Biome-zones beheer */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>🌿 Biome-zones</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {areas.some(a => a.type === 'boundary') && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                    onClick={() => {
                      const boundary = areas.find(a => a.type === 'boundary')
                      if (!boundary) return
                      const coords = boundary.geojson?.geometry?.coordinates?.[0] || []
                      const pts = coords.map(([lon, lat]) => [lat, lon])
                      if (pts.length > 1) {
                        setSavedBoundaryPoints(pts.slice(0, -1)) // sluit punt eraf
                        setAutoZonesPreview(generateAutoZones(pts.slice(0, -1)))
                        setBiomeChoiceStep('choice')
                        setShowBiomeChoice(true)
                      }
                    }}
                  >
                    🔄 Herindelen
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                  onClick={() => { setMapMode('biome'); setTab('map') }}
                >
                  + Zone tekenen
                </button>
              </div>
            </div>
            {areas.filter(a => a.type === 'biome').length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '12px 0' }}>
                Nog geen biome-zones ingesteld.<br/>
                Teken het speelveld op de kaart om te beginnen.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {areas.filter(a => a.type === 'biome').map(area => {
                  const typeInfo = POKEMON_TYPES[area.pokemon_type] || {}
                  return (
                    <div key={area.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: (typeInfo.color || '#555') + '22',
                      border: `1px solid ${typeInfo.color || 'var(--border)'}44`,
                    }}>
                      <span style={{ fontSize: 22 }}>{typeInfo.emoji || '🗺️'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{area.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{typeInfo.label || area.pokemon_type}</div>
                      </div>
                      <button
                        onClick={() => deleteBiomeZone(area.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18, padding: '4px 8px' }}
                        title="Zone verwijderen"
                      >
                        🗑️
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Challenge bibliotheek */}
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>🎯 Opdrachten</h3>
            <ChallengeLibrary challenges={challenges} onUpdated={refreshChallenges} executionStats={opdrachtStats} />
          </div>

          <button className="btn btn-ghost" onClick={onSignOut}>🚪 Uitloggen</button>
        </div>
      )}

      {/* ═════════════ 🧪 Test & Simulatie tab ═════════════ */}
      {tab === 'test' && session?.is_test_mode && (
        <TestTools
          session={session || initialSession}
          sessionId={initialSession.id}
          teams={teams}
          pokemons={pokemons}
          catches={catches}
          onDone={refetch}
        />
      )}

      {/* Challenge selector modal */}
      {challengeSelectorSpawn && (
        <ChallengeSelector
          spawn={challengeSelectorSpawn}
          opdrachtType={challengeSelectorSpawn.active_opdracht_type || 1}
          challenges={challenges}
          catchWaitSeconds={session?.catch_wait_seconds || 90}
          onAssign={() => setChallengeSelectorSpawn(null)}
          onClose={() => setChallengeSelectorSpawn(null)}
        />
      )}

      {/* Biome-keuze modal — verschijnt na speelveld opslaan */}
      {showBiomeChoice && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 900, padding: '0 0 env(safe-area-inset-bottom)',
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: '20px 20px 0 0',
            padding: '20px 16px 28px', width: '100%', maxWidth: 480,
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            {biomeChoiceStep === 'choice' && (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🗺️</div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>Speelveld opgeslagen!</h2>
                  <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 6 }}>
                    Hoe wil je de biome-zones instellen?
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    onClick={() => setBiomeChoiceStep('auto-preview')}
                    style={{
                      padding: '18px 16px', borderRadius: 14, border: '2px solid var(--accent)',
                      background: 'rgba(99,102,241,0.1)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 4 }}>🤖 Automatisch verdelen</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      6 zones worden automatisch aangemaakt op basis van het speelveld. Types zijn daarna aanpasbaar.
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowBiomeChoice(false)
                      setBiomeChoiceStep('choice')
                      setMapMode('biome')
                      setTab('map')
                    }}
                    style={{
                      padding: '18px 16px', borderRadius: 14, border: '2px solid var(--border)',
                      background: 'var(--bg2)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 4 }}>✏️ Handmatig tekenen</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                      Teken zelf de zones op de kaart, één per type. Maximale controle over de indeling.
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowBiomeChoice(false); setBiomeChoiceStep('choice') }}
                    style={{ padding: '12px', borderRadius: 14, border: 'none', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}
                  >
                    Later instellen
                  </button>
                </div>
              </>
            )}

            {biomeChoiceStep === 'auto-preview' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <button onClick={() => setBiomeChoiceStep('choice')} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>←</button>
                  <h2 style={{ margin: 0, fontSize: 18 }}>🤖 Automatische verdeling</h2>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
                  Het speelveld wordt verdeeld in 6 zones (2 rijen × 3 kolommen). Tik op een zone om het type te wijzigen.
                </p>

                {/* Grid preview */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>↑ Noord</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                    {autoZonesPreview.map((zone, idx) => {
                      const typeInfo = POKEMON_TYPES[zone.type] || {}
                      const isActive = activeAutoZoneIdx === idx
                      return (
                        <button
                          key={idx}
                          onClick={() => setActiveAutoZoneIdx(isActive ? null : idx)}
                          style={{
                            padding: '14px 8px', borderRadius: 10, border: `2px solid ${isActive ? 'white' : typeInfo.color || 'transparent'}`,
                            background: (typeInfo.color || '#555') + '33',
                            cursor: 'pointer', textAlign: 'center',
                            boxShadow: isActive ? `0 0 0 2px ${typeInfo.color}` : 'none',
                          }}
                        >
                          <div style={{ fontSize: 24 }}>{typeInfo.emoji}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: typeInfo.color }}>{typeInfo.label}</div>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>↓ Zuid</div>
                </div>

                {/* Type-wisselaar voor actieve zone */}
                {activeAutoZoneIdx !== null && (
                  <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '12px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
                      Kies type voor zone {activeAutoZoneIdx + 1}:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(POKEMON_TYPES).map(([key, info]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setAutoZonesPreview(prev => prev.map((z, i) => i === activeAutoZoneIdx ? { ...z, type: key } : z))
                            setActiveAutoZoneIdx(null)
                          }}
                          style={{
                            padding: '8px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 700,
                            background: autoZonesPreview[activeAutoZoneIdx]?.type === key ? info.color : 'var(--bg3)',
                            color: 'white',
                          }}
                        >
                          {info.emoji} {info.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={saveAutoZones}
                  >
                    ✅ Zones opslaan
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 0, padding: '0 16px' }}
                    onClick={() => { setShowBiomeChoice(false); setBiomeChoiceStep('choice') }}
                  >
                    Later
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stijlconstanten voor direct-assign form ──
const adminLabelStyle = {
  display: 'block', fontSize: 11, color: 'var(--text2)',
  fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
}
const adminSelectStyle = {
  width: '100%', background: 'var(--bg3)', color: 'var(--text1)',
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', fontSize: 14, marginBottom: 12,
}
const adminInputStyle = {
  width: '100%', background: 'var(--bg3)', color: 'var(--text1)',
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', fontSize: 14,
}
const adminSmallBtn = {
  padding: '8px 10px', border: 'none', borderRadius: 6,
  color: '#93c5fd', fontWeight: 700, fontSize: 12, cursor: 'pointer',
}
