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
import PhaseIntro from '../components/PhaseIntro'
import InventoryScreen from './InventoryScreen'
import PokedexScreen from './PokedexScreen'
import EvolutionScreen from './EvolutionScreen'
import TournamentScreen from './TournamentScreen'
import FinaleScreen from './FinaleScreen'

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

// Team Rocket HQ marker — verborgen "Pokéshop" met beveiligingssystemen
function makeHqIcon(progressLabel = '') {
  return L.divIcon({
    html: `<div style="position:relative;width:60px;height:72px;display:flex;flex-direction:column;align-items:center;">
      <div style="font-size:42px;line-height:1;filter:drop-shadow(0 0 10px #ef4444) drop-shadow(0 2px 4px rgba(0,0,0,0.9));animation:bokePulse 2s ease-in-out infinite;">🏚️</div>
      <div style="position:absolute;top:-2px;right:6px;font-size:14px;line-height:1;">🅡</div>
      <div style="background:rgba(127,29,29,0.95);border:1px solid #ef4444;border-radius:8px;padding:2px 8px;margin-top:2px;font-size:10px;font-weight:800;color:#fca5a5;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.9);letter-spacing:0.5px;">
        TEAM ROCKET HQ${progressLabel ? ` · ${progressLabel}` : ''}
      </div>
    </div>`,
    iconSize: [60, 72], iconAnchor: [30, 60], popupAnchor: [0, -60], className: '',
  })
}

