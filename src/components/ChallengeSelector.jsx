import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AUTO_ASSIGN_SECONDS = 45

// Zet variabelendefault-waarden als startpunt
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

// Vervangt {{var}} in de preview-tekst
function previewText(template, resolved) {
  if (!template) return ''
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => resolved?.[k] ?? `[${k}]`)
}

export default function ChallengeSelector({ spawn, opdrachtType, challenges = [], onAssign, onClose }) {
  const [selected, setSelected] = useState(null)
  const [resolved, setResolved]   = useState({})
  const [drinksLoser, setDrinksLoser] = useState(3)
  const [countdown, setCountdown] = useState(AUTO_ASSIGN_SECONDS)
  const [autoEnabled, setAutoEnabled] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [search, setSearch] = useState('')

  // Filter: type 1 spawns → type IN (1,3) | type 2 spawns → type IN (2,3)
  const compatible = challenges.filter(c => {
    const ok = opdrachtType === 2 ? [2, 3].includes(c.type) : [1, 3].includes(c.type)
    const nameMatch = c.title.toLowerCase().includes(search.toLowerCase())
    return ok && c.is_enabled && !c.vereist_content && nameMatch
  })

  // Selecteer eerste challenge als startpunt
  useEffect(() => {
    if (compatible.length > 0 && !selected) {
      pickChallenge(compatible[0])
    }
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

  // Auto-assign countdown
  useEffect(() => {
    if (!autoEnabled || countdown <= 0) return
    if (countdown === 0) {
      const fallback = compatible[0]
      if (fallback) doAssign(fallback)
      return
    }
    const t = setTimeout(() => setCountdown(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [autoEnabled, countdown, doAssign, compatible])

  // Als countdown 0 bereikt, auto-assign
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
    const idx = Math.floor(Math.random() * v.opties.length)
    updateVar(v.naam, v.opties[idx])
  }

  const pokemon = spawn?.pokemon_definitions

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            ⚡ Opdracht toewijzen
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            {pokemon?.sprite_emoji} {pokemon?.name} · {opdrachtType === 2 ? '⚔️ Team vs Team' : '👤 Solo'}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer',
        }}>✕</button>
      </div>

      {/* Auto-assign balk */}
      {autoEnabled ? (
        <div style={{
          padding: '10px 16px', background: 'rgba(239,68,68,0.12)',
          borderBottom: '2px solid var(--danger)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--danger)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 900, flexShrink: 0,
          }}>
            {countdown}
          </div>
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: 'var(--danger)' }}>Auto-assign over {countdown}s</div>
            <div style={{ color: 'var(--text2)', fontSize: 12 }}>
              Huidige selectie: {selected?.title || compatible[0]?.title || '—'}
            </div>
          </div>
          <button onClick={() => { setAutoEnabled(false); setCountdown(AUTO_ASSIGN_SECONDS) }} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--danger)',
            background: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}>
            Annuleer
          </button>
        </div>
      ) : (
        <div style={{
          padding: '8px 16px', background: 'var(--bg3)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Auto-assign uitgeschakeld</span>
          <button onClick={() => { setAutoEnabled(true); setCountdown(AUTO_ASSIGN_SECONDS) }} style={{
            padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'none', color: 'var(--text2)', fontSize: 12, cursor: 'pointer',
          }}>
            Herstart countdown
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Zoek + random */}
        <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="🔍 Zoek opdracht…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg3)',
              color: 'var(--text)', fontSize: 14, outline: 'none',
            }}
          />
          <button onClick={pickRandom} style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'var(--accent)', border: 'none', color: '#fff',
            fontSize: 14, cursor: 'pointer', fontWeight: 700, flexShrink: 0,
          }}>
            🎲 Random
          </button>
        </div>

        {/* Challenge lijst */}
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {compatible.length === 0 && (
            <p style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              Geen compatibele opdrachten gevonden.
            </p>
          )}
          {compatible.map(c => (
            <button
              key={c.id}
              onClick={() => { pickChallenge(c); setAutoEnabled(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                borderRadius: 10,
                border: `2px solid ${selected?.id === c.id ? 'var(--accent)' : 'var(--border)'}`,
                background: selected?.id === c.id ? 'rgba(124,58,237,0.12)' : 'var(--bg3)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{c.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  {c.categorie}
                  {c.rekwisieten?.length > 0 && ` · 📦 ${c.rekwisieten.join(', ')}`}
                </div>
              </div>
              {selected?.id === c.id && (
                <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Variabelen instellen */}
        {selected && (selected.variabelen?.length > 0 || true) && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{
              background: 'var(--bg3)', borderRadius: 12,
              border: '1px solid var(--border)', padding: '14px',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
                ⚙️ Instellingen — {selected.title}
              </div>

              {/* Drankkoppeling — altijd */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
                  🍺 Verliezer drinkt
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="range" min={0} max={8} value={drinksLoser}
                    onChange={e => setDrinksLoser(+e.target.value)}
                    style={{ flex: 1 }} />
                  <span style={{ fontWeight: 700, minWidth: 60, color: 'var(--warning)' }}>
                    {drinksLoser === 0 ? 'Geen' : `${drinksLoser} slokken`}
                  </span>
                </div>
              </div>

              {/* Challenge-specifieke variabelen */}
              {(selected.variabelen || []).map(v => (
                <div key={v.naam} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>
                    {v.label}
                  </label>

                  {v.type === 'kwantitatief' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="range" min={v.min} max={v.max} value={resolved[v.naam] ?? v.default}
                        onChange={e => updateVar(v.naam, +e.target.value)}
                        style={{ flex: 1 }} />
                      <span style={{ fontWeight: 700, minWidth: 70, textAlign: 'right' }}>
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
                          border: '1px solid var(--border)', background: 'var(--bg2)',
                          color: 'var(--text)', fontSize: 13,
                        }}
                      >
                        {v.opties.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <button onClick={() => randomizeVar(v)} style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: 'var(--bg2)', border: '1px solid var(--border)',
                        color: 'var(--text)', cursor: 'pointer', fontSize: 16,
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
                        border: '1px solid var(--border)', background: 'var(--bg2)',
                        color: 'var(--text)', fontSize: 13,
                      }}
                    />
                  )}
                </div>
              ))}

              {/* Preview beschrijving */}
              <div style={{
                marginTop: 4, padding: '10px 12px', borderRadius: 8,
                background: 'var(--bg2)', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Preview voor spelers
                </div>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-line', margin: 0 }}>
                  {previewText(
                    opdrachtType === 2
                      ? selected.beschrijving_t2t || selected.description
                      : selected.beschrijving_solo || selected.description,
                    resolved
                  ) || '(geen tekst beschikbaar)'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bevestig knop */}
      <div style={{
        padding: '12px 16px 20px', borderTop: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0,
      }}>
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '16px', fontSize: 16 }}
          onClick={() => doAssign()}
          disabled={!selected || assigning}
        >
          {assigning ? '⏳ Bezig...' : `✅ Wijs toe: ${selected?.title || '—'}`}
        </button>
      </div>
    </div>
  )
}
