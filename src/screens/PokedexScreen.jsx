import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

// PokedexScreen — toont individuele vangsten (niet gegroepeerd).
// embedded=true: geen screen-wrapper of topbar (voor gebruik in AdminScreen).
export default function PokedexScreen({ sessionId, teamId, onClose, embedded = false }) {
  const [pokemons, setPokemons] = useState([])
  const [catches, setCatches]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)

    async function load() {
      const { data: pkDefs } = await supabase
        .from('pokemon_definitions')
        .select('*')
        .order('dex_number')

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

    const ch = supabase.channel(`pokedex-${sessionId}-${teamId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'catches',
        filter: `game_session_id=eq.${sessionId}`,
      }, () => load())
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [sessionId, teamId])

  // ── Sets & filters ─────────────────────────────────────────────
  const caughtDefIds = new Set(
    catches.map(c => c.pokemon_definition_id || c.pokemon_definitions?.id).filter(Boolean)
  )

  const caughtEntries = catches.filter(c => {
    if (filter === 'all') return true
    return c.pokemon_definitions?.pokemon_type === filter
  })

  const uncaughtDefs = pokemons.filter(p => {
    if (p.is_special_spawn && !caughtDefIds.has(p.id)) return false
    if (caughtDefIds.has(p.id)) return false
    if (filter !== 'all' && p.pokemon_type !== filter) return false
    return p.is_enabled !== false
  })

  // ── Samenvatting ───────────────────────────────────────────────
  const totalCaught   = catches.length
  const caughtDefCount = caughtDefIds.size
  const totalDefs     = pokemons.filter(p => !p.is_special_spawn && p.is_enabled !== false).length

  // CP-verdeling per 100-CP bucket
  const cpBuckets = {}
  for (const c of catches) {
    const bucket = Math.floor((c.cp || 0) / 100) * 100
    const key = `${bucket}–${bucket + 99}`
    cpBuckets[key] = (cpBuckets[key] || 0) + 1
  }
  const cpBucketEntries = Object.entries(cpBuckets).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    const loadingView = (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text2)' }}>
        <div style={{ fontSize: 36 }}>📖</div>
        <p>Pokédex laden...</p>
      </div>
    )
    return embedded
      ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{loadingView}</div>
      : <div className="screen">{loadingView}</div>
  }

  // ── Content ────────────────────────────────────────────────────
  const inner = (
    <>
      {/* Topbar — alleen buiten embedded */}
      {!embedded && (
        <div className="topbar">
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22 }}>✕</button>
          <h3 style={{ color: 'var(--text)' }}>📖 Pokédex</h3>
          <div style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>
            {caughtDefCount}/{totalDefs}
          </div>
        </div>
      )}

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

      <div className="scroll-area">
        {/* Samenvatting (enkel bij filter=alles en minstens één vangst) */}
        {totalCaught > 0 && filter === 'all' && (
          <div className="card" style={{ background: 'var(--bg3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>📊 Samenvatting</div>
              <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 700 }}>
                {totalCaught} gevangen
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
              {caughtDefCount} van {totalDefs} soorten ontdekt
            </div>
            {cpBucketEntries.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cpBucketEntries.map(([range, count]) => (
                  <span key={range} style={{
                    padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                    background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)',
                  }}>
                    {count}× {range} CP
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lege staat */}
        {caughtEntries.length === 0 && uncaughtDefs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            Geen Pokémon gevonden
          </div>
        )}

        {/* ── Gevangen — individuele entries ── */}
        {caughtEntries.length > 0 && (
          <>
            <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Gevangen ({caughtEntries.length})
            </div>
            {caughtEntries.map((c, idx) => {
              const def      = c.pokemon_definitions
              if (!def) return null
              const typeInfo = POKEMON_TYPES[def.pokemon_type] || {}
              const isShiny  = c.is_shiny
              const chain    = Array.isArray(def.evolution_chain) ? def.evolution_chain : []

              return (
                <div key={c.id || idx} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {/* Sprite */}
                  <div style={{ fontSize: 38, flexShrink: 0, position: 'relative' }}>
                    {def.sprite_emoji}
                    {isShiny && (
                      <span style={{ position: 'absolute', top: -6, right: -12, fontSize: 14, lineHeight: 1 }}>✨</span>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      {def.dex_number != null && (
                        <span style={{ color: 'var(--text2)', fontSize: 11 }}>#{def.dex_number}</span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: 15, color: isShiny ? '#facc15' : 'var(--text)' }}>
                        {isShiny ? 'Blinkende ' : ''}{def.name}
                      </span>
                      <span className={`badge badge-${def.pokemon_type}`}>{typeInfo.emoji}</span>
                      {def.is_special_spawn && (
                        <span style={{ fontSize: 10, background: 'var(--warning)', color: '#000', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>⭐ Speciaal</span>
                      )}
                    </div>
                    {/* Werkelijke CP */}
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warning)', marginBottom: 2 }}>
                      {c.cp} CP
                    </div>
                    {def.linked_beer && (
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                        🍺 {def.linked_beer}
                      </div>
                    )}
                    {chain.length > 1 && (
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        {chain.join(' → ')}
                      </div>
                    )}
                  </div>

                  <div style={{ color: 'var(--success)', fontSize: 22, flexShrink: 0 }}>✅</div>
                </div>
              )
            })}
          </>
        )}

        {/* ── Nog niet gevangen ── */}
        {uncaughtDefs.length > 0 && (
          <>
            <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Nog niet gevangen ({uncaughtDefs.length})
            </div>
            {uncaughtDefs.map(p => {
              const typeInfo = POKEMON_TYPES[p.pokemon_type] || {}
              return (
                <div key={p.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: 0.4 }}>
                  <div style={{ fontSize: 38, flexShrink: 0, filter: 'grayscale(1) brightness(0.25)' }}>
                    {p.sprite_emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      {p.dex_number != null && (
                        <span style={{ color: 'var(--text2)', fontSize: 11 }}>#{p.dex_number}</span>
                      )}
                      <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>???</span>
                      <span className={`badge badge-${p.pokemon_type}`}>{typeInfo.emoji}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>CP: {p.cp_min}–{p.cp_max}</div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )

  if (embedded) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {inner}
      </div>
    )
  }

  return (
    <div className="screen">
      {inner}
    </div>
  )
}
