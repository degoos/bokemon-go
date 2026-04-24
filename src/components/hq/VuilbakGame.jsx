import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// VuilbakGame — Kamer 1 (Ingang)
//
// Geïnspireerd op Vermilion City Gym. Raster van vuilbakken met
// 2 verborgen schakelaars — de tweede zit altijd H/V aangrenzend
// aan de eerste. Verkeerd? Alles reset + nieuwe posities.
//
// v2:
//  - Team-sprite (🧢 of 💧 via team.emoji) loopt naar de aangeklikte bak.
//  - 3×4 = 12 bakken (minder dan v1) + wandelanimatie → 2-3 min play.
// ─────────────────────────────────────────────────────────────

const COLS = 3
const ROWS = 4           // aantal bakken-rijen
const TOTAL_ROWS = ROWS + 1   // + 1 startrij onderaan voor sprite
const TOTAL = COLS * ROWS
const STEP_MS = 220
const REVEAL_DELAY = 180

function randomSwitches() {
  const first = Math.floor(Math.random() * TOTAL)
  const fx = first % COLS
  const fy = Math.floor(first / COLS)
  const neighbors = []
  if (fx > 0)       neighbors.push(first - 1)
  if (fx < COLS-1)  neighbors.push(first + 1)
  if (fy > 0)       neighbors.push(first - COLS)
  if (fy < ROWS-1)  neighbors.push(first + COLS)
  const second = neighbors[Math.floor(Math.random() * neighbors.length)]
  return [first, second]
}

// Manhattan-pad (x eerst, dan y) van (c0,r0) → (c1,r1)
function pathBetween(c0, r0, c1, r1) {
  const steps = []
  let c = c0, r = r0
  while (c !== c1) { c += (c1 > c) ? 1 : -1; steps.push([c, r]) }
  while (r !== r1) { r += (r1 > r) ? 1 : -1; steps.push([c, r]) }
  return steps
}

