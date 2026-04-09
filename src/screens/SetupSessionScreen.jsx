// Scherm om een nieuwe game sessie aan te maken (admin only)
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SetupSessionScreen({ player, onSessionCreated }) {
  const [form, setForm] = useState({
    name: 'Bokémon GO Night',
    team1Name: 'Team Rood', team1Color: '#ef4444', team1Emoji: '🔴',
    team2Name: 'Team Blauw', team2Color: '#3b82f6', team2Emoji: '🔵',
  })
  const [loading, setLoading] = useState(false)

  async function createSession(e) {
    e.preventDefault()
    setLoading(true)

    // Maak sessie aan
    const { data: session } = await supabase.from('game_sessions').insert({
      name: form.name,
      status: 'setup',
    }).select().single()

    if (!session) { setLoading(false); return }

    // Maak teams aan
    await supabase.from('teams').insert([
      { game_session_id: session.id, name: form.team1Name, color: form.team1Color, emoji: form.team1Emoji },
      { game_session_id: session.id, name: form.team2Name, color: form.team2Color, emoji: form.team2Emoji },
    ])

    // Koppel admin aan sessie
    await supabase.from('players').update({ game_session_id: session.id }).eq('id', player.id)

    // Sla op in localStorage
    localStorage.setItem('bokemon_session_id', session.id)
    onSessionCreated(session)
    setLoading(false)
  }

  return (
    <div className="screen" style={{ justifyContent: 'center' }}>
      <div style={{ padding: 24, maxWidth: 420, width: '100%', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>👑 Nieuwe Game Aanmaken</h2>
        <form onSubmit={createSession}>
          <div className="field">
            <label>Game naam</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label>Team 1 naam</label>
              <input value={form.team1Name} onChange={e => setForm(f => ({ ...f, team1Name: e.target.value }))} />
            </div>
            <div>
              <label>Team 2 naam</label>
              <input value={form.team2Name} onChange={e => setForm(f => ({ ...f, team2Name: e.target.value }))} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '⏳ Aanmaken...' : '🚀 Game Aanmaken'}
          </button>
        </form>
      </div>
    </div>
  )
}
