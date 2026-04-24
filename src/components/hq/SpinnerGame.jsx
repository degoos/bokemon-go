import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// SpinnerGame — Kamer 2 (Beveiligingszaal)
//
// Geïnspireerd op Viridian City Gym: 6x6 grid met CHAIN-SPINNERS.
// Een spinner schiet je door tot je op een andere spinner landt —
// die neemt het over en stuwt je in zijn richting. Zo worden twee
// schakelaars bereikt via cascades van 3-4 spinners.
//
// v3:
//  - Sprite renderen BINNEN grid (flex-centering wrapper fix)
//  - Chain propulsie: landen op spinner → nieuwe richting
//  - Geen trap vlak naast goal → na switches is goal walking-reachable
//  - Sprite roteert tijdens propulsie (spin animatie)
// ─────────────────────────────────────────────────────────────

const SIZE = 6
const START = { x: 0, y: 0 }
const EXIT  = { x: 5, y: 5 }
const STEP_MS = 160

// Geen muren — lock op goal is voldoende barrière.
const WALLS = new Set([])

// CHAIN-spinners. Propulsie slide stopt zodra een andere spinner
// wordt geraakt; die neemt de richting over.
//
// Keten A (activeert Schakelaar A op (2,5)):
//   (0,1)→  ⇒  (3,1)↑  ⇒  (3,4)←  ⇒  (2,4)↑  ⇒  land op (2,5)
// Keten B (activeert Schakelaar B op (5,2)):
//   (1,0)↑  ⇒  (1,2)→  ⇒  land op (5,2)
// Trap:
//   (4,5)↓  ⇒  schiet door kolom 4 omlaag tot (4,0) — verleiding vlak
//              bij goal (als je via rij 5 van links naar rechts loopt).
const SPINNERS = {
  '0,1': 'right',
  '3,1': 'up',
  '1,0': 'up',
  '1,2': 'right',
  '3,4': 'left',
  '2,4': 'up',
  '4,5': 'down',   // trap
}

const SWITCH_A = '2,5'
const SWITCH_B = '5,2'

const ARROW = { up: '↑', down: '↓', left: '←', right: '→' }
const DELTA = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }

function isWall(x, y) { return WALLS.has(`${x},${y}`) }

// Chain-propulsie: slide in huidige richting tot aan muur/rand of tot
// speler op een volgende spinner LANDT — dan neemt die de richting over.
// Bezochte spinners tracken om eindeloze cycli te voorkomen.
function propulsionPath(startX, startY, startDir) {
  const cells = []
  let cx = startX, cy = startY
  let dir = startDir
  const visitedSpinners = new Set([`${startX},${startY}`])

  while (true) {
    const [dx, dy] = DELTA[dir]
    let moved = false
    while (true) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break
      if (isWall(nx, ny)) break
      cx = nx; cy = ny
      cells.push([cx, cy])
      moved = true
      // Geland op een (nog niet gebruikte) spinner? Slide stopt.
      if (SPINNERS[`${cx},${cy}`]) break
    }
    if (!moved) break
    const key = `${cx},${cy}`
    if (SPINNERS[key] && !visitedSpinners.has(key)) {
      visitedSpinners.add(key)
      dir = SPINNERS[key]
      continue  // chain!
    }
    break
  }
  return cells
}

