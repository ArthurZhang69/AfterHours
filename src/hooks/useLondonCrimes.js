import { useEffect, useState, useRef } from 'react'
import { fetchNearbyCrimes } from '../services/api'
import { clusterCrimes } from '../utils/risk'

/**
 * 43-point hexagonal grid covering inner London (Zone 1–2).
 * Generated with 2.5km spacing — max gap to any triangle centre = 2.5/√3 ≈ 1.44km,
 * which is within the API's 1.6km query radius. Full coverage, no gaps.
 * Ordered roughly centre-out so central London appears first during progressive load.
 */
const LONDON_GRID = [
  // ── Central core (loads first) ────────────────────────────────
  { lat: 51.518, lng: -0.1348 },
  { lat: 51.518, lng: -0.0987 },
  { lat: 51.495, lng: -0.1168 },
  { lat: 51.495, lng: -0.0807 },
  { lat: 51.518, lng: -0.1709 },
  { lat: 51.518, lng: -0.0627 },
  { lat: 51.540, lng: -0.1168 },
  { lat: 51.540, lng: -0.0807 },
  { lat: 51.495, lng: -0.1528 },
  { lat: 51.495, lng: -0.0446 },
  { lat: 51.540, lng: -0.1528 },
  { lat: 51.540, lng: -0.0446 },
  // ── Inner ring ────────────────────────────────────────────────
  { lat: 51.518, lng: -0.0266 },
  { lat: 51.518, lng:  0.0095 },
  { lat: 51.495, lng: -0.0085 },
  { lat: 51.518, lng: -0.2070 },
  { lat: 51.540, lng: -0.1889 },
  { lat: 51.540, lng: -0.0085 },
  { lat: 51.563, lng: -0.1348 },
  { lat: 51.563, lng: -0.0987 },
  { lat: 51.563, lng: -0.1709 },
  { lat: 51.563, lng: -0.0627 },
  { lat: 51.495, lng: -0.1889 },
  { lat: 51.473, lng: -0.1348 },
  { lat: 51.473, lng: -0.0987 },
  { lat: 51.473, lng: -0.0627 },
  // ── Outer ring ────────────────────────────────────────────────
  { lat: 51.473, lng: -0.1709 },
  { lat: 51.473, lng: -0.0266 },
  { lat: 51.473, lng:  0.0095 },
  { lat: 51.473, lng: -0.2070 },
  { lat: 51.495, lng: -0.2250 },
  { lat: 51.540, lng: -0.2250 },
  { lat: 51.563, lng: -0.2070 },
  { lat: 51.563, lng: -0.0266 },
  { lat: 51.540, lng: -0.0085 },
  // ── Edge / outermost ──────────────────────────────────────────
  { lat: 51.450, lng: -0.1528 },
  { lat: 51.450, lng: -0.1168 },
  { lat: 51.450, lng: -0.0807 },
  { lat: 51.450, lng: -0.0446 },
  { lat: 51.585, lng: -0.1528 },
  { lat: 51.585, lng: -0.1168 },
  { lat: 51.585, lng: -0.0807 },
  { lat: 51.585, lng: -0.0446 },
]

const CONCURRENCY = 12  // police API allows ~15 req/s; 12 is safe with retry handling 429s

const CACHE_KEY = 'afterhours_london_crimes_v4'
const CACHE_TTL = 24 * 60 * 60 * 1000   // 24 h — crime data is monthly

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, crimes, dataMonth } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return { crimes, dataMonth }
  } catch { return null }
}

function saveCache(crimes, dataMonth) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), crimes, dataMonth }))
  } catch { /* storage full — silently ignore */ }
}

/**
 * Runs `tasks` with at most `limit` concurrent promises.
 * Calls `onDone(result)` as each task completes — no waiting for a full batch.
 */
async function withConcurrency(tasks, limit, onDone, signal) {
  const queue = [...tasks]
  let active = 0
  let done = 0

  return new Promise((resolve) => {
    function next() {
      if (signal?.aborted) { resolve(); return }
      while (active < limit && queue.length > 0) {
        const task = queue.shift()
        active++
        task().then((result) => {
          active--
          done++
          if (!signal?.aborted) onDone(result, done)
          next()
          if (active === 0 && queue.length === 0) resolve()
        }).catch(() => {
          active--
          done++
          if (!signal?.aborted) onDone([], done)
          next()
          if (active === 0 && queue.length === 0) resolve()
        })
      }
    }
    next()
    if (queue.length === 0 && active === 0) resolve()
  })
}

/**
 * Fetches crime data across inner London via a 43-point hexagonal grid.
 * Deduplicates by crime `id`, merges into a single dataset.
 *
 * Use this for map-wide heatmap + hotspot visualisation.
 * Use useCrimeData for local area risk score calculation.
 */
export function useLondonCrimes(date) {
  const [crimes,    setCrimes]    = useState([])
  const [clusters,  setClusters]  = useState([])
  const [loading,   setLoading]   = useState(false)
  const [progress,  setProgress]  = useState(0)   // 0–100
  const [dataMonth, setDataMonth] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // ── Serve from cache if fresh ──────────────────────────────
    const cached = loadCache()
    if (cached) {
      const clusters = clusterCrimes(cached.crimes)
      setCrimes(cached.crimes)
      setClusters(clusters)
      setDataMonth(cached.dataMonth)
      setLoading(false)
      setProgress(100)
      return
    }

    setLoading(true)
    setProgress(0)
    setCrimes([])
    setClusters([])

    ;(async () => {
      const seen         = new Set()
      const all          = []
      let resolvedMonth  = null
      const total        = LONDON_GRID.length

      const tasks = LONDON_GRID.map((p) => () =>
        fetchNearbyCrimes(p.lat, p.lng, date, controller.signal).catch(() => [])
      )

      await withConcurrency(tasks, CONCURRENCY, (crimes, doneCount) => {
        for (const crime of crimes) {
          const key = crime.id ?? `${crime.location?.latitude},${crime.location?.longitude},${crime.category}`
          if (!seen.has(key)) {
            seen.add(key)
            all.push(crime)
          }
        }

        const snapshot = [...all]
        setCrimes(snapshot)
        setClusters(clusterCrimes(snapshot))
        setProgress(Math.round((doneCount / total) * 100))

        if (snapshot.length > 0 && !resolvedMonth) {
          const [y, m] = snapshot[0].month.split('-')
          resolvedMonth = new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
          setDataMonth(resolvedMonth)
        }
      }, controller.signal)

      if (!controller.signal.aborted) {
        setLoading(false)
        setProgress(100)
        saveCache(all, resolvedMonth)
      }
    })()

    return () => {
      controller.abort()
      setLoading(false)
    }
  }, [date])

  return { crimes, clusters, loading, progress, dataMonth }
}
