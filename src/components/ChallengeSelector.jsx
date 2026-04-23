import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AUTO_ASSIGN_SECONDS = 45

function buildDefaultResolved(variabelen) {
  const resolved = {}
  for (const v of variabelen || []) {
    if (v.type === 'kwantitatief') resolved[v.naam] = v.default
    else if (v.type === 'random_lijst' || v.type === 'keuze') {
      resolved[v.naam] = v.opties[Math.floor(Math.random() * v.opties.length)]
    }
  }
  return resolved
}

function previewText(template, resolved) {
  if (!template) return ''
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => resolved?.[k] ?? `[${k}]`)
}

function getBeschrijving(challenge, opdrachtType, resolved) {
  const tpl = opdrachtType === 2
    ? challenge.beschrijving_t2t || challenge.beschrijving_solo || challenge.description
    : challenge.beschrijving_solo || challenge.beschrijving_t2t || challenge.description
  return previewText(tpl, resolved)
}

// Bereken hoeveel seconden admin al mag wachten, zodat countdown gesynchroniseerd is met spelers
function computeInitialCountdown(spawn, catchWaitSeconds) {
  const t2 = spawn?.catch_team2_arrived_at ? new Date(spawn.catch_team2_arrived_at) : null
  const t1 = spawn?.catch_team1_arrived_at ? new Date(spawn.catch_team1_arrived_at) : null
  let pendingStarted = null
  if (t2) {
    pendingStarted = t2 // T2T: opdracht_pending startte toen team 2 aankwam
  } else if (t1) {
    pendingStarted = new Date(t1.getTime() + catchWaitSeconds * 1000) // Solo: na 90s wachttijd
  }
  if (!pendingStarted) return AUTO_ASSIGN_SECONDS
  const elapsed = Math.floor((Date.now() - pendingStarted.getTime()) / 1000)
  return Math.max(0, AUTO_ASSIGN_SECONDS - elapsed)
}

