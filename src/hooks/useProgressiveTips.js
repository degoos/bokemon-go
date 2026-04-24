// ─────────────────────────────────────────────────────────────
// useProgressiveTips — contextbewuste spelertips via localStorage
//
// Toont max 1 tip per MIN_INTERVAL_MS. Elke tip verschijnt slechts
// 1x per sessie. Tips zijn geordend op prioriteit (eerste match wint).
// ─────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react'
import { getDistanceMeters } from '../lib/geo'

const MIN_INTERVAL_MS = 3 * 60 * 1000   // max 1 tip per 3 minuten
const HQ_PROXIMITY_M  = 200              // binnen 200m van HQ → HQ-tip

function getSeenKey(sessionId) {
  return `bokemon_tips_seen_${sessionId}`
}

function loadSeen(sessionId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(getSeenKey(sessionId)) || '[]'))
  } catch { return new Set() }
}

function saveSeen(sessionId, seen) {
  try {
    localStorage.setItem(getSeenKey(sessionId), JSON.stringify([...seen]))
  } catch {}
}

// ── Tip definities ──────────────────────────────────────────
// id          : unieke sleutel (opgeslagen in localStorage)
// emoji       : icoon links in toast
// title       : vetgedrukte koptekst
// message     : korte toelichting (1-2 zinnen)
// phases      : in welke fases mag deze tip verschijnen
// condition   : fn(ctx) → true als de tip relevant is
// ────────────────────────────────────────────────────────────
const TIP_DEFINITIONS = [
  {
    id: 'spawn_visible',
    emoji: '🎯',
    title: 'Bokémon gespawnd!',
    message: 'Loop naar de marker toe en tik erop als je binnen de gele ring staat.',
    phases: ['collecting'],
    condition: ({ spawns }) => spawns.some(s => s.status === 'active'),
  },
  {
    id: 'hq_proximity',
    emoji: '🏚️',
    title: 'Verlaten HQ dichtbij!',
    message: 'Je nadert het Team Rocket HQ. Hier vind je mini-games, Moon Stones en meer items.',
    phases: ['collecting'],
    condition: ({ position, hqLocation }) => {
      if (!position || !hqLocation) return false
      const dist = getDistanceMeters(position.lat, position.lon, +hqLocation.lat, +hqLocation.lng)
      return dist <= HQ_PROXIMITY_M
    },
  },
  {
    id: 'first_catch',
    emoji: '✅',
    title: 'Eerste vangst!',
    message: 'Bekijk je team via de Pokédex-knop onderaan. Elke Bokémon heeft XP — hoe hoger, hoe beter in het toernooi.',
    phases: ['collecting'],
    condition: ({ catches, teamId }) => catches.some(c => c.team_id === teamId),
  },
  {
    id: 'steal_hint',
    emoji: '⚔️',
    title: 'Wist je dat je kunt stelen?',
    message: 'Gebruik een Silph Scope om het andere team te spotten. Loop naar ze toe, tik iemand aan en start een Rock Paper Scissors.',
    phases: ['collecting'],
    // Toon na 12 min spelen als het team nog niet gestolen heeft
    condition: ({ gameStartedAt, teamHasStolen }) => {
      if (teamHasStolen) return false
      if (!gameStartedAt) return false
      return Date.now() - new Date(gameStartedAt).getTime() > 12 * 60 * 1000
    },
  },
  {
    id: 'no_items_hint',
    emoji: '🎒',
    title: 'Nog geen items?',
    message: 'Bezoek het Team Rocket HQ voor mini-games die items opleveren. Of wacht op de Mobiele Shop op de kaart.',
    phases: ['collecting'],
    // Toon na 8 min als team nog geen items heeft
    condition: ({ inventory, gameStartedAt }) => {
      const total = Object.values(inventory || {}).reduce((sum, qty) => sum + (qty || 0), 0)
      if (total > 0) return false
      if (!gameStartedAt) return false
      return Date.now() - new Date(gameStartedAt).getTime() > 8 * 60 * 1000
    },
  },
  {
    id: 'silph_scope_use',
    emoji: '🔭',
    title: 'Silph Scope in je rugzak!',
    message: 'Activeer hem via Rugzak om het andere team 6 minuten zichtbaar te maken op de kaart. Perfect om te stelen.',
    phases: ['collecting'],
    condition: ({ inventory }) => (inventory?.silph_scope || 0) > 0,
  },
  {
    id: 'protect_hint',
    emoji: '🛡️',
    title: 'Protect beschikbaar!',
    message: 'Zet een schild op je sterkste Bokémon via de Rugzak. Die kan dan niet gestolen worden.',
    phases: ['collecting'],
    condition: ({ inventory }) => (inventory?.protect || 0) > 0,
  },
  {
    id: 'legendary_started',
    emoji: '👑',
    title: 'Legendarische fase!',
    message: 'Er is iets bijzonders gespawnd. Volg het warmer/kouder systeem op de kaart om het te vinden.',
    phases: ['collecting'],
    condition: ({ isLegendaryPhase }) => !!isLegendaryPhase,
  },
  {
    id: 'training_moon_stone',
    emoji: '🌙',
    title: 'Moon Stones beschikbaar!',
    message: 'Gebruik een Moon Stone in het Training-scherm voor een gratis evolutiestap — geen bier nodig.',
    phases: ['training'],
    condition: ({ inventory }) => (inventory?.moon_stone || 0) > 0,
  },
  {
    id: 'training_start',
    emoji: '🌿',
    title: 'Trainingsfase gestart!',
    message: 'Evolueer je Bokémon door het gekoppelde bier te drinken als team. Sterkere Bokémon = meer XP in het toernooi.',
    phases: ['training'],
    condition: () => true, // altijd bij start trainingsfase
  },
  {
    id: 'tournament_types',
    emoji: '⚡',
    title: 'Type-voordelen tellen mee!',
    message: 'Een gunstig type-matchup geeft +25% XP. Tik de 📖 Spelgids aan en ga naar "Toernooi" voor de volledige tabel.',
    phases: ['tournament'],
    condition: () => true,
  },
]

