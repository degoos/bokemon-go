import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import VuilbakGame from '../components/hq/VuilbakGame'
import SpinnerGame from '../components/hq/SpinnerGame'
import BoulderGame from '../components/hq/BoulderGame'

// ─────────────────────────────────────────────────────────────
// HQScreen — container voor het Team Rocket hoofdkwartier
//
// Drie kamers, sequentieel ontgrendeld per team:
//   1. Vuilbak-zoektocht  (Ingang)
//   2. Spinner Tiles      (Beveiligingszaal)
//   3. Strength Boulders  (Kluis)
//
// Patroon (stale-prop): eigen LIVE hq_progress state via supabase
// realtime sub. Bij voltooiing: insert hq_progress rij + grant loot
// via team_inventory upsert + notificatie naar team.
// ─────────────────────────────────────────────────────────────

const ITEM_INFO = {
  moon_stone:  { emoji: '🌙', name: 'Moon Stone' },
  silph_scope: { emoji: '🔭', name: 'Silph Scope' },
  protect:     { emoji: '🛡️', name: 'Protect' },
  double_team: { emoji: '🎭', name: 'Double Team' },
  snatch:      { emoji: '🧲', name: 'Snatch' },
  mirror_coat: { emoji: '🪞', name: 'Mirror Coat' },
  pickup:      { emoji: '🎲', name: 'Pickup' },
  poke_lure:   { emoji: '🎣', name: 'Poké Lure' },
  pokemon_egg: { emoji: '🥚', name: 'Pokémon Egg' },
  master_ball: { emoji: '🏆', name: 'Master Ball' },
}

// Loot per kamer — later configureerbaar via admin, hardcoded voor nu
const ROOM_LOOT = {
  1: [
    { key: 'protect',     qty: 2 },
    { key: 'double_team', qty: 1 },
    { key: 'mirror_coat', qty: 1 },
  ],
  2: [
    { key: 'silph_scope', qty: 1 },
    { key: 'snatch',      qty: 1 },
  ],
  3: [
    { key: 'pokemon_egg', qty: 1 },
    { key: 'master_ball', qty: 1 }, // 1× per spel — uniciteits-check bij grant
  ],
}

const ROOM_META = {
  1: {
    title: 'Kamer 1 — De Ingang',
    subtitle: 'Vuilbak-zoektocht',
    emoji: '🗑️',
    story: 'Voor je ligt een rij vuilbakken. Ergens zitten twee verborgen schakelaars. De tweede zit altijd náást de eerste...',
    color: '#fca5a5',
  },
  2: {
    title: 'Kamer 2 — Beveiligingszaal',
    subtitle: 'Spinner Tiles',
    emoji: '🌀',
    story: 'De vloer is bezaaid met Team Rocket spinners. Eén misstap en je wordt door het lokaal gelanceerd...',
    color: '#c4b5fd',
  },
  3: {
    title: 'Kamer 3 — De Kluis',
    subtitle: 'Strength Boulders',
    emoji: '🗿',
    story: 'Zware blokken blokkeren de kluis. Duw ze op de drukplaten om de toegang vrij te maken.',
    color: '#86efac',
  },
}

