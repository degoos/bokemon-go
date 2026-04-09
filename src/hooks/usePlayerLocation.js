import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function usePlayerLocation(playerId, sessionId) {
  const [position, setPosition] = useState(null)
  const [error, setError] = useState(null)
  const watchRef = useRef(null)

  useEffect(() => {
    if (!playerId) return
    if (!navigator.geolocation) {
      setError('GPS niet beschikbaar op dit apparaat')
      return
    }

    const updatePosition = async (pos) => {
      const { latitude, longitude } = pos.coords
      setPosition({ lat: latitude, lon: longitude, accuracy: pos.coords.accuracy })

      // Update in Supabase
      await supabase.from('players').update({
        latitude,
        longitude,
        last_seen: new Date().toISOString(),
        is_online: true,
      }).eq('id', playerId)
    }

    watchRef.current = navigator.geolocation.watchPosition(
      updatePosition,
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    )

    // Markeer als offline bij sluiten
    const handleOffline = () => {
      supabase.from('players').update({ is_online: false }).eq('id', playerId)
    }
    window.addEventListener('beforeunload', handleOffline)

    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
      window.removeEventListener('beforeunload', handleOffline)
    }
  }, [playerId])

  return { position, error }
}
