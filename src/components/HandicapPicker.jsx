import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────
// HandicapPicker — admin-component om een handicap toe te wijzen
// aan een team. Laadt handicap_definitions uit de DB en toont
// per handicap 1 knop per team om toe te kennen.
//
// Actieve handicap wordt geschreven in active_effects met
// item_key='handicap' + payload (snapshot van de definitie).
// Notificatie verschijnt direct op het scherm van het team.
// ─────────────────────────────────────────────────────────────

export default function HandicapPicker({ sessionId, teams, effects }) {
  const [defs, setDefs] = useState([])
  const [assigning, setAssigning] = useState(null)     // { handicapKey, teamId }
  const [feedback, setFeedback] = useState(null)

  // ── Laad handicap definities + realtime sub ──
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('handicap_definitions')
        .select('*').order('sort_order', { ascending: true })
      if (data) setDefs(data)
    }
    load()
    const ch = supabase.channel('handicap-defs-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handicap_definitions' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Welke teams hebben NU een actieve handicap?
  function activeHandicapForTeam(teamId) {
    return (effects || []).find(e =>
      e.team_id === teamId && e.item_key === 'handicap' && e.is_active &&
      (!e.expires_at || new Date(e.expires_at) > new Date())
    )
  }

  function flash(msg, kind = 'ok') {
    setFeedback({ msg, kind })
    setTimeout(() => setFeedback(null), 2500)
  }

  async function assign(handicap, team) {
    setAssigning({ handicapKey: handicap.key, teamId: team.id })
    const now = new Date()
    const expires = new Date(now.getTime() + (handicap.duration_seconds || 180) * 1000)

    // Eerst eventuele bestaande handicap van dit team afsluiten (1 per keer)
    const existing = activeHandicapForTeam(team.id)
    if (existing) {
      await supabase.from('active_effects').update({ is_active: false }).eq('id', existing.id)
    }

    // Nieuwe handicap-rij in active_effects
    await supabase.from('active_effects').insert({
      game_session_id: sessionId,
      team_id: team.id,
      item_key: 'handicap',
      started_at: now.toISOString(),
      expires_at: expires.toISOString(),
      is_active: true,
      payload: {
        handicap_key: handicap.key,
        name: handicap.name,
        emoji: handicap.emoji,
        description: handicap.description,
        duration_seconds: handicap.duration_seconds,
      },
    })

    // Notificatie naar het geraakte team
    const mins = Math.round((handicap.duration_seconds || 180) / 60)
    const durLabel = handicap.duration_seconds < 60
      ? `${handicap.duration_seconds} sec`
      : mins >= 1 ? `${mins} min` : `${handicap.duration_seconds}s`
    await supabase.from('notifications').insert({
      game_session_id: sessionId,
      title: `${handicap.emoji} HANDICAP: ${handicap.name}`,
      message: `${handicap.description} (${durLabel})`,
      type: 'danger',
      emoji: handicap.emoji,
      target_team_id: team.id,
    })

    setAssigning(null)
    flash(`${handicap.emoji} Toegewezen aan ${team.emoji} ${team.name}`, 'ok')
  }

  async function cancelHandicap(teamId) {
    const existing = activeHandicapForTeam(teamId)
    if (!existing) return
    await supabase.from('active_effects').update({ is_active: false }).eq('id', existing.id)
    const team = teams.find(t => t.id === teamId)
    await supabase.from('notifications').insert({
      game_session_id: sessionId,
      title: `✅ Handicap opgeheven`,
      message: `Team Rocket heeft jullie handicap vroegtijdig opgeheven.`,
      type: 'success',
      emoji: '✅',
      target_team_id: teamId,
    })
    flash(`Handicap van ${team?.emoji} ${team?.name} opgeheven`, 'ok')
  }

  if (defs.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--text2)', padding: 16 }}>
        Geen handicaps gedefinieerd. Run <code>migration_handicaps.sql</code>.
      </div>
    )
  }

  const enabled = defs.filter(d => d.is_enabled)

  return (
    <div>
      {/* Actieve handicaps-status per team */}
      {teams.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {teams.map(t => {
            const h = activeHandicapForTeam(t.id)
            if (!h) return null
            const remaining = h.expires_at ? Math.max(0, Math.ceil((new Date(h.expires_at) - Date.now()) / 1000)) : null
            return (
              <div key={t.id} className="card" style={{
                borderLeft: `4px solid ${t.color}`,
                background: '#3f0a15',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ fontSize: 28 }}>{h.payload?.emoji || '🎭'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>
                    {t.emoji} {t.name}: {h.payload?.name || 'Handicap'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                    {h.payload?.description}
                  </div>
                  {remaining !== null && (
                    <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, marginTop: 2 }}>
                      ⏱ Nog {remaining >= 60 ? `${Math.ceil(remaining/60)} min` : `${remaining}s`}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: 'auto', padding: '6px 10px', fontSize: 11 }}
                  onClick={() => cancelHandicap(t.id)}
                >✕ Stop</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          background: feedback.kind === 'err' ? 'var(--danger)' : 'var(--success)',
          color: 'white', padding: '8px 12px', borderRadius: 10,
          fontWeight: 700, fontSize: 12, marginBottom: 12, textAlign: 'center',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Handicap lijst */}
      {enabled.map(h => {
        const isAssigning = assigning?.handicapKey === h.key
        const durLabel = h.duration_seconds < 60
          ? `${h.duration_seconds}s`
          : `${Math.round(h.duration_seconds / 60)} min`
        return (
          <div key={h.key} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 32, flexShrink: 0, paddingTop: 2 }}>{h.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                  {h.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, marginBottom: 4 }}>
                  {h.description}
                </div>
                <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
                  ⏱ {durLabel}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {teams.map(t => {
                const isTargetAssigning = isAssigning && assigning.teamId === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => assign(h, t)}
                    disabled={isAssigning}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      background: isTargetAssigning ? '#64748b' : t.color,
                      border: 'none', borderRadius: 10,
                      color: 'white', fontWeight: 700, fontSize: 12,
                      cursor: isAssigning ? 'default' : 'pointer',
                      opacity: isAssigning && !isTargetAssigning ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}
                  >
                    {isTargetAssigning ? '⏳ …' : <>🎯 {t.emoji} {t.name}</>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
