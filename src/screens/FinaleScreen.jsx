import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ────────────────────────────────────────────────────────────
// Constanten
// ────────────────────────────────────────────────────────────
const ATTACK_TYPES = {
  gewoon: {
    label: 'Gewone aanval',
    emoji: '⚔️',
    damage: 25,
    desc: '25 schade aan tegenstander',
    color: '#f59e0b',
  },
  speciaal: {
    label: 'Speciale aanval',
    emoji: '💥',
    damage: 40,
    desc: '40 schade — jij drinkt 1 slok',
    color: '#f97316',
  },
  verdediging: {
    label: 'Verdediging',
    emoji: '🛡️',
    damage: 0,
    desc: 'Halveer inkomende schade deze ronde',
    color: '#3b82f6',
  },
  bliksem: {
    label: 'Bliksemstoot',
    emoji: '⚡',
    damage: 30,
    desc: '30 schade aan ALLE tegenstanders tegelijk',
    color: '#eab308',
    special: true,
    label_special: 'Alleen Pikachu / Raichu',
  },
  psykracht: {
    label: 'Psykracht',
    emoji: '🔮',
    damage: 0,
    desc: 'Kaats sterkste inkomende aanval × 1.5 terug',
    color: '#a855f7',
    special: true,
    label_special: 'Alleen Mewtwo',
  },
}

const BASE_HP = { regular: 100, pikachu: 125, rocket: 150 }
const PICK_SECONDS = 20

// ────────────────────────────────────────────────────────────
// Schade-berekening (pure functie)
// ────────────────────────────────────────────────────────────
function computeRound(picks, currentHp) {
  const newHp = { ...currentHp }
  const events = []

  const defenders = new Set(picks.filter(p => p.attack_type === 'verdediging').map(p => p.picker_id))
  const psykrachtPick = picks.find(p => p.attack_type === 'psykracht')
  const bliksemPick = picks.find(p => p.attack_type === 'bliksem')
  let regularAttacks = picks.filter(p => ['gewoon', 'speciaal'].includes(p.attack_type))

  // Bliksem: raakt alle tegenstanders
  if (bliksemPick) {
    const targets = Object.keys(currentHp).filter(id => id !== bliksemPick.picker_id && (currentHp[id] ?? 0) > 0)
    targets.forEach(target => {
      const dmg = defenders.has(target) ? Math.round(30 * 0.5) : 30
      newHp[target] = Math.max(0, (newHp[target] ?? 0) - dmg)
      events.push({ type: 'bliksem', from: bliksemPick.picker_id, to: target, damage: dmg })
    })
  }

  // Psykracht: kaats sterkste inkomende aanval terug
  if (psykrachtPick) {
    const attacksOnRocket = regularAttacks.filter(p => p.target_id === 'rocket')
    if (attacksOnRocket.length > 0) {
      const strongest = attacksOnRocket.reduce((best, p) =>
        ATTACK_TYPES[p.attack_type].damage > ATTACK_TYPES[best.attack_type].damage ? p : best
      )
      const reflectedDmg = Math.round(ATTACK_TYPES[strongest.attack_type].damage * 1.5)
      const finalDmg = defenders.has(strongest.picker_id) ? Math.round(reflectedDmg * 0.5) : reflectedDmg
      newHp[strongest.picker_id] = Math.max(0, (newHp[strongest.picker_id] ?? 0) - finalDmg)
      events.push({ type: 'psykracht', from: 'rocket', to: strongest.picker_id, damage: finalDmg, reflected: true })
      // Verwijder gereflecteerde aanvallen
      regularAttacks = regularAttacks.filter(p => p.target_id !== 'rocket')
    } else {
      // Geen aanval op Rocket → Psykracht valt terug op gewone aanval (random target)
      const targets = Object.keys(currentHp).filter(id => id !== 'rocket' && (currentHp[id] ?? 0) > 0)
      if (targets.length > 0) {
        const target = targets[Math.floor(Math.random() * targets.length)]
        const dmg = defenders.has(target) ? 12 : 25
        newHp[target] = Math.max(0, (newHp[target] ?? 0) - dmg)
        events.push({ type: 'psykracht_fallback', from: 'rocket', to: target, damage: dmg })
      }
    }
  }

  // Reguliere aanvallen
  regularAttacks.forEach(p => {
    if (!p.target_id) return
    const base = ATTACK_TYPES[p.attack_type]?.damage ?? 25
    const finalDmg = defenders.has(p.target_id) ? Math.round(base * 0.5) : base
    newHp[p.target_id] = Math.max(0, (newHp[p.target_id] ?? 0) - finalDmg)
    events.push({
      type: p.attack_type,
      from: p.picker_id,
      to: p.target_id,
      damage: finalDmg,
      extraDrink: p.attack_type === 'speciaal',
    })
  })

  return { newHp, events }
}

