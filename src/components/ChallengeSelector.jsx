import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AUTO_ASSIGN_SECONDS = 45

function buildDefaultResolved(variabelen) {
  const resolved = {}
  for (const v of variabelen || []) {
    if (v.type === 'kwantitatief') {
      resolved[v.naam] = v.default
    } else if (v.type === 'random_lijst' || v.type === 'keuze') {
      const idx = Math.floor(Math.random() * v.opties.length)
      resolved[v.naam] = v.opties[idx]
    }
  }
  return resolved
}

function previewText(template, resolved) {
  if (!template) return ''
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => resolved?.[k] ?? `[${k}]`)
}

// Beschrijving voor de juiste modus, met fallback
function getBeschrijving(challenge, opdrachtType, resolved) {
  const tpl = opdrachtType === 2
    ? challenge.beschrijving_t2t || challenge.beschrijving_solo || challenge.description
    : challenge.beschrijving_solo || challenge.beschrijving_t2t || challenge.description
  return previewText(tpl, resolved)
}

export default function ChallengeSelector({ spawn, opdrachtType, challenges = [], onAssign, onClose }) {
  const [selected, setSelected]     = useState(null)
  const [resolved, setResolved]     = useState({})
  const [drinksLoser, setDrinksLoser] = useState(3)
  const [countdown, setCountdown]   = useState(AUTO_ASSIGN_SECONDS)
  const [autoEnabled, setAutoEnabled] = useState(true)
  const [assigning, setAssigning]   = useState(false)
  const [search, setSearch]         = useState('')
  const [expandedId, setExpandedId] = useState(null) // inline preview per rij

  // Filter op modus + zoek
  const compatible = challenges.filter(c => {
    const ok = opdrachtType === 2 ? [2, 3].includes(c.type) : [1, 3].includes(c.type)
    const nameMatch = c.title.toLowerCase().includes(search.toLowerCase())
    return ok && c.is_enabled && !c.vereist_content && nameMatch
  })

  // Selecteer eerste challenge als startpunt
  useEffect(() => {
    if (compatible.length > 0 && !selected) pickChallenge(compatible[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges.length])

  function pickChallenge(c) {
    setSelected(c)
    setResolved(buildDefaultResolved(c.variabelen))
    setDrinksLoser(c.drinks_loser ?? 3)
  }

  function pickRandom() {
    if (compatible.length === 0) return
    const c = compatible[Math.floor(Math.random() * compatible.length)]
    pickChallenge(c)
    setExpandedId(null)
    setAutoEnabled(false)
  }

  const doAssign = useCallback(async (challengeOverride) => {
    const challenge = challengeOverride || selected
    if (!challenge || assigning) return
    setAssigning(true)
    const resolvedToSave = challengeOverride
      ? buildDefaultResolved(challengeOverride.variabelen)
      : resolved

    await supabase.from('active_spawns').update({
      opdracht_id: challenge.id,
      opdracht_resolved_data: { ...resolvedToSave, drinks_loser: drinksLoser },
      challenge_auto_assigned: !!challengeOverride,
      challenge_assigned_at: new Date().toISOString(),
    }).eq('id', spawn.id)

    if (onAssign) onAssign(challenge, resolvedToSave)
    setAssigning(false)
  }, [selected, resolved, drinksLoser, spawn.id, assigning, onAssign])

  // Countdown tick
  useEffect(() => {
    if (!autoEnabled || countdown <= 0) return
    const t = setTimeout(() => setCountdown(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [autoEnabled, countdown])

  // Auto-assign bij 0
  useEffect(() => {
    if (autoEnabled && countdown === 0 && compatible.length > 0) {
      doAssign(compatible[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  function updateVar(naam, value) {
    setResolved(prev => ({ ...prev, [naam]: value }))
  }
  function randomizeVar(v) {
    updateVar(v.naam, v.opties[Math.floor(Math.random() * v.opties.length)])
  }

  const pokemon = spawn?.pokemon_definitions
  const beschrijvingPreview = selected ? getBeschrijving(selected, opdrachtType, resolved) : ''

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Header ─────────────────────────────────── */}
      <div style={{
        padding: '14px 16px', background: '#1a1a2e',
        borderBottom: '1px solid #333',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>
            ⚡ Opdracht toewijzen
          </div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {pokemon?.sprite_emoji} {pokemon?.name} · {opdrachtType === 2 ? '⚔️ Team vs Team' : '👤 Solo'}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* ── Auto-assign balk ───────────────────────── */}
      {autoEnabled ? (
        <div style={{
          padding: '8px 16px', background: 'rgba(239,68,68,0.15)',
          borderBottom: '2px solid #ef4444',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 900, flexShrink: 0,
          }}>
            {countdown}
          </div>
          <div style={{ flex: 1, fontSize: 12, color: '#fff' }}>
            Auto-assign over <strong>{countdown}s</strong> · {selected?.title || compatible[0]?.title || '—'}
          </div>
          <button onClick={() => { setAutoEnabled(false); setCountdown(AUTO_ASSIGN_SECONDS) }} style={{
            padding: '5px 10px', borderRadius: 7, border: '1px solid #ef4444',
            background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 700,
          }}>
            Stop
          </button>
        </div>
      ) : (
        <div style={{
          padding: '7px 16px', background: '#1e1e1e',
          borderBottom: '1px solid #333',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#888' }}>Auto-assign uitgeschakeld</span>
          <button onClick={() => { setAutoEnabled(true); setCountdown(AUTO_ASSIGN_SECONDS) }} style={{
            padding: '4px 10px', borderRadius: 7, border: '1px solid #555',
            background: 'none', color: '#ccc', fontSize: 12, cursor: 'pointer',
          }}>
            Herstart countdown
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── Zoek + random ──────────────────────────── */}
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="🔍 Zoek opdracht…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid #444', background: '#222',
              color: '#fff', fontSize: 14, outline: 'none',
            }}
          />
          <button onClick={pickRandom} style={{
            padding: '8px 14px', borderRadius: 8,
            background: '#7c3aed', border: 'none', color: '#fff',
            fontSize: 14, cursor: 'pointer', fontWeight: 700, flexShrink: 0,
          }}>
            🎲 Random
          </button>
        </div>

        {/* ── Challenge lijst ─────────────────────────── */}
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {compatible.length === 0 && (
            <p style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Geen opdrachten gevonden.
            </p>
          )}

          {compatible.map(c => {
            const isSelected = selected?.id === c.id
            const isExpanded = expandedId === c.id
            const desc = getBeschrijving(c, opdrachtType, isSelected ? resolved : {})

            return (
              <div key={c.id} style={{
                borderRadius: 10,
                border: `2px solid ${isSelected ? '#7c3aed' : '#333'}`,
                background: isSelected ? 'rgba(124,58,237,0.18)' : '#1e1e1e',
                overflow: 'hidden',
              }}>
                {/* Rij: selecteer + info knop */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {/* Klikbaar deel → selecteren */}
                  <button
                    onClick={() => { pickChallenge(c); setAutoEnabled(false); setExpandedId(null) }}
                    style={{
                      flex: 1, textAlign: 'left', padding: '10px 12px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{c.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
                        {c.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                        {c.categorie}
                        {c.rekwisieten?.length > 0 && (
                          <span> · 📦 {c.rekwisieten.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <span style={{ color: '#7c3aed', fontSize: 18, flexShrink: 0 }}>✓</span>
                    )}
                  </button>

                  {/* ℹ️ Info knop → inline beschrijving tonen */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    style={{
                      padding: '10px 12px', background: 'none', border: 'none',
                      borderLeft: '1px solid #333', cursor: 'pointer',
                      color: isExpanded ? '#7c3aed' : '#666', fontSize: 16, flexShrink: 0,
                    }}
                    title="Toon beschrijving"
                  >
                    ℹ️
                  </button>
                </div>

                {/* Inline beschrijving (uitklap) */}
                {isExpanded && desc && (
                  <div style={{
                    padding: '10px 14px 12px',
                    borderTop: '1px solid #333',
                    background: 'rgba(0,0,0,0.3)',
                  }}>
                    <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                      {opdrachtType === 2 ? '⚔️ Team vs Team' : '👤 Solo'}
                    </div>
                    <p style={{ fontSize: 13, color: '#ddd', lineHeight: 1.6, whiteSpace: 'pre-line', margin: 0 }}>
                      {desc}
                    </p>
                    {c.rekwisieten?.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {c.rekwisieten.map((r, i) => (
                          <span key={i} style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 99,
                            background: 'rgba(201,169,58,0.15)', color: '#c9a93a',
                            border: '1px solid rgba(201,169,58,0.3)',
                          }}>📦 {r}</span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => { pickChallenge(c); setAutoEnabled(false); setExpandedId(null) }}
                      style={{
                        marginTop: 10, padding: '6px 14px', borderRadius: 8,
                        background: '#7c3aed', border: 'none', color: '#fff',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      ✓ Selecteer deze opdracht
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Instellingen voor geselecteerde challenge ── */}
        {selected && (
          <div style={{ padding: '12px 14px 16px' }}>
            <div style={{
              background: '#1a1a2e', borderRadius: 12,
              border: '1px solid #333', padding: '14px',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: '#fff' }}>
                ⚙️ {selected.title}
              </div>

              {/* Beschrijving voor admin — prominent bovenaan */}
              {beschrijvingPreview && (
                <div style={{
                  marginBottom: 14, padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)',
                }}>
                  <div style={{ fontSize: 10, color: '#9c7ae8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                    {opdrachtType === 2 ? '⚔️ Wat spelers zien (T2T)' : '👤 Wat spelers zien (Solo)'}
                  </div>
                  <p style={{ fontSize: 13, color: '#e0e0e0', lineHeight: 1.6, whiteSpace: 'pre-line', margin: 0 }}>
                    {beschrijvingPreview}
                  </p>
                </div>
              )}

              {/* Drankkoppeling */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 5 }}>
                  🍺 Verliezer drinkt
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={0} max={8} value={drinksLoser}
                    onChange={e => setDrinksLoser(+e.target.value)}
                    style={{ flex: 1 }} />
                  <span style={{ fontWeight: 700, minWidth: 65, color: '#f59e0b', textAlign: 'right' }}>
                    {drinksLoser === 0 ? 'Geen' : `${drinksLoser} slokken`}
                  </span>
                </div>
              </div>

              {/* Challenge-specifieke variabelen */}
              {(selected.variabelen || []).map(v => (
                <div key={v.naam} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 5 }}>
                    {v.label}
                  </label>
                  {v.type === 'kwantitatief' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="range" min={v.min} max={v.max}
                        value={resolved[v.naam] ?? v.default}
                        onChange={e => updateVar(v.naam, +e.target.value)}
                        style={{ flex: 1 }} />
                      <span style={{ fontWeight: 700, minWidth: 70, textAlign: 'right', color: '#fff' }}>
                        {resolved[v.naam] ?? v.default} {v.eenheid}
                      </span>
                    </div>
                  ) : (v.type === 'random_lijst' || v.type === 'keuze') ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select
                        value={resolved[v.naam] ?? v.opties[v.default ?? 0]}
                        onChange={e => updateVar(v.naam, e.target.value)}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: 8,
                          border: '1px solid #444', background: '#222',
                          color: '#fff', fontSize: 13,
                        }}
                      >
                        {v.opties.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <button onClick={() => randomizeVar(v)} style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: '#222', border: '1px solid #444',
                        color: '#fff', cursor: 'pointer', fontSize: 16,
                      }} title="Willekeurig">🎲</button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={resolved[v.naam] ?? ''}
                      onChange={e => updateVar(v.naam, e.target.value)}
                      placeholder={v.placeholder || 'Teams bepalen dit zelf op locatie'}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 8,
                        border: '1px solid #444', background: '#222',
                        color: '#fff', fontSize: 13, boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bevestig knop ──────────────────────────── */}
      <div style={{
        padding: '12px 14px 20px', borderTop: '1px solid #333',
        background: '#111', flexShrink: 0,
      }}>
        <button
          style={{
            width: '100%', padding: '16px', fontSize: 16, fontWeight: 800,
            borderRadius: 12, border: 'none', cursor: 'pointer',
            background: !selected || assigning ? '#333' : '#7c3aed',
            color: !selected || assigning ? '#666' : '#fff',
          }}
          onClick={() => doAssign()}
          disabled={!selected || assigning}
        >
          {assigning ? '⏳ Bezig...' : `✅ Wijs toe: ${selected?.title || '—'}`}
        </button>
      </div>
    </div>
  )
}
