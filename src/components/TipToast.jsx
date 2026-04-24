// ─────────────────────────────────────────────────────────────
// TipToast — subtiele progressive disclosure tip
//
// Bewust anders dan NotificationBanner: lichter, meer uitnodigend,
// geen alarm-gevoel. Auto-dismiss na 7 seconden. Zit boven de bottombar.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'

const AUTO_DISMISS_MS = 7000

export default function TipToast({ tip, onDismiss }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!tip) return
    setLeaving(false)
    // Kleine delay zodat de enter-animatie goed triggert
    const t1 = setTimeout(() => setVisible(true), 30)
    // Auto-dismiss
    const t2 = setTimeout(() => dismiss(), AUTO_DISMISS_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [tip?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    setLeaving(true)
    setTimeout(() => {
      setVisible(false)
      onDismiss?.()
    }, 300)
  }

  if (!tip) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,          // net boven bottombar
        left: 12,
        right: 12,
        zIndex: 450,
        transform: visible && !leaving ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible && !leaving ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
        pointerEvents: visible && !leaving ? 'auto' : 'none',
      }}
      onClick={dismiss}
    >
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'rgba(20, 30, 50, 0.97)',
        border: '1px solid rgba(250, 204, 21, 0.35)',
        borderLeft: '3px solid #facc15',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(250,204,21,0.1)',
        cursor: 'pointer',
      }}>
        {/* Lampje-indicator */}
        <div style={{
          fontSize: 22,
          flexShrink: 0,
          marginTop: 1,
          filter: 'drop-shadow(0 0 4px rgba(250,204,21,0.6))',
        }}>
          {tip.emoji || '💡'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* "Tip"-label */}
          <div style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#facc15',
            marginBottom: 2,
            opacity: 0.9,
          }}>
            💡 Tip
          </div>
          <div style={{
            fontWeight: 700,
            fontSize: 14,
            color: '#f0f0ff',
            lineHeight: 1.3,
            marginBottom: 3,
          }}>
            {tip.title}
          </div>
          <div style={{
            fontSize: 12,
            color: 'rgba(200,210,240,0.85)',
            lineHeight: 1.5,
          }}>
            {tip.message}
          </div>
        </div>

        {/* Sluiten */}
        <button
          onClick={e => { e.stopPropagation(); dismiss() }}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 16,
            cursor: 'pointer',
            padding: '0 2px',
            flexShrink: 0,
            lineHeight: 1,
            alignSelf: 'flex-start',
          }}
        >✕</button>
      </div>
    </div>
  )
}
