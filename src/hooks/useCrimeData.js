import { useEffect, useState, useRef } from 'react'
import { fetchNearbyCrimes } from '../services/api'
import { clusterCrimes } from '../utils/risk'

/**
 * Fetches and clusters crime data near a lat/lng point.
 *
 * Returns:
 *   crimes  — raw array from data.police.uk
 *   clusters — aggregated hotspot objects for map rendering
 *   loading, error
 *   dataMonth — the month label for the fetched data (e.g. "Oct 2024")
 */
export function useCrimeData(lat, lng, date) {
  const [crimes,     setCrimes]     = useState([])
  const [clusters,   setClusters]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [dataMonth,  setDataMonth]  = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!lat || !lng) return

    // Abort previous in-flight request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)

    fetchNearbyCrimes(lat, lng, date, abortRef.current.signal)
      .then((data) => {
        setCrimes(data)
        setClusters(clusterCrimes(data))

        if (data.length > 0) {
          const month = data[0].month // "YYYY-MM"
          const [y, m] = month.split('-')
          const label  = new Date(y, m - 1).toLocaleDateString('en-GB', {
            month: 'long', year: 'numeric',
          })
          setDataMonth(label)
        }
        setLoading(false)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      abortRef.current?.abort()
      setLoading(false)
    }
  }, [lat, lng, date])

  return { crimes, clusters, loading, error, dataMonth }
}
