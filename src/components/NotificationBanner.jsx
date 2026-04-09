import { useState, useEffect } from 'react'

export default function NotificationBanner({ notifications }) {
  const [current, setCurrent] = useState(null)
  const [queue, setQueue] = useState([])
  const [showing, setShowing] = useState(false)

  useEffect(() => {
    if (notifications.length > 0) {
      setQueue(prev => [...prev, ...notifications.filter(n => !prev.find(p => p.id === n.id))])
    }
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
