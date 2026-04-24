import { useState, useEffect, Component } from 'react'
import { supabase } from './lib/supabase'
import JoinScreen from './screens/JoinScreen'
import MapScreen from './screens/MapScreen'
import AdminScreen from './screens/admin/AdminScreen'
import SetupSessionScreen from './screens/SetupSessionScreen'

// ── Error Boundary: toont een leesbare fout i.p.v. zwart scherm ──
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#0f0f1a',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: 24, gap: 16,
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#ef4444' }}>Er ging iets mis</div>
          <div style={{
            background: '#1e1e3a', border: '1px solid #2a2a4a', borderRadius: 12,
            padding: 16, fontSize: 12, color: '#9090b0', maxWidth: 360,
            wordBreak: 'break-all', whiteSpace: 'pre-wrap',
          }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            onClick={() => { localStorage.clear(); window.location.reload() }}
            style={{
              background: '#7c3aed', color: 'white', border: 'none', borderRadius: 12,
              padding: '14px 24px', fontWeight: 700, fontSize: 16, cursor: 'pointer',
            }}
          >
            🔄 Herstart & uitloggen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [state, setState] = useState(null) // null = loading, 'join', 'game', 'admin', 'setup'
  const [player, setPlayer] = useState(null)
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Check localStorage voor bestaande sessie
  useEffect(() => {
    async function restore() {
      try {
        const playerId = localStorage.getItem('bokemon_player_id')
        const sessionId = localStorage.getItem('bokemon_session_id')
        const admin = localStorage.getItem('bokemon_is_admin') === '1'

        if (playerId && sessionId) {
          const [{ data: p }, { data: s }] = await Promise.all([
            supabase.from('players').select('*').eq('id', playerId).single(),
            supabase.from('game_sessions').select('*').eq('id', sessionId).neq('status', 'finished').single(),
          ])
          if (p && s) {
            setPlayer(p)
            setSession(s)
            setIsAdmin(admin)
            setState(admin ? 'admin' : 'game')
            await supabase.from('players').update({ is_online: true }).eq('id', playerId)
            return
          }
        }
      } catch (e) {
        console.error('Restore error:', e)
      }
      setState('join')
    }
    restore()
  }, [])

  function handleJoin({ player, session, isAdmin }) {
    setPlayer(player)
    setSession(session)
    setIsAdmin(isAdmin)
    if (isAdmin && !session) {
      setState('setup')
    } else if (isAdmin) {
      setState('admin')
    } else {
      setState('game')
    }
  }

  function handleSignOut() {
    localStorage.removeItem('bokemon_player_id')
    localStorage.removeItem('bokemon_session_id')
    localStorage.removeItem('bokemon_is_admin')
    setPlayer(null)
    setSession(null)
    setIsAdmin(false)
    setState('join')
  }

  if (state === null) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#0f0f1a',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>⚡</div>
        <div style={{ color: '#9090b0', fontSize: 15 }}>Laden...</div>
      </div>
    )
  }

  if (state === 'join') {
    return <ErrorBoundary><JoinScreen onJoin={handleJoin} /></ErrorBoundary>
  }

  if (state === 'setup' && player) {
    return (
      <ErrorBoundary>
        <SetupSessionScreen player={player} onSessionCreated={s => { setSession(s); setState('admin') }} />
      </ErrorBoundary>
    )
  }

  if (state === 'admin' && player && session) {
    return (
      <ErrorBoundary>
        <AdminScreen player={player} session={session} onSignOut={handleSignOut} />
      </ErrorBoundary>
    )
  }

  if (state === 'game' && player && session) {
    return (
      <ErrorBoundary>
        <MapScreen player={player} session={session} isAdmin={isAdmin} onSignOut={handleSignOut} />
      </ErrorBoundary>
    )
  }

  return <ErrorBoundary><JoinScreen onJoin={handleJoin} /></ErrorBoundary>
}