export default function HQScreen({ sessionId, team, player, onClose }) {
  const [liveProgress, setLiveProgress] = useState([])
  const [activeRoom, setActiveRoom] = useState(null)        // 1 | 2 | 3 | null (overview)
  const [completingRoom, setCompletingRoom] = useState(null) // { roomNumber, granted }
  const processingRef = useRef(false)

  // ── Live progress ophalen + realtime sub ─────────────────
  useEffect(() => {
    if (!sessionId || !team?.id) return
    async function load() {
      const { data } = await supabase.from('hq_progress')
        .select('*')
        .eq('game_session_id', sessionId)
        .eq('team_id', team.id)
      if (data) setLiveProgress(data)
    }
    load()
    const ch = supabase.channel(`hq-live-${sessionId}-${team.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hq_progress',
        filter: `game_session_id=eq.${sessionId}` }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sessionId, team?.id])

  const completedRooms = new Set(liveProgress.filter(r => r.completed_at).map(r => r.room_number))
  const isComplete = (n) => completedRooms.has(n)
  const isLocked = (n) => n > 1 && !isComplete(n - 1)
  const allDone = isComplete(1) && isComplete(2) && isComplete(3)

  // ── Loot uitkeren + hq_progress rij schrijven ─────────────
  async function grantRoomLoot(roomNumber) {
    if (processingRef.current) return []
    processingRef.current = true
    const loot = ROOM_LOOT[roomNumber] || []
    const granted = []

    try {
      for (const item of loot) {
        // Master Ball uniciteit: slechts 1 per spel wereldwijd
        if (item.key === 'master_ball') {
          const { data: existing } = await supabase.from('team_inventory')
            .select('id').eq('game_session_id', sessionId)
            .eq('item_key', 'master_ball').limit(1)
          const { data: usedEffects } = await supabase.from('active_effects')
            .select('id').eq('game_session_id', sessionId)
            .eq('item_key', 'master_ball').limit(1)
          if ((existing?.length || 0) > 0 || (usedEffects?.length || 0) > 0) {
            continue // Al iemand heeft 'm (of gebruikt 'm) — sla over
          }
        }

        // Upsert in team_inventory
        const { data: invRow } = await supabase.from('team_inventory')
          .select('*').eq('game_session_id', sessionId)
          .eq('team_id', team.id).eq('item_key', item.key).maybeSingle()
        if (invRow) {
          await supabase.from('team_inventory').update({
            quantity: (invRow.quantity || 0) + item.qty,
            updated_at: new Date().toISOString(),
          }).eq('id', invRow.id)
        } else {
          await supabase.from('team_inventory').insert({
            game_session_id: sessionId,
            team_id: team.id,
            item_key: item.key,
            quantity: item.qty,
          })
        }
        granted.push({ key: item.key, qty: item.qty })
      }

      // Schrijf hq_progress rij (UNIQUE op team+room → voorkomt dubbele loot)
      await supabase.from('hq_progress').insert({
        game_session_id: sessionId,
        team_id: team.id,
        room_number: roomNumber,
        loot_granted: granted,
      })

      // Notificatie naar mijn team
      const itemsList = granted.map(g => `${ITEM_INFO[g.key]?.emoji || '🎁'} ${ITEM_INFO[g.key]?.name || g.key}${g.qty > 1 ? ` ×${g.qty}` : ''}`).join(', ')
      await supabase.from('notifications').insert({
        game_session_id: sessionId,
        title: `🚪 Kamer ${roomNumber} veroverd!`,
        message: granted.length > 0
          ? `Buit: ${itemsList}`
          : 'Helaas... deze kamer was al geplunderd.',
        type: 'success', emoji: '🏴‍☠️',
        target_team_id: team.id,
      })
    } finally {
      processingRef.current = false
    }

    return granted
  }

  async function handleRoomComplete(roomNumber) {
    // Idempotentie: als we deze kamer al eerder voltooiden, gewoon terug
    if (isComplete(roomNumber)) {
      setActiveRoom(null)
      return
    }
    const granted = await grantRoomLoot(roomNumber)
    setCompletingRoom({ roomNumber, granted })
  }

  function closeCompletion() {
    setCompletingRoom(null)
    setActiveRoom(null)
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: mini-game (als actief) — anders overview + modal
  // ─────────────────────────────────────────────────────────
  if (activeRoom === 1 && !completingRoom) {
    return <VuilbakGame onComplete={() => handleRoomComplete(1)} onAbort={() => setActiveRoom(null)} />
  }
  if (activeRoom === 2 && !completingRoom) {
    return <SpinnerGame onComplete={() => handleRoomComplete(2)} onAbort={() => setActiveRoom(null)} />
  }
  if (activeRoom === 3 && !completingRoom) {
    return <BoulderGame onComplete={() => handleRoomComplete(3)} onAbort={() => setActiveRoom(null)} />
  }

  return (
    <div className="screen">
      <div className="topbar" style={{ background: '#2d0f1a', borderBottom: '1px solid #7f1d1d' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fca5a5', fontSize: 22 }}>✕</button>
        <h3 style={{ color: '#fca5a5' }}>🏚️ Team Rocket HQ</h3>
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>
          {team?.emoji} {team?.name}
        </div>
      </div>

      <div className="scroll-area">
        {/* Storyline intro */}
        <div style={{
          background: 'linear-gradient(135deg, #1a0f0f, #2d0f1a)',
          border: '1px solid #7f1d1d', borderRadius: 14, padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fca5a5', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🏴‍☠️</span> De geheime basis
          </div>
          <div style={{ fontSize: 13, color: '#fecaca', lineHeight: 1.5 }}>
            Team Rocket is gevlucht maar de <strong>beveiligingssystemen</strong> staan nog aan. Achter deze deuren
            liggen items — één kamer per keer te veroveren. Ontgrendel ze op volgorde.
          </div>
        </div>

        {/* Voortgang-samenvatting */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, padding: '8px 12px',
          background: '#1a1a2e', border: '1px solid var(--border)', borderRadius: 10,
          fontSize: 12, color: 'var(--text2)', alignItems: 'center',
        }}>
          <span>📊</span>
          <span style={{ fontWeight: 700 }}>{completedRooms.size}/3 kamers veroverd</span>
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
            {[1,2,3].map(n => isComplete(n) ? '🟢' : isLocked(n) ? '🔒' : '🟡').join(' ')}
          </span>
        </div>

        {/* Kamer-kaarten */}
        {[1, 2, 3].map(n => {
          const meta = ROOM_META[n]
          const completed = isComplete(n)
          const locked = isLocked(n)
          const loot = ROOM_LOOT[n]

          return (
            <div key={n} className="card" style={{
              borderLeft: completed ? '4px solid var(--success)'
                        : locked    ? '4px solid var(--border)'
                                    : '4px solid #fbbf24',
              opacity: locked ? 0.55 : 1,
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 36, filter: locked ? 'grayscale(1)' : 'none' }}>{meta.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: completed ? 'var(--success)' : meta.color }}>
                    {meta.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{meta.subtitle}</div>
                </div>
                {completed && <div style={{ fontSize: 22 }}>✅</div>}
                {locked && <div style={{ fontSize: 22 }}>🔒</div>}
              </div>

              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10, fontStyle: 'italic', lineHeight: 1.5 }}>
                {meta.story}
              </div>

              <div style={{
                fontSize: 12, color: 'var(--text)', marginBottom: 12,
                background: '#0f0f1e', padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)',
              }}>
                <span style={{ color: 'var(--text2)' }}>🎁 Loot:</span>{' '}
                {loot.map((l, i) => (
                  <span key={l.key}>
                    {i > 0 ? ' · ' : ' '}
                    {ITEM_INFO[l.key]?.emoji} {ITEM_INFO[l.key]?.name}{l.qty > 1 ? ` ×${l.qty}` : ''}
                  </span>
                ))}
              </div>

              {completed ? (
                <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 700, textAlign: 'center', padding: '6px 0' }}>
                  ✅ Veroverd — loot ontvangen
                </div>
              ) : locked ? (
                <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '6px 0' }}>
                  🔒 Voltooi eerst kamer {n - 1}
                </div>
              ) : (
                <button
                  className="btn btn-warning btn-sm"
                  onClick={() => setActiveRoom(n)}
                  style={{ width: '100%' }}
                >
                  🚪 Binnengaan
                </button>
              )}
            </div>
          )
        })}

        {/* All done-banner */}
        {allDone && (
          <div style={{
            margin: '20px 0', padding: 20, textAlign: 'center',
            background: 'linear-gradient(135deg, #14532d, #1a4a3a)',
            border: '1px solid #22c55e', borderRadius: 14,
          }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🏆</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#86efac', marginBottom: 4 }}>
              Het HQ is leeggeroofd!
            </div>
            <div style={{ fontSize: 13, color: '#4ade80' }}>
              Jullie hebben alle drie de kamers veroverd.
            </div>
          </div>
        )}
      </div>

      {/* Loot-reveal modal — na voltooiing van een kamer */}
      {completingRoom && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: '#1e1e3a', border: '2px solid #fbbf24', borderRadius: 20,
            padding: 24, maxWidth: 360, width: '100%', textAlign: 'center',
            boxShadow: '0 0 40px rgba(251, 191, 36, 0.4)',
          }}>
            <div style={{ fontSize: 60, marginBottom: 12, animation: 'bokePulse 1s ease-in-out infinite' }}>
              🎁
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24', marginBottom: 6 }}>
              Kamer {completingRoom.roomNumber} veroverd!
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
              Team Rocket heeft deze items achtergelaten:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {completingRoom.granted.length === 0 ? (
                <div style={{
                  fontSize: 13, color: 'var(--text2)', fontStyle: 'italic',
                  padding: 14, background: '#2a2a4a', borderRadius: 10,
                }}>
                  😔 Helaas... deze kamer was al leeggeroofd.
                </div>
              ) : (
                completingRoom.granted.map((g, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                    background: '#2a2a4a', borderRadius: 10,
                    animation: `slideDown 0.3s ease-out ${i * 0.15}s both`,
                  }}>
                    <div style={{ fontSize: 32 }}>{ITEM_INFO[g.key]?.emoji || '🎁'}</div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{ITEM_INFO[g.key]?.name || g.key}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>Toegevoegd aan teaminventaris</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24' }}>×{g.qty}</div>
                  </div>
                ))
              )}
            </div>
            <button className="btn btn-warning" onClick={closeCompletion} style={{ width: '100%' }}>
              {allDone || completingRoom.roomNumber === 3 ? '🏆 Naar kaart' : 'Terug naar HQ'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
