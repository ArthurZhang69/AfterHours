import { useEffect, useState } from 'react'
import { fetchLondonTransitStations } from '../services/api'

/**
 * Fetches all TfL tube / overground / DLR / Elizabeth line stations across London.
 * Results are cached for the session — only one API call is ever made.
 */
let _cache = null
let _promise = null

export function useLondonStations() {
  const [stations, setStations] = useState(_cache ?? [])
  const [loading,  setLoading]  = useState(!_cache)
  const [error,    setError]    = useState(null)

  const hasKey = Boolean(import.meta.env.VITE_TFL_APP_KEY)

  useEffect(() => {
    if (_cache) {
      setStations(_cache)
      setLoading(false)
      return
    }

    if (!hasKey) {
      setError('Add VITE_TFL_APP_KEY to .env.local to enable live station data')
      setLoading(false)
      return
    }

    if (!_promise) {
      _promise = fetchLondonTransitStations()
    }

    _promise
      .then((data) => {
        // Deduplicate by naptanId
        const seen = new Set()
        _cache = data.filter((s) => {
          if (seen.has(s.naptanId)) return false
          seen.add(s.naptanId)
          return true
        })
        setStations(_cache)
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })
  }, [hasKey])

  return { stations, loading, error }
}
