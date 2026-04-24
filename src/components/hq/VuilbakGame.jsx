import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// VuilbakGame — Kamer 1 (Ingang)
//
// Geïnspireerd op Vermilion City Gym: een raster van 15 vuilbakken
// met 2 verborgen schakelaars. De tweede zit altijd H/V aangrenzend
// aan de eerste. Verkeerd? Alles reset + nieuwe random locaties.
// ─────────────────────────────────────────────────────────────

const COLS = 3
const ROWS = 5
const TOTAL = COLS * ROWS

function randomSwitches() {
  const first = Math.floor(Math.random() * TOTAL)
  const fx = first % COLS
  const fy = Math.floor(first / COLS)
  const neighbors = []
  if (fx > 0)       neighbors.push(first - 1)      // links
  if (fx < COLS-1)  neighbors.push(first + 1)      // rechts
  if (fy > 0)       neighbors.push(first - COLS)   // onder
  if (fy < ROWS-1)  neighbors.push(first + COLS)   // boven
  const second = neighbors[Math.floor(Math.random() * neighbors.length)]
  return [first, second]
}

export default function VuilbakGame({ onComplete, onAbort }) {
  const [switches, setSwitches] = useState(randomSwitches)
  const [foundOne, setFoundOne] = useState(false)     // eerste schakelaar gevonden
  const [foundTwo, setFoundTwo] = useState(false)     // tweede schakelaar gevonden
  const [wrongIdx, setWrongIdx] = useState(null)      // shake animatie op deze bak
  const [message, setMessage] = useState(null)
  const [tries, setTries] = useState(0)
  const [resets, setResets] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  const completedRef = useRef(false)

  const [switch1, switch2] = switches

  // Klok-ticker
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
    return () => clearInterval(iv)
  }, [])

  // Foute-bak shake timer
  useEffect(() => {
    if (wrongIdx === null) return
    const t = setTimeout(() => setWrongIdx(null), 450)
    return () => clearTimeout(t)
  }, [wrongIdx])

  function handleClick(idx) {
    if (foundTwo || completedRef.current) return
    setTries(t => t + 1)

    // Eerste schakelaar gevonden?
    if (!foundOne && idx === switch1) {
      setFoundOne(true)
      setMessage({ kind: 'ok', text: '⚡ Schakelaar gevonden! Nu de tweede — hij zit er vlak naast.' })
      return
    }

    // Tweede schakelaar gevonden (terwijl eerste al gevonden)?
    if (foundOne && !foundTwo && idx === switch2) {
      setFoundTwo(true)
      setMessage({ kind: 'ok', text: '💡 Beide schakelaars gevonden! De deur gaat open...' })
      completedRef.current = true
      setTimeout(() => { if (onComplete) onComplete() }, 1800)
      return
    }

    // Fout — regenereer posities en reset progressie
    setWrongIdx(idx)
    setMessage({ kind: 'err', text: '🗑️ Hier zit alleen afval... De bakken sluiten zich opnieuw!' })
    setFoundOne(false)
    setFoundTwo(false)
    setResets(r => r + 1)
    setTimeout(() => setSwitches(randomSwitches()), 450)
  }

  const found = (foundOne ? 1 : 0) + (foundTwo ? 1 : 0)

  return (
    <div className="screen" style={{ background: '#1a0f0f' }}>
      <div className="topbar" style={{ background: '#2d0f1a', borderBottom: '1px solid #7f1d1d' }}>
        <button onClick={onAbort} style={{ background: 'none', border: 'none', color: '#fca5a5', fontSize: 22 }}>✕</button>
        <h3 style={{ color: '#fca5a5' }}>🗑️ Kamer 1 — De Ingang</h3>
        <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 700 }}>⏱ {elapsed}s</div>
      </div>

      {/* Story + hint */}
      <div style={{
        margin: '14px 16px 8px', padding: '12px 14px',
        background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 10,
        fontSize: 13, color: '#fca5a5', lineHeight: 1.5,
      }}>
        Team Rocket verstopte <strong>twee schakelaars</strong> onder de vuilbakken. De tweede zit altijd
        <strong> horizontaal of verticaal aangrenzend</strong> aan de eerste. Kies een verkeerde? Alles reset.
      </div>

      {/* Status-balk */}
      <div style={{
        display: 'flex', gap: 12, margin: '0 16px 12px', padding: '10px 14px',
        background: '#2d0f1a', borderRadius: 10, border: '1px solid #7f1d1d',
        alignItems: 'center', fontSize: 13, fontWeight: 700,
      }}>
        <span style={{ color: '#fbbf24' }}>{found}/2 gevonden</span>
        <span style={{ marginLeft: 'auto', color: '#fca5a5' }}>Pogingen: {tries}</span>
        <span style={{ color: '#fca5a5' }}>· Resets: {resets}</span>
      </div>

      {/* Message */}
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

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gap: 10, padding: '0 16px',
        maxWidth: 380, margin: '0 auto', width: '100%',
      }}>
        {Array.from({ length: TOTAL }).map((_, idx) => {
          const isFirstFound = foundOne && idx === switch1
          const isSecondFound = foundTwo && idx === switch2
          const isAnyFound = isFirstFound || isSecondFound
          const isShaking = wrongIdx === idx
          return (
            <button
              key={idx}
              onClick={() => handleClick(idx)}
              disabled={foundTwo}
              style={{
                aspectRatio: '1/1',
                background: isAnyFound
                  ? 'linear-gradient(135deg, #fef08a, #fbbf24)'
                  : 'linear-gradient(135deg, #3a3a3a, #1f2937)',
                border: isAnyFound ? '3px solid #fbbf24' : '2px solid #4b5563',
                borderRadius: 12,
                fontSize: 38,
                cursor: foundTwo ? 'default' : 'pointer',
                padding: 0,
                transition: 'background 0.2s, border 0.2s',
                boxShadow: isAnyFound ? '0 0 14px rgba(251, 191, 36, 0.6)' : 'inset 0 -3px 6px rgba(0,0,0,0.5)',
                animation: isShaking ? 'battleShake 0.4s ease-in-out' : 'none',
                color: 'white',
              }}
            >
              {isAnyFound ? '⚡' : '🗑️'}
            </button>
          )
        })}
      </div>

      {/* Success state */}
      {foundTwo && (
        <div style={{
          textAlign: 'center', padding: '24px 16px', marginTop: 16,
          fontSize: 22, fontWeight: 800, color: '#fbbf24',
          animation: 'bokePulse 0.8s ease-in-out infinite',
        }}>
          💡 De lichten gaan aan!
        </div>
      )}

      {/* Abort / reset-bevestiging */}
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
