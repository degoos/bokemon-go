import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const RPS_CHOICES = [
  { key: 'steen', emoji: '✊' },
  { key: 'schaar', emoji: '✌️' },
  { key: 'papier', emoji: '🖐️' },
]
const BEATS = { steen: 'schaar', schaar: 'papier', papier: 'steen' }

export default function StealFlow({ challenge, player, team, catches, onClose }) {
  const [myChoice, setMyChoice] = useState(null)
  const [rounds, setRounds] = useState([])
  const [myScore, setMyScore] = useState(0)
  const [theirScore, setTheirScore] = useState(0)
  const [phase, setPhase] = useState('choose') // choose → reveal → pokemon → done
  const [winner, setWinner] = useState(null)
  const [selectedPokemon, setSelectedPokemon] = useState(null)
  const [enemyCatches, setEnemyCatches] = useState([])

  const isAttacker = challenge?.attacker_team_id === team?.id

  useEffect(() => {
    // Laad vijandelijke Bokémon (voor stelen)
    if (challenge) {
      const enemyTeamId = isAttacker ? challenge.defender_team_id : challenge.attacker_team_id
      const enemy = (catches || []).filter(c => c.team_id === enemyTeamId && !c.shield_active)
      setEnemyCatches(enemy)
    }
  }, [challenge, catches, isAttacker])

  // Realtime updates van challenge
  useEffect(() => {
    if (!challenge?.id) return
    const ch = supabase.channel(`steal-${challenge.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'steal_challenges',
        filter: `id=eq.${challenge.id}`,
      }, (p) => {
        if (p.new.status === 'finished') {
          setWinner(p.new.winner_team_id)
          setPhase(p.new.winner_team_id === team?.id ? 'pokemon' : 'done')
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [challenge?.id, team?.id])

  async function submitChoice(choice) {
    setMyChoice(choice)
    // Sla keuze op in rounds JSON
    const round = { round: (rounds.length || 0) + 1, [isAttacker ? 'attacker' : 'defender']: choice }
    const newRounds = [...rounds, round]
    setRounds(newRounds)

    // Voor de demo: bot-keuze als tegenstander
    const botChoice = RPS_CHOICES[Math.floor(Math.random() * 3)].key
    const theirKey = botChoice

    // Bepaal winnaar van de ronde
    let roundWinner = 'draw'
    if (choice === theirKey) roundWinner = 'draw'
    else if (BEATS[choice] === theirKey) roundWinner = 'me'
    else roundWinner = 'them'

    const newMyScore = myScore + (roundWinner === 'me' ? 1 : 0)
    const newTheirScore = theirScore + (roundWinner === 'them' ? 1 : 0)
    setMyScore(newMyScore)
    setTheirScore(newTheirScore)

    // Best of 3
    if (newMyScore >= 2 || newTheirScore >= 2) {
      const iWon = newMyScore >= 2
      const winnerTeamId = iWon ? team.id : (isAttacker ? challenge.defender_team_id : challenge.attacker_team_id)
      await supabase.from('steal_challenges').update({
        status: 'finished',
        winner_team_id: winnerTeamId,
        rounds: newRounds,
        attacker_wins: isAttacker ? newMyScore : newTheirScore,
        defender_wins: isAttacker ? newTheirScore : newMyScore,
        finished_at: new Date().toISOString(),
      }).eq('id', challenge.id)

      setWinner(winnerTeamId)
      setPhase(iWon && isAttacker ? 'pokemon' : 'done')
    } else {
      setPhase('reveal')
      setTimeout(() => { setMyChoice(null); setPhase('choose') }, 1800)
    }
  }

  async function stealPokemon(catchId) {
    const catchItem = enemyCatches.find(c => c.id === catchId)
    if (!catchItem) return

    // Verplaats Bokémon naar winnend team
    await supabase.from('catches').update({
      team_id: team.id,
      stolen_from_team_id: catchItem.team_id,
    }).eq('id', catchId)

    await supabase.from('steal_challenges').update({
      stolen_catch_id: catchId,
    }).eq('id', challenge.id)

    await supabase.from('notifications').insert({
      game_session_id: challenge.game_session_id,
      title: `🧲 ${team.name} heeft een Bokémon gestolen!`,
      message: `${catchItem.pokemon_definitions?.name || 'een Bokémon'} is van team gewisseld.`,
      type: 'danger',
      emoji: '🧲',
    })

    setSelectedPokemon(catchId)
    setPhase('done')
  }

  const roundColor = (score, max) => score >= max ? 'var(--warning)' : 'var(--text2)'

  return (
    <div className="catch-screen">
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3>⚔️ Steal Battle</h3>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{myScore} – {theirScore}</div>
      </div>

      {/* Score indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 16px' }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: i < myScore ? 'var(--success)' : 'var(--border)',
          }} />
        ))}
        <span style={{ color: 'var(--text2)', margin: '0 8px', fontSize: 13 }}>vs</span>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: i < theirScore ? 'var(--danger)' : 'var(--border)',
          }} />
        ))}
      </div>

      <div className="scroll-area" style={{ paddingTop: 0 }}>
        {phase === 'choose' && (
          <div>
            <p style={{ textAlign: 'center', color: 'var(--text2)', padding: '16px 0 8px', fontSize: 15 }}>
              Kies steen, schaar of papier
            </p>
            <div className="rps-grid">
              {RPS_CHOICES.map(c => (
                <button key={c.key} className="rps-btn" onClick={() => submitChoice(c.key)}>
                  {c.emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'reveal' && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 64 }}>{myChoice ? RPS_CHOICES.find(c => c.key === myChoice)?.emoji : '⏳'}</div>
            <p style={{ color: 'var(--text2)', marginTop: 16 }}>Ronde voorbij...</p>
          </div>
        )}

        {phase === 'pokemon' && (
          <div>
            <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
              <h2 style={{ color: 'var(--success)' }}>Gewonnen!</h2>
              <p style={{ color: 'var(--text2)', marginTop: 8 }}>Kies een Bokémon om te stelen</p>
            </div>
            {enemyCatches.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: 'var(--text2)' }}>
                Tegenstander heeft geen Bokémon om te stelen.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {enemyCatches.map(c => (
                  <button
                    key={c.id}
                    className="card"
                    style={{ textAlign: 'left', cursor: 'pointer', border: '2px solid var(--border)' }}
                    onClick={() => stealPokemon(c.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 32 }}>{c.pokemon_definitions?.sprite_emoji || '❓'}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.pokemon_definitions?.name}</div>
                        <div style={{ color: 'var(--warning)', fontSize: 14, fontWeight: 700 }}>{c.cp} CP</div>
                        {c.is_shiny && <div style={{ color: 'gold', fontSize: 12 }}>✨ Shiny</div>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            {winner === team?.id ? (
              <>
                <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
                <h2 style={{ color: 'var(--success)' }}>
                  {selectedPokemon ? 'Bokémon gestolen!' : 'Gewonnen!'}
                </h2>
              </>
            ) : (
              <>
                <div style={{ fontSize: 64, marginBottom: 12 }}>😤</div>
                <h2 style={{ color: 'var(--danger)' }}>Verloren!</h2>
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
