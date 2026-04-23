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
import EvolutionScreen from './EvolutionScreen'
import TournamentScreen from './TournamentScreen'

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

  // Zodra GPS beschikbaar is: center op trainer (eenmalig)
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

function makeShinyIcon(emoji, size = 42) {
  return L.divIcon({
    html: `<div style="position:relative;width:${size+14}px;height:${size+14}px;">
      <div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 0 10px gold) drop-shadow(0 2px 4px rgba(0,0,0,0.8));animation:bokePulse 1.2s ease-in-out infinite;">${emoji}</div>
      <div style="position:absolute;top:-4px;right:-4px;font-size:18px;line-height:1;">✨</div>
    </div>`,
    iconSize: [size + 14, size + 14], iconAnchor: [(size+14)/2, (size+14)/2], popupAnchor: [0, -(size+14)/2], className: '',
  })
}

function makeLegendaryIcon(emoji, size = 48) {
  return L.divIcon({
    html: `<div style="position:relative;width:${size+14}px;height:${size+14}px;">
      <div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 0 14px gold) drop-shadow(0 0 6px #f59e0b) drop-shadow(0 2px 4px rgba(0,0,0,0.9));animation:bokePulse 0.9s ease-in-out infinite;">${emoji}</div>
      <div style="position:absolute;top:-6px;right:-6px;font-size:20px;line-height:1;">👑</div>
    </div>`,
    iconSize: [size + 14, size + 14], iconAnchor: [(size+14)/2, (size+14)/2], popupAnchor: [0, -(size+14)/2], className: '',
  })
}

function makeMysteryIcon(size = 40) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 0 8px #a855f7) drop-shadow(0 2px 4px rgba(0,0,0,0.8));animation:bokePulse 1.5s ease-in-out infinite;">❓</div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -size/2], className: '',
  })
}

// Catching-countdown: toont aftellende klok terwijl team 1 wacht op team 2
function makeCatchingCountdownIcon(emoji, waitSeconds, elapsedSeconds) {
  const remaining = Math.max(0, waitSeconds - elapsedSeconds)
  const r = 10
  const circ = +(2 * Math.PI * r).toFixed(2)
  const fraction = Math.min(1, Math.max(0, elapsedSeconds / waitSeconds))
  const offset = +(circ * (1 - fraction)).toFixed(2)
  return L.divIcon({
    html: `<div style="position:relative;width:48px;height:64px;">
      <div style="font-size:40px;line-height:1;text-align:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.9));animation:bokePulse 0.7s ease-in-out infinite;">
        ${emoji}
      </div>
      <div style="position:absolute;top:-4px;right:-6px;font-size:16px;line-height:1;">⚾</div>
      <svg viewBox="0 0 44 44" width="44" height="44" style="position:absolute;top:0;left:2px;pointer-events:none;">
        <circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(239,68,68,0.8)"
          stroke-width="${r * 2}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
          transform="rotate(-90 22 22)" />
      </svg>
      <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);background:rgba(239,68,68,0.92);border-radius:6px;padding:1px 7px;font-size:11px;font-weight:800;color:white;white-space:nowrap;">
        ⚔️ ${Math.ceil(remaining)}s
      </div>
    </div>`,
    iconSize: [48, 64], iconAnchor: [24, 48], className: '',
  })
}

