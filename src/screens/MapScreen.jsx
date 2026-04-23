import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useGameSession } from '../hooks/useGameSession'
import { usePlayerLocation } from '../hooks/usePlayerLocation'
import { getDistanceMeters, getPolygonCenter } from '../lib/geo'
import { POKEMON_TYPES, DEFAULT_CENTER, DEFAULT_ZOOM, CATCH_RADIUS_METERS } from '../lib/constants'
import CatchFlow from '../components/CatchFlow'
import StealFlow from '../components/StealFlow'
import NotificationBanner from '../components/NotificationBanner'
import PokeballThrow from '../components/PokeballThrow'
import InventoryScreen from './InventoryScreen'
import PokedexScreen from './PokedexScreen'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Centreert de kaart reactief op speelveld of GPS zodra data beschikbaar is
function MapAutoCenter({ areas, position }) {
  const map = useMap()
  const gpsCenteredRef = useRef(false)
  const fieldCenteredRef = useRef(false)

  // Zodra GPS beschikbaar is: center op speler (eenmalig)
  useEffect(() => {
    if (!position || gpsCenteredRef.current) return
    map.setView([position.lat, position.lon], DEFAULT_ZOOM)
    gpsCenteredRef.current = true
  }, [position, map])

  // Fallback: center op speelveld als GPS nog niet beschikbaar
  useEffect(() => {
    if (gpsCenteredRef.current || fieldCenteredRef.current) return
    const boundary = areas.find(a => a.type === 'boundary')
    if (boundary) {
      const center = getPolygonCenter(boundary.geojson)
      if (center) {
        map.setView(center, DEFAULT_ZOOM)
        fieldCenteredRef.current = true
      }
    }
  }, [areas, map])

  return null
}

function makeEmojiIcon(emoji, size = 36, glow = false) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8))${glow?' drop-shadow(0 0 8px gold)':''};">${emoji}</div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -size/2], className: '',
  })
}

function makePlayerIcon(emoji, name, isMe, size = 32) {
  const border = isMe ? '2px solid #facc15' : '2px solid rgba(255,255,255,0.3)'
  const bg = isMe ? 'rgba(250,204,21,0.25)' : 'rgba(0,0,0,0.45)'
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.9));">${emoji}</div>
      <div style="background:${bg};border:${border};border-radius:8px;padding:1px 5px;font-size:10px;font-weight:700;color:white;white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis;">${isMe ? '📍 Jij' : name}</div>
    </div>`,
    iconSize: [size, size + 20],
    iconAnchor: [size/2, size + 20],
    popupAnchor: [0, -(size + 20)],
    className: '',
  })
}

function makeBiomeLabel(emoji, label, color) {
  return L.divIcon({
    html: `<div style="background:${color}33;border:1px solid ${color}88;border-radius:8px;padding:4px 8px;font-size:13px;font-weight:700;color:white;text-shadow:0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;">${emoji} ${label}</div>`,
    iconSize: [80, 28], iconAnchor: [40, 14], className: '',
  })
}

// Countdown-icon met klok-overlay die met de klok mee vult (SVG stroke trick)
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
        <circle cx="22" cy="22" r="${r}"
          fill="none"
          stroke="rgba(20,20,20,0.7)"
          stroke-width="${r * 2}"
          stroke-dasharray="${circ}"
          stroke-dashoffset="${offset}"
          transform="rotate(-90 22 22)"
          style="animation:bokeCountdown ${remaining.toFixed(1)}s linear forwards;"
        />
      </svg>
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);border-radius:6px;padding:1px 7px;font-size:11px;font-weight:800;color:#ef4444;white-space:nowrap;letter-spacing:0.5px;">
        ⏱ ${Math.ceil(remaining)}s
      </div>
    </div>`,
    iconSize: [44, 58],
    iconAnchor: [22, 22],
    className: '',
  })
}

