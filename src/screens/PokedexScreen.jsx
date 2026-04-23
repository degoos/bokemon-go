import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

// PokedexScreen haalt zijn eigen data op vanuit Supabase zodat hij nooit afhankelijk is
// van een mogelijk lege/stale prop. Enkel sessionId en teamId zijn nodig.
export default function PokedexScreen({ sessionId, teamId, onClose }) {
  const [pokemons, setPokemons] = useState([])
  const [catches, setCatches]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)

    async function load() {
      // Alle pokemon definities (globaal, gesorteerd op dex_number)
      const { data: pkDefs } = await supabase
        .from('pokemon_definitions')
        .select('*')
        .order('dex_number')

      // Alle catches van DIT team in DEZE sessie
      const catchQuery = supabase
        .from('catches')
        .select('*, pokemon_definitions(*)')
        .eq('game_session_id', sessionId)
      if (teamId) catchQuery.eq('team_id', teamId)

      const { data: catchData } = await catchQuery

      setPokemons(pkDefs || [])
      setCatches(catchData || [])
      setLoading(false)
    }
    load()

    // Realtime: als een nieuwe vangst binnenkomt, herlaad
    const ch = supabase.channel(`pokedex-${sessionId}-${teamId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'catches',
        filter: `game_session_id=eq.${sessionId}`,
      }, () => load())
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [sessionId, teamId])

  // ── Catch-matching ─────────────────────────────────────────────
  // Indexeer op pokemon_definition_id én op naam (fallback)
  const catchById   = new Map()
  const catchByName = new Map()
  for (const c of catches) {
    const pid  = c.pokemon_definition_id || c.pokemon_definitions?.id
    const name = c.pokemon_definitions?.name
    if (pid)  catchById.set(pid,   (catchById.get(pid)   || 0) + 1)
    if (name) catchByName.set(name.toLowerCase(), (catchByName.get(name.toLowerCase()) || 0) + 1)
  }

  function countFor(p) {
    return catchById.get(p.id) || catchByName.get(p.name?.toLowerCase()) || 0
  }

  // ── Rijen bouwen ───────────────────────────────────────────────
  const rows = pokemons.filter(p => {
    if (p.is_special_spawn) return countFor(p) > 0 // specials alleen tonen als gevangen
    return p.is_enabled !== false
  })

  const filtered = rows.filter(p => filter === 'all' || p.pokemon_type === filter)

  const totalCaught = rows.filter(p => countFor(p) > 0).length

  if (loading) return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📖</div>
      <p>Pokédex laden...</p>
    </div>
  )

  return (
    <div className="screen">
      {/* Header */}
      <div className="topbar">
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
        <h3 style={{ color: 'var(--text)' }}>📖 Pokédex</h3>
        <div style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>
          {totalCaught}/{rows.length}
        </div>
      </div>

      {/* Type filter */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
          fontWeight: 700, fontSize: 13, flexShrink: 0,
          background: filter === 'all' ? 'var(--accent)' : 'var(--card)',
          color: filter === 'all' ? 'white' : 'var(--text2)',
        }}>Alles</button>
        {Object.entries(POKEMON_TYPES).map(([key, info]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13, flexShrink: 0,
            background: filter === key ? info.color : 'var(--card)',
            color: filter === key ? 'white' : 'var(--text2)',
          }}>
            {info.emoji} {info.label}
          </button>
        ))}
      </div>

      {/* Lijst */}
      <div className="scroll-area">
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            Geen Pokémon gevonden
          </div>
        )}
        {filtered.map(p => {
          const count    = countFor(p)
          const caught   = count > 0
          const typeInfo = POKEMON_TYPES[p.pokemon_type] || {}
          const chain    = Array.isArray(p.evolution_chain) ? p.evolution_chain : []

          return (
            <div key={p.id} className="card" style={{
              display: 'flex', gap: 12, alignItems: 'center',
              opacity: caught ? 1 : 0.45,
            }}>
              {/* Sprite */}
              <div style={{
                fontSize: 38, flexShrink: 0, position: 'relative',
                filter: caught ? 'none' : 'grayscale(1) brightness(0.25)',
              }}>
                {p.sprite_emoji}
                {count > 1 && (
                  <span style={{
                    position: 'absolute', bottom: -4, right: -10,
                    background: 'var(--success)', color: '#fff', fontSize: 11,
                    fontWeight: 800, borderRadius: 99, padding: '1px 6px',
                    border: '2px solid var(--bg)',
                  }}>×{count}</span>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  {p.dex_number != null && (
                    <span style={{ color: 'var(--text2)', fontSize: 11 }}>#{p.dex_number}</span>
                  )}
                  <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
                    {caught ? p.name : '???'}
                  </span>
                  <span className={`badge badge-${p.pokemon_type}`}>{typeInfo.emoji}</span>
                  {caught && p.is_special_spawn && (
                    <span style={{ fontSize: 10, background: 'var(--warning)', color: '#000', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>⭐ Speciaal</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>CP: {p.cp_min}–{p.cp_max}</div>
                {caught && (
                  <>
                    {p.linked_beer && (
                      <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 3 }}>
                        🍺 {p.linked_beer}
                      </div>
                    )}
                    {chain.length > 1 && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        {chain.join(' → ')}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Gevangen indicator */}
              {caught && (
                <div style={{ color: 'var(--success)', fontSize: 22, flexShrink: 0 }}>✅</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