// Catching actief (challenge loopt al, geen wachttimer meer)
function makeBattleIcon(emoji, size = 40) {
  return L.divIcon({
    html: `<div style="position:relative;width:${size+14}px;height:${size+14}px;">
      <div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 0 8px #ef4444) drop-shadow(0 2px 4px rgba(0,0,0,0.8));animation:bokePulse 0.6s ease-in-out infinite;">${emoji}</div>
      <div style="position:absolute;top:-4px;right:-6px;font-size:16px;line-height:1;">⚡</div>
    </div>`,
    iconSize: [size + 14, size + 14], iconAnchor: [(size+14)/2, (size+14)/2], className: '',
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

  // Klok-ticker voor fading spawns én catching-spawns (beide hebben een aftellende klok)
  const tickingKey = [
    ...spawns.filter(s => s.fade_duration_seconds && s.expires_at).map(s => `f${s.id}${s.expires_at}`),
    ...spawns.filter(s => s.status === 'catching' && s.catch_team1_arrived_at && !s.active_opdracht_type).map(s => `c${s.id}${s.catch_team1_arrived_at}`),
  ].join(',')
  useEffect(() => {
    if (!tickingKey) return
    const iv = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [tickingKey])

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
    setThrowingAt(spawn)
  }

  // Timer voor pokeball-animatie zit hier (niet in PokeballThrow) zodat
  // realtime re-renders de timer nooit resetten.
  useEffect(() => {
    if (!throwingAt) return
    const t = setTimeout(() => {
      setActiveCatch(throwingAt)
      setActiveTab('catch')
      setThrowingAt(null)
    }, 1300)
    return () => clearTimeout(t)
  }, [throwingAt])

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

  const currentPhase = session?.phase || session?.status || 'collecting'
  const isTrainingPhase  = currentPhase === 'training'
  const isTournamentPhase = currentPhase === 'tournament'
  // Evolutie-tab zichtbaar tijdens training én toernooi
  const showEvolutieTab = isTrainingPhase || isTournamentPhase
  const showOverlay = ['catch','steal','inventory','pokedex','evolutie','toernooi'].includes(activeTab)

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
                <Popup><div className="spawn-popup"><h4>📍 {player.name}</h4><div style={{color:'var(--text2)',fontSize:12}}>{team?.name || 'Team Rocket'}</div></div></Popup>
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
            const isMystery = spawn.spawn_type === 'mystery'
            const isShiny = spawn.spawn_type === 'shiny'
            const isLegendary = spawn.spawn_type === 'legendary'
            const displayEmoji = isMystery ? '❓' : pokemon.sprite_emoji
            const displayName = isMystery ? '??? (mysterieus)' : isShiny ? `✨ Blinkende ${pokemon.name}` : isLegendary ? `👑 ${pokemon.name}` : pokemon.name

            // Icon kiezen op basis van staat + type
            const isFading = spawn.fade_duration_seconds && spawn.expires_at
            const isCatchingWait = spawn.status === 'catching' && spawn.catch_team1_arrived_at && !spawn.active_opdracht_type
            const isCatchingBattle = spawn.status === 'catching' && spawn.active_opdracht_type

            let spawnIcon
            if (isCatchingWait) {
              const waitSec = session?.catch_wait_seconds || 90
              const elapsed = Math.max(0, (nowMs - new Date(spawn.catch_team1_arrived_at).getTime()) / 1000)
              spawnIcon = makeCatchingCountdownIcon(displayEmoji, waitSec, elapsed)
            } else if (isCatchingBattle) {
              spawnIcon = makeBattleIcon(displayEmoji)
            } else if (isFading) {
              const total = spawn.fade_duration_seconds
              const elapsed = Math.max(0, (nowMs - (new Date(spawn.expires_at) - total * 1000)) / 1000)
              spawnIcon = makeCountdownIcon(displayEmoji, total, elapsed)
            } else if (isShiny) {
              spawnIcon = makeShinyIcon(displayEmoji, 42)
            } else if (isLegendary) {
              spawnIcon = makeLegendaryIcon(displayEmoji, 48)
            } else if (isMystery) {
              spawnIcon = makeMysteryIcon(40)
            } else {
              spawnIcon = makeEmojiIcon(displayEmoji, 40, nearby)
            }

            const typeInfo = POKEMON_TYPES[pokemon.pokemon_type] || {}
            const catchingLabel = isCatchingWait
              ? `⚔️ Pokébal gegooid — ${Math.ceil(Math.max(0, (session?.catch_wait_seconds||90) - Math.max(0,(nowMs - new Date(spawn.catch_team1_arrived_at).getTime())/1000)))}s`
              : isCatchingBattle ? '⚡ Battle bezig!' : null

            return (
              <Marker key={spawn.id} position={[+spawn.latitude, +spawn.longitude]}
                icon={spawnIcon}
                eventHandlers={{ click: () => handleSpawnClick(spawn) }}>
                <Popup>
                  <div className="spawn-popup">
                    <div style={{fontSize:48, marginBottom:8}}>{displayEmoji}</div>
                    <h4>{displayName}</h4>
                    <div className="xp">{spawn.cp} XP</div>
                    <div style={{fontSize:12,color:'#9090b0',margin:'4px 0'}}>{typeInfo.emoji} {typeInfo.label}</div>
                    {catchingLabel && (
                      <div style={{fontSize:12,fontWeight:700,color:'#ef4444',margin:'4px 0',padding:'4px 8px',background:'rgba(239,68,68,0.15)',borderRadius:6}}>
                        {catchingLabel}
                      </div>
                    )}
                    {nearby && !isCatchingBattle
                      ? <button style={{marginTop:8,padding:'8px 16px',background:'#7c3aed',border:'none',borderRadius:8,color:'white',fontWeight:700,cursor:'pointer',width:'100%'}} onClick={() => handleSpawnClick(spawn)}>🎯 Vangen!</button>
                      : !nearby && <div style={{fontSize:12,color:'#9090b0',marginTop:8}}>📍 {Math.round(dist)}m</div>
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
        <CatchFlow spawn={activeCatch} player={player} team={team} teams={teams} session={session}
          onClose={() => { setActiveCatch(null); setActiveTab('map') }}
          onCaught={() => {
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
          currentPhase={currentPhase}
          onClose={() => setActiveTab('map')} />
      )}
      {activeTab === 'pokedex' && (
        <PokedexScreen sessionId={session.id} teamId={team?.id}
          onClose={() => setActiveTab('map')} />
      )}
      {activeTab === 'evolutie' && (
        <EvolutionScreen
          sessionId={session.id}
          team={team}
          catches={catches}
          inventory={inventory}
          currentPhase={currentPhase}
          onClose={() => setActiveTab('map')}
        />
      )}
      {activeTab === 'toernooi' && (
        <TournamentScreen
          session={session}
          sessionId={session.id}
          teams={teams}
          players={players}
          catches={catches}
          player={player}
          team={team}
          isAdmin={false}
          onClose={() => setActiveTab('map')}
        />
      )}

      {/* Pokéball throw-animatie voor de catch start */}
      {throwingAt && (
        <PokeballThrow
          emoji={throwingAt.spawn_type === 'mystery' ? '❓'
               : throwingAt.spawn_type === 'legendary' ? '👑'
               : (throwingAt.pokemon_definitions?.sprite_emoji || '❓')}
          label={throwingAt.spawn_type === 'shiny' ? '✨ BLINKEND! ✨' : 'GO!'}
        />
      )}

      {/* Trainingsfase-banner */}
      {isTrainingPhase && !showOverlay && (
        <div style={{
          position: 'absolute', top: 8, left: 8, right: 8, zIndex: 600,
          background: 'linear-gradient(135deg, #052e16, #14532d)',
          border: '1px solid #166534', borderRadius: 12,
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 24 }}>🌿</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#86efac' }}>Trainingsfase</div>
            <div style={{ fontSize: 12, color: '#4ade80' }}>Laat je Bokémon evolueren!</div>
          </div>
          <button
            onClick={() => setActiveTab('evolutie')}
            style={{
              background: '#166534', border: 'none', borderRadius: 8,
              color: '#86efac', fontWeight: 800, fontSize: 13,
              padding: '8px 14px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            🌿 Evolueer
          </button>
        </div>
      )}

      {/* Toernooifase-banner */}
      {isTournamentPhase && !showOverlay && (
        <div style={{
          position: 'absolute', top: 8, left: 8, right: 8, zIndex: 600,
          background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
          border: '1px solid #6366f1', borderRadius: 12,
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 24 }}>🏆</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#c7d2fe' }}>Toernooifase</div>
            <div style={{ fontSize: 12, color: '#818cf8' }}>De strijd begint!</div>
          </div>
          <button
            onClick={() => setActiveTab('toernooi')}
            style={{
              background: '#4f46e5', border: 'none', borderRadius: 8,
              color: '#fff', fontWeight: 800, fontSize: 13,
              padding: '8px 14px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            🏆 Start duel
          </button>
        </div>
      )}

      {/* Bottom nav */}
      {!showOverlay && (
        <div className="bottombar">
          <button className={`bottombar-btn ${activeTab==='map'?'active':''}`} onClick={() => setActiveTab('map')}>
            <span className="icon">🗺️</span><span>Kaart</span>
          </button>
          {isTournamentPhase ? (
            <button
              className={`bottombar-btn ${activeTab==='toernooi'?'active':''}`}
              onClick={() => setActiveTab('toernooi')}
            >
              <span className="icon" style={{ animation: 'bokePulse 1.5s ease-in-out infinite' }}>🏆</span>
              <span>Toernooi</span>
            </button>
          ) : showEvolutieTab ? (
            <button
              className={`bottombar-btn ${activeTab==='evolutie'?'active':''}`}
              onClick={() => setActiveTab('evolutie')}
            >
              <span className="icon" style={{ animation: isTrainingPhase ? 'bokePulse 1.5s ease-in-out infinite' : 'none' }}>🌿</span>
              <span>Training</span>
            </button>
          ) : (
            <button className="bottombar-btn" onClick={startSteal}>
              <span className="icon">⚔️</span><span>Stelen</span>
            </button>
          )}
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
