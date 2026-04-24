import { useState } from 'react'
import { supabase } from '../lib/supabase'

const CAT_COLORS = {
  Fysiek:        { bg: 'rgba(77,171,82,0.15)',  color: '#4dab52',  border: 'rgba(77,171,82,0.3)' },
  Intellectueel: { bg: 'rgba(106,176,245,0.15)',color: '#6ab0f5',  border: 'rgba(106,176,245,0.3)' },
  Vaardigheid:   { bg: 'rgba(192,125,232,0.15)',color: '#c07de8',  border: 'rgba(192,125,232,0.3)' },
  Sociaal:       { bg: 'rgba(232,164,77,0.15)', color: '#e8a44d',  border: 'rgba(232,164,77,0.3)' },
  Creatief:      { bg: 'rgba(240,98,146,0.15)', color: '#f06292',  border: 'rgba(240,98,146,0.3)' },
}

const EMPTY_NEW = {
  title: '',
  emoji: '🎯',
  type: 1,
  categorie: 'Fysiek',
  beschrijving_solo: '',
  beschrijving_t2t: '',
  drinks_loser: 2,
  time_limit_seconds: 120,
  rekwisieten: '',
  auto_assignable: true,
  is_enabled: true,
  master_ball_reward: false,
  item_reward_key: '',
}

// Items die als reward via een challenge uitgekeerd kunnen worden
export const ITEM_REWARDS = [
  { key: '',            label: '— geen item-reward —' },
  { key: 'master_ball', label: '🏆 Master Ball (één per spel)' },
  { key: 'silph_scope', label: '🔭 Silph Scope' },
  { key: 'protect',     label: '🛡️ Protect' },
  { key: 'double_team', label: '🎭 Double Team' },
  { key: 'snatch',      label: '🧲 Snatch' },
  { key: 'mirror_coat', label: '🪞 Mirror Coat' },
  { key: 'pickup',      label: '🎲 Pickup (3 random)' },
  { key: 'poke_lure',   label: '🎣 Poké Lure' },
  { key: 'moon_stone',  label: '🌙 Moon Stone' },
  { key: 'pokemon_egg', label: '🥚 Bokémon Egg' },
]

function typeLabel(t) {
  return t === 1 ? '👤 Solo' : t === 2 ? '⚔️ T2T' : '🔄 Beide'
}

