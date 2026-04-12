import { useEffect, useState, useRef } from 'react'
import { fetchNearbyCrimes } from '../services/api'
import { clusterCrimes } from '../utils/risk'

/**
 * 80-point hexagonal grid covering inner London (Zone 1–2 and beyond).
 * Generated with 1.8km spacing — guarantees no location is more than 1.6km
 * from its nearest grid point, eliminating all coverage gaps.
 * Ordered roughly centre-out so central areas appear first during progressive load.
 */
const LONDON_GRID = [
  // ── Central core (loads first) ────────────────────────────────
  { lat: 51.515, lng: -0.1211 },
  { lat: 51.515, lng: -0.0951 },
  { lat: 51.499, lng: -0.1341 },
  { lat: 51.499, lng: -0.1081 },
  { lat: 51.499, lng: -0.0821 },
  { lat: 51.515, lng: -0.1471 },
  { lat: 51.499, lng: -0.0562 },
  { lat: 51.515, lng: -0.0692 },
  { lat: 51.531, lng: -0.1341 },
  { lat: 51.531, lng: -0.1081 },
  { lat: 51.531, lng: -0.0821 },
  { lat: 51.499, lng: -0.0302 },
  { lat: 51.515, lng: -0.0432 },
  { lat: 51.531, lng: -0.1601 },
  { lat: 51.531, lng: -0.0562 },
  // ── Inner ring ────────────────────────────────────────────────
  { lat: 51.482, lng: -0.1471 },
  { lat: 51.482, lng: -0.1211 },
  { lat: 51.482, lng: -0.0951 },
  { lat: 51.482, lng: -0.0692 },
  { lat: 51.482, lng: -0.0432 },
  { lat: 51.499, lng: -0.1601 },
  { lat: 51.499, lng: -0.0042 },
  { lat: 51.515, lng: -0.1731 },
  { lat: 51.515, lng: -0.1990 },
  { lat: 51.515, lng: -0.0172 },
  { lat: 51.515, lng:  0.0088 },
  { lat: 51.531, lng: -0.1860 },
  { lat: 51.531, lng: -0.0302 },
  { lat: 51.531, lng: -0.0042 },
  { lat: 51.531, lng:  0.0218 },
  { lat: 51.547, lng: -0.1471 },
  { lat: 51.547, lng: -0.1211 },
  { lat: 51.547, lng: -0.0951 },
  { lat: 51.547, lng: -0.0692 },
  { lat: 51.547, lng: -0.0432 },
  { lat: 51.547, lng: -0.1731 },
  // ── Outer ring ────────────────────────────────────────────────
  { lat: 51.466, lng: -0.1601 },
  { lat: 51.466, lng: -0.1341 },
  { lat: 51.466, lng: -0.1081 },
  { lat: 51.466, lng: -0.0821 },
  { lat: 51.466, lng: -0.0562 },
  { lat: 51.466, lng: -0.0302 },
  { lat: 51.466, lng: -0.0042 },
  { lat: 51.466, lng:  0.0218 },
  { lat: 51.466, lng: -0.2120 },
  { lat: 51.466, lng: -0.1860 },
  { lat: 51.482, lng: -0.1731 },
  { lat: 51.482, lng: -0.1990 },
  { lat: 51.482, lng: -0.2250 },
  { lat: 51.482, lng: -0.0172 },
  { lat: 51.482, lng:  0.0088 },
  { lat: 51.499, lng: -0.1860 },
  { lat: 51.499, lng: -0.2120 },
  { lat: 51.499, lng:  0.0218 },
  { lat: 51.547, lng: -0.1990 },
  { lat: 51.547, lng: -0.2250 },
  { lat: 51.547, lng: -0.0172 },
  { lat: 51.547, lng:  0.0088 },
  { lat: 51.564, lng: -0.1601 },
  { lat: 51.564, lng: -0.1341 },
  { lat: 51.564, lng: -0.1081 },
  { lat: 51.564, lng: -0.0821 },
  { lat: 51.564, lng: -0.0562 },
  { lat: 51.564, lng: -0.0302 },
  { lat: 51.564, lng: -0.1860 },
  { lat: 51.564, lng: -0.2120 },
  // ── Edge / outermost ──────────────────────────────────────────
  { lat: 51.450, lng: -0.1731 },
  { lat: 51.450, lng: -0.1471 },
  { lat: 51.450, lng: -0.1211 },
  { lat: 51.450, lng: -0.0951 },
  { lat: 51.450, lng: -0.0692 },
  { lat: 51.450, lng: -0.0432 },
  { lat: 51.531, lng: -0.2120 },
  { lat: 51.531, lng: -0.2250 },
  { lat: 51.580, lng: -0.1731 },
  { lat: 51.580, lng: -0.1471 },
  { lat: 51.580, lng: -0.1211 },
  { lat: 51.580, lng: -0.0951 },
  { lat: 51.580, lng: -0.0692 },
  { lat: 51.580, lng: -0.0432 },
]

const CONCURRENCY = 6   // concurrent requests — police API allows ~15 req/s; retry handles 429

const CACHE_KEY = 'afterhours_london_crimes_v3'
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
 * Fetches crime data across inner London via an 80-point hexagonal grid.
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
