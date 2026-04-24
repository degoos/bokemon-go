import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// BoulderGame — Kamer 3 (Kluis)
//
// Sokoban-puzzel geïnspireerd op de Strength HM puzzles van Seafoam
// Islands en Victory Road. 6x6 grid, 3 blokken + 3 drukplaten, muren.
// Eén blok in een hoek zonder plaat = vast → gebruik RESET of UNDO.
//
// v2: 3 blokken/3 platen + muren + undo-knop + team-sprite.
// ─────────────────────────────────────────────────────────────

const SIZE = 6
const STEP_MS = 160

// Muren — obstakels die blokken en speler blokkeren
const WALLS = new Set([
  '2,4', '3,4',   // muur tussen midden en bovenkant
  '2,1', '3,1',   // muur tussen midden en onderkant
])

// Initiële stand — vast level, gegarandeerd oplosbaar
// y=0 onder, y=5 boven
const INITIAL = {
  player: { x: 0, y: 0 },
  boulders: [
    { x: 1, y: 3 },
    { x: 4, y: 3 },
    { x: 2, y: 2 },
  ],
  plates: [
    { x: 0, y: 5 },
    { x: 5, y: 5 },
    { x: 5, y: 0 },
  ],
}

const DELTA = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }

function isWall(x, y) { return WALLS.has(`${x},${y}`) }
function inBounds(x, y) { return x >= 0 && x < SIZE && y >= 0 && y < SIZE }

