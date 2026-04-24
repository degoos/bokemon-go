import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { POKEMON_TYPES } from '../lib/constants'

// PokedexScreen — toont individuele vangsten (niet gegroepeerd).
// embedded=true: geen screen-wrapper of topbar (voor gebruik in AdminScreen).
// isAdmin=true + teamId + adminPokemons + adminTeams: admin-modus — toont
// "Direct toewijzen"-formulier bovenaan en een 🗑️-knop per vangst om die
// vangst uit de teampool te verwijderen.
export default function PokedexScreen({
  sessionId,
  teamId,
  onClose,
  embedded = false,
  isAdmin = false,
  adminPokemons = [],
  adminTeams = [],
}) {
  const [pokemons, setPokemons] = useState([])
  const [catches, setCatches]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  // Admin: direct-toewijzen-form state
  const [assignForm, setAssignForm] = useState({ pokemonId: '', xp: '' })
  const [assigning, setAssigning] = useState(false)
  const [assignSuccess, setAssignSuccess] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [showAssign, setShowAssign] = useState(false)

  const adminMode = isAdmin && !!teamId
  const currentTeam = adminMode ? adminTeams.find(t => t.id === teamId) : null

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
        event: '*', schema: 'public', table: 'catches',
        filter: `game_session_id=eq.${sessionId}`,
      }, () => load())
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [sessionId, teamId])

  // ── Admin: direct-toewijzen ────────────────────────────────────
  async function handleDirectAssign() {
    if (!adminMode || !currentTeam) return
    const pokemon = adminPokemons.find(p => p.id === assignForm.pokemonId)
    if (!pokemon) return
    const xp = parseInt(assignForm.xp, 10)
    if (!xp || xp < 1) return
    setAssigning(true)
    const chain = pokemon.evolution_chain || [pokemon.name]
    const { error } = await supabase.from('catches').insert({
      game_session_id: sessionId,
      team_id: currentTeam.id,
      pokemon_definition_id: pokemon.id,
      cp: xp,
      evolution_stage: 0,
      is_shiny: false,
      caught_at: new Date().toISOString(),
    })
    if (!error) {
      await supabase.from('notifications').insert({
        game_session_id: sessionId,
        title: `🎁 ${pokemon.sprite_emoji || '🐾'} ${chain[0]} toegevoegd!`,
        message: `Team Rocket heeft ${chain[0]} (${xp} XP) direct toegewezen aan ${currentTeam.name}.`,
        type: 'success', emoji: '🎁',
      })
      setAssignForm({ pokemonId: '', xp: '' })
      setAssignSuccess(true)
      setTimeout(() => setAssignSuccess(false), 3000)
      setShowAssign(false)
    }
    setAssigning(false)
  }

  // ── Admin: catch verwijderen ───────────────────────────────────
  async function handleDeleteCatch(c) {
    if (!adminMode) return
    const def = c.pokemon_definitions
    const naam = def?.name || 'deze Bokémon'
    const confirmMsg = `⚠️ ${naam} (${c.cp} XP) verwijderen uit de pool van ${currentTeam?.name}?\n\nDit kan niet ongedaan worden.`
    if (!window.confirm(confirmMsg)) return
    setDeletingId(c.id)
    const { error } = await supabase.from('catches').delete().eq('id', c.id)
    if (!error) {
      // Notificatie naar team
      await supabase.from('notifications').insert({
        game_session_id: sessionId,
        title: `🗑️ ${def?.sprite_emoji || '🐾'} ${naam} verwijderd`,
        message: `Team Rocket heeft ${naam} (${c.cp} XP) uit ${currentTeam?.name} verwijderd.`,
        type: 'warning', emoji: '🗑️',
      })
    }
    setDeletingId(null)
  }

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

  // XP-verdeling per 100-CP bucket
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

  // ── Admin: Direct toewijzen-card (alleen in admin-modus) ──────
  const selectedPokemon = adminPokemons.find(p => p.id === assignForm.pokemonId)
  const assignCard = adminMode && (
    <div className="card" style={{
      border: `1px solid ${currentTeam?.color || '#7c3aed'}44`,
      background: 'rgba(124,58,237,0.04)',
    }}>
      <div
        onClick={() => setShowAssign(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          marginBottom: showAssign ? 12 : 0,
        }}
      >
        <div style={{ fontSize: 22 }}>🎁</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Direct toewijzen</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            Voeg Bokémon toe aan {currentTeam?.emoji} {currentTeam?.name} zonder opdracht
          </div>
        </div>
        <div style={{ fontSize: 18, color: 'var(--text2)' }}>
          {showAssign ? '▲' : '▼'}
        </div>
      </div>

      {showAssign && (
        <>
          {assignSuccess && (
            <div style={{
              background: '#14532d', border: '1px solid #22c55e', borderRadius: 8,
              padding: '8px 12px', marginBottom: 12, color: '#86efac',
              fontWeight: 700, fontSize: 12,
            }}>
              ✅ Bokémon succesvol toegewezen!
            </div>
          )}

          <label style={pdxLabelStyle}>🐾 Bokémon</label>
          <select
            style={pdxSelectStyle}
            value={assignForm.pokemonId}
            onChange={e => setAssignForm(f => ({ ...f, pokemonId: e.target.value, xp: '' }))}
          >
            <option value="">— kies Bokémon —</option>
            {adminPokemons.map(p => (
              <option key={p.id} value={p.id}>
                {p.sprite_emoji} {p.name} ({p.cp_min}–{p.cp_max} XP)
              </option>
            ))}
          </select>

          {assignForm.pokemonId && selectedPokemon && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={pdxLabelStyle}>⚡ XP waarde</label>
                <input
                  type="number"
                  min={selectedPokemon.cp_min || 1}
                  max={selectedPokemon.cp_max || 9999}
                  placeholder={`${selectedPokemon.cp_min}–${selectedPokemon.cp_max}`}
                  value={assignForm.xp}
                  onChange={e => setAssignForm(f => ({ ...f, xp: e.target.value }))}
                  style={pdxInputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-end', marginBottom: 1 }}>
                <button
                  onClick={() => setAssignForm(f => ({ ...f, xp: String(selectedPokemon.cp_min || '') }))}
                  style={{ ...pdxSmallBtn, background: '#1e3a5f' }}
                >Min</button>
                <button
                  onClick={() => setAssignForm(f => ({
                    ...f,
                    xp: String(Math.round(((selectedPokemon.cp_min || 0) + (selectedPokemon.cp_max || 0)) / 2)),
                  }))}
                  style={{ ...pdxSmallBtn, background: '#1e3a5f' }}
                >Mid</button>
                <button
                  onClick={() => setAssignForm(f => ({ ...f, xp: String(selectedPokemon.cp_max || '') }))}
                  style={{ ...pdxSmallBtn, background: '#1e3a5f' }}
                >Max</button>
              </div>
            </div>
          )}

          <button
            onClick={handleDirectAssign}
            disabled={assigning || !assignForm.pokemonId || !assignForm.xp}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, cursor: 'pointer',
              background: assigning ? '#374151' : (currentTeam?.color || '#7c3aed'),
              color: '#fff', fontWeight: 800, fontSize: 14, border: 'none',
              opacity: (!assignForm.pokemonId || !assignForm.xp) ? 0.5 : 1,
            }}
          >
            {assigning ? 'Bezig…' : `🎁 Toewijzen aan ${currentTeam?.name}`}
          </button>
        </>
      )}
    </div>
  )

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

      {/* Admin topbar in embedded modus — toon team + terug-knop */}
      {embedded && adminMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          background: `linear-gradient(90deg, ${currentTeam?.color || '#7c3aed'}22 0%, transparent 100%)`,
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 10px', color: 'var(--text2)',
              fontSize: 13, cursor: 'pointer', fontWeight: 600,
            }}
          >← Terug</button>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 15, color: currentTeam?.color || 'var(--text)' }}>
            {currentTeam?.emoji} {currentTeam?.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 700 }}>
            {totalCaught} gevangen
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
        {/* Admin: direct-toewijzen card (bovenaan) */}
        {adminMode && assignCard}

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
                    {count}× {range} XP
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lege staat */}
        {caughtEntries.length === 0 && uncaughtDefs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
            Geen Bokémon gevonden
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
              const isDeleting = deletingId === c.id

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
                    {/* Werkelijke XP */}
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warning)', marginBottom: 2 }}>
                      {c.cp} XP
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

                  {adminMode ? (
                    <button
                      onClick={() => handleDeleteCatch(c)}
                      disabled={isDeleting}
                      title="Verwijder deze vangst"
                      style={{
                        flexShrink: 0, background: isDeleting ? '#374151' : 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8,
                        padding: '8px 10px', cursor: isDeleting ? 'default' : 'pointer',
                        color: '#ef4444', fontSize: 16, fontWeight: 700,
                        opacity: isDeleting ? 0.5 : 1,
                      }}
                    >
                      {isDeleting ? '⏳' : '🗑️'}
                    </button>
                  ) : (
                    <div style={{ color: 'var(--success)', fontSize: 22, flexShrink: 0 }}>✅</div>
                  )}
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
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>XP: {p.cp_min}–{p.cp_max}</div>
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

// ── Stijlconstanten voor admin direct-toewijzen-form ──
const pdxLabelStyle = {
  display: 'block', fontSize: 11, color: 'var(--text2)',
  fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
}
const pdxSelectStyle = {
  width: '100%', background: 'var(--bg3)', color: 'var(--text1)',
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', fontSize: 14, marginBottom: 12,
}
const pdxInputStyle = {
  width: '100%', background: 'var(--bg3)', color: 'var(--text1)',
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '10px 12px', fontSize: 14,
}
const pdxSmallBtn = {
  padding: '8px 10px', border: 'none', borderRadius: 6,
  color: '#93c5fd', fontWeight: 700, fontSize: 12, cursor: 'pointer',
}
