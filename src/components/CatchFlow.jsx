import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

const RPS_CHOICES = [
  { key: 'steen', emoji: '✊', label: 'Steen' },
  { key: 'schaar', emoji: '✌️', label: 'Schaar' },
  { key: 'papier', emoji: '🖐️', label: 'Papier' },
]

const BEATS = { steen: 'schaar', schaar: 'papier', papier: 'steen' }

function getRpsWinner(a, b) {
  if (a === b) return 'draw'
  return BEATS[a] === b ? 'a' : 'b'
}

export default function CatchFlow({ spawn, player, team, onClose, onCaught }) {
  const [phase, setPhase] = useState('arriving') // arriving → waiting → opdracht → catching → result
  const [waitSeconds, setWaitSeconds] = useState(spawn?.game_session?.catch_wait_seconds || 90)
  const [opdrachtType, setOpdrachtType] = useState(null)
  const [opdracht, setOpdracht] = useState(null)
  const [rpsRounds, setRpsRounds] = useState([])
  const [myChoice, setMyChoice] = useState(null)
  const [teamScores, setTeamScores] = useState({ a: 0, b: 0 })
  const [result, setResult] = useState(null)

  const pokemon = spawn?.pokemon_definitions

  // Wachttimer voor second team
  useEffect(() => {
    if (phase !== 'waiting') return
    if (waitSeconds <= 0) {
      setOpdrachtType(1)
      setPhase('opdracht')
      return
    }
    const t = setTimeout(() => setWaitSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, waitSeconds])

  // Haal opdracht op
  useEffect(() => {
    if (phase !== 'opdracht') return
    async function fetchOpdracht() {
      const { data } = await supabase
        .from('opdracht_definitions')
        .select('*')
        .eq('type', opdrachtType || 1)
        .eq('is_enabled', true)
        .limit(20)
      if (data && data.length > 0) {
        setOpdracht(data[Math.floor(Math.random() * data.length)])
      }
    }
    fetchOpdracht()
  }, [phase, opdrachtType])

  // Luister naar realtime updates van deze spawn
  useEffect(() => {
    if (!spawn?.id) return
    const ch = supabase.channel(`spawn-${spawn.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'active_spawns',
        filter: `id=eq.${spawn.id}`,
      }, (p) => {
        if (p.new.status === 'caught') {
          if (p.new.caught_by_team_id === team?.id) {
            setResult('won')
          } else {
            setResult('lost')
          }
          setPhase('result')
        }
        if (p.new.active_opdracht_type && phase === 'waiting') {
          setOpdrachtType(p.new.active_opdracht_type)
          setPhase('opdracht')
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [spawn?.id, team?.id, phase])

  async function handleMarkArrived() {
    const field = team?.id === spawn?.catch_team1_arrived_at ? 'catch_team2_arrived_at' : 'catch_team1_arrived_at'
    await supabase.from('active_spawns').update({
      [field]: new Date().toISOString(),
      status: 'catching',
    }).eq('id', spawn.id)
    setPhase('waiting')
  }

  async function handleCompleteOpdracht() {
    // Vang de Bokémon
    const { data: caught } = await supabase.from('catches').insert({
      game_session_id: spawn.game_session_id,
      team_id: team.id,
      pokemon_definition_id: spawn.pokemon_definition_id,
      spawn_id: spawn.id,
      cp: spawn.cp,
      is_shiny: spawn.spawn_type === 'shiny',
      is_mystery: spawn.spawn_type === 'mystery',
    }).select().single()

    await supabase.from('active_spawns').update({
      status: 'caught',
      caught_by_team_id: team.id,
    }).eq('id', spawn.id)

    await supabase.from('notifications').insert({
      game_session_id: spawn.game_session_id,
      title: `${team.emoji} ${team.name} heeft ${pokemon?.name} gevangen!`,
      message: `CP: ${spawn.cp}${spawn.spawn_type === 'shiny' ? ' ✨ SHINY!' : ''}`,
      type: 'success',
      emoji: pokemon?.sprite_emoji,
    })

    setResult('won')
    setPhase('result')
    if (onCaught) onCaught(caught)
  }

  if (!pokemon) return null

  const typeInfo = POKEMON_TYPES[pokemon.pokemon_type] || {}

  return (
    <div className="catch-screen">
      {/* Header */}
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3>Vangst!</h3>
        <div />
      </div>

      {/* Pokémon info */}
      <div className="catch-pokemon-card">
        <div className="emoji" style={{ filter: spawn.spawn_type === 'shiny' ? 'drop-shadow(0 0 12px gold)' : 'none' }}>
          {spawn.spawn_type === 'mystery' ? '❓' : pokemon.sprite_emoji}
        </div>
        {spawn.spawn_type !== 'mystery' && (
          <h2 style={{ marginBottom: 8 }}>
            {spawn.spawn_type === 'shiny' ? '✨ ' : ''}{pokemon.name}
          </h2>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <span className={`badge badge-${pokemon.pokemon_type}`}>
            {typeInfo.emoji} {typeInfo.label}
          </span>
        </div>
        <div className="cp-big">{spawn.cp} CP</div>
      </div>

      <div className="scroll-area" style={{ paddingTop: 0 }}>
        {/* Fase: aankomen */}
        {phase === 'arriving' && (
          <div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text2)', marginBottom: 16 }}>
                Bevestig dat je team aanwezig is op de locatie
              </p>
              <button className="btn btn-primary" onClick={handleMarkArrived}>
                📍 Wij zijn er!
              </button>
            </div>
            {spawn.requires_opdracht && (
              <div className="card">
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                  ⏳ Wachten op het andere team... Als ze niet komen, start de opdracht automatisch.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Fase: wachten */}
        {phase === 'waiting' && (
          <div>
            <div className="timer-ring" style={{ className: waitSeconds < 15 ? 'timer-ring urgent' : 'timer-ring' }}>
              ⏱ {waitSeconds}s
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text2)' }}>
                Wachten op het andere team...
              </p>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>
                Als ze niet komen, start jij de opdracht solo.
              </p>
            </div>
          </div>
        )}

        {/* Fase: opdracht */}
        {phase === 'opdracht' && opdracht && (
          <div>
            <div className="card" style={{ borderColor: opdrachtType === 2 ? 'var(--warning)' : 'var(--accent)', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                {opdrachtType === 2 ? '⚔️ Team vs Team' : '🎯 Solo Opdracht'}
              </div>
              <h3 style={{ marginBottom: 12 }}>{opdracht.title}</h3>
              <p style={{ color: 'var(--text2)', lineHeight: 1.5 }}>{opdracht.description}</p>
              {opdracht.drinks_loser > 0 && (
                <div style={{ marginTop: 12, padding: '8px 16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 14, color: 'var(--warning)' }}>
                  🍺 Verliezer drinkt {opdracht.drinks_loser} slokken
                </div>
              )}
              {opdracht.time_limit_seconds && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
                  ⏱ Tijdslimiet: {Math.floor(opdracht.time_limit_seconds / 60)}:{String(opdracht.time_limit_seconds % 60).padStart(2, '0')}
                </div>
              )}
            </div>
            <button className="btn btn-success" style={{ margin: '0 16px 12px' }} onClick={handleCompleteOpdracht}>
              ✅ Opdracht Voltooid — Wij Winnen!
            </button>
            <button className="btn btn-ghost" style={{ margin: '0 16px' }} onClick={onClose}>
              ❌ Opdracht Mislukt
            </button>
          </div>
        )}

        {/* Fase: resultaat */}
        {phase === 'result' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            {result === 'won' ? (
              <>
                <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
                <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>Gevangen!</h2>
                <p style={{ color: 'var(--text2)' }}>
                  {pokemon.name} ({spawn.cp} CP) is toegevoegd aan jullie team!
                </p>
                {pokemon.linked_beer && (
                  <div style={{ marginTop: 16, padding: 12, background: 'var(--card)', borderRadius: 12 }}>
                    <p style={{ color: 'var(--text2)', fontSize: 13 }}>Evolutie-bier:</p>
                    <p style={{ fontWeight: 700, fontSize: 16 }}>🍺 {pokemon.linked_beer}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 72, marginBottom: 16 }}>😢</div>
                <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Verloren!</h2>
                <p style={{ color: 'var(--text2)' }}>Het andere team was sneller.</p>
              </>
            )}
            <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={onClose}>
              Terug naar kaart
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