export default function BoulderGame({ team, onComplete, onAbort }) {
  const [player, setPlayer] = useState(INITIAL.player)
  const [boulders, setBoulders] = useState(INITIAL.boulders)
  const [history, setHistory] = useState([])
  const [moves, setMoves] = useState(0)
  const [done, setDone] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [moving, setMoving] = useState(false)
  const startTimeRef = useRef(Date.now())
  const completedRef = useRef(false)
  const timeoutsRef = useRef([])

  const sprite = team?.emoji || '🏃'
  const teamColor = team?.color || '#4ade80'

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

  function boulderIndexAt(x, y, list = boulders) {
    return list.findIndex(b => b.x === x && b.y === y)
  }
  function plateAt(x, y) {
    return INITIAL.plates.some(p => p.x === x && p.y === y)
  }
  function allOnPlates(list) {
    return INITIAL.plates.every(p => list.some(b => b.x === p.x && b.y === p.y))
  }

  function move(dir) {
    if (done || completedRef.current || moving) return
    const [dx, dy] = DELTA[dir]
    const nx = player.x + dx
    const ny = player.y + dy
    if (!inBounds(nx, ny)) return
    if (isWall(nx, ny)) return

    const bIdx = boulderIndexAt(nx, ny)
    if (bIdx >= 0) {
      // Blok duwen
      const bx = nx + dx
      const by = ny + dy
      if (!inBounds(bx, by)) return
      if (isWall(bx, by)) return
      if (boulderIndexAt(bx, by) >= 0) return

      // Snapshot voor undo
      setHistory(h => [...h, { player: { ...player }, boulders: boulders.map(b => ({ ...b })) }])

      const newBoulders = boulders.map((b, i) => i === bIdx ? { x: bx, y: by } : b)
      setMoving(true)
      setBoulders(newBoulders)
      setPlayer({ x: nx, y: ny })
      setMoves(m => m + 1)
      schedule(() => setMoving(false), STEP_MS)
      if (allOnPlates(newBoulders)) {
        setDone(true)
        completedRef.current = true
        schedule(() => { if (onComplete) onComplete() }, 1800)
      }
    } else {
      // Vrij bewegen
      setHistory(h => [...h, { player: { ...player }, boulders: boulders.map(b => ({ ...b })) }])
      setMoving(true)
      setPlayer({ x: nx, y: ny })
      setMoves(m => m + 1)
      schedule(() => setMoving(false), STEP_MS)
    }
  }

  function undo() {
    if (completedRef.current || history.length === 0) return
    const prev = history[history.length - 1]
    setPlayer(prev.player)
    setBoulders(prev.boulders)
    setHistory(h => h.slice(0, -1))
    setMoves(m => Math.max(0, m - 1))
  }

  function reset() {
    if (completedRef.current) return
    timeoutsRef.current.forEach(t => clearTimeout(t))
    timeoutsRef.current = []
    setPlayer(INITIAL.player)
    setBoulders(INITIAL.boulders)
    setHistory([])
    setMoves(0)
    setDone(false)
    setMoving(false)
    startTimeRef.current = Date.now(); setElapsed(0)
  }

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (done) return
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
      const dir = map[e.key]
      if (dir) { e.preventDefault(); move(dir) }
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Render-grid: y=SIZE-1 bovenaan, y=0 onderaan
  const cells = []
  for (let y = SIZE - 1; y >= 0; y--) {
    for (let x = 0; x < SIZE; x++) {
      const wall = isWall(x, y)
      const bIdx = boulderIndexAt(x, y)
      const hasBlock = bIdx >= 0
      const hasPlate = plateAt(x, y)
      const onPlate = hasBlock && hasPlate

      let bg = 'linear-gradient(135deg, #1f2937, #111827)'
      let border = '1px solid #374151'
      if (wall) {
        bg = 'linear-gradient(135deg, #44403c, #292524)'
        border = '1px solid #78716c'
      } else if (hasPlate) {
        bg = onPlate
          ? 'linear-gradient(135deg, #14532d, #064e3b)'
          : 'linear-gradient(135deg, #1a3d26, #14301e)'
        border = onPlate ? '2px solid #22c55e' : '2px dashed #4ade80'
      }

      let label = ''
      if (wall)           label = '🧱'
      else if (onPlate)   label = '🟢'
      else if (hasBlock)  label = '🗿'
      else if (hasPlate)  label = '🎯'

      cells.push(
        <div key={`${x},${y}`} style={{
          gridColumn: x + 1,
          gridRow: SIZE - y,
          background: bg, border, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26,
          boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.3)',
          transition: 'all 0.15s',
        }}>
          {label}
        </div>
      )
    }
  }

  const visualRow = SIZE - 1 - player.y
  const visualCol = player.x

  const btnStyle = {
    background: 'linear-gradient(135deg, #334155, #1e293b)',
    border: '1px solid #475569',
    borderRadius: 12, color: '#e5e7eb',
    fontSize: 22, fontWeight: 800,
    width: 54, height: 54,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
  }
  const btnDisabled = { ...btnStyle, opacity: 0.4, cursor: 'default' }

  const onPlatesCount = boulders.filter(b => plateAt(b.x, b.y)).length

  return (
    <div className="screen" style={{ background: '#0f1a1f' }}>
      <div className="topbar" style={{ background: '#14302a', borderBottom: '1px solid #166534' }}>
        <button onClick={onAbort} style={{ background: 'none', border: 'none', color: '#86efac', fontSize: 22 }}>✕</button>
        <h3 style={{ color: '#86efac' }}>🗿 Kamer 3 — De Kluis</h3>
        <div style={{ color: '#86efac', fontSize: 13, fontWeight: 700 }}>⏱ {elapsed}s</div>
      </div>

      <div style={{
        margin: '10px 14px', padding: '10px 12px',
        background: '#102118', border: '1px solid #166534', borderRadius: 10,
        fontSize: 12, color: '#86efac', lineHeight: 1.5,
      }}>
        Duw alle <strong style={{ color: '#fbbf24' }}>🗿 3 blokken</strong> op de
        <strong style={{ color: '#4ade80' }}> 🎯 drukplaten</strong>. <strong style={{ color: '#d6d3d1' }}>🧱 Muren</strong>
        blokkeren blokken en speler. Vast? Gebruik <strong>↶ Undo</strong> of <strong>🔄 Reset</strong>.
      </div>

      <div style={{
        display: 'flex', gap: 12, margin: '0 14px 10px', padding: '8px 12px',
        background: '#0f1f1a', borderRadius: 10, border: '1px solid #166534',
        fontSize: 13, fontWeight: 700, color: '#86efac',
      }}>
        <span>{onPlatesCount}/{INITIAL.plates.length} blokken op plaat</span>
        <span style={{ marginLeft: 'auto' }}>Zetten: {moves}</span>
      </div>

      {/* Grid + sprite — flex-wrapper centreert inline-grid zodat absolute sprite correct aligneert */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 14px' }}>
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
              fontSize: 22,
              boxShadow: `0 0 10px ${teamColor}aa`,
              animation: moving ? 'bokePulse 0.5s ease-in-out infinite' : 'none',
            }}>
              {sprite}
            </div>
          </div>
        </div>
      </div>

      {/* D-pad + controls */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, gap: 14, userSelect: 'none' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 54px)',
          gridTemplateRows: 'repeat(3, 54px)',
          gap: 5,
        }}>
          <div />
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('up')} disabled={done} aria-label="omhoog">▲</button>
          <div />
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('left')} disabled={done} aria-label="links">◀</button>
          <button
            style={{
              ...btnStyle,
              background: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
              border: '1px solid #b91c1c', color: '#fca5a5', fontSize: 16,
              opacity: done ? 0.4 : 1, cursor: done ? 'default' : 'pointer',
            }}
            onClick={reset} disabled={done} aria-label="reset"
          >🔄</button>
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('right')} disabled={done} aria-label="rechts">▶</button>
          <div />
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('down')} disabled={done} aria-label="omlaag">▼</button>
          <div />
        </div>

        {/* Undo kolom */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <button
            style={{
              ...btnStyle,
              background: 'linear-gradient(135deg, #78350f, #451a03)',
              border: '1px solid #d97706', color: '#fbbf24',
              width: 72, height: 54, fontSize: 16,
              opacity: (done || history.length === 0) ? 0.4 : 1,
              cursor: (done || history.length === 0) ? 'default' : 'pointer',
            }}
            onClick={undo}
            disabled={done || history.length === 0}
            aria-label="undo"
          >
            ↶ Undo
          </button>
        </div>
      </div>

      {done && (
        <div style={{
          textAlign: 'center', padding: 16, fontSize: 22, fontWeight: 800, color: '#4ade80',
          animation: 'bokePulse 0.8s ease-in-out infinite',
        }}>
          🔓 De kluis gaat open!
        </div>
      )}

      <div style={{ padding: '10px 16px', textAlign: 'center', marginTop: 'auto' }}>
        <button onClick={onAbort} disabled={done} style={{
          background: 'transparent', border: '1px solid #166534',
          color: '#86efac', padding: '8px 18px', borderRadius: 10,
          fontSize: 12, cursor: done ? 'default' : 'pointer', opacity: done ? 0.3 : 1,
        }}>← Terug naar HQ-overzicht</button>
      </div>
    </div>
  )
}
