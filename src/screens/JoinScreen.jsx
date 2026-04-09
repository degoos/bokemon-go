import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function JoinScreen({ onJoin }) {
  const [step, setStep] = useState('code') // code | team | admin_setup
  const [gameCode, setGameCode] = useState('')
  const [name, setName] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [session, setSession] = useState(null)
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Admin: nieuwe game aanmaken
  const [adminSetup, setAdminSetup] = useState({
    adminName: '', adminPass: '',
    sessionName: 'Bokémon GO Night',
    team1Name: 'Team Rood', team1Color: '#ef4444', team1Emoji: '🔴',
    team2Name: 'Team Blauw', team2Color: '#3b82f6', team2Emoji: '🔵',
  })

  async function handleCodeSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const code = gameCode.toUpperCase().trim()
    const { data, error: err } = await supabase
      .from('game_sessions').select('*')
      .eq('game_code', code).neq('status', 'finished').single()
    if (err || !data) { setError('Game code niet gevonden.'); setLoading(false); return }
    const { data: t } = await supabase.from('teams').select('*').eq('game_session_id', data.id)
    setSession(data); setTeams(t || []); setStep('team'); setLoading(false)
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Geef je naam in.'); return }
    if (!selectedTeam && adminKey !== 'rocket') { setError('Kies een team of geef de admin-code in.'); return }
    setError(''); setLoading(true)
    const isAdmin = adminKey === 'rocket'
    const { data: player, error: err } = await supabase.from('players').insert({
      game_session_id: session.id,
      team_id: isAdmin ? null : selectedTeam,
      name: name.trim(), is_admin: isAdmin, is_online: true,
    }).select().single()
    if (err || !player) { setError('Fout bij joinen.'); setLoading(false); return }
    localStorage.setItem('bokemon_player_id', player.id)
    localStorage.setItem('bokemon_session_id', session.id)
    localStorage.setItem('bokemon_is_admin', isAdmin ? '1' : '0')
    onJoin({ player, session, isAdmin })
  }

  async function handleCreateGame(e) {
    e.preventDefault()
    if (adminSetup.adminPass !== 'rocket') { setError('Verkeerde admin-code.'); return }
    if (!adminSetup.adminName.trim()) { setError('Geef je naam in.'); return }
    setError(''); setLoading(true)

    // Maak sessie aan
    const { data: sess } = await supabase.from('game_sessions').insert({
      name: adminSetup.sessionName, status: 'setup', phase: 'setup',
    }).select().single()
    if (!sess) { setError('Fout bij aanmaken.'); setLoading(false); return }

    // Teams aanmaken
    await supabase.from('teams').insert([
      { game_session_id: sess.id, name: adminSetup.team1Name, color: adminSetup.team1Color, emoji: adminSetup.team1Emoji },
      { game_session_id: sess.id, name: adminSetup.team2Name, color: adminSetup.team2Color, emoji: adminSetup.team2Emoji },
    ])

    // Admin speler aanmaken
    const { data: player } = await supabase.from('players').insert({
      game_session_id: sess.id, name: adminSetup.adminName.trim(),
      is_admin: true, is_online: true,
    }).select().single()

    if (!player) { setError('Fout bij aanmaken speler.'); setLoading(false); return }
    localStorage.setItem('bokemon_player_id', player.id)
    localStorage.setItem('bokemon_session_id', sess.id)
    localStorage.setItem('bokemon_is_admin', '1')
    onJoin({ player, session: sess, isAdmin: true })
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', background: 'linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)' }}>
      <div style={{ padding: '32px 24px', maxWidth: 420, width: '100%', margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>⚡</div>
          <h1 style={{ color: '#facc15', fontSize: 32, letterSpacing: -1 }}>Bokémon GO</h1>
          <p style={{ color: 'var(--text2)', marginTop: 6, fontSize: 14 }}>Oudsbergen Night Edition</p>
        </div>

        {/* Stap 1: game code */}
        {step === 'code' && (
          <form onSubmit={handleCodeSubmit}>
            <div className="field">
              <label>Game Code</label>
              <input value={gameCode} onChange={e => setGameCode(e.target.value.toUpperCase())}
                placeholder="bijv. AB12CD" maxLength={10} autoCapitalize="characters" autoComplete="off"
                style={{ fontSize: 24, textAlign: 'center', letterSpacing: 4, fontWeight: 800 }} />
            </div>
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 14 }}>{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={loading || gameCode.length < 4}>
              {loading ? '⏳ Controleren...' : '🔍 Game zoeken'}
            </button>

            {/* Scheidingslijn */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>of</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <button type="button" className="btn btn-ghost" onClick={() => { setStep('admin_setup'); setError('') }}>
              👑 Nieuwe game aanmaken (admin)
            </button>
          </form>
        )}

        {/* Stap 2: team kiezen */}
        {step === 'team' && session && (
          <form onSubmit={handleJoin}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Game gevonden:</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{session.name}</div>
              <div style={{ fontSize: 13, color: 'var(--warning)', marginTop: 4, letterSpacing: 2, fontWeight: 700 }}>{session.game_code}</div>
            </div>
            <div className="field">
              <label>Jouw naam</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Trainer naam" maxLength={30} />
            </div>
            <div className="field">
              <label>Kies je team</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {teams.map(team => (
                  <button key={team.id} type="button"
                    onClick={() => { setSelectedTeam(team.id); setAdminKey('') }}
                    style={{
                      padding: '18px 12px', borderRadius: 14, cursor: 'pointer', fontSize: 16, fontWeight: 700,
                      border: `3px solid ${selectedTeam === team.id ? team.color : 'var(--border)'}`,
                      background: selectedTeam === team.id ? `${team.color}22` : 'var(--card)',
                      color: 'var(--text)', transition: 'all 0.15s',
                    }}>
                    {team.emoji} {team.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Of: Admin code (Team Rocket)</label>
              <input value={adminKey} onChange={e => { setAdminKey(e.target.value); setSelectedTeam(null) }}
                placeholder="Admin wachtwoord" type="password" />
            </div>
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 14 }}>{error}</p>}
            <button className="btn btn-primary" type="submit"
              disabled={loading || !name.trim() || (!selectedTeam && !adminKey)}>
              {loading ? '⏳ Joinen...' : '🚀 Deelnemen'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setStep('code')}>
              ← Andere code
            </button>
          </form>
        )}

        {/* Admin: nieuwe game aanmaken */}
        {step === 'admin_setup' && (
          <form onSubmit={handleCreateGame}>
            <h3 style={{ textAlign: 'center', marginBottom: 20 }}>👑 Nieuwe Game</h3>
            <div className="field">
              <label>Jouw naam (admin)</label>
              <input value={adminSetup.adminName}
                onChange={e => setAdminSetup(s => ({ ...s, adminName: e.target.value }))}
                placeholder="bijv. Professor Rocket" />
            </div>
            <div className="field">
              <label>Admin code</label>
              <input type="password" value={adminSetup.adminPass}
                onChange={e => setAdminSetup(s => ({ ...s, adminPass: e.target.value }))}
                placeholder="Admin wachtwoord" />
            </div>
            <div className="field">
              <label>Game naam</label>
              <input value={adminSetup.sessionName}
                onChange={e => setAdminSetup(s => ({ ...s, sessionName: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label>Team 1</label>
                <input value={adminSetup.team1Name}
                  onChange={e => setAdminSetup(s => ({ ...s, team1Name: e.target.value }))} />
              </div>
              <div>
                <label>Team 2</label>
                <input value={adminSetup.team2Name}
                  onChange={e => setAdminSetup(s => ({ ...s, team2Name: e.target.value }))} />
              </div>
            </div>
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 14 }}>{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? '⏳ Aanmaken...' : '🚀 Game Aanmaken'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { setStep('code'); setError('') }}>
              ← Terug
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
