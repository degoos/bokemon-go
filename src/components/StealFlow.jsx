import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function StealFlow({ challenge, player, team, catches, onClose }) {
  const [phase, setPhase] = useState('rps') // rps | won_pick | done
  const [enemyCatches, setEnemyCatches] = useState([])
  const [result, setResult] = useState(null) // 'won' | 'lost'

  const isAttacker = challenge?.attacker_team_id === team?.id

  useEffect(() => {
    if (challenge) {
      const enemyTeamId = isAttacker ? challenge.defender_team_id : challenge.attacker_team_id
      setEnemyCatches((catches || []).filter(c => c.team_id === enemyTeamId && !c.shield_active))
    }
  }, [challenge, catches, isAttacker])

  async function handleResult(won) {
    setResult(won ? 'won' : 'lost')
    const winnerTeamId = won ? team.id : (isAttacker ? challenge.defender_team_id : challenge.attacker_team_id)
    await supabase.from('steal_challenges').update({
      status: 'finished',
      winner_team_id: winnerTeamId,
      finished_at: new Date().toISOString(),
    }).eq('id', challenge.id)

    if (won && isAttacker) {
      setPhase('won_pick')
    } else {
      setPhase('done')
    }
  }

  async function stealPokemon(catchItem) {
    await supabase.from('catches').update({
      team_id: team.id,
      stolen_from_team_id: catchItem.team_id,
    }).eq('id', catchItem.id)

    await supabase.from('steal_challenges').update({ stolen_catch_id: catchItem.id }).eq('id', challenge.id)

    await supabase.from('notifications').insert({
      game_session_id: challenge.game_session_id,
      title: `🧲 ${team.name} heeft een Bokémon gestolen!`,
      message: `${catchItem.pokemon_definitions?.name || 'Een Bokémon'} is meegenomen.`,
      type: 'danger', emoji: '🧲',
    })
    setPhase('done')
  }

  return (
    <div className="catch-screen">
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3>⚔️ Steal Battle</h3>
        <div />
      </div>

      <div className="scroll-area">

        {/* Stap 1: fysiek RPS uitvoeren */}
        {phase === 'rps' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 72, marginBottom: 20 }}>✊✌️🖐️</div>
            <h2 style={{ marginBottom: 12 }}>Steen Schaar Papier</h2>
            <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: 32, fontSize: 15 }}>
              Speel <strong style={{ color: 'var(--text)' }}>best-of-3</strong> fysiek met de aangetikte persoon.<br />
              Geef daarna het resultaat in:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px' }}>
              <button className="btn btn-success" onClick={() => handleResult(true)}>
                🏆 Wij hebben gewonnen
              </button>
              <button className="btn btn-danger" onClick={() => handleResult(false)}>
                😤 Wij hebben verloren
              </button>
            </div>
          </div>
        )}

        {/* Stap 2: Bokémon kiezen om te stelen */}
        {phase === 'won_pick' && (
          <div>
            <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
              <h2 style={{ color: 'var(--success)', marginBottom: 6 }}>Gewonnen!</h2>
              <p style={{ color: 'var(--text2)', fontSize: 14 }}>Kies een Bokémon om te stelen</p>
            </div>
            {enemyCatches.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🌱</div>
                Tegenstander heeft geen Bokémon om te stelen.
                <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => setPhase('done')}>OK</button>
              </div>
            ) : (
              enemyCatches.map(c => (
                <button key={c.id} className="card"
                  style={{ textAlign: 'left', cursor: 'pointer', width: '100%', marginBottom: 10, border: '2px solid var(--border)' }}
                  onClick={() => stealPokemon(c)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 36, filter: c.is_shiny ? 'drop-shadow(0 0 6px gold)' : 'none' }}>
                      {c.pokemon_definitions?.sprite_emoji || '❓'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{c.pokemon_definitions?.name}</div>
                      <div style={{ color: 'var(--warning)', fontWeight: 700 }}>{c.cp} CP</div>
                      {c.is_shiny && <div style={{ color: 'gold', fontSize: 12 }}>✨ Shiny</div>}
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 22 }}>→</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Klaar */}
        {phase === 'done' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            {result === 'won' ? (
              <>
                <div style={{ fontSize: 72, marginBottom: 12 }}>🎉</div>
                <h2 style={{ color: 'var(--success)', marginBottom: 8 }}>Gestolen!</h2>
                <p style={{ color: 'var(--text2)' }}>De Bokémon is nu van jullie.</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 72, marginBottom: 12 }}>😤</div>
                <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Verloren!</h2>
                <p style={{ color: 'var(--text2)' }}>Jullie Bokémon zijn veilig... voor nu.</p>
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
