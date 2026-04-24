import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// BoulderGame — Kamer 3 (Kluis)
//
// Sokoban-puzzel geïnspireerd op Strength HM puzzles. 5x5 grid,
// 2 blokken + 2 drukplaten. Beweging via arrow-knoppen (of pijltjes
// toetsen op desktop). Pushen: bij beweging richting een blok wordt
// die in dezelfde richting geduwd. Niet door muren/blokken. Alle
// blokken op een plaat = kluis open. Reset-knop bij vastzitten.
// ─────────────────────────────────────────────────────────────

const SIZE = 5

// Initiële stand — vast level, gegarandeerd oplosbaar
// y=0 onder, y=4 boven
const INITIAL = {
  player: { x: 0, y: 0 },
  boulders: [
    { x: 1, y: 2 },
    { x: 3, y: 2 },
  ],
  plates: [
    { x: 1, y: 4 },
    { x: 3, y: 4 },
  ],
}

const DELTA = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }

export default function BoulderGame({ onComplete, onAbort }) {
  const [player, setPlayer] = useState(INITIAL.player)
  const [boulders, setBoulders] = useState(INITIAL.boulders)
  const [moves, setMoves] = useState(0)
  const [done, setDone] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startTimeRef = useRef(Date.now())
  const completedRef = useRef(false)

  // Klok
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 500)
    return () => clearInterval(iv)
  }, [])

  function inBounds(x, y) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE
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
    if (done || completedRef.current) return
    const [dx, dy] = DELTA[dir]
    const nx = player.x + dx
    const ny = player.y + dy
    if (!inBounds(nx, ny)) return

    const bIdx = boulderIndexAt(nx, ny)
    if (bIdx >= 0) {
      // Probeer blok te duwen
      const bx = nx + dx
      const by = ny + dy
      if (!inBounds(bx, by)) return                // randmuur blokkeert
      if (boulderIndexAt(bx, by) >= 0) return      // ander blok blokkeert
      const newBoulders = boulders.map((b, i) => i === bIdx ? { x: bx, y: by } : b)
      setBoulders(newBoulders)
      setPlayer({ x: nx, y: ny })
      setMoves(m => m + 1)
      if (allOnPlates(newBoulders)) {
        setDone(true)
        completedRef.current = true
        setTimeout(() => { if (onComplete) onComplete() }, 1800)
      }
    } else {
      // Vrije beweging
      setPlayer({ x: nx, y: ny })
      setMoves(m => m + 1)
    }
  }

  function reset() {
    if (completedRef.current) return
    setPlayer(INITIAL.player)
    setBoulders(INITIAL.boulders)
    setMoves(0); setDone(false)
    startTimeRef.current = Date.now(); setElapsed(0)
  }

  // Keyboard-support (desktop testing)
  useEffect(() => {
    function onKey(e) {
      if (done) return
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
      const dir = map[e.key]
      if (dir) { e.preventDefault(); move(dir) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Render-grid: y=4 bovenaan, y=0 onderaan
  const rows = []
  for (let y = SIZE - 1; y >= 0; y--) {
    const cols = []
    for (let x = 0; x < SIZE; x++) {
      const isPlayer  = player.x === x && player.y === y
      const bIdx      = boulderIndexAt(x, y)
      const hasBlock  = bIdx >= 0
      const hasPlate  = plateAt(x, y)
      const onPlate   = hasBlock && hasPlate

      let bg = 'linear-gradient(135deg, #1f2937, #111827)'
      let border = '1px solid #374151'
      if (hasPlate) {
        bg = onPlate
          ? 'linear-gradient(135deg, #14532d, #064e3b)'
          : 'linear-gradient(135deg, #1a3d26, #14301e)'
        border = onPlate ? '2px solid #22c55e' : '2px dashed #4ade80'
      }

      let label = ''
      if (isPlayer)       label = '🏃'
      else if (onPlate)   label = '🟢'
      else if (hasBlock)  label = '🗿'
      else if (hasPlate)  label = '🎯'

      cols.push(
        <div key={`${x},${y}`} style={{
          aspectRatio: '1/1',
          background: bg, border, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30,
          boxShadow: isPlayer ? '0 0 12px rgba(250,204,21,0.6)' : 'inset 0 -2px 4px rgba(0,0,0,0.3)',
          transition: 'all 0.15s',
        }}>
          {label}
        </div>
      )
    }
    rows.push(
      <div key={y} style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gap: 4 }}>
        {cols}
      </div>
    )
  }

  const btnStyle = {
    background: 'linear-gradient(135deg, #334155, #1e293b)',
    border: '1px solid #475569',
    borderRadius: 12, color: '#e5e7eb',
    fontSize: 24, fontWeight: 800,
    width: 60, height: 60,
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
        margin: '12px 14px', padding: '10px 12px',
        background: '#102118', border: '1px solid #166534', borderRadius: 10,
        fontSize: 12, color: '#86efac', lineHeight: 1.5,
      }}>
        Duw alle <strong style={{ color: '#fbbf24' }}>🗿 blokken</strong> op de
        <strong style={{ color: '#4ade80' }}> 🎯 drukplaten</strong>. Beweeg met de pijl-knoppen.
        Een blok kan niet door muren of andere blokken. Zit je vast? <strong>🔄 Reset</strong>.
      </div>

      <div style={{
        display: 'flex', gap: 12, margin: '0 14px 12px', padding: '8px 12px',
        background: '#0f1f1a', borderRadius: 10, border: '1px solid #166534',
        fontSize: 13, fontWeight: 700, color: '#86efac',
      }}>
        <span>{onPlatesCount}/{INITIAL.plates.length} blokken op plaat</span>
        <span style={{ marginLeft: 'auto' }}>Zetten: {moves}</span>
      </div>

      {/* Grid */}
      <div style={{
        padding: '0 14px',
        maxWidth: 360, margin: '0 auto', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {rows}
      </div>

      {/* D-pad */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18, userSelect: 'none' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 60px)',
          gridTemplateRows: 'repeat(3, 60px)',
          gap: 6,
        }}>
          <div />
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('up')} disabled={done} aria-label="omhoog">▲</button>
          <div />
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('left')} disabled={done} aria-label="links">◀</button>
          <button
            style={{
              ...btnStyle,
              background: 'linear-gradient(135deg, #7f1d1d, #450a0a)',
              border: '1px solid #b91c1c', color: '#fca5a5', fontSize: 18,
              opacity: done ? 0.4 : 1, cursor: done ? 'default' : 'pointer',
            }}
            onClick={reset} disabled={done} aria-label="reset"
          >🔄</button>
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('right')} disabled={done} aria-label="rechts">▶</button>
          <div />
          <button style={done ? btnDisabled : btnStyle} onClick={() => move('down')} disabled={done} aria-label="omlaag">▼</button>
          <div />
        </div>
      </div>

      {done && (
        <div style={{
          textAlign: 'center', padding: 18, fontSize: 22, fontWeight: 800, color: '#4ade80',
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