export default function VuilbakGame({ team, onComplete, onAbort }) {
  const [switches, setSwitches] = useState(randomSwitches)
  const [foundOne, setFoundOne] = useState(false)
  const [foundTwo, setFoundTwo] = useState(false)
  const [wrongIdx, setWrongIdx] = useState(null)
  const [message, setMessage] = useState(null)
  const [tries, setTries] = useState(0)
  const [resets, setResets] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  // Sprite-positie in grid-coords. row=ROWS is startrij (onder bakken).
  const [pos, setPos] = useState({ col: Math.floor(COLS / 2), row: ROWS })
  const [moving, setMoving] = useState(false)
  const startRef = useRef(Date.now())
  const completedRef = useRef(false)
  const timeoutsRef = useRef([])

  const [switch1, switch2] = switches
  const sprite = team?.emoji || '🏃'
  const teamColor = team?.color || '#fbbf24'

  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => () => timeoutsRef.current.forEach(t => clearTimeout(t)), [])

  useEffect(() => {
    if (wrongIdx === null) return
    const t = setTimeout(() => setWrongIdx(null), 450)
    return () => clearTimeout(t)
  }, [wrongIdx])

  function schedule(fn, delay) {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter(x => x !== id)
      fn()
    }, delay)
    timeoutsRef.current.push(id)
  }

  function walkTo(col, row, onArrive) {
    setMoving(true)
    const path = pathBetween(pos.col, pos.row, col, row)
    path.forEach(([c, r], i) => {
      schedule(() => setPos({ col: c, row: r }), (i + 1) * STEP_MS)
    })
    const totalTime = Math.max(1, path.length) * STEP_MS + REVEAL_DELAY
    schedule(() => { setMoving(false); onArrive() }, totalTime)
  }

  function revealBin(idx) {
    setTries(t => t + 1)

    if (!foundOne && idx === switch1) {
      setFoundOne(true)
      setMessage({ kind: 'ok', text: '⚡ Schakelaar gevonden! Nu de tweede — hij zit er vlak naast.' })
      return
    }

    if (foundOne && !foundTwo && idx === switch2) {
      setFoundTwo(true)
      setMessage({ kind: 'ok', text: '💡 Beide schakelaars gevonden! De deur gaat open...' })
      completedRef.current = true
      schedule(() => { if (onComplete) onComplete() }, 1800)
      return
    }

    setWrongIdx(idx)
    setMessage({ kind: 'err', text: '🗑️ Hier zit alleen afval... De bakken sluiten zich opnieuw!' })
    setFoundOne(false)
    setFoundTwo(false)
    setResets(r => r + 1)
    schedule(() => setSwitches(randomSwitches()), 450)
  }

  function handleClick(idx) {
    if (foundTwo || completedRef.current || moving) return
    const col = idx % COLS
    const row = Math.floor(idx / COLS)
    if (pos.col === col && pos.row === row) {
      revealBin(idx)
      return
    }
    walkTo(col, row, () => revealBin(idx))
  }

  const found = (foundOne ? 1 : 0) + (foundTwo ? 1 : 0)

  // Cel afmeting via CSS custom properties — responsive
  const gridStyle = {
    '--cell': 'min(86px, 26vw)',
    '--gap': '10px',
    display: 'grid',
    gridTemplateColumns: `repeat(${COLS}, var(--cell))`,
    gridTemplateRows: `repeat(${TOTAL_ROWS}, var(--cell))`,
    gap: 'var(--gap)',
    position: 'relative',
    margin: '0 auto',
    justifyContent: 'center',
  }

  return (
    <div className="screen" style={{ background: '#1a0f0f' }}>
      <div className="topbar" style={{ background: '#2d0f1a', borderBottom: '1px solid #7f1d1d' }}>
        <button onClick={onAbort} style={{ background: 'none', border: 'none', color: '#fca5a5', fontSize: 22 }}>✕</button>
        <h3 style={{ color: '#fca5a5' }}>🗑️ Kamer 1 — De Ingang</h3>
        <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700 }}>⏱ {elapsed}s</div>
      </div>

      <div style={{
        margin: '14px 16px 8px', padding: '12px 14px',
        background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 10,
        fontSize: 13, color: '#fca5a5', lineHeight: 1.5,
      }}>
        Team Rocket verstopte <strong>twee schakelaars</strong> onder de vuilbakken. De tweede zit altijd
        <strong> horizontaal of verticaal aangrenzend</strong> aan de eerste. Tik een bak — je loopt erheen
        en kijkt eronder. Verkeerd? Alles reset.
      </div>

      <div style={{
        display: 'flex', gap: 12, margin: '0 16px 12px', padding: '10px 14px',
        background: '#2d0f1a', borderRadius: 10, border: '1px solid #7f1d1d',
        alignItems: 'center', fontSize: 13, fontWeight: 700,
      }}>
        <span style={{ color: '#fbbf24' }}>{found}/2 gevonden</span>
        <span style={{ marginLeft: 'auto', color: '#fca5a5' }}>Pogingen: {tries}</span>
        <span style={{ color: '#fca5a5' }}>· Resets: {resets}</span>
      </div>

      {message && (
        <div style={{
          margin: '0 16px 14px', padding: '10px 14px', borderRadius: 10,
          background: message.kind === 'err' ? '#3f1015' : '#1e3a1e',
          border: `1px solid ${message.kind === 'err' ? '#ef4444' : '#22c55e'}`,
          color: message.kind === 'err' ? '#fca5a5' : '#86efac',
          fontSize: 13, fontWeight: 700, textAlign: 'center',
          animation: 'slideDown 0.25s ease-out',
        }}>
          {message.text}
        </div>
      )}

      {/* Playfield */}
      <div style={{ padding: '0 16px' }}>
        <div style={gridStyle}>
          {/* Vuilbakken — rij 1..ROWS */}
          {Array.from({ length: TOTAL }).map((_, idx) => {
            const col = idx % COLS
            const row = Math.floor(idx / COLS)
            const isFirstFound = foundOne && idx === switch1
            const isSecondFound = foundTwo && idx === switch2
            const isAnyFound = isFirstFound || isSecondFound
            const isShaking = wrongIdx === idx
            return (
              <button
                key={idx}
                onClick={() => handleClick(idx)}
                disabled={foundTwo || moving}
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                  background: isAnyFound
                    ? 'linear-gradient(135deg, #fef08a, #fbbf24)'
                    : 'linear-gradient(135deg, #3a3a3a, #1f2937)',
                  border: isAnyFound ? '3px solid #fbbf24' : '2px solid #4b5563',
                  borderRadius: 12,
                  fontSize: 34,
                  cursor: (foundTwo || moving) ? 'default' : 'pointer',
                  padding: 0,
                  transition: 'background 0.2s, border 0.2s',
                  boxShadow: isAnyFound ? '0 0 14px rgba(251, 191, 36, 0.6)' : 'inset 0 -3px 6px rgba(0,0,0,0.5)',
                  animation: isShaking ? 'battleShake 0.4s ease-in-out' : 'none',
                  color: 'white',
                  opacity: moving ? 0.85 : 1,
                }}
              >
                {isAnyFound ? '⚡' : '🗑️'}
              </button>
            )
          })}

          {/* Startvak onder de bakken */}
          {Array.from({ length: COLS }).map((_, c) => (
            <div key={`start-${c}`} style={{
              gridColumn: c + 1,
              gridRow: ROWS + 1,
              borderRadius: 12,
              background: c === Math.floor(COLS / 2)
                ? 'linear-gradient(135deg, #3a1f1f, #1a0f0f)'
                : 'transparent',
              border: c === Math.floor(COLS / 2) ? '1px dashed #7f1d1d' : 'none',
            }} />
          ))}

          {/* Sprite overlay — absoluut, translate op basis van cel-eenheid */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 'var(--cell)',
            height: 'var(--cell)',
            transform: `translate(calc(${pos.col} * (var(--cell) + var(--gap))), calc(${pos.row} * (var(--cell) + var(--gap))))`,
            transition: `transform ${STEP_MS}ms linear`,
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
          }}>
            <div style={{
              width: '72%', height: '72%',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${teamColor}55 0%, ${teamColor}22 60%, transparent 100%)`,
              border: `2px solid ${teamColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
              boxShadow: `0 0 12px ${teamColor}aa`,
              animation: moving ? 'bokePulse 0.6s ease-in-out infinite' : 'none',
            }}>
              {sprite}
            </div>
          </div>
        </div>
      </div>

      {foundTwo && (
        <div style={{
          textAlign: 'center', padding: '24px 16px', marginTop: 16,
          fontSize: 22, fontWeight: 800, color: '#fbbf24',
          animation: 'bokePulse 0.8s ease-in-out infinite',
        }}>
          💡 De lichten gaan aan!
        </div>
      )}

      <div style={{ padding: '16px', textAlign: 'center', marginTop: 'auto' }}>
        <button
          onClick={onAbort}
          disabled={foundTwo}
          style={{
            background: 'transparent', border: '1px solid #7f1d1d',
            color: '#fca5a5', padding: '8px 18px', borderRadius: 10,
            fontSize: 12, cursor: foundTwo ? 'default' : 'pointer', opacity: foundTwo ? 0.3 : 1,
          }}
        >
          ← Terug naar HQ-overzicht
        </button>
      </div>
    </div>
  )
}
