import { useState, useEffect, useRef } from 'react'

// Maximale leeftijd van een notificatie om getoond te worden (2 minuten)
const MAX_AGE_MS = 2 * 60 * 1000

export default function NotificationBanner({ notifications }) {
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
      setTimeout(() => setShowing(false), 3500)
    }
  }, [queue, showing])

  if (!showing || !current) return null

  return (
    <div className={`notif-banner ${current.type || 'info'}`} onClick={() => setShowing(false)}>
      <span style={{ fontSize: 22 }}>{current.emoji || '📢'}</span>
      <div>
        <div style={{ fontWeight: 800 }}>{current.title}</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>{current.message}</div>
      </div>
    </div>
  )
}
