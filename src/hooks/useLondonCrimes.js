import { useEffect, useState, useRef } from 'react'
import { fetchNearbyCrimes } from '../services/api'
import { clusterCrimes } from '../utils/risk'

/**
 * 24-point grid covering inner London (roughly Zone 1–2).
 * Ordered centre-out so the most crime-dense, most visible area loads first
 * and the progressive heatmap is useful within the first few seconds.
 * Each point's ~1-mile API radius overlaps neighbours — no coverage gaps.
 */
const LONDON_GRID = [
  // ── Priority 1: dense central core (loads first) ──────────────
  { lat: 51.514, lng: -0.130 }, // Soho / West End
  { lat: 51.520, lng: -0.065 }, // Shoreditch / Clerkenwell
  { lat: 51.514, lng: -0.098 }, // St. Paul's / City of London
  { lat: 51.498, lng: -0.125 }, // Westminster / Pimlico
  { lat: 51.497, lng: -0.082 }, // Borough / Bermondsey
  // ── Priority 2: inner ring ─────────────────────────────────────
  { lat: 51.530, lng: -0.145 }, // Marylebone / Regent's Park
  { lat: 51.556, lng: -0.125 }, // Camden / Kentish Town
  { lat: 51.547, lng: -0.080 }, // Islington / Highbury
  { lat: 51.532, lng: -0.106 }, // Angel / Islington south
  { lat: 51.516, lng: -0.015 }, // Whitechapel / Bethnal Green
  { lat: 51.474, lng: -0.120 }, // Vauxhall / Lambeth
  { lat: 51.474, lng: -0.085 }, // Peckham / Walworth
  // ── Priority 3: outer areas ────────────────────────────────────
  { lat: 51.530, lng: -0.200 }, // Paddington / Notting Hill
  { lat: 51.510, lng: -0.195 }, // Kensington / Hammersmith
  { lat: 51.487, lng: -0.175 }, // Fulham / Chelsea
  { lat: 51.505, lng:  0.010 }, // Canary Wharf / Poplar
  { lat: 51.462, lng: -0.120 }, // Brixton / Clapham
  { lat: 51.463, lng: -0.072 }, // Lewisham / New Cross
  // ── Gap fills (previously uncovered) ──────────────────────────
  { lat: 51.545, lng: -0.055 }, // Hackney / Dalston (gap between Islington & Shoreditch)
  { lat: 51.518, lng: -0.040 }, // Stepney / Mile End (gap between Shoreditch & Whitechapel)
  { lat: 51.497, lng: -0.055 }, // Bermondsey East / Rotherhithe (gap between Borough & Canary Wharf)
  { lat: 51.479, lng: -0.148 }, // Battersea / Nine Elms (gap between Fulham & Vauxhall)
  { lat: 51.514, lng: -0.170 }, // Bayswater / Hyde Park (gap between Paddington & Kensington)
  { lat: 51.477, lng: -0.024 }, // Deptford / Greenwich (gap between Canary Wharf & Lewisham)
]

const CONCURRENCY = 6   // concurrent requests — police API allows ~15 req/s; retry handles 429

const CACHE_KEY = 'afterhours_london_crimes_v2'
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

  return new Promise((resolve, reject) => {
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
    // Edge case: empty task list
    if (queue.length === 0 && active === 0) resolve()
  })
}

/**
 * Fetches crime data across inner London via a 16-point grid.
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
        // Merge deduplicated crimes
        for (const crime of crimes) {
          const key = crime.id ?? `${crime.location?.latitude},${crime.location?.longitude},${crime.category}`
          if (!seen.has(key)) {
            seen.add(key)
            all.push(crime)
          }
        }

        // Progressive update — update map after every completed request
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
