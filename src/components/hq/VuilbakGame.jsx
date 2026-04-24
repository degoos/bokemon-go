import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// VuilbakGame — Kamer 1 (Ingang)
//
// Geïnspireerd op Vermilion City Gym: 3x3 vuilbakken in rijen,
// met walkway-rijen ertussen + side-columns om tussen de bin-rijen
// te navigeren. Klik op een bak → speler loopt via BFS naar de cel
// DIRECT VOOR de bak (onder) en kijkt ernaar. Geen lopen OP bakken.
//
// v3:
//  - 3x3 bakken (was 3x4)
//  - Walkway-rijen tussen bakken + side-columns
//  - BFS pathfinding voor looppad door walkways
//  - Sprite BINNEN grid (flex-centering wrapper fix)
//  - Speler gaat VOOR de bak staan om te checken (niet erop)
// ─────────────────────────────────────────────────────────────

const COLS = 5           // 2 side-walkways + 3 bin-kolommen
const ROWS = 7           // 3 bin-rijen afgewisseld met walkways + startrij
const STEP_MS = 180
const REVEAL_DELAY = 200

// Bakken op vaste posities — (col 1,2,3) × (row 0,2,4)
const BIN_COORDS = []
for (const br of [0, 2, 4]) {
  for (const bc of [1, 2, 3]) {
    BIN_COORDS.push({ col: bc, row: br })
  }
}
const TOTAL_BINS = BIN_COORDS.length  // 9

function isBin(c, r) {
  return BIN_COORDS.some(b => b.col === c && b.row === r)
}

function randomSwitches() {
  const first = Math.floor(Math.random() * TOTAL_BINS)
  const f = BIN_COORDS[first]
  const adjacent = []
  for (let i = 0; i < TOTAL_BINS; i++) {
    if (i === first) continue
    const b = BIN_COORDS[i]
    // "Aangrenzend" in bakken-raster: zelfde rij, naastliggende kolom
    //                        of zelfde kolom, 2 rijen verschil (door walkway tussen).
    const sameRow = b.row === f.row && Math.abs(b.col - f.col) === 1
    const sameCol = b.col === f.col && Math.abs(b.row - f.row) === 2
    if (sameRow || sameCol) adjacent.push(i)
  }
  const second = adjacent[Math.floor(Math.random() * adjacent.length)]
  return [first, second]
}

// BFS vanaf (sc,sr) naar (tc,tr) waarbij bakken geblokkeerd zijn.
function bfsPath(sc, sr, tc, tr) {
  if (sc === tc && sr === tr) return []
  const queue = [[sc, sr, []]]
  const visited = new Set([`${sc},${sr}`])
  while (queue.length) {
    const [c, r, path] = queue.shift()
    for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nc = c + dc, nr = r + dr
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue
      if (isBin(nc, nr)) continue
      const key = `${nc},${nr}`
      if (visited.has(key)) continue
      visited.add(key)
      const newPath = [...path, [nc, nr]]
      if (nc === tc && nr === tr) return newPath
      queue.push([nc, nr, newPath])
    }
  }
  return null
}

