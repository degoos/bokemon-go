// Fullscreen overlay die trainers zien wanneer de sessie gepauzeerd is.
// Wordt getoond bovenop MapScreen / EvolutionScreen / TournamentScreen.
export default function PausedOverlay({ session, onSignOut }) {
  const since = session?.paused_at
    ? new Date(session.paused_at).toLocaleString('nl-BE', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  const phaseLabel = labelForStatus(session?.paused_at_status)
  const message = session?.paused_message

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'radial-gradient(circle at top, #1e1e3a 0%, #0f0f1a 80%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 24, gap: 20, textAlign: 'center',
    }}>
      <div style={{
        fontSize: 72, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
        animation: 'pauseBreath 2.4s ease-in-out infinite',
      }}>⏸️</div>

      <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>
        Spel gepauzeerd
      </div>

      <div style={{
        background: '#1e1e3a', border: '1px solid #2a2a4a',
        borderRadius: 14, padding: 18, maxWidth: 360, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
          {message || 'Team Rocket heeft het spel even stilgelegd. Je voortgang is bewaard — we hervatten binnenkort.'}
        </div>
        {phaseLabel && (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Gepauzeerd in fase: <strong style={{ color: 'var(--text)' }}>{phaseLabel}</strong>
          </div>
        )}
        {since && (
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            Sinds {since}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 320 }}>
        Laat deze pagina open staan. Zodra Team Rocket hervat, gaat het spel automatisch verder.
      </div>

      {onSignOut && (
        <button onClick={onSignOut}
          style={{
            marginTop: 12, background: 'transparent',
            color: 'var(--text2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 16px', fontSize: 12, cursor: 'pointer',
          }}>
          Uitloggen
        </button>
      )}

      <style>{`
        @keyframes pauseBreath {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50%      { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function labelForStatus(status) {
  switch (status) {
    case 'collecting': return '🟢 Verzamelfase'
    case 'training':   return '🌿 Trainingsfase'
    case 'tournament': return '🏆 Toernooi'
    default: return null
  }
}
