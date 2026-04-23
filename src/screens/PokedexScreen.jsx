import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

export default function PokedexScreen({ sessionId, catches, onClose }) {
  const [pokemons, setPokemons] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    // Alle definities halen — we filteren pas in de UI, zodat gevangen
    // maar inmiddels disabled/special Pokémon toch zichtbaar blijven.
    supabase.from('pokemon_definitions')
      .select('*')
      .order('dex_number')
      .then(({ data }) => setPokemons(data || []))
  }, [sessionId])

  // ── Catches indexeren met meerdere sleutels ──────────────────────
  //   - op pokemon_definition_id (FK kolom)  → primaire match
  //   - op nested pokemon_definitions.id     → fallback als FK ontbreekt
  //   - op name (case-insensitive)           → laatste redmiddel
  const catchCountById   = new Map()
  const catchCountByName = new Map()
  // Tevens: catches waarvan we (via embed) een definitie kennen die we eventueel
  // moeten tonen omdat de master-lijst hem niet terug-geeft (bv. verwijderde rij).
  const embedByKey       = new Map()
  for (const c of catches || []) {
    const id    = c.pokemon_definition_id || c.pokemon_definitions?.id || null
    const name  = c.pokemon_definitions?.name || null
    const nkey  = name ? name.toLowerCase() : null
    if (id)   catchCountById.set(id,    (catchCountById.get(id)    || 0) + 1)
    if (nkey) catchCountByName.set(nkey,(catchCountByName.get(nkey)|| 0) + 1)
    if (c.pokemon_definitions && (id || nkey)) {
      embedByKey.set(id || `name:${nkey}`, c.pokemon_definitions)
    }
  }

  function countFor(p) {
    const nkey = p.name ? p.name.toLowerCase() : null
    return catchCountById.get(p.id) || (nkey ? catchCountByName.get(nkey) : 0) || 0
  }

  // Samenstellen van de Pokédex-lijst:
  //  1. Alle "normale" Pokémon (enabled, geen special spawn) zodat lege slots zichtbaar blijven.
  //  2. Élke gevangen Pokémon — ook als die inmiddels disabled, special, of niet meer in master-lijst is.
  const seen   = new Set()
  const rows   = []

  for (const p of pokemons) {
    const nkey   = p.name ? p.name.toLowerCase() : ''
    const caught = countFor(p) > 0
    const showAsSlot = p.is_enabled !== false && !p.is_special_spawn
    if (!showAsSlot && !caught) continue
    seen.add(p.id)
    if (nkey) seen.add(`name:${nkey}`)
    rows.push(p)
  }

  // Caught-only fallback: catches waarvan de definitie niet (meer) in `pokemons` zit.
  for (const c of catches || []) {
    const id   = c.pokemon_definition_id || c.pokemon_definitions?.id || null
    const name = c.pokemon_definitions?.name || null
    const nkey = name ? name.toLowerCase() : null
    if (id && seen.has(id)) continue
    if (nkey && seen.has(`name:${nkey}`)) continue
    const embed = embedByKey.get(id || `name:${nkey}`)
    if (!embed) continue
    if (id)   seen.add(id)
    if (nkey) seen.add(`name:${nkey}`)
    rows.push(embed)
  }

  // Sorteren op dex_number (nulls achteraan), dan op naam
  rows.sort((a, b) => {
    const da = a.dex_number ?? 9999
    const db = b.dex_number ?? 9999
    if (da !== db) return da - db
    return (a.name || '').localeCompare(b.name || '')
  })

  const filtered = rows.filter(p => {
    if (filter === 'all') return true
    return p.pokemon_type === filter
  })

  const totalCaught   = rows.filter(p => countFor(p) > 0).length
  const totalPokemons = rows.length

  return (
    <div className="screen">
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3>📖 Pokédex</h3>
        <div style={{ color: 'var(--text2)', fontSize: 12 }}>
          {totalCaught}/{totalPokemons}
        </div>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, flexShrink: 0,
            background: filter === 'all' ? 'var(--accent)' : 'var(--card)',
            color: filter === 'all' ? 'white' : 'var(--text2)',
          }}
        >Alles</button>
        {Object.entries(POKEMON_TYPES).map(([key, info]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, flexShrink: 0,
              background: filter === key ? info.color : 'var(--card)',
              color: filter === key ? 'white' : 'var(--text2)',
            }}
          >
            {info.emoji} {info.label}
          </button>
        ))}
      </div>

      <div className="scroll-area">
        {filtered.map(p => {
          const count = countFor(p)
          const caught = count > 0
          const chain = p.evolution_chain || []
          const typeInfo = POKEMON_TYPES[p.pokemon_type] || {}
          const isSpecial = !!p.is_special_spawn
          const isDisabled = p.is_enabled === false
          return (
            <div key={p.id || p.name} className="card" style={{
              display: 'flex', gap: 12, alignItems: 'center',
              opacity: caught ? 1 : 0.5,
            }}>
              <div style={{
                fontSize: 36,
                filter: caught ? 'none' : 'grayscale(1) brightness(0.3)',
                position: 'relative',
              }}>
                {p.sprite_emoji}
                {count > 1 && (
                  <span style={{
                    position: 'absolute',
                    bottom: -4, right: -8,
                    background: 'var(--success)',
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 800,
                    borderRadius: 99,
                    padding: '1px 6px',
                    border: '2px solid var(--bg)',
                  }}>×{count}</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                  {p.dex_number && <span style={{ color: 'var(--text2)', fontSize: 12 }}>#{p.dex_number}</span>}
                  <span style={{ fontWeight: 700 }}>{caught ? p.name : '???'}</span>
                  <span className={`badge badge-${p.pokemon_type}`}>{typeInfo.emoji}</span>
                  {caught && isSpecial && (
                    <span style={{ fontSize: 10, background: 'var(--warning)', color: '#000', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>speciaal</span>
                  )}
                  {caught && isDisabled && (
                    <span style={{ fontSize: 10, background: 'var(--danger)', color: '#fff', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>uit</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  CP: {p.cp_min ?? '?'}–{p.cp_max ?? '?'}
                </div>
                {caught && (
                  <>
                    {p.linked_beer && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                        🍺 {p.linked_beer}
                      </div>
                    )}
                    {chain.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                        {[p.name, ...chain].join(' → ')}
                      </div>
                    )}
                  </>
                )}
              </div>
              {caught && <div style={{ color: 'var(--success)', fontSize: 20 }}>✅</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