export function useProgressiveTips({
  sessionId,
  teamId,
  phase,
  spawns = [],
  catches = [],
  inventory = {},
  effects = [],
  position = null,
  hqLocation = null,
  gameStartedAt = null,
  isLegendaryPhase = false,
}) {
  const [currentTip, setCurrentTip] = useState(null)
  const seenRef      = useRef(loadSeen(sessionId))
  const lastShownRef = useRef(0)
  const timerRef     = useRef(null)

  // Bouw context op voor condities
  const buildCtx = useCallback(() => {
    const teamHasStolen = catches.some(c => c.team_id === teamId && c.via_steal)
    const inventoryObj = typeof inventory === 'object' && !Array.isArray(inventory) ? inventory : {}

    return {
      phase,
      spawns,
      catches,
      inventory: inventoryObj,
      effects,
      position,
      hqLocation,
      gameStartedAt,
      teamId,
      isLegendaryPhase,
      teamHasStolen,
    }
  }, [phase, spawns, catches, inventory, effects, position, hqLocation, gameStartedAt, teamId, isLegendaryPhase])

  function dismissTip() {
    setCurrentTip(null)
  }

  // Evalueer tips zodra relevante state wijzigt
  useEffect(() => {
    // Wacht minstens MIN_INTERVAL_MS na de vorige tip
    const sinceLastMs = Date.now() - lastShownRef.current
    const delay = sinceLastMs < MIN_INTERVAL_MS ? MIN_INTERVAL_MS - sinceLastMs : 0

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (currentTip) return  // al een tip zichtbaar

      const ctx = buildCtx()
      const activeTips = TIP_DEFINITIONS.filter(t =>
        t.phases.includes(phase) &&
        !seenRef.current.has(t.id) &&
        t.condition(ctx)
      )

      if (activeTips.length === 0) return

      const tip = activeTips[0]
      seenRef.current.add(tip.id)
      saveSeen(sessionId, seenRef.current)
      lastShownRef.current = Date.now()
      setCurrentTip(tip)
    }, delay)

    return () => clearTimeout(timerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, spawns.length, catches.length, isLegendaryPhase,
      position?.lat, position?.lon,
      inventory?.silph_scope, inventory?.protect, inventory?.moon_stone])

  return { currentTip, dismissTip }
}
