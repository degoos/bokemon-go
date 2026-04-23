import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

export default function PokedexScreen({ sessionId, catches, onClose }) {
  const [pokemons, setPokemons] = useState([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase.from('pokemon_definitions')
      .select('*')
      .eq('is_enabled', true)
      .order('dex_number')
      .then(({ data }) => setPokemons(data || []))
  }, [sessionId])

  // Bouw meerdere lookups zodat we altijd een match vinden:
  //  - op pokemon_definition_id (FK kolom)
  //  - op nested pokemon_definitions.id  (fallback als FK ontbreekt)
  //  - op name (ultieme fallback, bv. als definities opnieuw geseed zijn)
  const catchCountById = new Map()
  const catchCountByName = new Map()
  for (const c of catches || []) {
    const id = c.pokemon_definition_id || c.pokemon_definitions?.id
    if (id) catchCountById.set(id, (catchCountById.get(id) || 0) + 1)
    const name = c.pokemon_definitions?.name
    if (name) catchCountByName.set(name, (catchCountByName.get(name) || 0) + 1)
  }

  function countFor(p) {
    return catchCountById.get(p.id) || catchCountByName.get(p.name) || 0
  }

  const filtered = pokemons.filter(p => {
    if (p.is_special_spawn) return false
    if (filter === 'all') return true
    return p.pokemon_type === filter
  })

  const totalCaught = pokemons.filter(p => !p.is_special_spawn && countFor(p) > 0).length
  const totalPokemons = pokemons.filter(p => !p.is_special_spawn).length

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
          return (
            <div key={p.id} className="card" style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  {p.dex_number && <span style={{ color: 'var(--text2)', fontSize: 12 }}>#{p.dex_number}</span>}
                  <span style={{ fontWeight: 700 }}>{caught ? p.name : '???'}</span>
                  <span className={`badge badge-${p.pokemon_type}`}>{typeInfo.emoji}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  CP: {p.cp_min}–{p.cp_max}
                </div>
                {caught && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      🍺 {p.linked_beer}
                    </div>
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
