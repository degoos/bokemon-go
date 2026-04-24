import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// SpinnerGame — Kamer 2 (Beveiligingszaal)
//
// Geïnspireerd op Viridian City Gym: 6x6 grid met spinners (↑↓←→).
// Start linksonder (0,0), exit rechtsboven (5,5). Op een spinner
// tegel word je voortgestuwd tot je de rand raakt. Pijlen zichtbaar
// zodat het een planningspuzzel is, niet blind.
// ─────────────────────────────────────────────────────────────

const SIZE = 6
const START = { x: 0, y: 0 }
const EXIT  = { x: 5, y: 5 }

// Coordinaten: y=0 is ONDER, y=5 is BOVEN (rendering flipt)
// Spinners — layout zorgt voor één duidelijke route + enkele trap-spinners
const SPINNERS = {
  '1,1': 'up',      // helper: stap vanaf start → slide naar (1,5)
  '3,3': 'up',      // helper: alternatieve route via midden → slide naar (3,5)
  '2,4': 'down',    // trap: glijdt terug naar (2,0)
  '4,4': 'left',    // trap: glijdt naar (0,4)
  '0,2': 'right',   // trap: glijdt naar (5,2)
}

const ARROW = { up: '↑', down: '↓', left: '←', right: '→' }
const DELTA = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }

// Slide door tot aan de rand in de gegeven richting (geen chain-spinners)
function propel(x, y, dir) {
  const [dx, dy] = DELTA[dir]
  let cx = x, cy = y
  while (cx + dx >= 0 && cx + dx < SIZE && cy + dy >= 0 && cy + dy < SIZE) {
    cx += dx; cy += dy
  }
  return [cx, cy]
}

export default function SpinnerGame({ onComplete, onAbort }) {
  const [pos, setPos] = useState(START)
  const [steps, setSteps] = useState(0)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef(Date.now())
  const completedRef = useRef(false)

  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 500)
    return () => clearInterval(iv)
  }, [])

  function isAdjacent(x, y) {
    const dx = Math.abs(x - pos.x)
    const dy = Math.abs(y - pos.y)
    return (dx + dy) === 1
  }

  function handleTileClick(x, y) {
    if (done || completedRef.current) return
    if (!isAdjacent(x, y)) return

    const spinner = SPINNERS[`${x},${y}`]
    let finalX = x, finalY = y
    if (spinner) {
      [finalX, finalY] = propel(x, y, spinner)
      setMessage({ kind: 'warn', text: `🌀 Spinner ${ARROW[spinner]} — je wordt voortgestuwd!` })
    } else {
      setMessage(null)
    }

    setPos({ x: finalX, y: finalY })
    setSteps(s => s + 1)

    if (finalX === EXIT.x && finalY === EXIT.y) {
      setDone(true)
      completedRef.current = true
      setMessage({ kind: 'ok', text: '🎉 Je bent door de beveiliging!' })
      setTimeout(() => { if (onComplete) onComplete() }, 1800)
    }
  }

  function reset() {
    if (completedRef.current) return
    setPos(START); setSteps(0); setDone(false); setMessage(null)
    startTimeRef.current = Date.now(); setElapsed(0)
  }

  // Render-grid: van y=5 (bovenaan) naar y=0 (onderaan)
  const rows = []
  for (let y = SIZE - 1; y >= 0; y--) {
    const cols = []
    for (let x = 0; x < SIZE; x++) {
      const key = `${x},${y}`
      const spinner = SPINNERS[key]
      const isPlayer = pos.x === x && pos.y === y
      const isStart  = START.x === x && START.y === y
      const isExit   = EXIT.x === x && EXIT.y === y
      const adj      = isAdjacent(x, y) && !done

      // Kleuren
      let bg = 'linear-gradient(135deg, #1f2937, #111827)'
      let border = '1px solid #374151'
      let color = '#9ca3af'

      if (spinner) {
        bg = 'linear-gradient(135deg, #6d28d9, #4c1d95)'
        border = '2px solid #a855f7'
        color = '#e9d5ff'
      }
      if (isExit) {
        bg = 'linear-gradient(135deg, #065f46, #064e3b)'
        border = '2px solid #22c55e'
        color = '#86efac'
      }
      if (isStart && !isPlayer) {
        border = '1px dashed #6b7280'
      }
      if (adj) {
        border = '2px dashed #facc15'
      }

      let label = ''
      if (isPlayer) label = '🏃'
      else if (spinner) label = ARROW[spinner]
      else if (isExit) label = '⭐'

      cols.push(
        <button
          key={key}
          onClick={() => handleTileClick(x, y)}
          disabled={!adj}
          style={{
            aspectRatio: '1/1',
            background: bg,
            border,
            borderRadius: 6,
            fontSize: 22,
            fontWeight: 800,
            color,
            padding: 0,
            cursor: adj ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            position: 'relative',
            boxShadow: isPlayer ? '0 0 12px rgba(250,204,21,0.7)' : 'none',
          }}
        >
          {label}
        </button>
      )
    }
    rows.push(
      <div key={y} style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gap: 4 }}>
        {cols}
      </div>
    )
  }

  return (
    <div className="screen" style={{ background: '#1a0f1f' }}>
      <div className="topbar" style={{ background: '#2d1558', borderBottom: '1px solid #6d28d9' }}>
        <button onClick={onAbort} style={{ background: 'none', border: 'none', color: '#c4b5fd', fontSize: 22 }}>✕</button>
        <h3 style={{ color: '#c4b5fd' }}>🌀 Kamer 2 — Beveiligingszaal</h3>
        <div style={{ color: '#c4b5fd', fontSize: 13, fontWeight: 700 }}>⏱ {elapsed}s</div>
      </div>

      <div style={{
        margin: '12px 14px', padding: '10px 12px',
        background: '#1a0a2e', border: '1px solid #6d28d9', borderRadius: 10,
        fontSize: 12, color: '#c4b5fd', lineHeight: 1.5,
      }}>
        Tik op een <strong style={{ color: '#facc15' }}>aangrenzende tegel</strong> (geel omrand). Op een
        <strong style={{ color: '#a855f7' }}> 🌀 spinner</strong> word je in de pijlrichting voortgestuwd tot
        de rand. Bereik de <strong style={{ color: '#22c55e' }}>⭐ uitgang</strong>.
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

      {/* Grid */}
      <div style={{
        padding: '8px 12px', maxWidth: 440, margin: '0 auto', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {rows}
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 16, padding: 14,
        fontSize: 13, color: '#c4b5fd', alignItems: 'center',
      }}>
        <span>Stappen: <strong style={{ color: '#e9d5ff' }}>{steps}</strong></span>
        <button onClick={reset} disabled={done} style={{
          background: '#374151', border: 'none', borderRadius: 8,
          color: '#e5e7eb', padding: '8px 16px', fontWeight: 700,
          cursor: done ? 'default' : 'pointer', opacity: done ? 0.4 : 1,
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
    </div>
  )
}
