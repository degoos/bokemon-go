import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { TOURNAMENT_GYMS, XP_CATEGORIES, TYPE_ADVANTAGES, POKEMON_TYPES } from '../lib/constants'

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function getTypeAdvantageInfo(typeA, typeB) {
  // Returns { aBeatsB, bBeatsA }
  const advA = TYPE_ADVANTAGES[typeA] || { strong: [], weak: [] }
  const aBeatsB = advA.strong.includes(typeB)
  const bBeatsA = (TYPE_ADVANTAGES[typeB]?.strong || []).includes(typeA)
  return { aBeatsB, bBeatsA }
}

function calcEffectiveXP(cp, myType, enemyType) {
  const { aBeatsB } = getTypeAdvantageInfo(myType, enemyType)
  return aBeatsB ? Math.round(cp * 1.25) : cp
}

function getXPCat(xpDiff) {
  for (const c of XP_CATEGORIES) {
    if (xpDiff >= c.minDiff && xpDiff <= c.maxDiff) return c.cat
  }
  return 0
}

function xpLabel(diff) {
  if (diff === 0) return 'Gelijkspel (geen voordeel)'
  const cat = getXPCat(Math.abs(diff))
  const who = diff > 0 ? 'Jouw team' : 'Tegenstander'
  return `${who} — Cat ${cat} voordeel (${Math.abs(diff)} XP)`
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function RPGTextBox({ lines, leider, emoji }) {
  const [page, setPage] = useState(0)
  const hasNext = page < lines.length - 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      <div style={{
        background: '#1e293b', border: '2px solid #6366f1', borderRadius: 12,
        padding: 16, minHeight: 100,
      }}>
        <div style={{ fontWeight: 900, fontSize: 13, color: '#818cf8', marginBottom: 8 }}>
          {emoji} {leider}:
        </div>
        <div style={{ fontSize: 15, color: '#e2e8f0', lineHeight: 1.6 }}>
          "{lines[page]}"
        </div>
      </div>

      {/* Pagina-dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {lines.map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i === page ? '#6366f1' : '#334155',
          }} />
        ))}
      </div>

      {hasNext ? (
        <button
          onClick={() => setPage(p => p + 1)}
          style={{
            background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 10,
            padding: '14px 20px', fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}
        >
          Volgende ▶
        </button>
      ) : null}
    </div>
  )
}

function LevelBadge({ index }) {
  const colors = ['#f59e0b', '#3b82f6', '#ef4444']
  const labels = ['Niveau 1', 'Niveau 2', 'Niveau 3']
  return (
    <span style={{
      background: colors[index], color: '#fff', borderRadius: 99,
      fontSize: 11, fontWeight: 800, padding: '2px 8px',
    }}>{labels[index]}</span>
  )
}

// ────────────────────────────────────────────────────────────
// TournamentScreen
// ────────────────────────────────────────────────────────────
export default function TournamentScreen({
  session, sessionId, teams, players, catches,
  player, team, isAdmin, onClose, onStartFinale,
}) {
  const [state, setState] = useState(null)           // tournament_state rij
  const [matchups, setMatchups] = useState([])       // tournament_matchups
  const [results, setResults] = useState([])         // tournament_results
  const [loading, setLoading] = useState(true)
  const [savingSlot, setSavingSlot] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [activeGymView, setActiveGymView] = useState('rules') // 'rules' | 'draft' | 'reveal' | 'duels' voor tab

  const gym = TOURNAMENT_GYMS[state?.current_gym ?? 0]
  const gymPhase = state?.gym_phase ?? 'intro'
  const currentGymIdx = state?.current_gym ?? 0

  // ── Data ophalen ─────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!sessionId) return
    const [stateRes, matchupsRes, resultsRes] = await Promise.all([
      supabase.from('tournament_state').select('*').eq('game_session_id', sessionId).maybeSingle(),
      supabase.from('tournament_matchups').select('*').eq('game_session_id', sessionId),
      supabase.from('tournament_results').select('*').eq('game_session_id', sessionId),
    ])
    setState(stateRes.data)
    setMatchups(matchupsRes.data || [])
    setResults(resultsRes.data || [])
    setLoading(false)
  }, [sessionId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Realtime ─────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    const ch = supabase.channel(`tournament-${sessionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournament_state',
        filter: `game_session_id=eq.${sessionId}`,
      }, (p) => {
        if (p.new) setState(p.new)
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournament_matchups',
        filter: `game_session_id=eq.${sessionId}`,
      }, (p) => {
        setMatchups(prev => {
          if (p.eventType === 'INSERT') return [...prev, p.new]
          if (p.eventType === 'UPDATE') return prev.map(r => r.id === p.new.id ? p.new : r)
          if (p.eventType === 'DELETE') return prev.filter(r => r.id !== p.old.id)
          return prev
        })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournament_results',
        filter: `game_session_id=eq.${sessionId}`,
      }, (p) => {
        if (p.eventType === 'INSERT') setResults(prev => [...prev, p.new])
        if (p.eventType === 'UPDATE') setResults(prev => prev.map(r => r.id === p.new.id ? p.new : r))
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [sessionId])

  // ── Hulpfuncties state ────────────────────────────────────
  async function upsertState(updates) {
    if (!sessionId) return
    if (state?.id) {
      await supabase.from('tournament_state').update(updates).eq('id', state.id)
    } else {
      await supabase.from('tournament_state').insert({ game_session_id: sessionId, ...updates })
    }
  }

  async function advancePhase(nextPhase, extraUpdates = {}) {
    setAdvancing(true)
    await upsertState({ gym_phase: nextPhase, ...extraUpdates })
    setAdvancing(false)
  }

  async function advanceGym() {
    const next = currentGymIdx + 1
    setAdvancing(true)
    if (next >= TOURNAMENT_GYMS.length) {
      await upsertState({ gym_phase: 'finished' })
    } else {
      await upsertState({ current_gym: next, gym_phase: 'intro' })
    }
    setAdvancing(false)
  }

  // ── Draft helpers ─────────────────────────────────────────
  function myMatchupsForGym(gymIdx, teamId) {
    return matchups.filter(m => m.gym_index === gymIdx && m.team_id === teamId)
  }

  function allTeamsConfirmedDraft(gymIdx) {
    return teams.every(t => {
      const tMatchups = myMatchupsForGym(gymIdx, t.id)
      const confirmed = tMatchups.find(m => m.confirmed)
      return !!confirmed
    })
  }

  // Welke catches al gebruikt door dit team in deze gym
  function usedCatchIds(gymIdx, teamId, excludeLevel) {
    return matchups
      .filter(m => m.gym_index === gymIdx && m.team_id === teamId && m.level_index !== excludeLevel)
      .map(m => m.catch_id)
      .filter(Boolean)
  }

  // Welke player_ids al gebruikt
  function usedPlayerIds(gymIdx, teamId, excludeLevel) {
    return matchups
      .filter(m => m.gym_index === gymIdx && m.team_id === teamId && m.level_index !== excludeLevel)
      .map(m => m.player_id)
      .filter(Boolean)
  }

  async function saveDraftSlot(gymIdx, teamId, levelIdx, updates) {
    setSavingSlot(`${gymIdx}-${teamId}-${levelIdx}`)
    const existing = matchups.find(
      m => m.game_session_id === sessionId && m.gym_index === gymIdx &&
           m.level_index === levelIdx && m.team_id === teamId
    )
    if (existing) {
      await supabase.from('tournament_matchups')
        .update({ ...updates, confirmed: false })
        .eq('id', existing.id)
    } else {
      await supabase.from('tournament_matchups').insert({
        game_session_id: sessionId,
        gym_index: gymIdx,
        level_index: levelIdx,
        team_id: teamId,
        confirmed: false,
        ...updates,
      })
    }
    setSavingSlot(null)
  }

  async function confirmDraft(gymIdx, teamId) {
    setConfirming(true)
    // Zet confirmed=true op alle slots voor dit team in deze gym
    const toConfirm = matchups.filter(m => m.gym_index === gymIdx && m.team_id === teamId)
    await Promise.all(toConfirm.map(m =>
      supabase.from('tournament_matchups').update({ confirmed: true }).eq('id', m.id)
    ))
    setConfirming(false)
  }

  async function saveResult(gymIdx, levelIdx, winnerTeamId) {
    const existing = results.find(r => r.gym_index === gymIdx && r.level_index === levelIdx)
    if (existing) {
      await supabase.from('tournament_results')
        .update({ winner_team_id: winnerTeamId })
        .eq('id', existing.id)
    } else {
      await supabase.from('tournament_results').insert({
        game_session_id: sessionId,
        gym_index: gymIdx,
        level_index: levelIdx,
        winner_team_id: winnerTeamId,
      })
    }
  }

  // ── CP & type berekening ──────────────────────────────────
  function getDuelAnalysis(gymIdx, levelIdx) {
    if (teams.length < 2) return null
    const [teamA, teamB] = teams
    const mA = matchups.find(m => m.gym_index === gymIdx && m.level_index === levelIdx && m.team_id === teamA.id)
    const mB = matchups.find(m => m.gym_index === gymIdx && m.level_index === levelIdx && m.team_id === teamB.id)
    if (!mA || !mB) return null

    const catchA = catches.find(c => c.id === mA.catch_id)
    const catchB = catches.find(c => c.id === mB.catch_id)
    const playerA = players.find(p => p.id === mA.player_id)
    const playerB = players.find(p => p.id === mB.player_id)
    if (!catchA || !catchB) return null

    const typeA = catchA.pokemon_definitions?.type || 'normal'
    const typeB = catchB.pokemon_definitions?.type || 'normal'
    const { aBeatsB, bBeatsA } = getTypeAdvantageInfo(typeA, typeB)

    const effA = calcEffectiveXP(catchA.cp, typeA, typeB)
    const effB = calcEffectiveXP(catchB.cp, typeB, typeA)
    const xpDiff = effA - effB
    const xpCat = getXPCat(Math.abs(xpDiff))

    return {
      teamA, teamB, playerA, playerB, catchA, catchB,
      typeA, typeB, aBeatsB, bBeatsA,
      effA, effB, xpDiff, xpCat,
      advantageTeam: xpDiff > 0 ? teamA : xpDiff < 0 ? teamB : null,
      typeWinner: aBeatsB ? teamA : bBeatsA ? teamB : null,
    }
  }

  // ── Gym-scorebord ─────────────────────────────────────────
  function gymScore(gymIdx) {
    const score = {}
    teams.forEach(t => { score[t.id] = 0 })
    results.filter(r => r.gym_index === gymIdx).forEach(r => {
      score[r.winner_team_id] = (score[r.winner_team_id] || 0) + 1
    })
    return score
  }

  // Totaal scorebord (aantal gym-overwinningen)
  function totalScore() {
    const score = {}
    teams.forEach(t => { score[t.id] = 0 })
    TOURNAMENT_GYMS.forEach((_, gi) => {
      const s = gymScore(gi)
      // Winnaar is team met meeste duels
      const winner = teams.reduce((best, t) =>
        (s[t.id] || 0) > (s[best.id] || 0) ? t : best
      , teams[0])
      if (winner && (s[winner.id] || 0) > 0) score[winner.id]++
    })
    return score
  }

  // ────────────────────────────────────────────────────────
  // RENDERS per fase
  // ────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
      Laden…
    </div>
  )

  if (!state || gymPhase === 'intro') return renderIntro()
  if (gymPhase === 'draft') return renderDraft()
  if (gymPhase === 'reveal') return renderReveal()
  if (gymPhase === 'duels') return renderDuels()
  if (gymPhase === 'complete') return renderComplete()
  if (gymPhase === 'finished') return renderFinished()
  return renderIntro()

  // ── INTRO ────────────────────────────────────────────────
  function renderIntro() {
    const g = gym || TOURNAMENT_GYMS[0]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
        <Header onClose={onClose} title={g.naam} subtitle={g.leider} emoji={g.emoji} />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <RPGTextBox lines={g.intro} leider={g.leider} emoji={g.emoji} />

          {/* Gym-regels samenvatting */}
          <div style={{ padding: '0 16px 16px' }}>
            <GymRulesCard gym={g} />
          </div>
        </div>

        {/* Admin: start draft */}
        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
            <button
              onClick={() => advancePhase('draft')}
              disabled={advancing}
              style={primaryBtn}
            >
              {advancing ? 'Bezig…' : '📋 Start Draft →'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── DRAFT ────────────────────────────────────────────────
  function renderDraft() {
    const g = gym
    const myTeamMatchups = myMatchupsForGym(currentGymIdx, team?.id)
    const myConfirmed = myTeamMatchups.some(m => m.confirmed)
    const allConfirmed = allTeamsConfirmedDraft(currentGymIdx)

    // Team players
    const myPlayers = players.filter(p => p.team_id === team?.id)
    const myCatches = catches.filter(c => c.team_id === team?.id)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
        <Header onClose={onClose} title={g.naam} subtitle="Draft — kies jouw opstelling" emoji="📋" />

        {myConfirmed ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{
              background: '#14532d', border: '1px solid #22c55e', borderRadius: 12,
              padding: 16, textAlign: 'center', marginBottom: 20,
            }}>
              <div style={{ fontSize: 28 }}>✅</div>
              <div style={{ fontWeight: 800, color: '#86efac', marginTop: 6 }}>Opstelling bevestigd!</div>
              <div style={{ fontSize: 13, color: '#4ade80', marginTop: 4 }}>
                {allConfirmed ? 'Beide teams klaar — wacht op Team Rocket…' : 'Wacht op de andere ploeg…'}
              </div>
            </div>

            {/* Eigen bevestigde picks tonen */}
            {g.niveaus.map((_, li) => {
              const m = myTeamMatchups.find(m => m.level_index === li)
              const c = catches.find(x => x.id === m?.catch_id)
              const p = players.find(x => x.id === m?.player_id)
              return (
                <div key={li} style={slotCard}>
                  <LevelBadge index={li} />
                  <div style={{ marginTop: 8, fontSize: 13, color: '#94a3b8' }}>
                    🧑 {p?.name || '—'} &nbsp;·&nbsp; {c ? `${c.pokemon_definitions?.name || '?'} (${c.cp} XP)` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              Kies voor elk niveau een trainer en een Bokémon. Bespreek intern — de andere ploeg ziet niets.
            </p>
            {g.niveaus.map((niveau, li) => {
              const m = myTeamMatchups.find(m => m.level_index === li)
              const usedCatches = usedCatchIds(currentGymIdx, team?.id, li)
              const usedPlayers = usedPlayerIds(currentGymIdx, team?.id, li)

              return (
                <div key={li} style={slotCard}>
                  <LevelBadge index={li} />
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, marginBottom: 8 }}>
                    {niveau.label}
                  </div>

                  {/* Trainer kiezen */}
                  <label style={labelStyle}>🧑 Trainer</label>
                  <select
                    style={selectStyle}
                    value={m?.player_id || ''}
                    onChange={e => saveDraftSlot(currentGymIdx, team.id, li, { player_id: e.target.value || null })}
                    disabled={savingSlot === `${currentGymIdx}-${team?.id}-${li}`}
                  >
                    <option value="">— kies trainer —</option>
                    {myPlayers.map(p => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={usedPlayers.includes(p.id)}
                      >
                        {p.name} {usedPlayers.includes(p.id) ? '(al gekozen)' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Bokémon kiezen */}
                  <label style={labelStyle}>🐾 Bokémon</label>
                  <select
                    style={selectStyle}
                    value={m?.catch_id || ''}
                    onChange={e => saveDraftSlot(currentGymIdx, team.id, li, { catch_id: e.target.value || null })}
                    disabled={savingSlot === `${currentGymIdx}-${team?.id}-${li}`}
                  >
                    <option value="">— kies Bokémon —</option>
                    {myCatches.map(c => {
                      const pd = c.pokemon_definitions
                      const isUsed = usedCatches.includes(c.id)
                      const evoLabel = pd?.evolution_chain?.[c.evolution_stage] || pd?.name || '?'
                      return (
                        <option key={c.id} value={c.id} disabled={isUsed}>
                          {isUsed ? '✗ ' : ''}{evoLabel} ({c.cp} XP)
                          {c.is_shiny ? ' ✨' : ''} {isUsed ? '— al gekozen' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              )
            })}

            {/* Bevestig */}
            <button
              onClick={() => confirmDraft(currentGymIdx, team?.id)}
              disabled={
                confirming ||
                myTeamMatchups.length < g.niveaus.length ||
                myTeamMatchups.some(m => !m.player_id || !m.catch_id)
              }
              style={{
                ...primaryBtn,
                background: '#166534',
                marginTop: 8,
              }}
            >
              {confirming ? 'Bezig…' : '✅ Bevestig opstelling'}
            </button>
          </div>
        )}

        {/* Admin: advance to reveal zodra beide teams klaar zijn */}
        {isAdmin && allConfirmed && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
            <button
              onClick={() => advancePhase('reveal')}
              disabled={advancing}
              style={primaryBtn}
            >
              {advancing ? 'Bezig…' : '🎭 Onthulling →'}
            </button>
          </div>
        )}

        {/* Admin-override: gym-uitleg opnieuw */}
        {isAdmin && (
          <div style={{ padding: '0 16px 8px' }}>
            <button onClick={() => advancePhase('intro')} style={ghostBtn}>
              ← Gym-intro opnieuw
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── REVEAL ───────────────────────────────────────────────
  function renderReveal() {
    const g = gym
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
        <Header onClose={onClose} title={g.naam} subtitle="Simultane onthulling" emoji="🎭" />

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {g.niveaus.map((niveau, li) => {
            const analysis = getDuelAnalysis(currentGymIdx, li)
            return (
              <div key={li} style={{ ...slotCard, gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <LevelBadge index={li} />
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{niveau.label}</span>
                </div>

                {analysis ? (
                  <>
                    {/* Matchup */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <MatchupCard
                        teamColor={analysis.teamA.color}
                        teamName={analysis.teamA.name}
                        playerName={analysis.playerA?.name}
                        catchItem={analysis.catchA}
                        effXP={analysis.effA}
                        typeInfo={POKEMON_TYPES[analysis.typeA]}
                        hasTypeAdv={analysis.aBeatsB}
                      />
                      <div style={{ color: '#475569', fontWeight: 900, fontSize: 18 }}>VS</div>
                      <MatchupCard
                        teamColor={analysis.teamB.color}
                        teamName={analysis.teamB.name}
                        playerName={analysis.playerB?.name}
                        catchItem={analysis.catchB}
                        effXP={analysis.effB}
                        typeInfo={POKEMON_TYPES[analysis.typeB]}
                        hasTypeAdv={analysis.bBeatsA}
                      />
                    </div>

                    {/* XP analyse */}
                    <AnalysisBanner analysis={analysis} gym={g} />
                  </>
                ) : (
                  <div style={{ color: '#64748b', fontSize: 13 }}>Geen picks voor dit slot.</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Admin: start duels */}
        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
            <button
              onClick={() => advancePhase('duels')}
              disabled={advancing}
              style={primaryBtn}
            >
              {advancing ? 'Bezig…' : '⚔️ Start duels →'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── DUELS ────────────────────────────────────────────────
  function renderDuels() {
    const g = gym
    const gymResults = results.filter(r => r.gym_index === currentGymIdx)
    const allDone = gymResults.length >= g.niveaus.length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
        <Header onClose={onClose} title={g.naam} subtitle="Duels" emoji="⚔️" />

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Gym-uitleg knop */}
          <button
            onClick={() => advancePhase('intro')}
            style={{ ...ghostBtn, alignSelf: 'flex-start' }}
          >
            📖 Gym-uitleg opnieuw
          </button>

          {/* Speelwijze */}
          <div style={{
            background: '#1e293b', borderRadius: 10, padding: 12,
            fontSize: 13, color: '#94a3b8', lineHeight: 1.6,
          }}>
            <strong style={{ color: '#c7d2fe' }}>{g.parallel ? '⚡ Parallel' : '▶ Sequentieel'}</strong>
            {' '}{g.parallel
              ? '— alle niveaus spelen tegelijk.'
              : '— speel niveau 1 → 2 → 3 achter elkaar.'
            }
            <br />
            <strong style={{ color: '#c7d2fe' }}>Drank:</strong> {g.drank}
          </div>

          {g.niveaus.map((niveau, li) => {
            const analysis = getDuelAnalysis(currentGymIdx, li)
            const result = results.find(r => r.gym_index === currentGymIdx && r.level_index === li)
            const winnerTeam = result ? teams.find(t => t.id === result.winner_team_id) : null

            return (
              <div key={li} style={slotCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <LevelBadge index={li} />
                  {winnerTeam && (
                    <span style={{
                      fontSize: 12, color: winnerTeam.color, fontWeight: 800,
                      background: winnerTeam.color + '22', borderRadius: 8, padding: '2px 8px',
                    }}>
                      🏅 {winnerTeam.emoji} {winnerTeam.name}
                    </span>
                  )}
                </div>

                {/* Niveau-details */}
                <NiveauDetails gym={g} levelIndex={li} />

                {analysis && <AnalysisBanner analysis={analysis} gym={g} compact />}

                {/* Winnaar registreren (admin of iedereen) */}
                {!winnerTeam && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>Winnaar:</span>
                    {teams.map(t => (
                      <button
                        key={t.id}
                        onClick={() => saveResult(currentGymIdx, li, t.id)}
                        style={{
                          flex: 1, padding: '10px 0', background: t.color + '33',
                          border: `1px solid ${t.color}`, borderRadius: 8,
                          color: t.color, fontWeight: 800, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        {t.emoji} {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Gym-scorebord */}
          {gymResults.length > 0 && <GymScoreboard gymIdx={currentGymIdx} teams={teams} results={results} />}
        </div>

        {/* Admin: afsluiten */}
        {isAdmin && allDone && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
            <button
              onClick={() => advancePhase('complete')}
              disabled={advancing}
              style={primaryBtn}
            >
              {advancing ? 'Bezig…' : '✅ Gym afsluiten →'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── COMPLETE (gym klaar) ─────────────────────────────────
  function renderComplete() {
    const g = gym
    const score = gymScore(currentGymIdx)
    const sortedTeams = [...teams].sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0))
    const winner = sortedTeams[0]
    const isLastGym = currentGymIdx >= TOURNAMENT_GYMS.length - 1

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
        <Header onClose={onClose} title={g.naam} subtitle="Gym voltooid!" emoji="🏅" />

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Winnaar */}
          <div style={{
            background: `linear-gradient(135deg, ${winner?.color || '#6366f1'}33, #1e293b)`,
            border: `2px solid ${winner?.color || '#6366f1'}`,
            borderRadius: 16, padding: 20, textAlign: 'center',
          }}>
            <div style={{ fontSize: 40 }}>🏆</div>
            <div style={{ fontWeight: 900, fontSize: 20, color: winner?.color, marginTop: 8 }}>
              {winner?.emoji} {winner?.name}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
              wint {g.naam}!
            </div>
          </div>

          {/* Score per niveau */}
          <GymScoreboard gymIdx={currentGymIdx} teams={teams} results={results} detailed catches={catches} matchups={matchups} players={players} />

          {/* Totaalstand */}
          <TotalScoreboard teams={teams} score={totalScore()} />
        </div>

        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
            {isLastGym ? (
              <button
                onClick={() => advancePhase('finished')}
                disabled={advancing}
                style={{ ...primaryBtn, background: '#7c3aed' }}
              >
                {advancing ? 'Bezig…' : '🎉 Toernooi eindigen →'}
              </button>
            ) : (
              <button
                onClick={advanceGym}
                disabled={advancing}
                style={primaryBtn}
              >
                {advancing ? 'Bezig…' : `🏟️ Volgende gym: ${TOURNAMENT_GYMS[currentGymIdx + 1]?.naam} →`}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── FINISHED ─────────────────────────────────────────────
  function renderFinished() {
    const ts = totalScore()
    const sortedTeams = [...teams].sort((a, b) => (ts[b.id] || 0) - (ts[a.id] || 0))
    const champion = sortedTeams[0]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a' }}>
        <Header onClose={onClose} title="Bokémon GO" subtitle="Toernooi afgelopen!" emoji="🎊" />

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Kampioen */}
          <div style={{
            background: 'linear-gradient(135deg, #451a03, #78350f)',
            border: '2px solid #f59e0b',
            borderRadius: 16, padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 48 }}>🏆</div>
            <div style={{ fontWeight: 900, fontSize: 24, color: '#fbbf24', marginTop: 8 }}>
              KAMPIOEN
            </div>
            <div style={{ fontWeight: 900, fontSize: 28, color: '#fff', marginTop: 4 }}>
              {champion?.emoji} {champion?.name}
            </div>
            <div style={{ fontSize: 14, color: '#fcd34d', marginTop: 6 }}>
              {ts[champion?.id] || 0} gym{ts[champion?.id] !== 1 ? 's' : ''} gewonnen
            </div>
          </div>

          <TotalScoreboard teams={teams} score={ts} detailed />

          {/* Per gym resultaat */}
          {TOURNAMENT_GYMS.map((g, gi) => (
            <div key={gi} style={{ ...slotCard, opacity: 0.9 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#c7d2fe', marginBottom: 8 }}>
                {g.emoji} {g.naam}
              </div>
              <GymScoreboard gymIdx={gi} teams={teams} results={results} compact />
            </div>
          ))}
        </div>

        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => onStartFinale && onStartFinale()}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #dc2626)',
                color: '#fff', border: 'none', borderRadius: 12,
                padding: '16px 20px', fontSize: 16, fontWeight: 900, cursor: 'pointer',
                boxShadow: '0 0 24px rgba(124,58,237,0.4)',
              }}
            >
              ⚔️ Legendaire Finale starten!
            </button>
            <button
              onClick={() => advancePhase('intro', { current_gym: 0 })}
              style={ghostBtn}
            >
              🔄 Toernooi herspelen
            </button>
          </div>
        )}
        {!isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
            <button
              onClick={() => onStartFinale && onStartFinale()}
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #dc2626)',
                color: '#fff', border: 'none', borderRadius: 12,
                padding: '16px 20px', fontSize: 16, fontWeight: 900, cursor: 'pointer',
                width: '100%',
              }}
            >
              ⚔️ Legendaire Finale!
            </button>
          </div>
        )}
      </div>
    )
  }
}

// ────────────────────────────────────────────────────────────
// Kleine sub-components
// ────────────────────────────────────────────────────────────

function Header({ onClose, title, subtitle, emoji }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      background: 'linear-gradient(135deg, #1e1b4b, #1e293b)',
      borderBottom: '1px solid #312e81',
      flexShrink: 0,
    }}>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: 22, cursor: 'pointer', padding: 0 }}>
        ←
      </button>
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: '#e0e7ff' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: '#818cf8' }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function MatchupCard({ teamColor, teamName, playerName, catchItem, effXP, typeInfo, hasTypeAdv }) {
  const pd = catchItem?.pokemon_definitions
  const evoName = pd?.evolution_chain?.[catchItem?.evolution_stage] || pd?.name || '?'
  return (
    <div style={{
      flex: 1, background: teamColor + '18',
      border: `1px solid ${teamColor}55`,
      borderRadius: 10, padding: 10, textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: teamColor, fontWeight: 800, marginBottom: 4 }}>{teamName}</div>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#e2e8f0' }}>{evoName}</div>
      {catchItem?.is_shiny && <div style={{ fontSize: 11 }}>✨ Blinkend</div>}
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
        {typeInfo?.emoji} {typeInfo?.label}
        {hasTypeAdv && <span style={{ color: '#4ade80' }}> ↑</span>}
      </div>
      <div style={{ fontWeight: 900, color: '#fbbf24', fontSize: 14, marginTop: 4 }}>
        {effXP} XP{hasTypeAdv ? ' (+25%)' : ''}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{playerName || '?'}</div>
    </div>
  )
}

function AnalysisBanner({ analysis, gym, compact }) {
  const { xpDiff, xpCat, advantageTeam, typeWinner, typeA, typeB } = analysis
  const g = gym
  const typeInfo = POKEMON_TYPES[typeWinner === analysis.teamA ? typeA : typeB]

  return (
    <div style={{
      background: '#1e293b', borderRadius: 8, padding: compact ? 8 : 12,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {/* XP voordeel */}
      {advantageTeam && xpCat > 0 && (
        <div style={{ fontSize: 12, color: '#fbbf24' }}>
          ⚔️ <strong>{advantageTeam.name}</strong> — {g.xpVoordeel[`cat${xpCat}`]}
        </div>
      )}
      {!advantageTeam && (
        <div style={{ fontSize: 12, color: '#64748b' }}>⚖️ Gelijkspel — geen XP-voordeel</div>
      )}
      {/* Type handicap */}
      {(typeWinner || (!g.typeIsBonus && (analysis.aBeatsB || analysis.bBeatsA))) && (
        <div style={{ fontSize: 12, color: g.typeIsBonus ? '#4ade80' : '#f87171' }}>
          {g.typeIsBonus ? '🌟' : '⚠️'} {g.typeHandicap}
          {typeWinner && (
            <span style={{ color: typeInfo?.color }}>
              {' '}({typeWinner.name})
            </span>
          )}
        </div>
      )}
      {!typeWinner && !g.typeIsBonus && (
        <div style={{ fontSize: 12, color: '#64748b' }}>🤝 Geen type-handicap</div>
      )}
    </div>
  )
}

function NiveauDetails({ gym: g, levelIndex }) {
  const n = g.niveaus[levelIndex]
  if (!n) return null
  const entries = Object.entries(n).filter(([k]) => k !== 'label')
  return (
    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, lineHeight: 1.7 }}>
      {entries.map(([k, v]) => (
        <div key={k}><strong style={{ color: '#c7d2fe' }}>{niveauKeyLabel(k)}:</strong> {v}</div>
      ))}
    </div>
  )
}

function niveauKeyLabel(k) {
  return { bekers: 'Bekers', bier: 'Bier', afstand: 'Afstand', rondes: 'Rondes', parcours: 'Parcours', hekken: 'Hekken' }[k] || k
}

function GymRulesCard({ gym: g }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 12, padding: 14, marginTop: 4 }}>
      <div style={{ fontWeight: 800, color: '#c7d2fe', marginBottom: 10, fontSize: 14 }}>
        📋 Spelregels — {g.naam}
      </div>

      {/* Niveaus */}
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
        {g.parallel
          ? '⚡ Parallel — alle niveaus tegelijk'
          : '▶ Sequentieel — niveau 1 → 2 → 3'
        } · Drank: {g.drank}
      </div>

      {g.niveaus.map((n, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <LevelBadge index={i} />
          <NiveauDetails gym={g} levelIndex={i} />
        </div>
      ))}

      {/* XP voordeel */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 10, marginTop: 4 }}>
        <div style={{ fontWeight: 800, color: '#fbbf24', fontSize: 12, marginBottom: 6 }}>⚔️ XP-voordeel</div>
        {[1, 2, 3].map(cat => (
          <div key={cat} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
            <strong style={{ color: '#fbbf24' }}>Cat {cat}:</strong> {g.xpVoordeel[`cat${cat}`]}
          </div>
        ))}
      </div>

      {/* Type handicap */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 10, marginTop: 6 }}>
        <div style={{ fontWeight: 800, color: g.typeIsBonus ? '#4ade80' : '#f87171', fontSize: 12, marginBottom: 6 }}>
          {g.typeIsBonus ? '🌟 Type-bonus' : '⚠️ Type-handicap'}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>{g.typeHandicap}</div>
      </div>
    </div>
  )
}

function GymScoreboard({ gymIdx, teams, results, compact, detailed, catches, matchups, players }) {
  const gymResults = results.filter(r => r.gym_index === gymIdx)
  const score = {}
  teams.forEach(t => { score[t.id] = 0 })
  gymResults.forEach(r => { score[r.winner_team_id] = (score[r.winner_team_id] || 0) + 1 })

  return (
    <div style={{
      background: '#1e293b', borderRadius: 10, padding: 12,
    }}>
      {!compact && <div style={{ fontWeight: 800, color: '#c7d2fe', marginBottom: 8, fontSize: 13 }}>📊 Scorebord gym</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        {[...teams].sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0)).map(t => (
          <div key={t.id} style={{
            flex: 1, textAlign: 'center', padding: 10,
            background: t.color + '22', border: `1px solid ${t.color}44`, borderRadius: 8,
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: t.color }}>{score[t.id] || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t.emoji} {t.name}</div>
          </div>
        ))}
      </div>

      {detailed && gymResults.length > 0 && catches && matchups && players && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {gymResults.map(r => {
            const wt = teams.find(t => t.id === r.winner_team_id)
            const mA = matchups.find(m => m.gym_index === gymIdx && m.level_index === r.level_index && m.team_id === teams[0]?.id)
            const mB = matchups.find(m => m.gym_index === gymIdx && m.level_index === r.level_index && m.team_id === teams[1]?.id)
            const cA = catches.find(c => c.id === mA?.catch_id)
            const cB = catches.find(c => c.id === mB?.catch_id)
            return (
              <div key={r.id} style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 6, alignItems: 'center' }}>
                <LevelBadge index={r.level_index} />
                <span style={{ color: '#64748b' }}>
                  {cA?.pokemon_definitions?.name || '?'} vs {cB?.pokemon_definitions?.name || '?'}
                </span>
                <span style={{ color: wt?.color, fontWeight: 800 }}>→ {wt?.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TotalScoreboard({ teams, score, detailed }) {
  const sorted = [...teams].sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0))
  return (
    <div style={{ background: '#1e293b', borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 800, color: '#c7d2fe', marginBottom: 8, fontSize: 13 }}>
        🏆 Totaalstand ({TOURNAMENT_GYMS.length} gyms)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((t, i) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px',
            background: i === 0 ? t.color + '22' : 'transparent',
            border: i === 0 ? `1px solid ${t.color}55` : '1px solid #334155',
            borderRadius: 8,
          }}>
            <div style={{ fontWeight: 900, fontSize: 18, width: 24, color: i === 0 ? '#fbbf24' : '#475569' }}>
              {i + 1}.
            </div>
            <div style={{ flex: 1, fontWeight: 800, color: t.color }}>{t.emoji} {t.name}</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#fbbf24' }}>
              {score[t.id] || 0}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Stijlen
// ────────────────────────────────────────────────────────────
const primaryBtn = {
  width: '100%', padding: '14px 20px',
  background: '#4f46e5', color: '#fff',
  border: 'none', borderRadius: 12,
  fontSize: 15, fontWeight: 800, cursor: 'pointer',
}

const ghostBtn = {
  width: '100%', padding: '10px 20px',
  background: 'none', color: '#818cf8',
  border: '1px solid #334155', borderRadius: 10,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const slotCard = {
  background: '#1e293b', borderRadius: 12, padding: 14,
  display: 'flex', flexDirection: 'column', gap: 6,
}

const selectStyle = {
  width: '100%', background: '#0f172a', color: '#e2e8f0',
  border: '1px solid #334155', borderRadius: 8,
  padding: '10px 12px', fontSize: 14, marginBottom: 4,
}

const labelStyle = {
  display: 'block', fontSize: 11, color: '#64748b',
  fontWeight: 700, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em',
}
