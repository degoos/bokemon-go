import { useState, useEffect } from 'react'

// Vervangt {{variabele}} placeholders met de resolved waarden
function resolveTemplate(template, resolved) {
  if (!template) return ''
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => resolved?.[key] ?? `[${key}]`)
}

// Formatteert seconden als mm:ss
function formatTime(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

const CAT_COLORS = {
  Fysiek:       { bg: 'rgba(77,171,82,0.15)',  color: '#4dab52' },
  Intellectueel:{ bg: 'rgba(106,176,245,0.15)',color: '#6ab0f5' },
  Vaardigheid:  { bg: 'rgba(192,125,232,0.15)',color: '#c07de8' },
  Sociaal:      { bg: 'rgba(232,164,77,0.15)', color: '#e8a44d' },
  Creatief:     { bg: 'rgba(240,98,146,0.15)', color: '#f06292' },
}

export default function ChallengeCard({ opdracht, resolvedData = {}, opdrachtType, onComplete, onFail }) {
  const [timeLeft, setTimeLeft] = useState(opdracht?.time_limit_seconds ?? null)
  const [timerActive, setTimerActive] = useState(false)

  // Toon ALTIJD de volledige uitleg. t2t-teksten verwijzen vaak
  // naar de solo-regels ("Beide teams spelen parallel. Snelste wint.")
  // dus bij type 2 tonen we de solo-mechanics + de t2t-twist.
  const soloText = resolveTemplate(opdracht?.beschrijving_solo || '', resolvedData)
  const t2tText  = resolveTemplate(opdracht?.beschrijving_t2t  || '', resolvedData)
  const descText = resolveTemplate(opdracht?.description       || '', resolvedData)

  // Bepaal welke blokken we tonen en met welke labels
  const showBoth  = opdrachtType === 2 && soloText && t2tText
  const mainText  = opdrachtType === 2
    ? (t2tText || soloText || descText)
    : (soloText || t2tText || descText)
  const extraText = showBoth ? soloText : null
  const extraLabel = '📖 Basis-spelregels'
  const mainLabel  = opdrachtType === 2 ? '⚔️ Team vs Team variant' : null

  const rekwisieten = opdracht?.rekwisieten || []
  const variabelen  = opdracht?.variabelen  || []
  const catStyle = CAT_COLORS[opdracht?.categorie] || CAT_COLORS.Fysiek

  // Start timer bij mount
  useEffect(() => {
    if (!opdracht?.time_limit_seconds) return
    setTimerActive(true)
  }, [opdracht?.time_limit_seconds])

  // Countdown
  useEffect(() => {
    if (!timerActive || timeLeft === null || timeLeft <= 0) return
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [timerActive, timeLeft])

  const timerExpired = timeLeft !== null && timeLeft <= 0
  const timerWarning = timeLeft !== null && timeLeft <= 15 && timeLeft > 0

  if (!opdracht) return null

  return (
    <div>
      {/* Opdracht header */}
      <div style={{
        textAlign: 'center',
        padding: '20px 16px 12px',
        background: opdrachtType === 2
          ? 'rgba(245,158,11,0.12)'
          : 'rgba(124,58,237,0.12)',
        borderBottom: `2px solid ${opdrachtType === 2 ? 'var(--warning)' : 'var(--accent)'}`,
        marginBottom: 0,
      }}>
        <div style={{ fontSize: 40, marginBottom: 6 }}>{opdracht.emoji || '🎯'}</div>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4, color: 'var(--text)' }}>{opdracht.title}</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 99,
            background: catStyle.bg, color: catStyle.color, fontWeight: 600,
          }}>
            {opdracht.categorie}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 99,
            background: opdrachtType === 2 ? 'rgba(245,158,11,0.2)' : 'rgba(124,58,237,0.2)',
            color: opdrachtType === 2 ? 'var(--warning)' : 'var(--accent)', fontWeight: 600,
          }}>
            {opdrachtType === 2 ? '⚔️ Team vs Team' : '👤 Solo'}
          </span>
        </div>
      </div>

      {/* Timer */}
      {timeLeft !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 16px',
          background: timerExpired ? 'rgba(239,68,68,0.15)'
            : timerWarning ? 'rgba(245,158,11,0.15)'
            : 'var(--bg3)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 14 }}>⏱</span>
          <span style={{
            fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
            color: timerExpired ? 'var(--danger)'
              : timerWarning ? 'var(--warning)'
              : 'var(--text)',
          }}>
            {timerExpired ? 'Tijd!' : formatTime(timeLeft)}
          </span>
          {!timerActive && (
            <button
              onClick={() => setTimerActive(true)}
              style={{
                marginLeft: 8, padding: '4px 10px', borderRadius: 8,
                background: 'var(--accent)', border: 'none', color: '#fff',
                fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}
            >
              ▶ Start
            </button>
          )}
        </div>
      )}

      {/* Beschrijving */}
      <div className="card" style={{ margin: '12px 16px', textAlign: 'left' }}>
        {/* Bij type 2 eerst de basis-spelregels (solo-versie) */}
        {extraText && (
          <>
            <div style={{
              fontSize: 11, color: 'var(--text2)', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
            }}>
              {extraLabel}
            </div>
            <p style={{
              color: 'var(--text)', lineHeight: 1.65, fontSize: 15,
              whiteSpace: 'pre-line', marginBottom: 14,
            }}>
              {extraText}
            </p>
            <div style={{
              height: 1, background: 'var(--border)',
              margin: '12px -16px 14px',
            }} />
          </>
        )}

        {/* Hoofd-beschrijving (t2t-twist bij type 2, of volledige solo-regels bij type 1) */}
        {mainLabel && (
          <div style={{
            fontSize: 11, color: 'var(--warning)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700,
          }}>
            {mainLabel}
          </div>
        )}
        <p style={{
          color: 'var(--text)', lineHeight: 1.65, fontSize: 15,
          whiteSpace: 'pre-line',
        }}>
          {mainText || 'Beschrijving volgt...'}
        </p>

        {/* Ingestelde waarden (variabelen) — zodat spelers exact weten welke getallen gelden */}
        {variabelen.length > 0 && Object.keys(resolvedData).length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Instellingen
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {variabelen.map((v, i) => {
                const val = resolvedData?.[v.naam]
                if (val === undefined || val === null) return null
                const eenheid = v.eenheid ? ` ${v.eenheid}` : ''
                return (
                  <span key={i} style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 99,
                    background: 'rgba(124,58,237,0.15)', color: '#c4b5fd',
                    border: '1px solid rgba(124,58,237,0.3)', fontWeight: 500,
                  }}>
                    {v.label || v.naam}: <strong>{String(val)}{eenheid}</strong>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Rekwisieten */}
        {rekwisieten.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Rekwisieten
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {rekwisieten.map((r, i) => (
                <span key={i} style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 99,
                  background: 'rgba(201,169,58,0.15)', color: '#c9a93a',
                  border: '1px solid rgba(201,169,58,0.3)', fontWeight: 500,
                }}>
                  📦 {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Drankkoppeling */}
        {opdracht.drinks_loser > 0 && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 10,
            background: 'rgba(245,158,11,0.12)', borderLeft: '3px solid var(--warning)',
            fontSize: 14, color: 'var(--warning)', fontWeight: 600,
          }}>
            🍺 Verliezer / niet geslaagd: {opdracht.drinks_loser} slokken
          </div>
        )}
      </div>

      {/* Actie-knoppen */}
      <div style={{ padding: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          className="btn btn-success"
          onClick={onComplete}
          style={{ padding: '16px', fontSize: 16 }}
        >
          ✅ Opdracht Voltooid — Wij Winnen!
        </button>
        <button
          className="btn btn-ghost"
          onClick={onFail}
          style={{ padding: '14px' }}
        >
          ❌ Opdracht Mislukt
        </button>
      </div>
    </div>
  )
}
