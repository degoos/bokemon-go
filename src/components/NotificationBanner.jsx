import { useState, useEffect, useRef } from 'react'
import TeamEmoji from './TeamEmoji'

// Maximale leeftijd van een notificatie om getoond te worden (2 minuten)
const MAX_AGE_MS = 2 * 60 * 1000

export default function NotificationBanner({ notifications, teams = [], players = [], myTeamId = null }) {
  const [current, setCurrent] = useState(null)
  const [queue, setQueue] = useState([])
  const [showing, setShowing] = useState(false)
  // Bijhouden welke IDs al ooit in de queue zijn gestopt — overleeft re-renders
  const seenIds = useRef(new Set())

  useEffect(() => {
    if (!notifications || notifications.length === 0) return
    const now = Date.now()
    const fresh = notifications.filter(n => {
      if (!n?.id) return false
      if (seenIds.current.has(n.id)) return false // al getoond
      // Gooi oude notificaties weg (ouder dan MAX_AGE_MS)
      if (n.created_at && now - new Date(n.created_at).getTime() > MAX_AGE_MS) return false
      return true
    })
    if (fresh.length === 0) return
    fresh.forEach(n => seenIds.current.add(n.id))
    setQueue(prev => [...prev, ...fresh])
  }, [notifications])

  useEffect(() => {
    if (!showing && queue.length > 0) {
      setCurrent(queue[0])
      setQueue(prev => prev.slice(1))
      setShowing(true)
      setTimeout(() => setShowing(false), 4000)
    }
  }, [queue, showing])

  if (!showing || !current) return null

  // ── Doelteam afleiden uit target_team_id of via target_player_id → team ──
  let targetTeam = null
  if (current.target_team_id) {
    targetTeam = teams.find(t => t.id === current.target_team_id) || null
  } else if (current.target_player_id) {
    const p = players.find(pl => pl.id === current.target_player_id)
    if (p) targetTeam = teams.find(t => t.id === p.team_id) || null
  }

  const isForMe = targetTeam && myTeamId && targetTeam.id === myTeamId
  const isForAll = !targetTeam

  // Bepaal accentkleur: teamkleur als er een doelteam is, anders neutraal
  const accent = targetTeam?.color || null

  // Inline border-style override op basis van teamkleur (overschrijft de css-class border)
  const borderStyle = accent
    ? { borderBottom: `3px solid ${accent}`, boxShadow: `inset 4px 0 0 ${accent}` }
    : {}

  return (
    <div
      className={`notif-banner ${current.type || 'info'}`}
      onClick={() => setShowing(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        cursor: 'pointer',
        ...borderStyle,
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{current.emoji || '📢'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Team-chip: maakt direct duidelijk voor welk team de melding is */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
          flexWrap: 'wrap',
        }}>
          {isForAll ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
              padding: '2px 7px', borderRadius: 99,
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.95)',
              textTransform: 'uppercase',
            }}>
              📣 Iedereen
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
              padding: '2px 8px', borderRadius: 99,
              background: `${accent}33`,
              border: `1px solid ${accent}`,
              color: accent,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              <span>Voor</span>
              <TeamEmoji emoji={targetTeam.emoji} style={{ fontSize: 12 }} />
              <span>{targetTeam.name}</span>
              {isForMe && <span style={{ marginLeft: 2 }}>· jij</span>}
            </span>
          )}
        </div>
        <div style={{ fontWeight: 800 }}>{current.title}</div>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1 }}>{current.message}</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); setShowing(false) }}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer', flexShrink: 0, padding: '0 4px', lineHeight: 1 }}
      >✕</button>
    </div>
  )
}