export default function VuilbakGame({ team, onComplete, onAbort }) {
  const [switches, setSwitches] = useState(randomSwitches)
  const [foundOne, setFoundOne] = useState(false)
  const [foundTwo, setFoundTwo] = useState(false)
  const [wrongBinIdx, setWrongBinIdx] = useState(null)
  const [message, setMessage] = useState(null)
  const [tries, setTries] = useState(0)
  const [resets, setResets] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  // Start-positie: midden onder
  const [pos, setPos] = useState({ col: 2, row: 6 })
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
    if (wrongBinIdx === null) return
    const t = setTimeout(() => setWrongBinIdx(null), 450)
    return () => clearTimeout(t)
  }, [wrongBinIdx])

  function schedule(fn, delay) {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter(x => x !== id)
      fn()
    }, delay)
    timeoutsRef.current.push(id)
  }

  function walkTo(tc, tr, onArrive) {
    const path = bfsPath(pos.col, pos.row, tc, tr)
    if (!path) { onArrive(); return }  // fallback
    if (path.length === 0) { onArrive(); return }
    setMoving(true)
    path.forEach(([c, r], i) => {
      schedule(() => setPos({ col: c, row: r }), (i + 1) * STEP_MS)
    })
    const total = path.length * STEP_MS + REVEAL_DELAY
    schedule(() => { setMoving(false); onArrive() }, total)
  }

  function revealBin(binIdx) {
    setTries(t => t + 1)

    if (!foundOne && binIdx === switch1) {
      setFoundOne(true)
      setMessage({ kind: 'ok', text: '⚡ Schakelaar gevonden! Nu de tweede — hij zit in een aangrenzende bak.' })
      return
    }

    if (foundOne && !foundTwo && binIdx === switch2) {
      setFoundTwo(true)
      setMessage({ kind: 'ok', text: '💡 Beide schakelaars gevonden! De deur gaat open...' })
      completedRef.current = true
      schedule(() => { if (onComplete) onComplete() }, 1800)
      return
    }

    setWrongBinIdx(binIdx)
    setMessage({ kind: 'err', text: '🗑️ Hier zit alleen afval... De bakken sluiten zich opnieuw!' })
    setFoundOne(false)
    setFoundTwo(false)
    setResets(r => r + 1)
    schedule(() => setSwitches(randomSwitches()), 450)
  }

  function handleBinClick(binIdx) {
    if (foundTwo || completedRef.current || moving) return
    const bin = BIN_COORDS[binIdx]
    // "Voor de bak" = cel onder de bak (row + 1)
    const frontCol = bin.col
    const frontRow = bin.row + 1
    if (frontRow >= ROWS) { revealBin(binIdx); return }
    walkTo(frontCol, frontRow, () => revealBin(binIdx))
  }

  const found = (foundOne ? 1 : 0) + (foundTwo ? 1 : 0)

  // ─── Render cellen ───────────────────────────────────────
  const cells = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const bin = BIN_COORDS.find(b => b.col === c && b.row === r)
      const binIdx = bin ? BIN_COORDS.findIndex(b => b.col === c && b.row === r) : -1
      if (bin) {
        const isFirstFound = foundOne && binIdx === switch1
        const isSecondFound = foundTwo && binIdx === switch2
        const isAnyFound = isFirstFound || isSecondFound
        const isShaking = wrongBinIdx === binIdx
        cells.push(
          <button
            key={`bin-${c},${r}`}
            onClick={() => handleBinClick(binIdx)}
            disabled={foundTwo || moving}
            style={{
              gridColumn: c + 1,
              gridRow: r + 1,
              background: isAnyFound
                ? 'linear-gradient(135deg, #fef08a, #fbbf24)'
                : 'linear-gradient(135deg, #3a3a3a, #1f2937)',
              border: isAnyFound ? '3px solid #fbbf24' : '2px solid #4b5563',
              borderRadius: 10,
              fontSize: 28,
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
      } else {
        // Walkway-cel — subtle render
        const isStart = c === 2 && r === 6
        cells.push(
          <div key={`w-${c},${r}`} style={{
            gridColumn: c + 1,
            gridRow: r + 1,
            borderRadius: 8,
            background: isStart
              ? 'linear-gradient(135deg, #2a1818, #1a0f0f)'
              : 'linear-gradient(135deg, #1f1515, #14100f)',
            border: isStart ? '1px dashed #7f1d1d' : '1px solid #2a1a1a',
            opacity: 0.6,
          }} />
        )
      }
    }
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
        Team Rocket verstopte <strong>twee schakelaars</strong> onder de 9 vuilbakken. De tweede zit altijd in een
        <strong> aangrenzende bak</strong>. Tik een bak — je loopt ervoor staan en kijkt eronder. Verkeerd? Alles reset.
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

      {/* Grid + sprite — flex-centering voor correcte sprite-positionering */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 12px' }}>
        <div style={{
          '--cell': 'min(58px, 16vw)',
          '--gap': '6px',
          display: 'inline-grid',
          gridTemplateColumns: `repeat(${COLS}, var(--cell))`,
          gridTemplateRows: `repeat(${ROWS}, var(--cell))`,
          gap: 'var(--gap)',
          position: 'relative',
        }}>
          {cells}

          {/* Sprite overlay */}
          <div style={{
            position: 'absolute',
            left: 0, top: 0,
            width: 'var(--cell)', height: 'var(--cell)',
            transform: `translate(calc(${pos.col} * (var(--cell) + var(--gap))), calc(${pos.row} * (var(--cell) + var(--gap))))`,
            transition: `transform ${STEP_MS}ms linear`,
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
          }}>
            <div style={{
              width: '76%', height: '76%',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${teamColor}66 0%, ${teamColor}22 60%, transparent 100%)`,
              border: `2px solid ${teamColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
              boxShadow: `0 0 12px ${teamColor}aa`,
              animation: moving ? 'bokePulse 0.5s ease-in-out infinite' : 'none',
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