// Mobiele Shop — volgt admin GPS, alleen zichtbaar als admin geactiveerd
function makeMobileShopIcon() {
  return L.divIcon({
    html: `<div style="position:relative;width:56px;height:68px;display:flex;flex-direction:column;align-items:center;">
      <div style="font-size:38px;line-height:1;filter:drop-shadow(0 0 8px #facc15) drop-shadow(0 2px 4px rgba(0,0,0,0.9));animation:bokePulse 1.4s ease-in-out infinite;">🚐</div>
      <div style="background:rgba(120,53,15,0.95);border:1px solid #facc15;border-radius:8px;padding:2px 8px;margin-top:2px;font-size:10px;font-weight:800;color:#fde68a;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.9);letter-spacing:0.5px;">
        SHOP
      </div>
    </div>`,
    iconSize: [56, 68], iconAnchor: [28, 56], popupAnchor: [0, -56], className: '',
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

export default function MapScreen({ player, session: initialSession, isAdmin, onSignOut }) {
  // Live session van hook zodat phase-wisselingen van admin direct doorkomen
  const { session: liveSession, teams, players, spawns, catches, inventory, effects, notifications, events, refetch } = useGameSession(initialSession.id)
  const session = liveSession || initialSession
  const { position, error: gpsError } = usePlayerLocation(player.id, initialSession.id)
  const [activeTab, setActiveTab] = useState('map')
  const [activeCatch, setActiveCatch] = useState(null)
  const [throwingAt, setThrowingAt] = useState(null) // spawn waar pokeball-animatie naartoe gaat
  const [stealChallenge, setStealChallenge] = useState(null)
  const [areas, setAreas] = useState([])
  const [nowMs, setNowMs] = useState(Date.now())
  const [activeIntro, setActiveIntro] = useState(null) // welke fase-intro tonen
  const shownIntrosRef = useRef(new Set())             // bijhouden welke al getoond zijn
  const [poiPanel, setPoiPanel] = useState(null)       // {kind:'hq'|'shop', ...} — detail buiten MapContainer
  const mapRef = useRef(null)

  // Derive own team from loaded data
  const myPlayer = players.find(p => p.id === player.id) || player
  const team = teams.find(t => t.id === myPlayer?.team_id) || null

  // ── Fase-afleidingen (vroeg definiëren zodat alle useEffects ze kunnen gebruiken) ──
  const currentPhase      = session?.status || 'collecting'
  const isSetup           = currentPhase === 'setup'
  const isCollecting      = currentPhase === 'collecting'
  const isTrainingPhase   = currentPhase === 'training'
  const isTournamentPhase = currentPhase === 'tournament'
  const isFinished        = currentPhase === 'finished'
  const isLegendaryPhase  = isCollecting && !!(session?.legendary_phase_started_at)

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

  // Silph Scope actief voor mijn team? (opvolger van Moonstone-visibility)
  const silphScopeActive = team && effects.some(e =>
    e.team_id === team.id && e.item_key === 'silph_scope' && e.is_active &&
    (!e.expires_at || new Date(e.expires_at) > new Date())
  )
  const bloodMoonActive = events.some(e => e.event_key === 'blood_moon' && e.status === 'active')
  const opponentsVisible = silphScopeActive || bloodMoonActive

  // Double Team decoys: van TEGENSTANDER op MIJN kaart (target_team_id = mijn team)
  const decoysAgainstMe = team ? effects.filter(e =>
    e.item_key === 'double_team' && e.is_active && e.target_team_id === team.id &&
    (!e.expires_at || new Date(e.expires_at) > new Date())
  ) : []

  // ── Team Rocket HQ + Mobiele Shop posities ──
  const hqLoc = session?.hq_location && session.hq_location.lat && session.hq_location.lng
    ? [+session.hq_location.lat, +session.hq_location.lng] : null
  const adminPlayer = (players || []).find(p => p.is_admin && p.latitude && p.longitude)
  const mobileShopActive = !!session?.mobile_shop_active
  const shopLoc = (mobileShopActive && adminPlayer)
    ? [+adminPlayer.latitude, +adminPlayer.longitude] : null
  const mobileShopItems = Array.isArray(session?.mobile_shop_items) ? session.mobile_shop_items : []

  // Auto-navigeer naar de juiste tab bij fase-wissel
  useEffect(() => {
    if (currentPhase === 'training' && activeTab === 'map') setActiveTab('evolutie')
    if (currentPhase === 'tournament' && activeTab !== 'toernooi') setActiveTab('toernooi')
  }, [currentPhase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fase-intro tonen bij fase-wissel (enkel 1x per fase, niet tijdens setup)
  useEffect(() => {
    const introPhases = ['collecting', 'training', 'tournament']
    if (introPhases.includes(currentPhase) && !shownIntrosRef.current.has(currentPhase)) {
      shownIntrosRef.current.add(currentPhase)
      setActiveIntro(currentPhase)
    }
  }, [currentPhase])

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

  // Spawns enkel tonen in verzamelfase (tijdens training/toernooi zijn er geen actieve vangsten)
  const visibleSpawns = isCollecting ? spawns : []

  const showOverlay = ['catch','steal','inventory','pokedex','evolutie','toernooi','finale'].includes(activeTab)

  // ── Setup-fase: toon wachtscherm i.p.v. lege kaart ────────────
  if (isSetup) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
        <NotificationBanner notifications={notifications} />
        <div style={{ fontSize: 64 }}>⏳</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#facc15', marginBottom: 8 }}>
            Wachten op Team Rocket
          </div>
          <div style={{ color: '#9090b0', fontSize: 14, lineHeight: 1.5 }}>
            De spelleiding start zo de verzamelfase.<br />
            Houd je smartphone bij de hand!
          </div>
        </div>
        <div style={{
          background: '#1e1e3a', border: '1px solid #2a2a4a', borderRadius: 14,
          padding: '14px 20px', fontSize: 14, color: '#9090b0', textAlign: 'center',
        }}>
          {team
            ? <span>Je speelt voor <strong style={{ color: team.color }}>{team.emoji} {team.name}</strong></span>
            : <span style={{ color: '#6060a0' }}>Team laden...</span>
          }
        </div>
        <button onClick={onSignOut} style={{
          background: 'none', border: '1px solid #2a2a4a', borderRadius: 10,
          color: '#6060a0', padding: '10px 20px', fontSize: 13, cursor: 'pointer', marginTop: 8,
        }}>
          ← Andere game code
        </button>
      </div>
    )
  }

  return (
    <div className="screen">
      {/* Fase-intro overlay (bovenop alles) */}
      {activeIntro && (
        <PhaseIntro
          phase={activeIntro}
          onDismiss={() => setActiveIntro(null)}
        />
      )}

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

          {/* Tegenstanders (Silph Scope/Bloedmaan) — let op: decoys vervangen ECHTE positie van die speler */}
          {opponentsVisible && enemyPlayers.filter(p => p.latitude && p.longitude).map(p => {
            const eTeam = teams.find(t => t.id === p.team_id)
            // Heeft de tegenstander een Double Team decoy actief op MIJ gericht?
            const decoy = decoysAgainstMe.find(d => d.target_player_id === p.id)
            const lat = decoy?.decoy_latitude ? +decoy.decoy_latitude : +p.latitude
            const lng = decoy?.decoy_longitude ? +decoy.decoy_longitude : +p.longitude
            return (
              <Marker key={p.id} position={[lat, lng]} icon={makePlayerIcon(eTeam?.emoji||'❗', p.name, false, 30)}>
                <Popup><div className="spawn-popup"><h4>⚠️ {p.name}</h4><div style={{color:'var(--danger)',fontSize:12,fontWeight:700}}>Tegenstander!</div></div></Popup>
              </Marker>
            )
          })}

          {/* Team Rocket HQ — vaste locatie, altijd zichtbaar in verzamelfase */}
          {isCollecting && hqLoc && (
            <Marker
              position={hqLoc}
              icon={makeHqIcon('komt eraan')}
              eventHandlers={{ click: () => setPoiPanel({ kind: 'hq' }) }}
            />
          )}

          {/* Mobiele Shop — volgt admin GPS, alleen als geactiveerd */}
          {isCollecting && shopLoc && (
            <Marker
              position={shopLoc}
              icon={makeMobileShopIcon()}
              eventHandlers={{ click: () => setPoiPanel({ kind: 'shop' }) }}
            />
          )}

          {/* Bokémon spawns — enkel zichtbaar in verzamelfase */}
          {visibleSpawns.map(spawn => {
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

        {silphScopeActive && (
          <div style={{position:'absolute',top:8,left:'50%',transform:'translateX(-50%)',background:'#2d1558',border:'1px solid var(--accent)',borderRadius:10,padding:'6px 14px',fontSize:13,fontWeight:700,zIndex:500,color:'#c084fc',whiteSpace:'nowrap'}}>
            🔭 Silph Scope actief
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
          teams={teams} players={players} player={player} team={team} sessionId={session.id}
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
          onStartFinale={() => setActiveTab('finale')}
        />
      )}
      {activeTab === 'finale' && (
        <FinaleScreen
          session={session}
          sessionId={session.id}
          teams={teams}
          catches={catches}
          player={player}
          team={team}
          isAdmin={false}
          onClose={() => setActiveTab('toernooi')}
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

      {/* POI detail-panel (HQ / Mobiele Shop) — buiten MapContainer i.v.m. mobile touch bug */}
      {poiPanel && !showOverlay && (
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 88, zIndex: 700,
          background: '#1e1e3a', border: '1px solid var(--border)', borderRadius: 14,
          padding: 16, boxShadow: '0 6px 24px rgba(0,0,0,0.6)', maxHeight: '60vh', overflowY: 'auto',
        }}>
          {poiPanel.kind === 'hq' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 32 }}>🏚️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#fca5a5' }}>Team Rocket HQ</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Geheime basis vol beveiligingssystemen</div>
                </div>
                <button onClick={() => setPoiPanel(null)} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer' }}>✕</button>
              </div>
              {hqLoc && position && (() => {
                const dist = getDistanceMeters(position.lat, position.lon, hqLoc[0], hqLoc[1])
                const inRange = dist <= (CATCH_RADIUS_METERS * 1.2)
                return (
                  <>
                    <div style={{ fontSize: 13, color: inRange ? 'var(--success)' : 'var(--text2)', marginBottom: 10 }}>
                      {inRange ? '✅ Je staat bij het HQ' : `📍 ${Math.round(dist)}m verwijderd`}
                    </div>
                    <div style={{
                      background: '#1a0f0f', border: '1px solid #7f1d1d', borderRadius: 10,
                      padding: 12, fontSize: 13, color: '#fca5a5', lineHeight: 1.5, marginBottom: 10,
                    }}>
                      🚪 <strong>3 kamers wachten</strong>: Vuilbak-zoektocht (Ingang) → Spinner Tiles (Beveiligingszaal) → Strength Boulders (Kluis).
                      <br /><br />
                      <em>De mini-games komen in een volgende update. Voor nu: kom hier fysiek samen — Team Rocket controleert je legitimiteit.</em>
                    </div>
                  </>
                )
              })()}
            </>
          )}
          {poiPanel.kind === 'shop' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 32 }}>🚐</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#fde68a' }}>Mobiele Shop</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Team Rocket — kom langs met je drank</div>
                </div>
                <button onClick={() => setPoiPanel(null)} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer' }}>✕</button>
              </div>
              {shopLoc && position && (() => {
                const dist = getDistanceMeters(position.lat, position.lon, shopLoc[0], shopLoc[1])
                const inRange = dist <= (CATCH_RADIUS_METERS * 1.2)
                return (
                  <div style={{ fontSize: 13, color: inRange ? 'var(--success)' : 'var(--text2)', marginBottom: 10 }}>
                    {inRange ? '✅ Je staat bij de shop' : `📍 ${Math.round(dist)}m verwijderd — kom dichterbij`}
                  </div>
                )
              })()}
              {mobileShopItems.length === 0 ? (
                <div style={{
                  background: '#1a1a2e', border: '1px solid var(--border)', borderRadius: 10,
                  padding: 14, fontSize: 13, color: 'var(--text2)', textAlign: 'center',
                }}>
                  Team Rocket heeft nog niets uitgestald. Kom later terug.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {mobileShopItems.map((it, idx) => (
                    <div key={idx} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 26 }}>{it.emoji || '🎁'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{it.name || it.item_key}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                          Prijs: {it.prijs_slokken ? `${it.prijs_slokken} slokken` : ''}
                          {it.prijs_uitdaging ? ` · ${it.prijs_uitdaging}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--accent)' }}>👋 vraag aan Team Rocket</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10, lineHeight: 1.5, fontStyle: 'italic' }}>
                Items worden manueel toegekend door Team Rocket nadat je de prijs hebt betaald.
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Fase-banner (altijd zichtbaar op de kaart, niet tijdens overlays) ── */}
      {!showOverlay && (
        <>
          {/* Legendarische eindfase: prominente gouden banner */}
          {isLegendaryPhase && (
            <div style={{
              position: 'absolute', top: 10, left: 12, right: 12, zIndex: 600,
              background: 'rgba(120, 53, 15, 0.96)', border: '1px solid #d97706',
              borderRadius: 12, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 8,
              animation: 'bokePulse 2s ease-in-out infinite',
            }}>
              <span style={{ fontSize: 18 }}>👑</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#fbbf24' }}>Legendarische Eindfase!</div>
                <div style={{ fontSize: 11, color: '#fde68a' }}>Pikachu is ergens op de kaart — dit zijn de laatste minuten!</div>
              </div>
            </div>
          )}

          {/* Verzamelfase: subtiele pill rechtsboven (verborgen tijdens legendary) */}
          {isCollecting && !isLegendaryPhase && (
            <div style={{
              position: 'absolute', top: 10, right: 12, zIndex: 600,
              background: 'rgba(20, 83, 45, 0.92)', border: '1px solid #166534',
              borderRadius: 99, padding: '5px 12px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 14 }}>🟢</span>
              <span style={{ fontWeight: 800, fontSize: 12, color: '#86efac' }}>Verzamelfase</span>
            </div>
          )}

          {/* Trainingsfase: prominente actie-banner */}
          {isTrainingPhase && (
            <div style={{
              position: 'absolute', top: 8, left: 8, right: 8, zIndex: 600,
              background: 'linear-gradient(135deg, #052e16, #14532d)',
              border: '2px solid #16a34a', borderRadius: 14,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}>
              <span style={{ fontSize: 26 }}>🌿</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#86efac' }}>Trainingsfase</div>
                <div style={{ fontSize: 12, color: '#4ade80', marginTop: 1 }}>Laat je Bokémon evolueren voor het toernooi!</div>
              </div>
              <button onClick={() => setActiveTab('evolutie')} style={{
                background: '#16a34a', border: 'none', borderRadius: 10,
                color: '#fff', fontWeight: 800, fontSize: 13,
                padding: '10px 14px', cursor: 'pointer', flexShrink: 0,
                animation: 'bokePulse 2s ease-in-out infinite',
              }}>
                🌿 Evolueer
              </button>
            </div>
          )}

          {/* Toernooifase: prominente actie-banner */}
          {isTournamentPhase && (
            <div style={{
              position: 'absolute', top: 8, left: 8, right: 8, zIndex: 600,
              background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
              border: '2px solid #6366f1', borderRadius: 14,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
            }}>
              <span style={{ fontSize: 26 }}>🏆</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#c7d2fe' }}>Toernooifase</div>
                <div style={{ fontSize: 12, color: '#818cf8', marginTop: 1 }}>De gyms wachten — wie wordt kampioen?</div>
              </div>
              <button onClick={() => setActiveTab('toernooi')} style={{
                background: '#4f46e5', border: 'none', borderRadius: 10,
                color: '#fff', fontWeight: 800, fontSize: 13,
                padding: '10px 14px', cursor: 'pointer', flexShrink: 0,
                animation: 'bokePulse 2s ease-in-out infinite',
              }}>
                🏆 Naar gym
              </button>
            </div>
          )}

          {/* Afgelopen */}
          {isFinished && (
            <div style={{
              position: 'absolute', top: 8, left: 8, right: 8, zIndex: 600,
              background: 'rgba(30,30,30,0.95)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '12px 14px', textAlign: 'center',
            }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text2)' }}>⏹️ Spel afgelopen</span>
            </div>
          )}
        </>
      )}

      {/* ── Bottombar — inhoud afhankelijk van fase ── */}
      {!showOverlay && (
        <div className="bottombar">
          {/* Kaart: altijd aanwezig */}
          <button className={`bottombar-btn ${activeTab==='map'?'active':''}`} onClick={() => setActiveTab('map')}>
            <span className="icon">🗺️</span><span>Kaart</span>
          </button>

          {/* Middelste knop: fase-afhankelijk */}
          {isCollecting && (
            <button className="bottombar-btn" onClick={startSteal}>
              <span className="icon">⚔️</span><span>Stelen</span>
            </button>
          )}
          {isTrainingPhase && (
            <button
              className={`bottombar-btn ${activeTab==='evolutie'?'active':''}`}
              onClick={() => setActiveTab('evolutie')}
            >
              <span className="icon" style={{ animation: 'bokePulse 1.5s ease-in-out infinite' }}>🌿</span>
              <span>Training</span>
            </button>
          )}
          {isTournamentPhase && (
            <button
              className={`bottombar-btn ${activeTab==='toernooi'?'active':''}`}
              onClick={() => setActiveTab('toernooi')}
            >
              <span className="icon" style={{ animation: 'bokePulse 1.5s ease-in-out infinite' }}>🏆</span>
              <span>Toernooi</span>
            </button>
          )}
          {isFinished && (
            <button className="bottombar-btn" disabled style={{ opacity: 0.4 }}>
              <span className="icon">⏹️</span><span>Klaar</span>
            </button>
          )}

          {/* Items: altijd aanwezig */}
          <button className={`bottombar-btn ${activeTab==='inventory'?'active':''}`} onClick={() => setActiveTab('inventory')}>
            <span className="icon">🎒</span><span>Items</span>
          </button>

          {/* Pokédex: altijd aanwezig */}
          <button className={`bottombar-btn ${activeTab==='pokedex'?'active':''}`} onClick={() => setActiveTab('pokedex')}>
            <span className="icon">📖</span><span>Pokédex</span>
          </button>
        </div>
      )}
    </div>
  )
}
