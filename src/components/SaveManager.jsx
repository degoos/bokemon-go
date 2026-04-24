import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  createSnapshot, deleteSnapshot, listSnapshots,
  pauseSession, resumeSession, createSessionFromSnapshot,
} from '../lib/gameEngine'

// Compacte UI voor het beheren van pauze + snapshots.
// Gebruikt vanuit AdminScreen in zowel het dashboard-tab
// (pauze-panel) als in een apart 'saves'-tab (volledig overzicht).
export default function SaveManager({ session, teams = [], compact = false }) {
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null) // id of action
  const [feedback, setFeedback] = useState('')

  const refresh = useCallback(async () => {
    if (!session?.id) return
    setLoading(true)
    const { data } = await listSnapshots(session.id, 50)
    setSnapshots(data || [])
    setLoading(false)
  }, [session?.id])

  useEffect(() => {
    refresh()
    if (!session?.id) return
    // Luister naar nieuwe snapshots (kan via pauze of andere admin-actie)
    const ch = supabase.channel(`save-${session.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'save_snapshots',
        filter: `game_session_id=eq.${session.id}`,
      }, refresh).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session?.id, refresh])

  function flash(msg) {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 2500)
  }

  async function handleManualSnapshot() {
    const name = window.prompt('Naam voor deze snapshot:', `Handmatig — ${new Date().toLocaleString('nl-BE')}`)
    if (name === null) return
    setBusy('create')
    const { error } = await createSnapshot(session.id, { name: name.trim() || undefined, isAuto: false })
    setBusy(null)
    flash(error ? '❌ Fout bij opslaan' : '✅ Snapshot gemaakt')
    refresh()
  }

  async function handlePause() {
    const msg = window.prompt(
      'Optioneel bericht voor de trainers (zien zij op hun wachtscherm):',
      'Team Rocket pauzeert het spel. We hervatten later.'
    )
    if (msg === null) return
    if (!window.confirm('⏸️ Spel pauzeren?\nEr wordt automatisch een snapshot gemaakt.')) return
    setBusy('pause')
    const { error } = await pauseSession(session.id, { message: msg })
    setBusy(null)
    flash(error ? '❌ Fout bij pauzeren' : '⏸️ Spel gepauzeerd')
  }

  async function handleResume() {
    if (!window.confirm('▶️ Spel hervatten? Alle trainers krijgen een notificatie.')) return
    setBusy('resume')
    const { error } = await resumeSession(session.id)
    setBusy(null)
    flash(error ? '❌ Fout bij hervatten' : '▶️ Spel hervat')
  }

  async function handleDelete(snap) {
    if (!window.confirm(`Snapshot "${snap.name}" verwijderen?`)) return
    setBusy(snap.id)
    await deleteSnapshot(snap.id)
    setBusy(null)
    refresh()
  }

  async function handleRestoreAsNew(snap) {
    const name = window.prompt(
      'Naam voor de nieuwe sessie:',
      `${session?.name || 'Bokémon GO'} (Vervolg)`
    )
    if (name === null) return
    if (!window.confirm(
      `Nieuwe sessie aanmaken van snapshot "${snap.name}"?\n\n` +
      'Er wordt een nieuwe game_code gegenereerd. Trainers moeten opnieuw inloggen met die code. ' +
      'Alle catches, items en teams worden gekopieerd.'
    )) return
    setBusy(snap.id)
    const { data, error } = await createSessionFromSnapshot(snap.id, { newName: name.trim() || undefined })
    setBusy(null)
    if (error || !data) {
      flash('❌ Fout bij aanmaken nieuwe sessie')
      return
    }
    window.alert(
      `✅ Nieuwe sessie aangemaakt!\n\n` +
      `Naam: ${data.name}\n` +
      `Game code: ${data.game_code}\n\n` +
      'Laat trainers opnieuw inloggen met deze code. De huidige sessie blijft bestaan.'
    )
    refresh()
  }

  const isPaused = !!session?.is_paused

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0, marginBottom: 4 }}>💾 Opslaan &amp; Pauzeren</h3>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Pauzeer tussentijds en hervat later — of maak een snapshot om een nieuwe sessie mee te starten.
        </div>
      </div>

      {isPaused ? (
        <div style={{
          background: '#3a2a00', border: '1px solid #854d0e', borderRadius: 10,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontWeight: 800, color: '#fbbf24' }}>⏸️ Spel is gepauzeerd</div>
          <div style={{ fontSize: 12, color: '#fcd34d' }}>
            Gepauzeerd sinds {session.paused_at ? new Date(session.paused_at).toLocaleString('nl-BE') : '—'}
            {session.paused_at_status ? ` · fase: ${session.paused_at_status}` : ''}
          </div>
          {session.paused_message && (
            <div style={{ fontSize: 12, color: '#fcd34d', fontStyle: 'italic' }}>
              "{session.paused_message}"
            </div>
          )}
          <button className="btn btn-success btn-sm" disabled={busy === 'resume'}
            onClick={handleResume}>
            {busy === 'resume' ? '⏳ Hervatten...' : '▶️ Hervatten'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-sm"
            style={{ background: '#0f172a', color: '#93c5fd', border: '1px solid #1e3a8a' }}
            disabled={busy === 'pause'} onClick={handlePause}>
            {busy === 'pause' ? '⏳ Pauzeren...' : '⏸️ Spel pauzeren (+ snapshot)'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy === 'create'} onClick={handleManualSnapshot}>
            {busy === 'create' ? '⏳ Opslaan...' : '📸 Nu een snapshot maken'}
          </button>
        </div>
      )}

      {feedback && (
        <div style={{ fontSize: 12, color: 'var(--success)', textAlign: 'center' }}>{feedback}</div>
      )}

      {!compact && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            📁 Snapshots {snapshots.length > 0 && <span style={{ color: 'var(--text2)', fontWeight: 500 }}>({snapshots.length})</span>}
          </div>
          {loading && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Laden...</div>}
          {!loading && snapshots.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
              Nog geen snapshots voor deze sessie.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {snapshots.map(s => {
              const summ = s.summary || {}
              const tc = summ.team_counts || {}
              return (
                <div key={s.id} style={{
                  background: 'var(--card2, #1e1e3a)', borderRadius: 10, padding: 10,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {s.is_auto ? '🤖' : '👤'} {s.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        {new Date(s.created_at).toLocaleString('nl-BE')}
                        {' · '}{labelForStatus(s.status_at_save)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        🎯 {summ.total_catches || 0} catches
                        {' · '}🎒 {summ.items_total || 0} items
                        {(summ.evolution_events || 0) > 0 ? ` · 🧬 ${summ.evolution_events} evo's` : ''}
                      </div>
                      {Object.keys(tc).length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          {Object.entries(tc).map(([tid, count]) => {
                            const t = teams.find(x => x.id === tid)
                            return (
                              <span key={tid} style={{
                                fontSize: 11, padding: '1px 6px', borderRadius: 4,
                                background: (t?.color || '#666') + '33', color: t?.color || '#aaa',
                              }}>
                                {t?.emoji || ''} {t?.name || 'Team'} · {count}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, fontSize: 12 }}
                      disabled={busy === s.id} onClick={() => handleRestoreAsNew(s)}>
                      🆕 Nieuwe sessie
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      style={{ fontSize: 12, color: 'var(--danger)' }}
                      disabled={busy === s.id} onClick={() => handleDelete(s)}>
                      🗑️
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function labelForStatus(status) {
  switch (status) {
    case 'setup':      return '⚙️ Setup'
    case 'collecting': return '🟢 Verzamelfase'
    case 'training':   return '🌿 Training'
    case 'tournament': return '🏆 Toernooi'
    case 'finished':   return '⏹️ Afgelopen'
    default:           return status || '—'
  }
}
