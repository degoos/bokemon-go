import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useGameSession(sessionId) {
  const [session, setSession] = useState(null)
  const [teams, setTeams] = useState([])
  const [players, setPlayers] = useState([])
  const [spawns, setSpawns] = useState([])
  const [catches, setCatches] = useState([])
  const [inventory, setInventory] = useState([])
  const [effects, setEffects] = useState([])
  const [notifications, setNotifications] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    const [
      { data: s }, { data: t }, { data: p }, { data: sp },
      { data: c }, { data: inv }, { data: eff }, { data: ev }
    ] = await Promise.all([
      supabase.from('game_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('teams').select('*').eq('game_session_id', sessionId),
      supabase.from('players').select('*').eq('game_session_id', sessionId),
      supabase.from('active_spawns').select('*, pokemon_definitions(*)').eq('game_session_id', sessionId).in('status', ['active', 'catching']),
      supabase.from('catches').select('*, pokemon_definitions(*), teams(name,color)').eq('game_session_id', sessionId),
      supabase.from('team_inventory').select('*, item_definitions(*)').eq('game_session_id', sessionId),
      supabase.from('active_effects').select('*').eq('game_session_id', sessionId).eq('is_active', true),
      supabase.from('events_log').select('*').eq('game_session_id', sessionId).in('status', ['pending', 'active']).order('suggested_at', { ascending: false }),
    ])
    if (s) setSession(s)
    if (t) setTeams(t)
    if (p) setPlayers(p)

    // Auto-expire spawns waarvan expires_at al voorbij is
    const now = new Date()
    const toExpire = (sp || []).filter(s =>
      s.expires_at && new Date(s.expires_at) < now
    )
    if (toExpire.length > 0) {
      supabase.from('active_spawns')
        .update({ status: 'expired' })
        .in('id', toExpire.map(x => x.id))
        .then(() => {})
      setSpawns((sp || []).filter(s => !toExpire.some(e => e.id === s.id)))
    } else {
      if (sp) setSpawns(sp)
    }

    if (c) setCatches(c)
    if (inv) setInventory(inv)
    if (eff) setEffects(eff)
    if (ev) setEvents(ev)
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    fetchAll()

    // Realtime subscriptions
    const channels = [
      supabase.channel(`session-${sessionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
          (p) => { if (p.new) setSession(p.new) })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_session_id=eq.${sessionId}` },
          () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_spawns', filter: `game_session_id=eq.${sessionId}` },
          () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'catches', filter: `game_session_id=eq.${sessionId}` },
          () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_inventory', filter: `game_session_id=eq.${sessionId}` },
          () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_effects', filter: `game_session_id=eq.${sessionId}` },
          () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events_log', filter: `game_session_id=eq.${sessionId}` },
          () => fetchAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `game_session_id=eq.${sessionId}` },
          (p) => { if (p.new) setNotifications(prev => [p.new, ...prev.slice(0, 9)]) })
        .subscribe()
    ]

    return () => { channels.forEach(c => supabase.removeChannel(c)) }
  }, [sessionId, fetchAll])

  return { session, teams, players, spawns, catches, inventory, effects, notifications, events, loading, refetch: fetchAll }
}
