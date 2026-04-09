import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function JoinScreen({ onJoin }) {
  const [step, setStep] = useState('code') // code → team → ready
  const [gameCode, setGameCode] = useState('')
  const [name, setName] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [session, setSession] = useState(null)
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCodeSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const code = gameCode.toUpperCase().trim()
    const { data, error: err } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('game_code', code)
      .neq('status', 'finished')
      .single()

    if (err || !data) {
      setError('Game code niet gevonden. Probeer opnieuw.')
      setLoading(false)
      return
    }

    const { data: t } = await supabase.from('teams').select('*').eq('game_session_id', data.id)
    setSession(data)
    setTeams(t || [])
    setStep('team')
    setLoading(false)
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Geef je naam in.'); return }
    if (!selectedTeam && !adminKey) { setError('Kies een team of geef de admin-code in.'); return }
    setError('')
    setLoading(true)

    const isAdmin = adminKey === 'rocket'

    const { data: player, error: err } = await supabase.from('players').insert({
      game_session_id: session.id,
      team_id: isAdmin ? null : selectedTeam,
      name: name.trim(),
      is_admin: isAdmin,
      is_online: true,
    }).select().single()

    if (err || !player) {
      setError('Fout bij joinen. Probeer opnieuw.')
      setLoading(false)
      return
    }

    // Sla op in localStorage
    localStorage.setItem('bokemon_player_id', player.id)
    localStorage.setItem('bokemon_session_id', session.id)
    localStorage.setItem('bokemon_is_admin', isAdmin ? '1' : '0')

    onJoin({ player, session, isAdmin })
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', background: 'linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)' }}>
      <div style={{ padding: '32px 24px', maxWidth: 420, width: '100%', margin: '0 auto' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 8 }}>⚡</div>
          <h1 style={{ color: '#facc15', fontSize: 32, letterSpacing: -1 }}>Bokémon GO</h1>
          <p style={{ color: 'var(--text2)', marginTop: 6, fontSize: 14 }}>
            Oudsbergen Night Edition
          </p>
        </div>

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit}>
            <div className="field">
              <label>Game Code</label>
              <input
                value={gameCode}
                onChange={e => setGameCode(e.target.value.toUpperCase())}
                placeholder="bijv. AB12CD"
                maxLength={10}
                autoCapitalize="characters"
                autoComplete="off"
                style={{ fontSize: 24, textAlign: 'center', letterSpacing: 4, fontWeight: 800 }}
              />
            </div>
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 14 }}>{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={loading || gameCode.length < 4}>
              {loading ? '⏳ Controleren...' : '🔍 Game zoeken'}
            </button>
          </form>
        )}

        {step === 'team' && session && (
          <form onSubmit={handleJoin}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Game gevonden:</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{session.name}</div>
            </div>

            <div className="field">
              <label>Jouw naam</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Trainer naam"
                maxLength={30}
                autoComplete="name"
              />
            </div>

            <div className="field">
              <label>Kies je team</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {teams.map(team => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => { setSelectedTeam(team.id); setAdminKey('') }}
                    style={{
                      padding: '18px 12px',
                      borderRadius: 14,
                      border: `3px solid ${selectedTeam === team.id ? team.color : 'var(--border)'}`,
                      background: selectedTeam === team.id ? `${team.color}22` : 'var(--card)',
                      color: 'var(--text)',
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {team.emoji} {team.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Of: Admin code (Team Rocket)</label>
              <input
                value={adminKey}
                onChange={e => { setAdminKey(e.target.value); setSelectedTeam(null) }}
                placeholder="Admin wachtwoord"
                type="password"
              />
            </div>

            {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 14 }}>{error}</p>}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || !name.trim() || (!selectedTeam && !adminKey)}
            >
              {loading ? '⏳ Joinen...' : '🚀 Deelnemen'}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              onClick={() => setStep('code')}
            >
              ← Andere code
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
