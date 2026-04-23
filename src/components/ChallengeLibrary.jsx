import { useState } from 'react'
import { supabase } from '../lib/supabase'

const CAT_COLORS = {
  Fysiek:        { bg: 'rgba(77,171,82,0.15)',  color: '#4dab52',  border: 'rgba(77,171,82,0.3)' },
  Intellectueel: { bg: 'rgba(106,176,245,0.15)',color: '#6ab0f5',  border: 'rgba(106,176,245,0.3)' },
  Vaardigheid:   { bg: 'rgba(192,125,232,0.15)',color: '#c07de8',  border: 'rgba(192,125,232,0.3)' },
  Sociaal:       { bg: 'rgba(232,164,77,0.15)', color: '#e8a44d',  border: 'rgba(232,164,77,0.3)' },
  Creatief:      { bg: 'rgba(240,98,146,0.15)', color: '#f06292',  border: 'rgba(240,98,146,0.3)' },
}

function typeLabel(t) {
  return t === 1 ? '👤 Solo' : t === 2 ? '⚔️ T2T' : '🔄 Beide'
}

export default function ChallengeLibrary({ challenges, onUpdated }) {
  const [expanded, setExpanded]   = useState(null)
  const [filter, setFilter]       = useState('alle') // alle | 1 | 2 | 3 | enabled | disabled
  const [catFilter, setCatFilter] = useState('alle')
  const [editId, setEditId]       = useState(null)
  const [editData, setEditData]   = useState({})
  const [saving, setSaving]       = useState(false)

  const cats = ['alle', 'Fysiek', 'Intellectueel', 'Vaardigheid', 'Sociaal', 'Creatief']
  const modusFilters = [
    { key: 'alle', label: 'Alle' },
    { key: '1',    label: '👤 Solo' },
    { key: '2',    label: '⚔️ T2T' },
    { key: '3',    label: '🔄 Beide' },
    { key: 'enabled',  label: '✅ Actief' },
    { key: 'disabled', label: '⛔ Inactief' },
  ]

  const visible = challenges.filter(c => {
    if (filter === 'enabled'  && !c.is_enabled) return false
    if (filter === 'disabled' && c.is_enabled)  return false
    if (['1','2','3'].includes(filter) && String(c.type) !== filter) return false
    if (catFilter !== 'alle' && c.categorie !== catFilter) return false
    return true
  })

  async function toggleEnabled(c) {
    await supabase.from('opdracht_definitions')
      .update({ is_enabled: !c.is_enabled })
      .eq('id', c.id)
    if (onUpdated) onUpdated()
  }

  function startEdit(c) {
    setEditId(c.id)
    setEditData({
      title:            c.title,
      emoji:            c.emoji,
      drinks_loser:     c.drinks_loser,
      time_limit_seconds: c.time_limit_seconds,
      beschrijving_solo: c.beschrijving_solo || '',
      beschrijving_t2t:  c.beschrijving_t2t  || '',
    })
  }

  async function saveEdit(id) {
    setSaving(true)
    await supabase.from('opdracht_definitions').update(editData).eq('id', id)
    setEditId(null)
    setSaving(false)
    if (onUpdated) onUpdated()
  }

  const enabledCount  = challenges.filter(c => c.is_enabled).length
  const disabledCount = challenges.length - enabledCount

  return (
    <div>
      {/* Samenvatting */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
      }}>
        {[
          { label: 'Totaal',   val: challenges.length, color: 'var(--text)' },
          { label: 'Actief',   val: enabledCount,      color: 'var(--success)' },
          { label: 'Inactief', val: disabledCount,     color: 'var(--text2)' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, minWidth: 80, padding: '10px 14px', borderRadius: 10,
            background: 'var(--bg3)', border: '1px solid var(--border)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Modus filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {modusFilters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
            background: filter === f.key ? 'var(--accent)' : 'var(--bg3)',
            color: filter === f.key ? '#fff' : 'var(--text2)', fontWeight: 600,
          }}>{f.label}</button>
        ))}
      </div>

      {/* Categorie filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {cats.map(c => {
          const cs = CAT_COLORS[c]
          const active = catFilter === c
          return (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              padding: '4px 11px', borderRadius: 99, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${active && cs ? cs.border : 'var(--border)'}`,
              background: active && cs ? cs.bg : 'var(--bg3)',
              color: active && cs ? cs.color : 'var(--text2)', fontWeight: 600,
            }}>{c === 'alle' ? 'Alle categorieën' : c}</button>
          )
        })}
      </div>

      {/* Challenge lijst */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(c => {
          const cs = CAT_COLORS[c.categorie] || CAT_COLORS.Fysiek
          const isExpanded = expanded === c.id
          const isEditing  = editId === c.id

          return (
            <div key={c.id} style={{
              borderRadius: 12,
              border: `1px solid ${c.is_enabled ? 'var(--border)' : 'rgba(100,100,100,0.3)'}`,
              background: c.is_enabled ? 'var(--bg3)' : 'rgba(30,30,30,0.5)',
              opacity: c.is_enabled ? 1 : 0.6,
              overflow: 'hidden',
            }}>
              {/* Card header */}
              <div
                onClick={() => setExpanded(isExpanded ? null : c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 24, flexShrink: 0 }}>{c.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, padding: '1px 8px', borderRadius: 99,
                      background: cs.bg, color: cs.color, border: `1px solid ${cs.border}`, fontWeight: 600,
                    }}>{c.categorie}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 8px', borderRadius: 99,
                      background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)',
                    }}>{typeLabel(c.type)}</span>
                    {c.rekwisieten?.length > 0 && (
                      <span style={{
                        fontSize: 10, padding: '1px 8px', borderRadius: 99,
                        background: 'rgba(201,169,58,0.1)', color: '#c9a93a',
                        border: '1px solid rgba(201,169,58,0.25)',
                      }}>📦 {c.rekwisieten.join(', ')}</span>
                    )}
                    {c.vereist_content && (
                      <span style={{
                        fontSize: 10, padding: '1px 8px', borderRadius: 99,
                        background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
                        border: '1px solid rgba(239,68,68,0.25)',
                      }}>⚠️ Content vereist</span>
                    )}
                  </div>
                </div>

                {/* Toggle enable */}
                <button
                  onClick={e => { e.stopPropagation(); toggleEnabled(c) }}
                  style={{
                    padding: '5px 10px', borderRadius: 8, fontSize: 12,
                    border: `1px solid ${c.is_enabled ? 'var(--success)' : 'var(--border)'}`,
                    background: c.is_enabled ? 'rgba(34,197,94,0.15)' : 'var(--bg2)',
                    color: c.is_enabled ? 'var(--success)' : 'var(--text2)',
                    cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                  }}
                >
                  {c.is_enabled ? '✅' : '⛔'}
                </button>

                <span style={{
                  color: 'var(--text2)', fontSize: 13,
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s', flexShrink: 0,
                }}>▼</span>
              </div>

              {/* Uitklap */}
              {isExpanded && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>

                  {isEditing ? (
                    /* Edit formulier */
                    <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={editData.emoji} onChange={e => setEditData(d => ({...d, emoji: e.target.value}))}
                          style={{...inputStyle, width: 60, textAlign: 'center', fontSize: 20}} placeholder="🎯" />
                        <input value={editData.title} onChange={e => setEditData(d => ({...d, title: e.target.value}))}
                          style={{...inputStyle, flex: 1}} placeholder="Naam" />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{...labelStyle}}>🍺 Slokken verliezer</div>
                          <input type="number" min={0} max={10} value={editData.drinks_loser}
                            onChange={e => setEditData(d => ({...d, drinks_loser: +e.target.value}))}
                            style={{...inputStyle, width: '100%'}} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{...labelStyle}}>⏱ Tijdslimiet (sec)</div>
                          <input type="number" min={30} max={600} value={editData.time_limit_seconds}
                            onChange={e => setEditData(d => ({...d, time_limit_seconds: +e.target.value}))}
                            style={{...inputStyle, width: '100%'}} />
                        </div>
                      </div>
                      {c.type !== 2 && (
                        <>
                          <div style={{...labelStyle}}>👤 Beschrijving solo</div>
                          <textarea value={editData.beschrijving_solo}
                            onChange={e => setEditData(d => ({...d, beschrijving_solo: e.target.value}))}
                            rows={4} style={{...inputStyle, width: '100%', resize: 'vertical'}} />
                        </>
                      )}
                      {c.type !== 1 && (
                        <>
                          <div style={{...labelStyle}}>⚔️ Beschrijving T2T</div>
                          <textarea value={editData.beschrijving_t2t}
                            onChange={e => setEditData(d => ({...d, beschrijving_t2t: e.target.value}))}
                            rows={4} style={{...inputStyle, width: '100%', resize: 'vertical'}} />
                        </>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(c.id)} disabled={saving}
                          style={{...btnStyle, background: 'var(--success)', color: '#fff', flex: 1}}>
                          {saving ? '⏳' : '💾 Opslaan'}
                        </button>
                        <button onClick={() => setEditId(null)}
                          style={{...btnStyle, background: 'var(--bg2)', color: 'var(--text2)'}}>
                          Annuleer
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Leesmodus */
                    <div style={{ paddingTop: 10 }}>
                      {/* Solo beschrijving */}
                      {c.beschrijving_solo && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>👤 Solo / Parallel</div>
                          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-line', margin: 0 }}>
                            {c.beschrijving_solo}
                          </p>
                        </div>
                      )}
                      {/* T2T beschrijving */}
                      {c.beschrijving_t2t && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>⚔️ Team vs Team</div>
                          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-line', margin: 0 }}>
                            {c.beschrijving_t2t}
                          </p>
                        </div>
                      )}

                      {/* Variabelen */}
                      {c.variabelen?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Variabelen</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {c.variabelen.map(v => (
                              <div key={v.naam} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '5px 10px', background: 'var(--bg2)', borderRadius: 6, fontSize: 12,
                              }}>
                                <span style={{ color: 'var(--text2)' }}>{v.label}</span>
                                <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                                  {v.type === 'kwantitatief'
                                    ? `${v.default} ${v.eenheid} (${v.min}–${v.max})`
                                    : v.type === 'random_lijst' || v.type === 'keuze'
                                    ? `🎲 ${v.opties.length} opties`
                                    : 'Vrij in te vullen'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                          ⏱ {c.time_limit_seconds}s · 🍺 {c.drinks_loser} slokken
                          {!c.auto_assignable && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>· Geen auto-assign</span>}
                        </div>
                        <button onClick={() => startEdit(c)} style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 12,
                          border: '1px solid var(--border)', background: 'var(--bg2)',
                          color: 'var(--text2)', cursor: 'pointer',
                        }}>
                          ✏️ Bewerk
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const inputStyle = {
  padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg2)',
  color: 'var(--text)', fontSize: 14, outline: 'none',
  boxSizing: 'border-box',
}
const labelStyle = { fontSize: 11, color: 'var(--text2)', marginBottom: 4 }
const btnStyle = {
  padding: '8px 14px', borderRadius: 8, border: 'none',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
