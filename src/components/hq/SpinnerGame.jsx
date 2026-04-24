import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// SpinnerGame — Kamer 2 (Beveiligingszaal)
//
// Geïnspireerd op Viridian City Gym: 6x6 grid met spinners (↑↓←→),
// muren en twee drukschakelaars. De uitgang is VERGRENDELD tot
// beide schakelaars geactiveerd zijn — en een schakelaar activeert
// alléén als je erop LANDT via een spinner (lopen telt niet).
//
// v2:
//  - Walls: blokkeren zowel lopen als propulsie.
//  - Switches (*): vereisen spinner-landing → lopen is niet genoeg.
//  - Geanimeerde beweging (cel per cel) i.p.v. teleport.
//  - Team-sprite (🧢/💧) met spin-animatie tijdens propulsie.
//  - Trap-spinners die je terug naar beneden lanceren.
// ─────────────────────────────────────────────────────────────

const SIZE = 6
const START = { x: 0, y: 0 }
const EXIT  = { x: 5, y: 5 }
const STEP_MS = 180

// Muren (geen walking, geen propulsie)
const WALLS = new Set([
  '3,3', '3,4', '3,5', '4,5', // L-vorm muur rechts van midden
])

// Spinners: key 'x,y' → richting
// (2,0) up       → propels door kolom 2 naar top, LANDT op switch A (2,5)
// (1,2) right    → propels over rij 2 naar rechts, LANDT op switch B (5,2)
// (0,4) down     → TRAP: terug naar (0,0)
// (4,1) up       → nuttig na switches: springt naar (4,4) (bij (4,5) muur)
// (5,4) down     → TRAP: schiet terug naar (5,0) (passeert switch B maar landt niet)
const SPINNERS = {
  '2,0': 'up',
  '1,2': 'right',
  '0,4': 'down',
  '4,1': 'up',
  '5,4': 'down',
}

// Schakelaars
const SWITCH_A = '2,5'
const SWITCH_B = '5,2'

const ARROW = { up: '↑', down: '↓', left: '←', right: '→' }
const DELTA = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }

function isWall(x, y) { return WALLS.has(`${x},${y}`) }

// Propel door tot aan muur of rand (geen chain-spinners)
function propel(x, y, dir) {
  const [dx, dy] = DELTA[dir]
  let cx = x, cy = y
  while (true) {
    const nx = cx + dx, ny = cy + dy
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break
    if (isWall(nx, ny)) break
    cx = nx; cy = ny
  }
  return [cx, cy]
}

function propulsionPath(x, y, dir) {
  const [dx, dy] = DELTA[dir]
  const cells = []
  let cx = x, cy = y
  while (true) {
    const nx = cx + dx, ny = cy + dy
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break
    if (isWall(nx, ny)) break
    cx = nx; cy = ny
    cells.push([cx, cy])
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
    // path: array of [x,y], elke cel wordt bezocht op volgorde
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
    // Vergrendelde uitgang?
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
        // Spinner blokkeert direct door muur — speler blijft staan
        setMessage({ kind: 'warn', text: `🌀 Spinner ${ARROW[spinner]} — maar een muur blokt de voortstuwing.` })
      }
    } else {
      setMessage(null)
    }

    setSteps(s => s + 1)

    animatePath(path, wasPropulsion, () => {
      const [fx, fy] = path[path.length - 1]
      const finalKey = `${fx},${fy}`

      // Switch-activering (alleen bij propulsie-landing)
      let newA = switchA, newB = switchB
      if (wasPropulsion) {
        if (finalKey === SWITCH_A && !switchA) {
          setSwitchA(true); newA = true
          setMessage({ kind: 'ok', text: '⚡ Schakelaar A geactiveerd!' })
        } else if (finalKey === SWITCH_B && !switchB) {
          setSwitchB(true); newB = true
          setMessage({ kind: 'ok', text: '⚡ Schakelaar B geactiveerd!' })
        }
      } else if (finalKey === SWITCH_A || finalKey === SWITCH_B) {
        // Lopen op een switch: hint
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

  // Render-grid: y=SIZE-1 bovenaan, y=0 onderaan
  const rows = []
  for (let y = SIZE - 1; y >= 0; y--) {
    const cols = []
    for (let x = 0; x < SIZE; x++) {
      const key = `${x},${y}`
      const spinner = SPINNERS[key]
      const wall = WALLS.has(key)
      const isPlayer = pos.x === x && pos.y === y
      const isStart  = START.x === x && START.y === y
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
      if (adj) {
        border = '2px dashed #facc15'
      }

      let label = ''
      if (wall) label = '🧱'
      else if (isExit) label = exitUnlocked ? '⭐' : '🔒'
      else if (spinner) label = ARROW[spinner]
      else if (isSwitchA) label = switchActive ? '🔵' : 'A'
      else if (isSwitchB) label = switchActive ? '🔵' : 'B'

      cols.push(
        <button
          key={key}
          onClick={() => handleTileClick(x, y)}
          disabled={!adj}
          style={{
            gridColumn: x + 1,
            gridRow: SIZE - y,
            aspectRatio: '1/1',
            background: bg,
            border,
            borderRadius: 6,
            fontSize: 20,
            fontWeight: 800,
            color,
            padding: 0,
            cursor: adj ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            userSelect: 'none',
          }}
        >
          {label}
          {isPlayer && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }} />
          )}
        </button>
      )
    }
    rows.push(...cols)
  }

  // Sprite-positie translate (gridkolom * (cel+gap); gridrij via SIZE-1-y)
  // We gebruiken dezelfde CSS-custom properties als grid.
  const visualRow = SIZE - 1 - pos.y   // 0 = top rij visueel
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
        Tik een <strong style={{ color: '#facc15' }}>aangrenzende tegel</strong>. Een <strong style={{ color: '#a855f7' }}>🌀 spinner</strong> stuwt je voort tot aan een
        <strong style={{ color: '#d6d3d1' }}> 🧱 muur</strong> of rand. De <strong style={{ color: '#22c55e' }}>⭐ uitgang</strong> is vergrendeld — activeer eerst
        <strong style={{ color: '#22d3ee' }}> beide schakelaars (A en B)</strong> door erop te LANDEN via een spinner.
      </div>

      {/* Switches-status balk */}
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

      {/* Grid + sprite */}
      <div style={{ padding: '4px 12px' }}>
        <div style={{
          '--cell': 'min(52px, 14vw)',
          '--gap': '4px',
          display: 'grid',
          gridTemplateColumns: `repeat(${SIZE}, var(--cell))`,
          gridTemplateRows: `repeat(${SIZE}, var(--cell))`,
          gap: 'var(--gap)',
          justifyContent: 'center',
          margin: '0 auto',
          position: 'relative',
        }}>
          {rows}

          {/* Sprite overlay */}
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

      {/* Controls */}
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

      {/* Spin-rotatie keyframe (één keer per mount injectie) */}
      <style>{`
        @keyframes spinRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