export default function MapScreen({ player, session, isAdmin, onSignOut }) {
  const { teams, players, spawns, catches, inventory, effects, notifications, events, refetch } = useGameSession(session.id)
  const { position, error: gpsError } = usePlayerLocation(player.id, session.id)
  const [activeTab, setActiveTab] = useState('map')
  const [activeCatch, setActiveCatch] = useState(null)
  const [throwingAt, setThrowingAt] = useState(null) // spawn waar pokeball-animatie naartoe gaat
  const [stealChallenge, setStealChallenge] = useState(null)
  const [areas, setAreas] = useState([])
  const [nowMs, setNowMs] = useState(Date.now())
  const mapRef = useRef(null)

  // Derive own team from loaded data
  const myPlayer = players.find(p => p.id === player.id) || player
  const team = teams.find(t => t.id === myPlayer?.team_id) || null

  // Speelgebied laden
  useEffect(() => {
    supabase.from('game_areas').select('*').eq('game_session_id', session.id)
      .then(({ data }) => { if (data) setAreas(data) })
  }, [session.id])

  // Klok-ticker voor fading spawns: dependency is de lijst van expires_at waarden
  // zodat de interval herstart als een bestaande spawn een fade_duration_seconds krijgt
  const fadingKey = spawns.filter(s => s.fade_duration_seconds).map(s => s.id + s.expires_at).join(',')
  useEffect(() => {
    if (!fadingKey) return
    const iv = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [fadingKey])

  // Moonstone actief voor mijn team?
  const moonstoneActive = team && effects.some(e =>
    e.team_id === team.id && e.item_key === 'moonstone' && e.is_active &&
    (!e.expires_at || new Date(e.expires_at) > new Date())
  )
  const bloodMoonActive = events.some(e => e.event_key === 'blood_moon' && e.status === 'active')
  const opponentsVisible = moonstoneActive || bloodMoonActive

  // Luister naar steal challenges gericht aan mijn team
  useEffect(() => {
    if (!team?.id) return
    const ch = supabase.channel(`steal-${player.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'steal_challenges',
        filter: `game_session_id=eq.${session.id}` },
        (p) => {
          if (p.new.defender_team_id === team.id || p.new.attacker_team_id === team.id) {
            setStealChallenge(p.new)
            setActiveTab('steal')
          }
        }
      ).subscribe()
    return () => supabase.removeChannel(ch)
  }, [team?.id, player.id, session.id])

  async function handleSpawnClick(spawn) {
    if (!position) return
    const radius = spawn.catch_radius_meters || CATCH_RADIUS_METERS
    const dist = getDistanceMeters(position.lat, position.lon, +spawn.latitude, +spawn.longitude)
    if (dist > radius) return
    // Toon eerst de pokeball-throw animatie, daarna pas de catch-flow
    setThrowingAt(spawn)
  }

  function handleThrowDone() {
    if (!throwingAt) return
    setActiveCatch(throwingAt)
    setActiveTab('catch')
    setThrowingAt(null)
  }

  async function startSteal() {
    if (!team) return
    const enemyTeam = teams.find(t => t.id !== team.id)
    if (!enemyTeam) return
    const { data } = await supabase.from('steal_challenges').insert({
      game_session_id: session.id,
      attacker_team_id: team.id,
      defender_team_id: enemyTeam.id,
      attacker_player_id: player.id,
      status: 'waiting',
    }).select().single()
    if (data) { setStealChallenge(data); setActiveTab('steal') }
  }

  const myTeamPlayers = players.filter(p => p.team_id === team?.id && p.id !== player.id)
  const enemyPlayers = players.filter(p => team && p.team_id !== team.id && p.team_id !== null)

  // Kaartcentrum: GPS > speelveld centrum > Oudsberg
  const boundary = areas.find(a => a.type === 'boundary')
  const fieldCenter = boundary ? getPolygonCenter(boundary.geojson) : null
  const mapCenter = position ? [position.lat, position.lon] : (fieldCenter || DEFAULT_CENTER)

  const showOverlay = ['catch','steal','inventory','pokedex'].includes(activeTab)

  return (
    <div className="screen">
      <NotificationBanner notifications={notifications} />

      {/* Kaart (altijd gerenderd, verborgen tijdens overlays) */}
      <div style={{ flex: 1, display: showOverlay ? 'none' : 'flex', flexDirection: 'column', position: 'relative' }}>
        <MapContainer
          center={mapCenter}
          zoom={DEFAULT_ZOOM}
          ref={mapRef}
          style={{ flex: 1 }}
          zoomControl={false}
        >
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <MapAutoCenter areas={areas} position={position} />

          {/* Speelveld grens — dikke paarse stippellijn */}
          {areas.filter(a => a.type === 'boundary').map(area => {
            const pts = (area.geojson?.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon])
            return pts.length > 2 ? <Polygon key={area.id} positions={pts} pathOptions={{ color:'#a855f7', fillOpacity:0, weight:4, dashArray:'10,6' }} /> : null
          })}

          {/* Biome zones — gekleurde vlakken + label in het midden */}
          {areas.filter(a => a.type === 'biome').map(area => {
            const pts = (area.geojson?.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon])
            const info = POKEMON_TYPES[area.pokemon_type] || {}
            if (pts.length < 3) return null
            const lats = pts.map(([lat]) => lat)
            const lons = pts.map(([, lon]) => lon)
            const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
            const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2
            return (
              <React.Fragment key={area.id}>
                <Polygon positions={pts} pathOptions={{ color: info.mapColor||'#fff', fillColor: info.mapColor||'#fff', fillOpacity: 0.22, weight: 2 }} />
                <Marker position={[centerLat, centerLon]} icon={makeBiomeLabel(info.emoji||'', info.label||area.pokemon_type, info.mapColor||'#fff')} interactive={false} />
              </React.Fragment>
            )
          })}

          {/* Eigen locatie */}
          {position && (
            <>
              <Circle center={[position.lat, position.lon]} radius={CATCH_RADIUS_METERS}
                pathOptions={{ color:'#facc15', fillColor:'#facc15', fillOpacity:0.08, weight:1.5, dashArray:'4,3' }} />
              <Marker position={[position.lat, position.lon]} icon={makePlayerIcon(team?.emoji||'📍', player.name, true, 32)}>
                <Popup><div className="spawn-popup"><h4>📍 {player.name}</h4><div style={{color:'var(--text2)',fontSize:12}}>{team?.name || 'Admin'}</div></div></Popup>
              </Marker>
            </>
          )}

          {/* Teamgenoten */}
          {myTeamPlayers.filter(p => p.latitude && p.longitude).map(p => (
            <Marker key={p.id} position={[+p.latitude, +p.longitude]} icon={makePlayerIcon(team?.emoji||'🔵', p.name, false, 30)}>
              <Popup><div className="spawn-popup"><h4>{p.name}</h4><div style={{color:'var(--text2)',fontSize:12}}>{team?.name}</div></div></Popup>
            </Marker>
          ))}

          {/* Tegenstanders (Moonstone/Bloedmaan) */}
          {opponentsVisible && enemyPlayers.filter(p => p.latitude && p.longitude).map(p => {
            const eTeam = teams.find(t => t.id === p.team_id)
            return (
              <Marker key={p.id} position={[+p.latitude, +p.longitude]} icon={makePlayerIcon(eTeam?.emoji||'❗', p.name, false, 30)}>
                <Popup><div className="spawn-popup"><h4>⚠️ {p.name}</h4><div style={{color:'var(--danger)',fontSize:12,fontWeight:700}}>Tegenstander!</div></div></Popup>
              </Marker>
            )
          })}

          {/* Bokémon spawns */}
          {spawns.map(spawn => {
            const pokemon = spawn.pokemon_definitions
            if (!pokemon) return null
            const dist = position ? getDistanceMeters(position.lat, position.lon, +spawn.latitude, +spawn.longitude) : 999
            const spawnRadius = spawn.catch_radius_meters || CATCH_RADIUS_METERS
            const nearby = dist <= spawnRadius
            const emoji = spawn.spawn_type === 'mystery' ? '❓'
              : spawn.spawn_type === 'legendary' ? '👑'
              : pokemon.sprite_emoji

            // Fading spawn: countdown overlay
            const isFading = spawn.fade_duration_seconds && spawn.expires_at
            let spawnIcon
            if (isFading) {
              const total = spawn.fade_duration_seconds
              const elapsed = Math.max(0, (nowMs - (new Date(spawn.expires_at) - total * 1000)) / 1000)
              spawnIcon = makeCountdownIcon(emoji, total, elapsed)
            } else {
              spawnIcon = makeEmojiIcon(emoji, 40, nearby)
            }

            const typeInfo = POKEMON_TYPES[pokemon.pokemon_type] || {}
            return (
              <Marker key={spawn.id} position={[+spawn.latitude, +spawn.longitude]}
                icon={spawnIcon}
                eventHandlers={{ click: () => handleSpawnClick(spawn) }}>
                <Popup>
                  <div className="spawn-popup">
                    <div style={{fontSize:48, marginBottom:8}}>{emoji}{spawn.spawn_type==='shiny'?' ✨':''}</div>
                    <h4>{spawn.spawn_type==='mystery'?'???':pokemon.name}</h4>
                    <div className="cp">{spawn.cp} CP</div>
                    <div style={{fontSize:12,color:'#9090b0',margin:'4px 0'}}>{typeInfo.emoji} {typeInfo.label}</div>
                    {nearby
                      ? <button style={{marginTop:8,padding:'8px 16px',background:'#7c3aed',border:'none',borderRadius:8,color:'white',fontWeight:700,cursor:'pointer',width:'100%'}} onClick={() => handleSpawnClick(spawn)}>🎯 Vangen!</button>
                      : <div style={{fontSize:12,color:'#9090b0',marginTop:8}}>📍 {Math.round(dist)}m</div>
                    }
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        {/* Floating controls */}
        <div style={{position:'absolute',right:12,bottom:72,zIndex:500,display:'flex',flexDirection:'column',gap:8}}>
          {position && (
            <button className="map-ctrl-btn" onClick={() => mapRef.current?.setView([position.lat, position.lon], DEFAULT_ZOOM)}>📍</button>
          )}
        </div>

        {gpsError && (
          <div style={{position:'absolute',top:8,left:8,right:8,background:'var(--danger)',borderRadius:10,padding:10,fontSize:13,zIndex:500,fontWeight:600}}>
            ⚠️ GPS: {gpsError}
          </div>
        )}

        {moonstoneActive && (
          <div style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',background:'#2d1558',border:'1px solid var(--accent)',borderRadius:10,padding:'6px 14px',fontSize:13,fontWeight:700,zIndex:500,color:'#c084fc',whiteSpace:'nowrap'}}>
            🌙 Moonstone actief
          </div>
        )}
      </div>

      {/* Overlays */}
      {activeTab === 'catch' && activeCatch && (
        <CatchFlow spawn={activeCatch} player={player} team={team} session={session}
          onClose={() => { setActiveCatch(null); setActiveTab('map') }}
          onCaught={() => {
            // Expliciete refetch als vangnet naast de realtime subscription —
            // garandeert dat de catches-lijst direct up-to-date is in Pokédex + Inventory
            refetch()
            setTimeout(() => { setActiveCatch(null); setActiveTab('map') }, 2500)
          }} />
      )}
      {activeTab === 'steal' && stealChallenge && (
        <StealFlow challenge={stealChallenge} player={player} team={team} catches={catches}
          onClose={() => { setStealChallenge(null); setActiveTab('map') }} />
      )}
      {activeTab === 'inventory' && (
        <InventoryScreen catches={catches} inventory={inventory} effects={effects}
          teams={teams} player={player} team={team} sessionId={session.id}
          onClose={() => setActiveTab('map')} />
      )}
      {activeTab === 'pokedex' && (
        <PokedexScreen sessionId={session.id} catches={catches.filter(c => c.team_id === team?.id)}
          onClose={() => setActiveTab('map')} />
      )}

      {/* Pokéball throw-animatie voor de catch start */}
      {throwingAt && (
        <PokeballThrow
          emoji={throwingAt.spawn_type === 'mystery' ? '❓'
               : throwingAt.spawn_type === 'legendary' ? '👑'
               : (throwingAt.pokemon_definitions?.sprite_emoji || '❓')}
          label={throwingAt.spawn_type === 'shiny' ? '✨ SHINY! ✨' : 'GO!'}
          onComplete={handleThrowDone}
        />
      )}

      {/* Bottom nav */}
      {!showOverlay && (
        <div className="bottombar">
          <button className={`bottombar-btn ${activeTab==='map'?'active':''}`} onClick={() => setActiveTab('map')}>
            <span className="icon">🗺️</span><span>Kaart</span>
          </button>
          <button className="bottombar-btn" onClick={startSteal}>
            <span className="icon">⚔️</span><span>Stelen</span>
          </button>
          <button className={`bottombar-btn ${activeTab==='inventory'?'active':''}`} onClick={() => setActiveTab('inventory')}>
            <span className="icon">🎒</span><span>Items</span>
          </button>
          <button className={`bottombar-btn ${activeTab==='pokedex'?'active':''}`} onClick={() => setActiveTab('pokedex')}>
            <span className="icon">📖</span><span>Pokédex</span>
          </button>
        </div>
      )}
    </div>
  )
}