export default function SpinnerGame({ team, onComplete, onAbort }) {
  const [pos, setPos] = useState(START)
  const [steps, setSteps] = useState(0)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [switchA, setSwitchA] = useState(false)
  const [switchB, setSwitchB] = useState(false)
  const [moving, setMoving] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const startTimeRef = useRef(Date.now())
  const completedRef = useRef(false)
  const timeoutsRef = useRef([])

  const sprite = team?.emoji || '🏃'
  const teamColor = team?.color || '#fbbf24'

  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 500)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => () => timeoutsRef.current.forEach(t => clearTimeout(t)), [])

  function schedule(fn, delay) {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter(x => x !== id)
      fn()
    }, delay)
    timeoutsRef.current.push(id)
  }

  function isAdjacent(x, y) {
    const dx = Math.abs(x - pos.x)
    const dy = Math.abs(y - pos.y)
    return (dx + dy) === 1
  }

  function animatePath(path, wasPropulsion, onFinish) {
    setMoving(true)
    if (wasPropulsion) setSpinning(true)
    path.forEach(([x, y], i) => {
      schedule(() => setPos({ x, y }), (i + 1) * STEP_MS)
    })
    const total = path.length * STEP_MS + 100
    schedule(() => {
      setMoving(false)
      setSpinning(false)
      onFinish()
    }, total)
  }

  function handleTileClick(x, y) {
    if (done || completedRef.current || moving) return
    if (!isAdjacent(x, y)) return
    if (isWall(x, y)) {
      setMessage({ kind: 'err', text: '🧱 Een muur — kan hier niet langs.' })
      return
    }
    if (x === EXIT.x && y === EXIT.y && !(switchA && switchB)) {
      setMessage({ kind: 'err', text: '🔒 De deur is vergrendeld — activeer eerst beide schakelaars met een spinner!' })
      return
    }

    const key = `${x},${y}`
    const spinner = SPINNERS[key]
    let path = [[x, y]]
    let wasPropulsion = false
    if (spinner) {
      const pcells = propulsionPath(x, y, spinner)
      if (pcells.length > 0) {
        path = [[x, y], ...pcells]
        wasPropulsion = true
        setMessage({ kind: 'warn', text: `🌀 Spinner ${ARROW[spinner]} — je wordt voortgestuwd!` })
      } else {
        setMessage({ kind: 'warn', text: `🌀 Spinner ${ARROW[spinner]} — maar de propulsie wordt geblokkeerd.` })
      }
    } else {
      setMessage(null)
    }

    setSteps(s => s + 1)

    animatePath(path, wasPropulsion, () => {
      const [fx, fy] = path[path.length - 1]
      const finalKey = `${fx},${fy}`
      let newA = switchA, newB = switchB
      if (wasPropulsion) {
        if (finalKey === SWITCH_A && !switchA) {
          setSwitchA(true); newA = true
          setMessage({ kind: 'ok', text: '⚡ Schakelaar A geactiveerd!' })
        } else if (finalKey === SWITCH_B && !switchB) {
          setSwitchB(true); newB = true
          setMessage({ kind: 'ok', text: '⚡ Schakelaar B geactiveerd!' })
        }
      } else if ((finalKey === SWITCH_A && !switchA) || (finalKey === SWITCH_B && !switchB)) {
        setMessage({ kind: 'warn', text: '💡 Een schakelaar — maar lopen triggert hem niet. Gebruik een spinner!' })
      }
      if (fx === EXIT.x && fy === EXIT.y && newA && newB) {
        setDone(true)
        completedRef.current = true
        setMessage({ kind: 'ok', text: '🎉 Je bent door de beveiliging!' })
        schedule(() => { if (onComplete) onComplete() }, 1800)
      }
    })
  }

  function reset() {
    if (completedRef.current) return
    timeoutsRef.current.forEach(t => clearTimeout(t))
    timeoutsRef.current = []
    setPos(START); setSteps(0); setDone(false); setMessage(null)
    setSwitchA(false); setSwitchB(false)
    setMoving(false); setSpinning(false)
    startTimeRef.current = Date.now(); setElapsed(0)
  }

  // Bouw grid-cellen
  const cells = []
  for (let y = SIZE - 1; y >= 0; y--) {
    for (let x = 0; x < SIZE; x++) {
      const key = `${x},${y}`
      const spinner = SPINNERS[key]
      const wall = WALLS.has(key)
      const isExit   = EXIT.x === x && EXIT.y === y
      const adj      = isAdjacent(x, y) && !wall && !done && !moving
      const isSwitchA = key === SWITCH_A
      const isSwitchB = key === SWITCH_B
      const switchActive = (isSwitchA && switchA) || (isSwitchB && switchB)
      const exitUnlocked = switchA && switchB

      let bg = 'linear-gradient(135deg, #1f2937, #111827)'
      let border = '1px solid #374151'
      let color = '#9ca3af'

      if (wall) {
        bg = 'linear-gradient(135deg, #44403c, #292524)'
        border = '1px solid #78716c'
        color = '#d6d3d1'
      } else if (spinner) {
        bg = 'linear-gradient(135deg, #6d28d9, #4c1d95)'
        border = '2px solid #a855f7'
        color = '#e9d5ff'
      } else if (isSwitchA || isSwitchB) {
        bg = switchActive
          ? 'linear-gradient(135deg, #1e40af, #06b6d4)'
          : 'linear-gradient(135deg, #1e293b, #0f172a)'
        border = switchActive ? '2px solid #22d3ee' : '2px dashed #475569'
        color = switchActive ? '#cffafe' : '#64748b'
      }
      if (isExit) {
        bg = exitUnlocked
          ? 'linear-gradient(135deg, #065f46, #064e3b)'
          : 'linear-gradient(135deg, #1e293b, #0f172a)'
        border = exitUnlocked ? '2px solid #22c55e' : '2px solid #475569'
        color = exitUnlocked ? '#86efac' : '#64748b'
      }
      if (adj) border = '2px dashed #facc15'

      let label = ''
      if (wall) label = '🧱'
      else if (isExit) label = exitUnlocked ? '⭐' : '🔒'
      else if (spinner) label = ARROW[spinner]
      else if (isSwitchA) label = switchActive ? '🔵' : 'A'
      else if (isSwitchB) label = switchActive ? '🔵' : 'B'

      cells.push(
        <button
          key={key}
          onClick={() => handleTileClick(x, y)}
          disabled={!adj}
          style={{
            gridColumn: x + 1,
            gridRow: SIZE - y,
            background: bg, border, borderRadius: 6,
            fontSize: 20, fontWeight: 800, color,
            padding: 0,
            cursor: adj ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            userSelect: 'none',
            // Spinners draaien zachtjes om chain-karakter te tonen
            animation: spinner && !moving ? 'spinRotate 3s linear infinite' : 'none',
          }}
        >
          {label}
        </button>
      )
    }
  }

  const visualRow = SIZE - 1 - pos.y
  const visualCol = pos.x

  return (
    <div className="screen" style={{ background: '#1a0f1f' }}>
      <div className="topbar" style={{ background: '#2d1558', borderBottom: '1px solid #6d28d9' }}>
        <button onClick={onAbort} style={{ background: 'none', border: 'none', color: '#c4b5fd', fontSize: 22 }}>✕</button>
        <h3 style={{ color: '#c4b5fd' }}>🌀 Kamer 2 — Beveiligingszaal</h3>
        <div style={{ color: '#c4b5fd', fontSize: 13, fontWeight: 700 }}>⏱ {elapsed}s</div>
      </div>

      <div style={{
        margin: '10px 14px', padding: '10px 12px',
        background: '#1a0a2e', border: '1px solid #6d28d9', borderRadius: 10,
        fontSize: 12, color: '#c4b5fd', lineHeight: 1.5,
      }}>
        <strong style={{ color: '#a855f7' }}>🌀 Spinners</strong> stuwen je voort — en als je LANDT op een andere spinner,
        neemt die het over (chain-reactie). Activeer <strong style={{ color: '#22d3ee' }}>Schakelaar A en B</strong> door erop
        te landen via een spinner. Daarna gaat de <strong style={{ color: '#22c55e' }}>⭐ uitgang</strong> open — loop er dan naartoe
        (pas op de <strong style={{ color: '#fdba74' }}>trap-spinner</strong> vlak bij de deur!).
      </div>

      <div style={{
        display: 'flex', gap: 10, margin: '0 14px 10px', padding: '8px 12px',
        background: '#2d1558', borderRadius: 10, border: '1px solid #6d28d9',
        alignItems: 'center', fontSize: 12, fontWeight: 700,
      }}>
        <span style={{ color: switchA ? '#22d3ee' : '#64748b' }}>
          {switchA ? '🔵' : '⚪'} Schakelaar A
        </span>
        <span style={{ color: switchB ? '#22d3ee' : '#64748b' }}>
          {switchB ? '🔵' : '⚪'} Schakelaar B
        </span>
        <span style={{ marginLeft: 'auto', color: (switchA && switchB) ? '#22c55e' : '#94a3b8' }}>
          {(switchA && switchB) ? '🔓 Deur open' : '🔒 Deur dicht'}
        </span>
      </div>

      {message && (
        <div style={{
          margin: '0 14px 10px', padding: '8px 12px', borderRadius: 10,
          background: message.kind === 'err' ? '#3f1015' : message.kind === 'warn' ? '#3f2300' : '#1e3a1e',
          border: `1px solid ${message.kind === 'err' ? '#ef4444' : message.kind === 'warn' ? '#fb923c' : '#22c55e'}`,
          color: message.kind === 'err' ? '#fca5a5' : message.kind === 'warn' ? '#fdba74' : '#86efac',
          fontSize: 12, fontWeight: 700, textAlign: 'center',
        }}>
          {message.text}
        </div>
      )}

      {/* Grid + sprite — flex-wrapper centreert inline-grid zodat absolute sprite correct aligneert */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 12px' }}>
        <div style={{
          '--cell': 'min(52px, 14vw)',
          '--gap': '4px',
          display: 'inline-grid',
          gridTemplateColumns: `repeat(${SIZE}, var(--cell))`,
          gridTemplateRows: `repeat(${SIZE}, var(--cell))`,
          gap: 'var(--gap)',
          position: 'relative',
        }}>
          {cells}

          {/* Sprite overlay — relatief t.o.v. grid zelf, niet de centering-wrapper */}
          <div style={{
            position: 'absolute',
            left: 0, top: 0,
            width: 'var(--cell)', height: 'var(--cell)',
            transform: `translate(calc(${visualCol} * (var(--cell) + var(--gap))), calc(${visualRow} * (var(--cell) + var(--gap))))`,
            transition: `transform ${STEP_MS}ms linear`,
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
          }}>
            <div style={{
              width: '78%', height: '78%',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${teamColor}66 0%, ${teamColor}22 60%, transparent 100%)`,
              border: `2px solid ${teamColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
              boxShadow: `0 0 10px ${teamColor}aa`,
              animation: spinning
                ? 'spinRotate 0.3s linear infinite'
                : moving
                ? 'bokePulse 0.6s ease-in-out infinite'
                : 'none',
            }}>
              {sprite}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'center', gap: 16, padding: 14,
        fontSize: 13, color: '#c4b5fd', alignItems: 'center',
      }}>
        <span>Stappen: <strong style={{ color: '#e9d5ff' }}>{steps}</strong></span>
        <button onClick={reset} disabled={done || moving} style={{
          background: '#374151', border: 'none', borderRadius: 8,
          color: '#e5e7eb', padding: '8px 16px', fontWeight: 700,
          cursor: (done || moving) ? 'default' : 'pointer', opacity: (done || moving) ? 0.4 : 1,
          fontSize: 13,
        }}>🔄 Reset</button>
      </div>

      {done && (
        <div style={{
          textAlign: 'center', padding: 16, fontSize: 22, fontWeight: 800, color: '#86efac',
          animation: 'bokePulse 0.8s ease-in-out infinite',
        }}>
          ⭐ Beveiliging omzeild!
        </div>
      )}

      <div style={{ padding: '10px 16px', textAlign: 'center', marginTop: 'auto' }}>
        <button onClick={onAbort} disabled={done} style={{
          background: 'transparent', border: '1px solid #6d28d9',
          color: '#c4b5fd', padding: '8px 18px', borderRadius: 10,
          fontSize: 12, cursor: done ? 'default' : 'pointer', opacity: done ? 0.3 : 1,
        }}>← Terug naar HQ-overzicht</button>
      </div>

      <style>{`
        @keyframes spinRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
