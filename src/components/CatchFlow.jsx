import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

export default function CatchFlow({ spawn, player, team, session, onClose, onCaught }) {
  const [phase, setPhase] = useState('arriving') // arriving → waiting → opdracht → result
  const [waitSeconds, setWaitSeconds] = useState(session?.catch_wait_seconds || 90)
  const [opdrachtType, setOpdrachtType] = useState(null) // 1 = solo, 2 = team vs team
  const [opdracht, setOpdracht] = useState(null)
  const [arriving, setArriving] = useState(false) // loading state

  const pokemon = spawn?.pokemon_definitions

  // ── Wachttimer (enkel eerste team ziet dit) ──────────────────
  useEffect(() => {
    if (phase !== 'waiting') return
    if (waitSeconds <= 0) {
      // Schrijf naar DB zodat laat-aankomend team ook stopt
      // .is() voorkomt dat type 2 overschreven wordt als team 2 net arriveerde
      supabase.from('active_spawns')
        .update({ active_opdracht_type: 1 })
        .eq('id', spawn.id)
        .is('active_opdracht_type', null)
        .then(() => {})
      setOpdrachtType(1)
      setPhase('opdracht')
      return
    }
    const t = setTimeout(() => setWaitSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, waitSeconds, spawn.id])

  // ── Opdracht ophalen zodra fase start ────────────────────────
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

  // ── Realtime: luister naar updates van deze spawn ────────────
  useEffect(() => {
    if (!spawn?.id) return
    const ch = supabase.channel(`catch-${spawn.id}-${team?.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'active_spawns',
        filter: `id=eq.${spawn.id}`,
      }, (payload) => {
        const updated = payload.new

        // Spawn gevangen door een team
        if (updated.status === 'caught') {
          setResult(updated.caught_by_team_id === team?.id ? 'won' : 'lost')
          setPhase('result')
          return
        }

        // Eerste team wacht: team 2 is gearriveerd → Type 2 battle!
        if (phase === 'waiting' && updated.active_opdracht_type === 2) {
          setOpdrachtType(2)
          setPhase('opdracht')
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [spawn?.id, team?.id, phase])

  // ── Wij zijn er! ─────────────────────────────────────────────
  async function handleMarkArrived() {
    setArriving(true)
    const now = new Date().toISOString()

    // Haal meest recente staat op om race-condition te voorkomen
    const { data: fresh } = await supabase
      .from('active_spawns')
      .select('catch_team1_arrived_at, active_opdracht_type')
      .eq('id', spawn.id)
      .single()

    if (!fresh) { setArriving(false); return }

    // Als er al een opdracht gestart is (timer liep af): meteen tonen
    if (fresh.active_opdracht_type) {
      setOpdrachtType(fresh.active_opdracht_type)
      setPhase('opdracht')
      setArriving(false)
      return
    }

    if (!fresh.catch_team1_arrived_at) {
      // ── Eerste team: start de wachttimer ──────────────────────
      await supabase.from('active_spawns').update({
        catch_team1_arrived_at: now,
        status: 'catching',
      }).eq('id', spawn.id)
      setPhase('waiting')
    } else {
      // ── Tweede team: start Type 2 battle direct! ──────────────
      await supabase.from('active_spawns').update({
        catch_team2_arrived_at: now,
        active_opdracht_type: 2,
      }).eq('id', spawn.id)
      setOpdrachtType(2)
      setPhase('opdracht')
    }
    setArriving(false)
  }

  // ── Opdracht voltooid → vangst vastleggen ────────────────────
  async function handleCompleteOpdracht() {
    await supabase.from('catches').insert({
      game_session_id: spawn.game_session_id,
      team_id: team.id,
      pokemon_definition_id: spawn.pokemon_definition_id,
      spawn_id: spawn.id,
      cp: spawn.cp,
      is_shiny: spawn.spawn_type === 'shiny',
      is_mystery: spawn.spawn_type === 'mystery',
    })
    await supabase.from('active_spawns').update({
      status: 'caught',
      caught_by_team_id: team.id,
    }).eq('id', spawn.id)
    await supabase.from('notifications').insert({
      game_session_id: spawn.game_session_id,
      title: `${team.emoji} ${team.name} heeft ${pokemon?.name} gevangen!`,
      message: `CP: ${spawn.cp}${spawn.spawn_type === 'shiny' ? ' ✨ SHINY!' : ''}`,
      type: 'success', emoji: pokemon?.sprite_emoji,
    })
    setResult('won')
    setPhase('result')
    if (onCaught) onCaught()
  }

  const [result, setResult] = useState(null)

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
              <button className="btn btn-primary" onClick={handleMarkArrived} disabled={arriving}>
                {arriving ? '⏳ Even wachten...' : '📍 Wij zijn er!'}
              </button>
            </div>
          </div>
        )}

        {/* Fase: wachten op tweede team */}
        {phase === 'waiting' && (
          <div>
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{
                fontSize: 56, fontWeight: 900,
                color: waitSeconds < 15 ? 'var(--danger)' : 'var(--warning)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {waitSeconds}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>seconden</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>⏳ Wachten op het andere team...</p>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                Komen ze op tijd? → ⚔️ Team vs Team battle!<br />
                Komen ze niet? → 🎯 Solo opdracht.
              </p>
            </div>
          </div>
        )}

        {/* Fase: opdracht */}
        {phase === 'opdracht' && (
          <div>
            {/* Battle-type banner */}
            <div style={{
              textAlign: 'center', padding: '16px',
              background: opdrachtType === 2 ? 'rgba(245,158,11,0.15)' : 'rgba(124,58,237,0.15)',
              borderBottom: `2px solid ${opdrachtType === 2 ? 'var(--warning)' : 'var(--accent)'}`,
              marginBottom: 8,
            }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>
                {opdrachtType === 2 ? '⚔️' : '🎯'}
              </div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>
                {opdrachtType === 2 ? 'Team vs Team!' : 'Solo Opdracht'}
              </div>
              {opdrachtType === 2 && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                  Beide teams zijn aanwezig — het beste team wint de Bokémon!
                </div>
              )}
            </div>

            {opdracht ? (
              <div className="card" style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: 12 }}>{opdracht.title}</h3>
                <p style={{ color: 'var(--text2)', lineHeight: 1.6 }}>{opdracht.description}</p>
                {opdracht.drinks_loser > 0 && (
                  <div style={{ marginTop: 12, padding: '8px 16px', background: 'var(--bg3)', borderRadius: 10, fontSize: 14, color: 'var(--warning)' }}>
                    🍺 Verliezer drinkt {opdracht.drinks_loser} slokken
                  </div>
                )}
                {opdracht.time_limit_seconds && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
                    ⏱ Max {Math.floor(opdracht.time_limit_seconds / 60)}:{String(opdracht.time_limit_seconds % 60).padStart(2, '0')}
                  </div>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', color: 'var(--text2)' }}>
                ⏳ Opdracht laden...
              </div>
            )}

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
