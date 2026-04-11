import { useEffect, useState } from 'react'
import { fetchNearbyStations } from '../services/api'

/**
 * Fetches TfL stations near a lat/lng point.
 * Skips the call if VITE_TFL_APP_KEY is not set (returns empty array + warning).
 */
export function useNearbyStations(lat, lng, radius = 600) {
  const [stations, setStations] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const hasKey = Boolean(import.meta.env.VITE_TFL_APP_KEY)

  useEffect(() => {
    if (!lat || !lng) return
    if (!hasKey) {
      setError('Add VITE_TFL_APP_KEY to .env.local to enable live station data')
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetchNearbyStations(lat, lng, radius, controller.signal)
      .then((data) => {
        // Deduplicate by naptanId and only keep relevant modes
        const seen = new Set()
        const unique = data.filter((s) => {
          if (seen.has(s.naptanId)) return false
          seen.add(s.naptanId)
          return true
        })
        setStations(unique)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [lat, lng, radius, hasKey])

  return { stations, loading, error }
}