// ────────────────────────────────────────────────────────────
// Hulpfuncties voor namen/kleuren
// ────────────────────────────────────────────────────────────
function teamName(id, teams) {
  if (id === 'rocket') return 'Team Rocket'
  return teams.find(t => t.id === id)?.name || '?'
}
function teamEmoji(id, teams) {
  if (id === 'rocket') return '🚀'
  return teams.find(t => t.id === id)?.emoji || '❓'
}
function teamColor(id, teams) {
  if (id === 'rocket') return '#dc2626'
  return teams.find(t => t.id === id)?.color || '#64748b'
}

// ────────────────────────────────────────────────────────────
// HP Bar
// ────────────────────────────────────────────────────────────
function HPBar({ label, emoji, pokemon, hp, maxHp, color, eliminated, compact }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0
  const barColor = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{
      background: eliminated ? '#0f172a' : '#1e293b',
      border: `2px solid ${eliminated ? '#374151' : color}`,
      borderRadius: 12,
      padding: compact ? 10 : 14,
      flex: 1,
      opacity: eliminated ? 0.45 : 1,
      position: 'relative',
      transition: 'opacity 0.4s',
    }}>
      {eliminated && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: 10, background: '#00000077', fontSize: 32,
        }}>💀</div>
      )}
      <div style={{ fontWeight: 900, fontSize: 11, color, marginBottom: 2, letterSpacing: 0.5 }}>
        {emoji} {label}
      </div>
      <div style={{ fontWeight: 800, fontSize: compact ? 12 : 14, color: '#e2e8f0', marginBottom: 6 }}>
        {pokemon}
      </div>
      <div style={{ background: '#0f172a', borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: barColor,
          transition: 'width 1s ease', borderRadius: 6,
          boxShadow: pct > 0 ? `0 0 6px ${barColor}88` : 'none',
        }} />
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
        {hp} / {maxHp} HP
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Event-beschrijving
// ────────────────────────────────────────────────────────────
function EventLine({ event, teams }) {
  const fromName = teamName(event.from, teams)
  const toName = teamName(event.to, teams)
  const fromColor = teamColor(event.from, teams)
  const toColor = teamColor(event.to, teams)

  const typeEmoji = ATTACK_TYPES[event.type]?.emoji || '💫'

  let desc = ''
  if (event.type === 'bliksem') desc = `⚡ Bliksemstoot naar ${toName}: ${event.damage} schade`
  else if (event.type === 'psykracht') desc = `🔮 Psykracht kaatst terug naar ${toName}: ${event.damage} schade`
  else if (event.type === 'psykracht_fallback') desc = `🔮 Psykracht → gewone aanval op ${toName}: ${event.damage} schade`
  else if (event.type === 'gewoon') desc = `${typeEmoji} ${fromName} → ${toName}: ${event.damage} schade`
  else if (event.type === 'speciaal') desc = `${typeEmoji} ${fromName} → ${toName}: ${event.damage} schade`

  return (
    <div style={{
      padding: '10px 12px',
      background: '#1e293b',
      borderRadius: 8,
      borderLeft: `3px solid ${fromColor}`,
      fontSize: 13,
      color: '#e2e8f0',
    }}>
      {desc}
      {event.extraDrink && (
        <div style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>
          🍺 <strong style={{ color: fromColor }}>{fromName}</strong> drinkt 1 slok (speciale aanval)
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Hoofdcomponent: FinaleScreen
// ────────────────────────────────────────────────────────────
export default function FinaleScreen({ session, sessionId, teams, catches, player, team, isAdmin, onClose }) {
  const [state, setState] = useState(null)
  const [picks, setPicks] = useState([])
  const [myPick, setMyPick] = useState(null)
  const [selectedAttack, setSelectedAttack] = useState(null)
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [rocketAttack, setRocketAttack] = useState(null)
  const [rocketTarget, setRocketTarget] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(PICK_SECONDS)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  // Zoek welk team Pikachu/Raichu heeft gevangen
  const pikachuCatch = catches?.find(c => {
    const nm = (c.pokemon_definitions?.name || '').toLowerCase()
    return nm === 'pikachu' || nm === 'raichu'
  })
  const pikachuTeamId = pikachuCatch?.team_id || null

  // ── Data laden + realtime ─────────────────────────────────
  useEffect(() => {
    loadAll()
    const ch = supabase.channel(`finale_${sessionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'finale_state',
        filter: `game_session_id=eq.${sessionId}`,
      }, payload => {
        if (payload.new) {
          setState(payload.new)
          if (['pick', 'final_pick'].includes(payload.new.phase)) {
            setMyPick(null)
            setSelectedAttack(null)
            setSelectedTarget(null)
            setRocketAttack(null)
            setRocketTarget(null)
            setSecondsLeft(PICK_SECONDS)
          }
          loadPicks(payload.new.round)
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'finale_picks',
        filter: `game_session_id=eq.${sessionId}`,
      }, payload => {
        if (payload.eventType === 'DELETE') {
          setPicks(prev => prev.filter(p => p.id !== payload.old.id))
        } else if (payload.new) {
          setPicks(prev => {
            const filtered = prev.filter(p => p.id !== payload.new.id)
            return [...filtered, payload.new]
          })
        }
      })
      .subscribe()
    return () => ch.unsubscribe()
  }, [sessionId])

  // ── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!state) return
    if (['pick', 'final_pick'].includes(state.phase)) {
      setSecondsLeft(PICK_SECONDS)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) { clearInterval(timerRef.current); return 0 }
          return s - 1
        })
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [state?.phase, state?.round])

  async function loadAll() {
    setLoading(true)
    const { data: st } = await supabase.from('finale_state')
      .select('*').eq('game_session_id', sessionId).single()
    setState(st)
    if (st) await loadPicks(st.round)
    setLoading(false)
  }

  async function loadPicks(round) {
    const r = round || 1
    const { data } = await supabase.from('finale_picks')
      .select('*').eq('game_session_id', sessionId).eq('round', r)
    setPicks(data || [])
  }

  // ── Admin: start finale ───────────────────────────────────
  async function startFinale() {
    const hp = {}
    const maxHp = {}
    teams.forEach(t => {
      const val = pikachuTeamId === t.id ? BASE_HP.pikachu : BASE_HP.regular
      hp[t.id] = val
      maxHp[t.id] = val
    })
    hp['rocket'] = BASE_HP.rocket
    maxHp['rocket'] = BASE_HP.rocket

    await supabase.from('finale_state').upsert({
      game_session_id: sessionId,
      phase: 'pick',
      round: 1,
      hp,
      max_hp: maxHp,
      pikachu_team_id: pikachuTeamId,
      eliminated_team_id: null,
      winner_team_id: null,
      round_result: {},
    }, { onConflict: 'game_session_id' })
  }

  // ── Admin: fase-wissel ────────────────────────────────────
  async function setPhase(phase, extra = {}) {
    await supabase.from('finale_state')
      .update({ phase, ...extra })
      .eq('game_session_id', sessionId)
  }

  // ── Admin: schade berekenen en resultaat opslaan ──────────
  async function resolveRound() {
    if (!state) return
    const currentPicks = picks.filter(p => p.round === state.round)
    const { newHp, events } = computeRound(currentPicks, state.hp)

    // Wie is er uitgeschakeld?
    const eliminated = Object.entries(newHp)
      .filter(([, h]) => h <= 0)
      .map(([id]) => id)

    const eliminatedPlayerTeam = eliminated.find(id => id !== 'rocket') ?? null
    const rocketEliminated = eliminated.includes('rocket')

    const updates = {
      phase: 'result',
      hp: newHp,
      round_result: { events, eliminated },
    }

    if (eliminatedPlayerTeam) updates.eliminated_team_id = eliminatedPlayerTeam

    await supabase.from('finale_state')
      .update(updates)
      .eq('game_session_id', sessionId)
  }

  // ── Admin: naar 1v1 finale gaan ───────────────────────────
  async function goToFinalRound() {
    if (!state) return
    // Reset HP naar 60% van max
    const newHp = {}
    Object.entries(state.max_hp).forEach(([id, max]) => {
      // Alleen levende teams
      if ((state.hp[id] ?? 0) > 0) {
        newHp[id] = Math.round(max * 0.6)
      }
    })
    await supabase.from('finale_state').update({
      phase: 'final_pick',
      round: (state.round || 1) + 1,
      hp: newHp,
      round_result: {},
    }).eq('game_session_id', sessionId)
  }

  // ── Admin: volgende ronde ─────────────────────────────────
  async function nextRound() {
    await supabase.from('finale_state').update({
      phase: 'pick',
      round: (state?.round || 1) + 1,
      round_result: {},
    }).eq('game_session_id', sessionId)
  }

  // ── Admin: winnaar bepalen ────────────────────────────────
  async function resolveFinale() {
    if (!state) return
    const currentPicks = picks.filter(p => p.round === state.round)
    const { newHp, events } = computeRound(currentPicks, state.hp)

    // Wie heeft nog HP?
    const alive = Object.entries(newHp).filter(([, h]) => h > 0).map(([id]) => id)
    const winnerId = alive.length === 1 ? alive[0] : null

    await supabase.from('finale_state').update({
      phase: winnerId ? 'winner' : 'final_result',
      hp: newHp,
      winner_team_id: winnerId,
      round_result: { events },
    }).eq('game_session_id', sessionId)
  }

  // ── Speler: pick indienen ─────────────────────────────────
  async function submitPick() {
    if (!selectedAttack) return
    const needsTarget = !['bliksem', 'psykracht', 'verdediging'].includes(selectedAttack)
    if (needsTarget && !selectedTarget) return
    if (!team) return
    setSubmitting(true)
    await supabase.from('finale_picks').upsert({
      game_session_id: sessionId,
      round: state?.round || 1,
      picker_id: team.id,
      attack_type: selectedAttack,
      target_id: needsTarget ? selectedTarget : null,
    }, { onConflict: 'game_session_id,round,picker_id' })
    setMyPick({ attack_type: selectedAttack, target_id: selectedTarget })
    setSubmitting(false)
  }

  // ── Admin: Rocket-pick indienen ───────────────────────────
  async function submitRocketPick() {
    if (!rocketAttack) return
    const needsTarget = !['bliksem', 'psykracht', 'verdediging'].includes(rocketAttack)
    if (needsTarget && !rocketTarget) return
    await supabase.from('finale_picks').upsert({
      game_session_id: sessionId,
      round: state?.round || 1,
      picker_id: 'rocket',
      attack_type: rocketAttack,
      target_id: needsTarget ? rocketTarget : null,
    }, { onConflict: 'game_session_id,round,picker_id' })
    setRocketAttack(null)
    setRocketTarget(null)
  }

  // ── Helpers voor render ───────────────────────────────────
  function getHp(id) { return state?.hp?.[id] ?? 0 }
  function getMaxHp(id) { return state?.max_hp?.[id] ?? BASE_HP.regular }
  function isEliminated(id) { return (state?.eliminated_team_id === id) || (state?.winner_team_id && state?.hp?.[id] === 0) }
  function hasPicked(id) { return picks.some(p => p.round === state?.round && p.picker_id === id) }

  const currentPhase = state?.phase || 'intro'
  const roundResult = state?.round_result || {}

  // Welke attacks zijn beschikbaar voor de ingelogde trainer?
  function availableAttacks(forRocket = false) {
    const hasPikachu = pikachuTeamId && (forRocket ? false : team?.id === pikachuTeamId)
    return Object.entries(ATTACK_TYPES).filter(([key]) => {
      if (key === 'bliksem') return hasPikachu
      if (key === 'psykracht') return forRocket
      return true
    })
  }

  // ── HP overzicht bovenaan scherm ──────────────────────────
  function renderHPBars(compact = false) {
    const rocketElim = state?.hp?.['rocket'] === 0
    return (
      <div style={{ display: 'flex', gap: 8, padding: compact ? '8px 12px' : '12px 16px' }}>
        {teams.map(t => (
          <HPBar
            key={t.id}
            label={t.name}
            emoji={t.emoji}
            pokemon={
              pikachuTeamId === t.id
                ? (catches?.find(c => c.team_id === t.id && ['pikachu','raichu'].includes(c.pokemon_definitions?.name?.toLowerCase()))?.pokemon_definitions?.evolution_chain?.[
                    catches?.find(c => c.team_id === t.id && ['pikachu','raichu'].includes(c.pokemon_definitions?.name?.toLowerCase()))?.evolution_stage
                  ] || 'Pikachu ⚡')
                : (catches?.filter(c => c.team_id === t.id).sort((a, b) => b.cp - a.cp)[0]?.pokemon_definitions?.evolution_chain?.[
                    catches?.filter(c => c.team_id === t.id).sort((a, b) => b.cp - a.cp)[0]?.evolution_stage
                  ] || '?')
            }
            hp={getHp(t.id)}
            maxHp={getMaxHp(t.id)}
            color={t.color}
            eliminated={isEliminated(t.id)}
            compact={compact}
          />
        ))}
        <HPBar
          label="Team Rocket"
          emoji="🚀"
          pokemon="👑 Mewtwo"
          hp={getHp('rocket')}
          maxHp={getMaxHp('rocket')}
          color="#dc2626"
          eliminated={rocketElim}
          compact={compact}
        />
      </div>
    )
  }

  // ── Aanval-selectie UI ────────────────────────────────────
  function renderPickUI(forRocket = false) {
    const currentPickerId = forRocket ? 'rocket' : team?.id
    const alreadyPicked = currentPickerId ? hasPicked(currentPickerId) : false
    const attacks = availableAttacks(forRocket)
    const selAttack = forRocket ? rocketAttack : selectedAttack
    const selTarget = forRocket ? rocketTarget : selectedTarget
    const setAttack = forRocket ? setRocketAttack : setSelectedAttack
    const setTarget = forRocket ? setRocketTarget : setSelectedTarget
    const needsTarget = selAttack && !['bliksem', 'psykracht', 'verdediging'].includes(selAttack)

    // Beschikbare doelwitten (levende tegenstanders)
    const possibleTargets = [
      ...teams.filter(t => !isEliminated(t.id) && t.id !== (forRocket ? null : team?.id)).map(t => ({
        id: t.id, label: `${t.emoji} ${t.name}`, color: t.color,
      })),
      ...(forRocket ? [] : [{ id: 'rocket', label: '🚀 Team Rocket', color: '#dc2626' }]),
    ]

    if (alreadyPicked && !forRocket) {
      return (
        <div style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#4ade80', marginBottom: 8 }}>
            Aanval gekozen!
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Wachten op anderen…
          </div>
          <div style={{ marginTop: 16, padding: '10px 16px', background: '#1e293b', borderRadius: 10 }}>
            <span style={{ fontSize: 20 }}>{ATTACK_TYPES[myPick?.attack_type]?.emoji} </span>
            <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{ATTACK_TYPES[myPick?.attack_type]?.label}</span>
          </div>
        </div>
      )
    }

    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Timer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#1e293b', borderRadius: 10, padding: '10px 16px',
        }}>
          <div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 14 }}>
            ⏱️ Kies je aanval
          </div>
          <div style={{
            fontWeight: 900, fontSize: 20,
            color: secondsLeft <= 5 ? '#ef4444' : '#fbbf24',
          }}>
            {secondsLeft}s
          </div>
        </div>

        {/* Attack-knoppen */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attacks.map(([key, atk]) => (
            <button
              key={key}
              onClick={() => { setAttack(key); if (key !== selAttack) setTarget(null) }}
              style={{
                background: selAttack === key ? atk.color + '33' : '#1e293b',
                border: `2px solid ${selAttack === key ? atk.color : '#334155'}`,
                borderRadius: 12,
                padding: '12px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15, color: selAttack === key ? atk.color : '#e2e8f0' }}>
                {atk.emoji} {atk.label}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                {atk.desc}
              </div>
              {atk.special && (
                <div style={{ fontSize: 11, color: atk.color, marginTop: 2, fontStyle: 'italic' }}>
                  {atk.label_special}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Target-selectie */}
        {needsTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#818cf8' }}>🎯 Kies doelwit:</div>
            {possibleTargets.map(t => (
              <button
                key={t.id}
                onClick={() => setTarget(t.id)}
                style={{
                  background: selTarget === t.id ? t.color + '33' : '#1e293b',
                  border: `2px solid ${selTarget === t.id ? t.color : '#334155'}`,
                  borderRadius: 10,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontWeight: 800,
                  color: selTarget === t.id ? t.color : '#e2e8f0',
                  fontSize: 14,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Bevestig-knop */}
        <button
          onClick={forRocket ? submitRocketPick : submitPick}
          disabled={submitting || !selAttack || (needsTarget && !selTarget)}
          style={{
            background: (!selAttack || (needsTarget && !selTarget)) ? '#334155' : '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '16px 20px',
            fontSize: 16,
            fontWeight: 900,
            cursor: (!selAttack || (needsTarget && !selTarget)) ? 'not-allowed' : 'pointer',
            marginTop: 4,
          }}
        >
          {submitting ? 'Bevestigen…' : '⚔️ Aanval bevestigen!'}
        </button>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // RENDER: INTRO
  // ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={overlay}>
        <div style={{ color: '#fff', fontSize: 18, textAlign: 'center', marginTop: 100 }}>
          Laden…
        </div>
      </div>
    )
  }

  if (!state || state.phase === 'intro') {
    return (
      <div style={{ ...overlay, background: 'linear-gradient(180deg, #0c0015, #1a0a2e)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>👑</div>
          <div style={{ fontWeight: 900, fontSize: 28, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>
            LEGENDAIRE FINALE
          </div>
          <div style={{ fontSize: 16, color: '#a78bfa', marginBottom: 32, lineHeight: 1.6 }}>
            3 deelnemers strijden om de ultieme titel.<br />
            Mewtwo wacht. Enkel de sterkste surviveert.
          </div>

          {/* Deelnemers preview */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 32, width: '100%' }}>
            {teams.map(t => (
              <div key={t.id} style={{
                flex: 1, background: t.color + '22', border: `2px solid ${t.color}`,
                borderRadius: 12, padding: 14, textAlign: 'center',
              }}>
                <div style={{ fontSize: 24 }}>{t.emoji}</div>
                <div style={{ fontWeight: 800, color: t.color, fontSize: 13, marginTop: 4 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {pikachuTeamId === t.id ? '⚡ Pikachu' : `${BASE_HP.regular} HP`}
                </div>
                <div style={{ fontWeight: 900, color: '#fbbf24', fontSize: 13, marginTop: 2 }}>
                  {pikachuTeamId === t.id ? `${BASE_HP.pikachu} HP` : `${BASE_HP.regular} HP`}
                </div>
              </div>
            ))}
            <div style={{
              flex: 1, background: '#dc262622', border: '2px solid #dc2626',
              borderRadius: 12, padding: 14, textAlign: 'center',
            }}>
              <div style={{ fontSize: 24 }}>🚀</div>
              <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 13, marginTop: 4 }}>Team Rocket</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>🔮 Mewtwo</div>
              <div style={{ fontWeight: 900, color: '#fbbf24', fontSize: 13, marginTop: 2 }}>{BASE_HP.rocket} HP</div>
            </div>
          </div>

          {/* Aanvals-legenda */}
          <div style={{ background: '#1e1e3a', borderRadius: 12, padding: 14, width: '100%', marginBottom: 24 }}>
            <div style={{ fontWeight: 800, color: '#818cf8', marginBottom: 10, fontSize: 13 }}>⚔️ Aanvalstypes</div>
            {Object.values(ATTACK_TYPES).map(atk => (
              <div key={atk.label} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, display: 'flex', gap: 6 }}>
                <span>{atk.emoji}</span>
                <span><strong style={{ color: '#c7d2fe' }}>{atk.label}:</strong> {atk.desc}</span>
              </div>
            ))}
          </div>

          {isAdmin && (
            <button onClick={startFinale} style={{
              background: 'linear-gradient(135deg, #7c3aed, #dc2626)',
              color: '#fff', border: 'none', borderRadius: 14,
              padding: '18px 32px', fontSize: 18, fontWeight: 900, cursor: 'pointer',
              width: '100%', boxShadow: '0 0 30px rgba(124,58,237,0.5)',
            }}>
              ⚔️ Start de Legendaire Finale!
            </button>
          )}
          {!isAdmin && (
            <div style={{ color: '#64748b', fontSize: 14 }}>
              Wacht op Team Rocket om de finale te starten…
            </div>
          )}
        </div>
        <div style={{ padding: 16 }}>
          <button onClick={onClose} style={ghostBtnStyle}>← Terug</button>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // RENDER: WINNER
  // ────────────────────────────────────────────────────────────
  if (currentPhase === 'winner') {
    const winnerId = state.winner_team_id
    const winnerIsRocket = winnerId === 'rocket'
    const winnerTeam = teams.find(t => t.id === winnerId)
    const wName = winnerIsRocket ? 'Team Rocket' : winnerTeam?.name || '?'
    const wColor = winnerIsRocket ? '#dc2626' : (winnerTeam?.color || '#64748b')
    const wEmoji = winnerIsRocket ? '🚀' : (winnerTeam?.emoji || '❓')

    return (
      <div style={{ ...overlay, background: 'linear-gradient(180deg, #0c0015, #1a0a2e)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 80, marginBottom: 16 }}>🏆</div>
          <div style={{ fontWeight: 900, fontSize: 32, color: '#fbbf24', letterSpacing: 2, marginBottom: 8 }}>
            WINNAAR!
          </div>
          <div style={{
            background: wColor + '33', border: `3px solid ${wColor}`,
            borderRadius: 20, padding: '24px 40px', marginTop: 16,
          }}>
            <div style={{ fontSize: 48 }}>{wEmoji}</div>
            <div style={{ fontWeight: 900, fontSize: 28, color: wColor, marginTop: 8 }}>{wName}</div>
            {winnerIsRocket && (
              <div style={{ fontSize: 16, color: '#dc2626', marginTop: 8 }}>
                "Ha! Jullie waren nooit een match voor Mewtwo!"
              </div>
            )}
            {!winnerIsRocket && (
              <div style={{ fontSize: 16, color: '#4ade80', marginTop: 8 }}>
                Jullie hebben Mewtwo verslagen! 🎉
              </div>
            )}
          </div>

          <div style={{ marginTop: 32, padding: 16, background: '#1e293b', borderRadius: 12, width: '100%' }}>
            {teams.map(t => {
              const isWinner = t.id === winnerId
              return (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #334155' }}>
                  <div style={{ fontWeight: 700, color: t.color }}>{t.emoji} {t.name}</div>
                  <div style={{ fontWeight: 900, color: isWinner ? '#fbbf24' : '#dc2626' }}>
                    {isWinner ? '🥇 Winnaar' : '💀 Uitgeschakeld'}
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <div style={{ fontWeight: 700, color: '#dc2626' }}>🚀 Team Rocket</div>
              <div style={{ fontWeight: 900, color: state.winner_team_id === 'rocket' ? '#fbbf24' : '#dc2626' }}>
                {state.winner_team_id === 'rocket' ? '🥇 Winnaar' : '💀 Verslagen'}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <button onClick={onClose} style={ghostBtnStyle}>← Terug naar overzicht</button>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // RENDER: ELIMINATED (tussenscherm)
  // ────────────────────────────────────────────────────────────
  if (currentPhase === 'eliminated') {
    const elim = teams.find(t => t.id === state.eliminated_team_id)
    return (
      <div style={{ ...overlay, background: '#0f172a' }}>
        <div style={{ padding: 16 }}>
          {renderHPBars(true)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>💀</div>
          <div style={{ fontWeight: 900, fontSize: 24, color: '#ef4444', marginBottom: 8 }}>
            {elim?.emoji} {elim?.name} is uitgeschakeld!
          </div>
          <div style={{ fontSize: 16, color: '#94a3b8', marginBottom: 32, lineHeight: 1.6 }}>
            {elim?.name} drinkt een <strong style={{ color: '#f59e0b' }}>vol glas</strong>!
          </div>
          <div style={{
            background: '#1e293b', borderRadius: 12, padding: 16,
            width: '100%', marginBottom: 32,
          }}>
            <div style={{ fontWeight: 800, color: '#818cf8', marginBottom: 10 }}>⚔️ Nu: 1v1 FINALE</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
              De 2 overlevers strijden verder.<br />
              HP wordt gereset naar <strong style={{ color: '#fbbf24' }}>60%</strong> voor de finale!
            </div>
          </div>
          {isAdmin && (
            <button onClick={goToFinalRound} style={primaryBtnStyle}>
              ⚔️ Start 1v1 Finale!
            </button>
          )}
          {!isAdmin && (
            <div style={{ color: '#64748b', fontSize: 13 }}>
              Wacht op Team Rocket…
            </div>
          )}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // RENDER: RESULT (schade overzicht)
  // ────────────────────────────────────────────────────────────
  if (currentPhase === 'result' || currentPhase === 'final_result') {
    const events = roundResult.events || []
    const eliminated = roundResult.eliminated || []
    const hasEliminated = eliminated.length > 0
    const isFinalRound = currentPhase === 'final_result'

    return (
      <div style={{ ...overlay, background: '#0f172a' }}>
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#818cf8', marginBottom: 8 }}>
            Ronde {state.round} — Resultaat
          </div>
          {renderHPBars(true)}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map((ev, i) => (
            <EventLine key={i} event={ev} teams={teams} />
          ))}
          {events.length === 0 && (
            <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Geen aanvallen deze ronde.</div>
          )}
        </div>
        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hasEliminated && !isFinalRound && (
              <button onClick={() => setPhase('eliminated')} style={primaryBtnStyle}>
                💀 Eliminatie-scherm →
              </button>
            )}
            {!hasEliminated && !isFinalRound && (
              <button onClick={nextRound} style={primaryBtnStyle}>
                ▶ Volgende ronde
              </button>
            )}
            {isFinalRound && state.winner_team_id && (
              <button onClick={() => setPhase('winner')} style={primaryBtnStyle}>
                🏆 Toon winnaar!
              </button>
            )}
            {isFinalRound && !state.winner_team_id && (
              <button onClick={nextRound} style={primaryBtnStyle}>
                ▶ Volgende ronde
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // RENDER: REVEAL
  // ────────────────────────────────────────────────────────────
  if (currentPhase === 'reveal' || currentPhase === 'final_reveal') {
    const isFinal = currentPhase === 'final_reveal'
    const roundPicks = picks.filter(p => p.round === state.round)

    return (
      <div style={{ ...overlay, background: '#0f172a' }}>
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#818cf8', marginBottom: 8 }}>
            Ronde {state.round} — Aanvallen onthuld!
          </div>
          {renderHPBars(true)}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {roundPicks.map(p => {
            const atk = ATTACK_TYPES[p.attack_type]
            const fromColor = teamColor(p.picker_id, teams)
            const fromName = teamName(p.picker_id, teams)
            const toName = p.target_id ? teamName(p.target_id, teams) : null
            return (
              <div key={p.id} style={{
                background: '#1e293b',
                borderLeft: `4px solid ${fromColor}`,
                borderRadius: 10,
                padding: '12px 16px',
                animation: 'slideIn 0.3s ease',
              }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: fromColor, marginBottom: 6 }}>
                  {teamEmoji(p.picker_id, teams)} {fromName}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: atk?.color }}>
                  {atk?.emoji} {atk?.label}
                </div>
                {toName && (
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                    → gericht op <strong style={{ color: teamColor(p.target_id, teams) }}>
                      {teamEmoji(p.target_id, teams)} {toName}
                    </strong>
                  </div>
                )}
              </div>
            )
          })}
          {roundPicks.length === 0 && (
            <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
              Niemand heeft een aanval gekozen.
            </div>
          )}
        </div>
        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
            <button
              onClick={isFinal ? resolveFinale : resolveRound}
              style={primaryBtnStyle}
            >
              💥 Bereken schade!
            </button>
          </div>
        )}
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // RENDER: PICK (3-way of 1v1)
  // ────────────────────────────────────────────────────────────
  const isFinalPick = currentPhase === 'final_pick'
  const roundPicks = picks.filter(p => p.round === state?.round)
  const pickedCount = roundPicks.length
  const totalPickers = teams.length + 1 // teams + rocket
  const playerIsEliminated = team && isEliminated(team.id)

  return (
    <div style={{ ...overlay, background: '#0f172a' }}>
      {/* HP bars */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ padding: '12px 16px 4px', fontWeight: 800, fontSize: 14, color: '#818cf8' }}>
          {isFinalPick ? '⚔️ 1v1 FINALE' : `Ronde ${state?.round || 1}`}
          {isFinalPick && <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}> — HP gereset naar 60%</span>}
        </div>
        {renderHPBars(true)}
      </div>

      {/* Pick-voortgang */}
      <div style={{ padding: '8px 16px', flexShrink: 0 }}>
        <div style={{
          background: '#1e293b', borderRadius: 8, padding: '8px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {pickedCount}/{totalPickers} aanvallen gekozen
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[...teams, { id: 'rocket' }].map(p => (
              <div key={p.id} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: hasPicked(p.id) ? '#4ade80' : '#374151',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Admin: Rocket-pick sectie */}
        {isAdmin && (
          <div style={{ padding: '0 16px 8px' }}>
            <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 13, marginBottom: 8 }}>
              🚀 Kies aanval voor Mewtwo:
            </div>
            <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: 12 }}>
              {hasPicked('rocket') ? (
                <div style={{ color: '#4ade80', fontWeight: 700, textAlign: 'center' }}>
                  ✅ Mewtwo-aanval gekozen
                </div>
              ) : (
                renderPickUI(true)
              )}
            </div>
          </div>
        )}

        {/* Player: eigen pick */}
        {!isAdmin && !playerIsEliminated && (
          <div style={{ padding: '0 16px 16px' }}>
            {renderPickUI(false)}
          </div>
        )}

        {playerIsEliminated && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💀</div>
            <div style={{ color: '#ef4444', fontWeight: 800, fontSize: 16 }}>
              Jouw team is uitgeschakeld
            </div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
              Je kijkt toe…
            </div>
          </div>
        )}
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ padding: 16, borderTop: '1px solid #1e293b', flexShrink: 0 }}>
          <button
            onClick={() => setPhase(isFinalPick ? 'final_reveal' : 'reveal')}
            style={primaryBtnStyle}
          >
            👁️ Onthul aanvallen!
          </button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Stijlen
// ────────────────────────────────────────────────────────────
const overlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 9000,
  display: 'flex',
  flexDirection: 'column',
  background: '#0f172a',
  overflowY: 'hidden',
}

const primaryBtnStyle = {
  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  padding: '16px 20px',
  fontSize: 16,
  fontWeight: 900,
  cursor: 'pointer',
  width: '100%',
  boxShadow: '0 0 20px rgba(79,70,229,0.3)',
}

const ghostBtnStyle = {
  background: 'transparent',
  color: '#818cf8',
  border: '1px solid #334155',
  borderRadius: 10,
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%',
}