export default function ChallengeLibrary({ challenges, onUpdated, executionStats = {} }) {
  const [expanded, setExpanded]   = useState(null)
  const [filter, setFilter]       = useState('alle') // alle | 1 | 2 | 3 | enabled | disabled
  const [catFilter, setCatFilter] = useState('alle')
  const [editId, setEditId]       = useState(null)
  const [editData, setEditData]   = useState({})
  const [saving, setSaving]       = useState(false)
  const [creating, setCreating]   = useState(false)
  const [newData, setNewData]     = useState(EMPTY_NEW)
  const [createError, setCreateError] = useState(null)

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
      categorie:        c.categorie,
      type:             c.type,
      drinks_loser:     c.drinks_loser,
      time_limit_seconds: c.time_limit_seconds,
      beschrijving_solo: c.beschrijving_solo || '',
      beschrijving_t2t:  c.beschrijving_t2t  || '',
      rekwisieten:      (c.rekwisieten || []).join(', '),
      auto_assignable:  c.auto_assignable !== false,
      master_ball_reward: !!c.master_ball_reward,
      item_reward_key:    c.item_reward_key || '',
    })
  }

  async function saveEdit(id) {
    setSaving(true)
    const payload = {
      ...editData,
      rekwisieten: typeof editData.rekwisieten === 'string'
        ? editData.rekwisieten.split(',').map(s => s.trim()).filter(Boolean)
        : editData.rekwisieten,
    }
    await supabase.from('opdracht_definitions').update(payload).eq('id', id)
    setEditId(null)
    setSaving(false)
    if (onUpdated) onUpdated()
  }

  async function createNew() {
    setCreateError(null)
    if (!newData.title?.trim()) {
      setCreateError('Geef een titel op')
      return
    }
    if (newData.type !== 2 && !newData.beschrijving_solo?.trim()) {
      setCreateError('Solo-beschrijving is verplicht voor Solo / Beide')
      return
    }
    if (newData.type !== 1 && !newData.beschrijving_t2t?.trim()) {
      setCreateError('T2T-beschrijving is verplicht voor T2T / Beide')
      return
    }

    setSaving(true)
    const payload = {
      title: newData.title.trim(),
      emoji: newData.emoji || '🎯',
      type: +newData.type,
      categorie: newData.categorie,
      beschrijving_solo: newData.beschrijving_solo || null,
      beschrijving_t2t:  newData.beschrijving_t2t  || null,
      drinks_loser: +newData.drinks_loser || 0,
      time_limit_seconds: +newData.time_limit_seconds || 120,
      rekwisieten: newData.rekwisieten
        ? newData.rekwisieten.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      auto_assignable: !!newData.auto_assignable,
      is_enabled: !!newData.is_enabled,
      master_ball_reward: !!newData.master_ball_reward,
      item_reward_key: newData.item_reward_key || null,
      vereist_content: false,
      variabelen: [],
    }

    const { error } = await supabase.from('opdracht_definitions').insert(payload)
    setSaving(false)
    if (error) {
      setCreateError(error.message || 'Kon opdracht niet opslaan')
      return
    }
    setCreating(false)
    setNewData(EMPTY_NEW)
    if (onUpdated) onUpdated()
  }

  const enabledCount  = challenges.filter(c => c.is_enabled).length
  const disabledCount = challenges.length - enabledCount
  const totalExecutions = Object.values(executionStats).reduce((a, b) => a + (b?.count || 0), 0)

  return (
    <div>
      {/* Samenvatting */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap',
      }}>
        {[
          { label: 'Totaal',     val: challenges.length, color: 'var(--text)' },
          { label: 'Actief',     val: enabledCount,      color: 'var(--success)' },
          { label: 'Inactief',   val: disabledCount,     color: 'var(--text2)' },
          { label: 'Uitgevoerd', val: totalExecutions,   color: '#e8a44d' },
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

      {/* Nieuwe opdracht knop / form */}
      {!creating ? (
        <button
          onClick={() => { setCreating(true); setNewData(EMPTY_NEW); setCreateError(null) }}
          style={{
            width: '100%', padding: '12px', borderRadius: 10, marginBottom: 14,
            border: '1px dashed var(--accent)', background: 'rgba(106,176,245,0.08)',
            color: 'var(--accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ➕ Nieuwe opdracht toevoegen
        </button>
      ) : (
        <div style={{
          padding: 14, borderRadius: 12, marginBottom: 14,
          border: '2px solid var(--accent)', background: 'var(--bg3)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            ➕ Nieuwe opdracht
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newData.emoji}
              onChange={e => setNewData(d => ({...d, emoji: e.target.value}))}
              style={{...inputStyle, width: 60, textAlign: 'center', fontSize: 20}} placeholder="🎯" />
            <input value={newData.title}
              onChange={e => setNewData(d => ({...d, title: e.target.value}))}
              style={{...inputStyle, flex: 1}} placeholder="Naam van de opdracht" />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Type</div>
              <select value={newData.type}
                onChange={e => setNewData(d => ({...d, type: +e.target.value}))}
                style={{...inputStyle, width: '100%'}}>
                <option value={1}>👤 Solo</option>
                <option value={2}>⚔️ T2T</option>
                <option value={3}>🔄 Beide</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Categorie</div>
              <select value={newData.categorie}
                onChange={e => setNewData(d => ({...d, categorie: e.target.value}))}
                style={{...inputStyle, width: '100%'}}>
                {cats.filter(c => c !== 'alle').map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>🍺 Slokken verliezer</div>
              <input type="number" min={0} max={10} value={newData.drinks_loser}
                onChange={e => setNewData(d => ({...d, drinks_loser: +e.target.value}))}
                style={{...inputStyle, width: '100%'}} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>⏱ Tijdslimiet (sec)</div>
              <input type="number" min={30} max={600} value={newData.time_limit_seconds}
                onChange={e => setNewData(d => ({...d, time_limit_seconds: +e.target.value}))}
                style={{...inputStyle, width: '100%'}} />
            </div>
          </div>

          {newData.type !== 2 && (
            <>
              <div style={labelStyle}>👤 Beschrijving solo / parallel</div>
              <textarea value={newData.beschrijving_solo}
                onChange={e => setNewData(d => ({...d, beschrijving_solo: e.target.value}))}
                rows={4} style={{...inputStyle, width: '100%', resize: 'vertical'}}
                placeholder="Uitleg voor solo-uitvoering…" />
            </>
          )}
          {newData.type !== 1 && (
            <>
              <div style={labelStyle}>⚔️ Beschrijving team vs team</div>
              <textarea value={newData.beschrijving_t2t}
                onChange={e => setNewData(d => ({...d, beschrijving_t2t: e.target.value}))}
                rows={4} style={{...inputStyle, width: '100%', resize: 'vertical'}}
                placeholder="Uitleg voor team vs team…" />
            </>
          )}

          <div>
            <div style={labelStyle}>📦 Rekwisieten (komma-gescheiden)</div>
            <input value={newData.rekwisieten}
              onChange={e => setNewData(d => ({...d, rekwisieten: e.target.value}))}
              style={{...inputStyle, width: '100%'}}
              placeholder="bv. dobbelsteen, pingpongbal" />
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
              <input type="checkbox" checked={newData.auto_assignable}
                onChange={e => setNewData(d => ({...d, auto_assignable: e.target.checked}))} />
              Auto-toewijsbaar
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
              <input type="checkbox" checked={newData.is_enabled}
                onChange={e => setNewData(d => ({...d, is_enabled: e.target.checked}))} />
              Meteen actief
            </label>
          </div>

          {/* Reward (item / master ball) */}
          <div style={{
            background: 'rgba(124,58,237,0.1)', border: '1px solid #7c3aed44',
            borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ ...labelStyle, color: '#c4b5fd' }}>🎁 Reward bij voltooiing (optioneel)</div>
            <select value={newData.item_reward_key || ''}
              onChange={e => setNewData(d => ({ ...d, item_reward_key: e.target.value, master_ball_reward: e.target.value === 'master_ball' }))}
              style={{ ...inputStyle, width: '100%' }}>
              {ITEM_REWARDS.map(r => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            {newData.item_reward_key === 'master_ball' && (
              <div style={{ fontSize: 11, color: '#fbbf24', fontStyle: 'italic' }}>
                ⚠️ Master Ball mag maar 1× per spel uitgekeerd worden — controle in CatchFlow.
              </div>
            )}
          </div>

          {createError && (
            <div style={{
              padding: '8px 10px', borderRadius: 8, fontSize: 12,
              background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}>
              {createError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createNew} disabled={saving}
              style={{...btnStyle, background: 'var(--success)', color: '#fff', flex: 1}}>
              {saving ? '⏳ Opslaan…' : '💾 Aanmaken'}
            </button>
            <button onClick={() => { setCreating(false); setCreateError(null) }}
              style={{...btnStyle, background: 'var(--bg2)', color: 'var(--text2)'}}>
              Annuleer
            </button>
          </div>
        </div>
      )}

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
          const stat = executionStats[c.id]

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
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.title}
                    {stat?.count > 0 && (
                      <span style={{
                        fontSize: 10, padding: '1px 7px', borderRadius: 99, fontWeight: 800,
                        background: 'rgba(232,164,77,0.18)', color: '#e8a44d',
                        border: '1px solid rgba(232,164,77,0.35)',
                      }}>▶ {stat.count}×</span>
                    )}
                  </div>
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
                    {c.item_reward_key && (
                      <span style={{
                        fontSize: 10, padding: '1px 8px', borderRadius: 99,
                        background: 'rgba(124,58,237,0.15)', color: '#c4b5fd',
                        border: '1px solid #7c3aed',
                      }}>
                        🎁 {ITEM_REWARDS.find(r => r.key === c.item_reward_key)?.label || c.item_reward_key}
                      </span>
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
                          <div style={labelStyle}>Type</div>
                          <select value={editData.type}
                            onChange={e => setEditData(d => ({...d, type: +e.target.value}))}
                            style={{...inputStyle, width: '100%'}}>
                            <option value={1}>👤 Solo</option>
                            <option value={2}>⚔️ T2T</option>
                            <option value={3}>🔄 Beide</option>
                          </select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={labelStyle}>Categorie</div>
                          <select value={editData.categorie}
                            onChange={e => setEditData(d => ({...d, categorie: e.target.value}))}
                            style={{...inputStyle, width: '100%'}}>
                            {cats.filter(k => k !== 'alle').map(k => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={labelStyle}>🍺 Slokken verliezer</div>
                          <input type="number" min={0} max={10} value={editData.drinks_loser}
                            onChange={e => setEditData(d => ({...d, drinks_loser: +e.target.value}))}
                            style={{...inputStyle, width: '100%'}} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={labelStyle}>⏱ Tijdslimiet (sec)</div>
                          <input type="number" min={30} max={600} value={editData.time_limit_seconds}
                            onChange={e => setEditData(d => ({...d, time_limit_seconds: +e.target.value}))}
                            style={{...inputStyle, width: '100%'}} />
                        </div>
                      </div>
                      {editData.type !== 2 && (
                        <>
                          <div style={labelStyle}>👤 Beschrijving solo</div>
                          <textarea value={editData.beschrijving_solo}
                            onChange={e => setEditData(d => ({...d, beschrijving_solo: e.target.value}))}
                            rows={4} style={{...inputStyle, width: '100%', resize: 'vertical'}} />
                        </>
                      )}
                      {editData.type !== 1 && (
                        <>
                          <div style={labelStyle}>⚔️ Beschrijving T2T</div>
                          <textarea value={editData.beschrijving_t2t}
                            onChange={e => setEditData(d => ({...d, beschrijving_t2t: e.target.value}))}
                            rows={4} style={{...inputStyle, width: '100%', resize: 'vertical'}} />
                        </>
                      )}
                      <div>
                        <div style={labelStyle}>📦 Rekwisieten (komma-gescheiden)</div>
                        <input value={editData.rekwisieten}
                          onChange={e => setEditData(d => ({...d, rekwisieten: e.target.value}))}
                          style={{...inputStyle, width: '100%'}}
                          placeholder="bv. dobbelsteen, pingpongbal" />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                        <input type="checkbox" checked={editData.auto_assignable !== false}
                          onChange={e => setEditData(d => ({...d, auto_assignable: e.target.checked}))} />
                        Auto-toewijsbaar
                      </label>
                      {/* Reward (item / master ball) */}
                      <div style={{
                        background: 'rgba(124,58,237,0.1)', border: '1px solid #7c3aed44',
                        borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
                      }}>
                        <div style={{ ...labelStyle, color: '#c4b5fd' }}>🎁 Reward bij voltooiing</div>
                        <select value={editData.item_reward_key || ''}
                          onChange={e => setEditData(d => ({ ...d, item_reward_key: e.target.value, master_ball_reward: e.target.value === 'master_ball' }))}
                          style={{ ...inputStyle, width: '100%' }}>
                          {ITEM_REWARDS.map(r => (
                            <option key={r.key} value={r.key}>{r.label}</option>
                          ))}
                        </select>
                      </div>
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

                      {/* Stat / executions in dit spel */}
                      {stat?.count > 0 && (
                        <div style={{
                          marginBottom: 10, padding: '8px 10px', borderRadius: 8, fontSize: 12,
                          background: 'rgba(232,164,77,0.1)', color: '#e8a44d',
                          border: '1px solid rgba(232,164,77,0.25)',
                        }}>
                          ▶ {stat.count}× gespeeld in dit spel
                          {stat.last && (
                            <span style={{ color: 'var(--text2)', marginLeft: 6 }}>
                              · laatst {new Date(stat.last).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
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