export default function ChallengeSelector({ spawn, opdrachtType, challenges = [], catchWaitSeconds = 90, onAssign, onClose }) {
  const initialCD = computeInitialCountdown(spawn, catchWaitSeconds)
  const [selected, setSelected]     = useState(null)
  const [resolved, setResolved]     = useState({})
  const [drinksLoser, setDrinksLoser] = useState(3)
  const [countdown, setCountdown]   = useState(initialCD)
  const [autoEnabled, setAutoEnabled] = useState(initialCD > 0)
  const [assigning, setAssigning]   = useState(false)
  const [search, setSearch]         = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [catFilter, setCatFilter]   = useState('alle')

  const CATS = ['alle', 'Fysiek', 'Intellectueel', 'Vaardigheid', 'Sociaal', 'Creatief']
  const CAT_EMOJI = { Fysiek: '💪', Intellectueel: '🧠', Vaardigheid: '🎯', Sociaal: '🤝', Creatief: '🎨' }

  // Filter op modus + categorie + zoek
  const compatible = challenges.filter(c => {
    const ok = opdrachtType === 2 ? [2, 3].includes(c.type) : [1, 3].includes(c.type)
    const cat = catFilter === 'alle' || c.categorie === catFilter
    return ok && c.is_enabled && !c.vereist_content && cat && c.title.toLowerCase().includes(search.toLowerCase())
  })

  // Selecteer eerste challenge als startpunt
  useEffect(() => {
    if (compatible.length > 0 && !selected) pickChallenge(compatible[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges.length])

  function pickChallenge(c) {
    setSelected(c)
    setResolved(buildDefaultResolved(c.variabelen || []))
    setDrinksLoser(c.drinks_loser ?? 3)
    setExpandedId(null)
  }

  function pickRandom() {
    if (!compatible.length) return
    pickChallenge(compatible[Math.floor(Math.random() * compatible.length)])
    setAutoEnabled(false)
  }

  const doAssign = useCallback(async (challengeOverride) => {
    const challenge = challengeOverride || selected
    if (!challenge || assigning) return
    setAssigning(true)
    const resolvedToSave = challengeOverride ? buildDefaultResolved(challengeOverride.variabelen || []) : resolved
    await supabase.from('active_spawns').update({
      opdracht_id: challenge.id,
      opdracht_resolved_data: { ...resolvedToSave, drinks_loser: drinksLoser },
      challenge_auto_assigned: !!challengeOverride,
      challenge_assigned_at: new Date().toISOString(),
    }).eq('id', spawn.id)
    if (onAssign) onAssign(challenge)
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
    if (autoEnabled && countdown === 0 && compatible.length > 0) doAssign(compatible[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  function updateVar(naam, value) { setResolved(prev => ({ ...prev, [naam]: value })) }
  function randomizeVar(v) { updateVar(v.naam, v.opties[Math.floor(Math.random() * v.opties.length)]) }

  const pokemon = spawn?.pokemon_definitions
  const beschrijvingPreview = selected ? getBeschrijving(selected, opdrachtType, resolved) : ''
  // Veilig de variabelen ophalen (altijd array, ook als DB null teruggeeft)
  const variabelen = Array.isArray(selected?.variabelen) ? selected.variabelen : []

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.94)',
      display: 'flex', flexDirection: 'column',
      color: '#fff', // expliciete witte basiskleur voor het hele panel
    }}>

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ padding: '12px 16px', background: '#14142a', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>⚡ Opdracht toewijzen</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
            {pokemon?.sprite_emoji} {pokemon?.name} · {opdrachtType === 2 ? '⚔️ Team vs Team' : '👤 Solo'}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', padding: 4 }}>✕</button>
      </div>

      {/* ── Auto-assign balk ───────────────────────── */}
      <div style={{
        padding: '8px 16px', flexShrink: 0,
        background: autoEnabled && countdown > 0 ? 'rgba(239,68,68,0.14)' : '#1a1a1a',
        borderBottom: '1px solid #333',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {autoEnabled && countdown > 0 ? (
          <>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, flexShrink: 0 }}>
              {countdown}
            </div>
            <div style={{ flex: 1, fontSize: 12, color: '#fff' }}>
              Auto-assign over <strong>{countdown}s</strong> · <span style={{ color: '#aaa' }}>{selected?.title || '—'}</span>
            </div>
            <button onClick={() => setAutoEnabled(false)} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #ef4444', background: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>Stop</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: '#888', flex: 1 }}>
              {countdown === 0 ? '⚠️ Auto-assign timeout bereikt' : 'Auto-assign uitgeschakeld'}
            </span>
            <button onClick={() => { setAutoEnabled(true); setCountdown(computeInitialCountdown(spawn, catchWaitSeconds)) }} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #555', background: 'none', color: '#ccc', fontSize: 12, cursor: 'pointer' }}>
              Herstart
            </button>
          </>
        )}
      </div>

      {/* ── Categorie filter ───────────────────────── */}
      <div style={{ padding: '6px 14px 0', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
        {CATS.map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            padding: '4px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer', fontWeight: 600,
            border: `1px solid ${catFilter === c ? '#7c3aed' : '#2a2a2a'}`,
            background: catFilter === c ? 'rgba(124,58,237,0.25)' : '#1a1a1a',
            color: catFilter === c ? '#c4b0ff' : '#888',
          }}>
            {c === 'alle' ? 'Alle' : `${CAT_EMOJI[c]} ${c}`}
          </button>
        ))}
      </div>

      {/* ── Zoek + Random ──────────────────────────── */}
      <div style={{ padding: '8px 14px 0', display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          type="text" placeholder="🔍 Zoek opdracht…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #444', background: '#222', color: '#fff', fontSize: 14, outline: 'none' }}
        />
        <button onClick={pickRandom} style={{ padding: '8px 14px', borderRadius: 8, background: '#7c3aed', border: 'none', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>
          🎲
        </button>
      </div>

      {/* ── Challenge lijst (max-hoogte, onafhankelijk scrollbaar) ── */}
      <div style={{ maxHeight: '32vh', overflowY: 'auto', padding: '0 14px 8px', flexShrink: 0 }}>
        {compatible.length === 0 && (
          <p style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Geen opdrachten gevonden.</p>
        )}
        {compatible.map(c => {
          const isSel = selected?.id === c.id
          const isExp = expandedId === c.id
          return (
            <div key={c.id} style={{ borderRadius: 10, border: `2px solid ${isSel ? '#7c3aed' : '#2a2a2a'}`, background: isSel ? 'rgba(124,58,237,0.18)' : '#1e1e1e', marginBottom: 5, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button onClick={() => { pickChallenge(c); setAutoEnabled(false) }} style={{ flex: 1, textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{c.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
                      {c.categorie}{c.rekwisieten?.length > 0 ? ` · 📦 ${c.rekwisieten.join(', ')}` : ''}
                    </div>
                  </div>
                  {isSel && <span style={{ color: '#7c3aed', fontSize: 16 }}>✓</span>}
                </button>
                <button onClick={() => setExpandedId(isExp ? null : c.id)} style={{ padding: '9px 12px', background: 'none', border: 'none', borderLeft: '1px solid #2a2a2a', cursor: 'pointer', color: isExp ? '#7c3aed' : '#555', fontSize: 15 }} title="Beschrijving">ℹ️</button>
              </div>
              {isExp && (
                <div style={{ padding: '10px 14px 12px', borderTop: '1px solid #2a2a2a', background: 'rgba(0,0,0,0.25)' }}>
                  <p style={{ fontSize: 12, color: '#ccc', lineHeight: 1.6, whiteSpace: 'pre-line', margin: '0 0 8px' }}>
                    {getBeschrijving(c, opdrachtType, {})}
                  </p>
                  <button onClick={() => { pickChallenge(c); setAutoEnabled(false) }} style={{ padding: '5px 12px', borderRadius: 7, background: '#7c3aed', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    ✓ Selecteer
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Instellingen geselecteerde challenge (altijd zichtbaar) ── */}
      <div style={{ flex: 1, overflowY: 'auto', borderTop: '2px solid #2a2a2a' }}>
        {selected ? (
          <div style={{ padding: '12px 14px' }}>
            {/* Naam + beschrijving */}
            <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 8 }}>
              {selected.emoji} {selected.title}
            </div>

            {/* Beschrijving preview — volledig */}
            {beschrijvingPreview && (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}>
                <div style={{ fontSize: 10, color: '#9c7ae8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                  {opdrachtType === 2 ? '⚔️ Wat spelers zien' : '👤 Wat spelers zien'}
                </div>
                <p style={{ fontSize: 13, color: '#e0e0e0', lineHeight: 1.65, whiteSpace: 'pre-line', margin: 0 }}>
                  {beschrijvingPreview}
                </p>
              </div>
            )}

            {/* Drankkoppeling */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 5 }}>🍺 Verliezer drinkt</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="range" min={0} max={8} value={drinksLoser} onChange={e => setDrinksLoser(+e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontWeight: 700, minWidth: 65, color: '#f59e0b', textAlign: 'right', fontSize: 13 }}>
                  {drinksLoser === 0 ? 'Geen' : `${drinksLoser} slokken`}
                </span>
              </div>
            </div>

            {/* Challenge-specifieke variabelen */}
            {variabelen.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>⚙️ Variabelen</div>
                {variabelen.map(v => (
                  <div key={v.naam} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#ccc', display: 'block', marginBottom: 5 }}>{v.label}</label>
                    {v.type === 'kwantitatief' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="range" min={v.min} max={v.max} value={resolved[v.naam] ?? v.default} onChange={e => updateVar(v.naam, +e.target.value)} style={{ flex: 1 }} />
                        <span style={{ fontWeight: 700, minWidth: 70, textAlign: 'right', color: '#fff', fontSize: 13 }}>
                          {resolved[v.naam] ?? v.default} {v.eenheid}
                        </span>
                      </div>
                    ) : (v.type === 'random_lijst' || v.type === 'keuze') ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select value={resolved[v.naam] ?? v.opties[0]} onChange={e => updateVar(v.naam, e.target.value)}
                          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #444', background: '#222', color: '#fff', fontSize: 12 }}>
                          {v.opties.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                        </select>
                        <button onClick={() => randomizeVar(v)} style={{ padding: '7px 11px', borderRadius: 8, background: '#222', border: '1px solid #444', color: '#fff', cursor: 'pointer', fontSize: 15 }}>🎲</button>
                      </div>
                    ) : (
                      <input type="text" value={resolved[v.naam] ?? ''} onChange={e => updateVar(v.naam, e.target.value)}
                        placeholder={v.placeholder || 'Teams bepalen zelf'}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #444', background: '#222', color: '#fff', fontSize: 12, boxSizing: 'border-box' }} />
                    )}
                  </div>
                ))}
              </div>
            )}
            {variabelen.length === 0 && (
              <p style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>Geen instelbare variabelen voor deze opdracht.</p>
            )}
          </div>
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: '#555', fontSize: 13 }}>
            Selecteer een opdracht hierboven
          </div>
        )}
      </div>

      {/* ── Bevestig knop ──────────────────────────── */}
      <div style={{ padding: '10px 14px 16px', borderTop: '1px solid #2a2a2a', background: '#0d0d0d', flexShrink: 0 }}>
        <button
          style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 800, borderRadius: 12, border: 'none', cursor: selected && !assigning ? 'pointer' : 'default', background: selected && !assigning ? '#7c3aed' : '#2a2a2a', color: selected && !assigning ? '#fff' : '#555' }}
          onClick={() => doAssign()}
          disabled={!selected || assigning}
        >
          {assigning ? '⏳ Bezig...' : `✅ Wijs toe: ${selected?.title || '—'}`}
        </button>
      </div>
    </div>
  )
}
