import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function StealFlow({ challenge, player, team, catches, onClose }) {
  const [phase, setPhase] = useState('rps') // rps | won_pick | done
  const [enemyCatches, setEnemyCatches] = useState([])
  const [result, setResult] = useState(null) // 'won' | 'lost'
  const [mirrorEffect, setMirrorEffect] = useState(null) // active_effects rij voor Mirror Coat
  const [mirrorTriggered, setMirrorTriggered] = useState(false)

  const isAttacker = challenge?.attacker_team_id === team?.id

  useEffect(() => {
    if (challenge) {
      const enemyTeamId = isAttacker ? challenge.defender_team_id : challenge.attacker_team_id
      setEnemyCatches((catches || []).filter(c => c.team_id === enemyTeamId && !c.shield_active))
    }
  }, [challenge, catches, isAttacker])

  // Check of Mirror Coat ready staat — alleen bij start van het scherm
  useEffect(() => {
    if (!team?.id || !challenge?.game_session_id) return
    supabase.from('active_effects')
      .select('*').eq('game_session_id', challenge.game_session_id)
      .eq('team_id', team.id).eq('item_key', 'mirror_coat').eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => setMirrorEffect(data))
  }, [team?.id, challenge?.game_session_id])

  async function handleResult(won) {
    let effectiveWon = won
    let mirrorWasUsed = false

    // Mirror Coat: bij verlies + ready → automatisch omdraaien
    if (!won && mirrorEffect && !mirrorTriggered) {
      mirrorWasUsed = true
      effectiveWon = true
      setMirrorTriggered(true)
      // 1. Active effect deactiveren
      await supabase.from('active_effects').update({ is_active: false }).eq('id', mirrorEffect.id)
      // 2. Item-quantity aftrekken
      const { data: invRow } = await supabase.from('team_inventory')
        .select('*').eq('game_session_id', challenge.game_session_id)
        .eq('team_id', team.id).eq('item_key', 'mirror_coat').maybeSingle()
      if (invRow) {
        const newQty = Math.max(0, (invRow.quantity || 0) - 1)
        if (newQty === 0) await supabase.from('team_inventory').delete().eq('id', invRow.id)
        else await supabase.from('team_inventory').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', invRow.id)
      }
      // 3. Markering op challenge zetten zodat resultaat correct is
      await supabase.from('steal_challenges').update({ mirror_used: true }).eq('id', challenge.id)
    }

    setResult(effectiveWon ? 'won' : 'lost')
    const winnerTeamId = effectiveWon ? team.id : (isAttacker ? challenge.defender_team_id : challenge.attacker_team_id)
    await supabase.from('steal_challenges').update({
      status: 'finished',
      winner_team_id: winnerTeamId,
      finished_at: new Date().toISOString(),
    }).eq('id', challenge.id)

    if (mirrorWasUsed) {
      // Notificatie naar tegenstander
      const enemyTeamId = isAttacker ? challenge.defender_team_id : challenge.attacker_team_id
      await supabase.from('notifications').insert({
        game_session_id: challenge.game_session_id,
        title: '🪞 Mirror Coat!',
        message: 'De tegenstander draaide jullie verlies om met Mirror Coat.',
        type: 'warning', emoji: '🪞',
        target_team_id: enemyTeamId,
      })
    }

    if (effectiveWon && isAttacker) {
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
            <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: 16, fontSize: 15 }}>
              Speel <strong style={{ color: 'var(--text)' }}>best-of-3</strong> fysiek met de aangetikte persoon.<br />
              Geef daarna het resultaat in:
            </p>
            {mirrorEffect && (
              <div style={{
                background: 'rgba(168,85,247,0.18)', border: '1px solid #c084fc',
                borderRadius: 10, padding: '8px 12px', marginBottom: 20, fontSize: 13, color: '#c084fc',
              }}>
                🪞 <strong>Mirror Coat ready</strong> — bij verlies wordt het automatisch omgedraaid
              </div>
            )}
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
                      <div style={{ color: 'var(--warning)', fontWeight: 700 }}>{c.cp} XP</div>
                      {c.is_shiny && <div style={{ color: 'gold', fontSize: 12 }}>✨ Blinkend</div>}
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
