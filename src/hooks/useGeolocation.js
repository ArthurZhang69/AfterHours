import { useState, useEffect } from 'react'
import { DEFAULT_CENTER } from '../constants/mapStyles'

/**
 * Returns the user's current geolocation.
 * Falls back to DEFAULT_CENTER (UCL) if permission denied or unavailable.
 */
export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation(DEFAULT_CENTER)
      setError('Geolocation not supported — using default location')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLoading(false)
      },
      (err) => {
        console.warn('Geolocation error:', err.message)
        setLocation(DEFAULT_CENTER)
        setError('Location access denied — using UCL as default')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    )
  }, [])

  return { location, error, loading }
}
