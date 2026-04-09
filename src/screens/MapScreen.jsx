import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useGameSession } from '../hooks/useGameSession'
import { usePlayerLocation } from '../hooks/usePlayerLocation'
import { getDistanceMeters } from '../lib/geo'
import { POKEMON_TYPES, DEFAULT_CENTER, DEFAULT_ZOOM, CATCH_RADIUS_METERS } from '../lib/constants'
import CatchFlow from '../components/CatchFlow'
import StealFlow from '../components/StealFlow'
import NotificationBanner from '../components/NotificationBanner'
import InventoryScreen from './InventoryScreen'
import PokedexScreen from './PokedexScreen'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function makeEmojiIcon(emoji, size = 36, glow = false) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8))${glow?' drop-shadow(0 0 8px gold)':''};">${emoji}</div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2], popupAnchor: [0, -size/2], className: '',
  })
}

export default function MapScreen({ player, session, isAdmin, onSignOut }) {
  const { teams, players, spawns, catches, inventory, effects, notifications, events } = useGameSession(session.id)
  const { position, error: gpsError } = usePlayerLocation(player.id, session.id)
  const [activeTab, setActiveTab] = useState('map')
  const [activeCatch, setActiveCatch] = useState(null)
  const [stealChallenge, setStealChallenge] = useState(null)
  const [areas, setAreas] = useState([])
  const mapRef = useRef(null)

  // Derive own team from loaded data
  const myPlayer = players.find(p => p.id === player.id) || player
  const team = teams.find(t => t.id === myPlayer?.team_id) || null

  // Speelgebied laden
  useEffect(() => {
    supabase.from('game_areas').select('*').eq('game_session_id', session.id)
      .then(({ data }) => { if (data) setAreas(data) })
  }, [session.id])

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
    const dist = getDistanceMeters(position.lat, position.lon, +spawn.latitude, +spawn.longitude)
    if (dist > CATCH_RADIUS_METERS) return
    setActiveCatch(spawn)
    setActiveTab('catch')
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

  const showOverlay = ['catch','steal','inventory','pokedex'].includes(activeTab)

  return (
    <div className="screen">
      <NotificationBanner notifications={notifications} />

      {/* Kaart (altijd gerenderd, verborgen tijdens overlays) */}
      <div style={{ flex: 1, display: showOverlay ? 'none' : 'flex', flexDirection: 'column', position: 'relative' }}>
        <MapContainer
          center={position ? [position.lat, position.lon] : DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          ref={mapRef}
          style={{ flex: 1 }}
          zoomControl={false}
        >
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />

          {/* Speelveld grens */}
          {areas.filter(a => a.type === 'boundary').map(area => {
            const pts = (area.geojson?.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon])
            return pts.length > 2 ? <Polygon key={area.id} positions={pts} pathOptions={{ color:'#7c3aed', fillOpacity:0.05, weight:2, dashArray:'6,4' }} /> : null
          })}

          {/* Biome overlays */}
          {areas.filter(a => a.type === 'biome').map(area => {
            const pts = (area.geojson?.geometry?.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon])
            const info = POKEMON_TYPES[area.pokemon_type] || {}
            return pts.length > 2 ? <Polygon key={area.id} positions={pts} pathOptions={{ color: info.mapColor||'#fff', fillColor: info.mapColor||'#fff', fillOpacity: 0.12, weight:1 }} /> : null
          })}

          {/* Eigen locatie */}
          {position && (
            <>
              <Circle center={[position.lat, position.lon]} radius={CATCH_RADIUS_METERS}
                pathOptions={{ color:'#7c3aed', fillOpacity:0.08, weight:1 }} />
              <Marker position={[position.lat, position.lon]} icon={makeEmojiIcon('📍', 28)}>
                <Popup><div className="spawn-popup"><h4>Jij — {player.name}</h4></div></Popup>
              </Marker>
            </>
          )}

          {/* Teamgenoten */}
          {myTeamPlayers.filter(p => p.latitude && p.longitude).map(p => (
            <Marker key={p.id} position={[+p.latitude, +p.longitude]} icon={makeEmojiIcon(team?.emoji||'🔵', 26)}>
              <Popup><div className="spawn-popup"><h4>{p.name}</h4><div style={{color:'var(--text2)',fontSize:12}}>{team?.name}</div></div></Popup>
            </Marker>
          ))}

          {/* Tegenstanders (Moonstone/Bloedmaan) */}
          {opponentsVisible && enemyPlayers.filter(p => p.latitude && p.longitude).map(p => {
            const eTeam = teams.find(t => t.id === p.team_id)
            return (
              <Marker key={p.id} position={[+p.latitude, +p.longitude]} icon={makeEmojiIcon(eTeam?.emoji||'❗', 26)}>
                <Popup><div className="spawn-popup"><h4>⚠️ {p.name}</h4><div style={{color:'var(--danger)',fontSize:12,fontWeight:700}}>Tegenstander!</div></div></Popup>
              </Marker>
            )
          })}

          {/* Bokémon spawns */}
          {spawns.map(spawn => {
            const pokemon = spawn.pokemon_definitions
            if (!pokemon) return null
            const dist = position ? getDistanceMeters(position.lat, position.lon, +spawn.latitude, +spawn.longitude) : 999
            const nearby = dist <= CATCH_RADIUS_METERS
            const emoji = spawn.spawn_type === 'mystery' ? '❓'
              : spawn.spawn_type === 'legendary' ? '👑'
              : spawn.spawn_type === 'shiny' ? pokemon.sprite_emoji
              : pokemon.sprite_emoji
            const typeInfo = POKEMON_TYPES[pokemon.pokemon_type] || {}
            return (
              <Marker key={spawn.id} position={[+spawn.latitude, +spawn.longitude]}
                icon={makeEmojiIcon(emoji, 40, nearby)}
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
        <CatchFlow spawn={activeCatch} player={player} team={team}
          onClose={() => { setActiveCatch(null); setActiveTab('map') }}
          onCaught={() => setTimeout(() => { setActiveCatch(null); setActiveTab('map') }, 2500)} />
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
