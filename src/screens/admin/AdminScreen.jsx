import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import { useGameSession } from '../../hooks/useGameSession'
import { usePlayerLocation } from '../../hooks/usePlayerLocation'
import { POKEMON_TYPES, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../lib/constants'
import { getPolygonCenter, pointInPolygon } from '../../lib/geo'
import { autoSpawnPokemon } from '../../lib/gameEngine'
import NotificationBanner from '../../components/NotificationBanner'

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
  const { session, teams, players, spawns, catches, events, notifications, refetch } = useGameSession(initialSession.id)
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
    ]).then(([{ data: a }, { data: p }]) => {
      if (a) setAreas(a)
      if (p) setPokemons(p)
    })
  }, [initialSession.id])

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
    }
  }

  async function spawnPokemon() {
    if (!pendingSpawnLoc || !spawnForm.pokemonId) return
    const pokemon = pokemons.find(p => p.id === spawnForm.pokemonId)
    if (!pokemon) return
    const cp = Math.floor(pokemon.cp_min + Math.random() * (pokemon.cp_max - pokemon.cp_min))
    await supabase.from('active_spawns').insert({
      game_session_id: initialSession.id,
      pokemon_definition_id: pokemon.id,
      latitude: pendingSpawnLoc.lat,
      longitude: pendingSpawnLoc.lng,
      spawn_type: spawnForm.spawnType,
      cp,
      requires_opdracht: spawnForm.requiresOpdracht,
      catch_radius_meters: spawnForm.catchRadius || 50,
      status: 'active',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    await supabase.from('notifications').insert({
      game_session_id: initialSession.id,
      title: `${pokemon.sprite_emoji} ${pokemon.name} spawnt!`,
      message: `Admin heeft een ${pokemon.name} gespawnd (${cp} CP)`,
      type: 'info', emoji: pokemon.sprite_emoji,
    })
    setPendingSpawnLoc(null)
    setMapMode('view')
  }

  async function handlePhaseChange(newPhase) {
    await supabase.from('game_sessions').update({ status: newPhase, phase: newPhase }).eq('id', initialSession.id)
  }

  async function confirmEvent(eventId) {
    await supabase.from('events_log').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', eventId)
    await supabase.from('events_log').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', eventId)
  }

  async function rejectEvent(eventId) {
    await supabase.from('events_log').update({ status: 'rejected' }).eq('id', eventId)
  }

  async function triggerEvent(key) {
    await supabase.from('events_log').insert({
      game_session_id: initialSession.id,
      event_key: key,
      triggered_by: 'admin',
      status: 'active',
      started_at: new Date().toISOString(),
    })
    // Verstuur notificatie
    const eventNames = { blood_moon: 'Bloedmaan 🌕', shuffle: 'Shuffle 🔀', mirror_world: 'Mirror World 🪞', legendary: 'Legendary Spawn 👑', shiny_hunt: 'Shiny Hunt ✨' }
    await supabase.from('notifications').insert({
      game_session_id: initialSession.id,
      title: `⚡ Event: ${eventNames[key] || key}`,
      message: 'Admin heeft een event getriggerd!',
      type: 'event', emoji: '⚡',
    })
  }

  async function toggleShop() {
    const newActive = !shopActive
    setShopActive(newActive)
    if (newActive && position) {
      await supabase.from('notifications').insert({
        game_session_id: initialSession.id,
        title: '🏪 Mobiele Shop is open!',
        message: 'Team Rocket heeft de shop geopend. Kom snel!',
        type: 'success', emoji: '🏪',
      })
    }
  }

  const teamScores = teams.map(t => {
    const tc = catches.filter(c => c.team_id === t.id)
    return { ...t, pokemonCount: tc.length, totalCP: tc.reduce((sum, c) => sum + c.cp, 0) }
  })

  const currentPhase = session?.status || 'setup'
  const pendingEvents = events.filter(e => e.status === 'pending')

  return (
    <div className="screen">
      <NotificationBanner notifications={notifications} />

      {/* Topbar */}
      <div className="topbar">
        <div style={{ fontWeight: 800 }}>👑 Admin</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          Code: <strong style={{ color: 'var(--warning)' }}>{session?.game_code}</strong>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700,
          background: currentPhase === 'collecting' ? '#14350f' : currentPhase === 'setup' ? '#1e1e3a' : '#3f1515',
          color: currentPhase === 'collecting' ? 'var(--success)' : 'var(--text2)',
        }}>
          {currentPhase}
        </div>
      </div>

      {/* Tab navigatie */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
        {[['dashboard','📊'], ['map','🗺️'], ['events','⚡'], ['setup','⚙️']].map(([key, icon]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === key ? 'var(--accent)' : 'var(--text2)', fontSize: 20,
          }}>{icon}</button>
        ))}
      </div>

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
                  {t.totalCP} CP
                </div>
              </div>
            </div>
          ))}

          {/* Online spelers */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>👥 Spelers</h3>
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
            <h3 style={{ marginBottom: 12 }}>🎮 Fase Beheer</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-success btn-sm" onClick={() => handlePhaseChange('collecting')} disabled={currentPhase === 'collecting'}>
                ▶️ Start Verzamelfase
              </button>
              <button className="btn btn-warning btn-sm" onClick={() => handlePhaseChange('tournament')} disabled={currentPhase === 'tournament'}>
                🏆 Start Toernooi
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handlePhaseChange('finished')} disabled={currentPhase === 'finished'}>
                ⏹️ Spel Afsluiten
              </button>
            </div>
          </div>

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
          <button className="btn btn-ghost" onClick={() => autoSpawnPokemon(initialSession.id)}>
            🎲 Gooi Random Spawn
          </button>
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

            {/* Alle spelers */}
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
          </MapContainer>

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
                    {detectedBiomeType && <optgroup label={`── ${biomeInfo?.emoji} ${biomeInfo?.label} (aanbevolen) ──`} />}
                    {sortedPokemons.map((p, i) => {
                      const isFirstOfOtherType = detectedBiomeType && i > 0 && p.pokemon_type !== detectedBiomeType && sortedPokemons[i-1].pokemon_type === detectedBiomeType
                      return (
                        <option key={p.id} value={p.id}>
                          {p.sprite_emoji} {p.name} ({p.cp_min}–{p.cp_max} CP){isFirstOfOtherType ? ' ·' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div className="field">
                  <label>Type</label>
                  <select value={spawnForm.spawnType} onChange={e => setSpawnForm(f => ({ ...f, spawnType: e.target.value }))}>
                    <option value="normal">Normaal</option>
                    <option value="shiny">✨ Shiny</option>
                    <option value="mystery">❓ Mystery</option>
                    <option value="legendary">👑 Legendary</option>
                  </select>
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
                      {selectedSpawn.cp} CP · {selectedSpawn.spawn_type} · {selectedSpawn.catch_radius_meters || 50}m radius
                      {selectedSpawn.fade_duration_seconds ? ` · ⏱ fade actief` : ''}
                    </div>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}
                    onClick={() => setSelectedSpawn(null)}>✕</button>
                </div>

                {/* Acties: twee rijen */}
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
            { key: 'blood_moon', name: 'Bloedmaan', emoji: '🌕', desc: 'Iedereen zichtbaar voor iedereen (3 min)' },
            { key: 'shuffle', name: 'Shuffle', emoji: '🔀', desc: 'Bokémon worden random herverdeeld' },
            { key: 'mirror_world', name: 'Mirror World', emoji: '🪞', desc: 'Teamkleuren omgewisseld op kaart (5 min)' },
            { key: 'shiny_hunt', name: 'Shiny Hunt', emoji: '✨', desc: 'Zeldzame Shiny Bokémon spawnt' },
            { key: 'legendary', name: 'Legendary Spawn', emoji: '👑', desc: 'Sterkste Bokémon spawnt → eindesignaal' },
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
              <label>Moonstone duur (minuten)</label>
              <input
                type="number"
                defaultValue={session?.moonstone_duration_minutes || 6}
                onBlur={e => supabase.from('game_sessions').update({ moonstone_duration_minutes: Number(e.target.value) }).eq('id', initialSession.id)}
              />
            </div>
          </div>

          {/* Straf uitdelen */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>🎭 Straf Uitdelen</h3>
            {teams.map(t => (
              <button key={t.id} className="btn btn-danger btn-sm" style={{ marginBottom: 8 }}
                onClick={async () => {
                  const straf = prompt(`Straf voor ${t.name}:`)
                  if (straf) {
                    await supabase.from('notifications').insert({
                      game_session_id: initialSession.id,
                      title: `🎭 Straf voor ${t.emoji} ${t.name}!`,
                      message: straf,
                      type: 'danger', emoji: '🎭',
                      target_team_id: t.id,
                    })
                  }
                }}
              >
                🎭 Straf aan {t.emoji} {t.name}
              </button>
            ))}
          </div>

          <button className="btn btn-ghost" onClick={onSignOut}>🚪 Uitloggen</button>
        </div>
      )}
    </div>
  )
}
