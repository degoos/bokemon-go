import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import JoinScreen from './screens/JoinScreen'
import MapScreen from './screens/MapScreen'
import AdminScreen from './screens/admin/AdminScreen'
import SetupSessionScreen from './screens/SetupSessionScreen'

export default function App() {
  const [state, setState] = useState(null) // null = loading, 'join', 'game', 'admin', 'setup'
  const [player, setPlayer] = useState(null)
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Check localStorage voor bestaande sessie
  useEffect(() => {
    async function restore() {
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
          // Update online status
          await supabase.from('players').update({ is_online: true }).eq('id', playerId)
          return
        }
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
      <div className="loading">
        <div className="spinner" />
        <span>Laden...</span>
      </div>
    )
  }

  if (state === 'join') {
    return <JoinScreen onJoin={handleJoin} />
  }

  if (state === 'setup' && player) {
    return <SetupSessionScreen player={player} onSessionCreated={s => { setSession(s); setState('admin') }} />
  }

  if (state === 'admin' && player && session) {
    return <AdminScreen player={player} session={session} onSignOut={handleSignOut} />
  }

  if (state === 'game' && player && session) {
    const team = null // wordt geladen vanuit useGameSession
    return <MapScreen player={player} session={session} team={team} isAdmin={isAdmin} onSignOut={handleSignOut} />
  }

  return <JoinScreen onJoin={handleJoin} />
}
