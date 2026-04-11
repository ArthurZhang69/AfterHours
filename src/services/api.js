// ============================================================
// AfterHours — Unified Data Service
// ============================================================
// API keys are read from Vite env vars (VITE_ prefix).
// data.police.uk requires NO key — always works.
// TfL requires VITE_TFL_APP_KEY (free registration).
// ============================================================

// In dev, route through Vite proxy (avoids browser CORS issues on some networks).
// In production (GitHub Pages), call the APIs directly — both support CORS.
const POLICE_BASE = import.meta.env.PROD
  ? 'https://data.police.uk/api'
  : '/api/police'
const TFL_BASE = import.meta.env.PROD
  ? 'https://api.tfl.gov.uk'
  : '/api/tfl'

const TFL_KEY = import.meta.env.VITE_TFL_APP_KEY || ''

// Helper: build a URL string with query params (works with relative paths)
function buildUrl(base, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString()
  return qs ? `${base}?${qs}` : base
}

// ─── data.police.uk ──────────────────────────────────────────

/**
 * Fetch all crimes within ~1 mile of a lat/lng point.
 * @param {number} lat
 * @param {number} lng
 * @param {string} [date]  Format: "YYYY-MM". Omit for latest available month.
 * @param {AbortSignal} [signal]
 */
/**
 * fetch with automatic retry on 429 / 5xx.
 * Waits: 1 s → 2 s → 4 s before giving up.
 */
async function fetchWithRetry(url, signal, maxRetries = 3) {
  let lastErr
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Respect abort signal before each attempt
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    let res
    try {
      res = await fetch(url, { signal })
    } catch (err) {
      // Network-level failure (proxy down, connection refused, etc.)
      if (err.name === 'AbortError') throw err
      lastErr = err
      if (attempt < maxRetries - 1) {
        await sleep(1000 * 2 ** attempt, signal)
        continue
      }
      throw err
    }

    if (res.ok) return res

    // Rate-limited or server error — retry with backoff
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries - 1) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10)
      const delay = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt
      console.warn(`Crime API ${res.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
      await sleep(delay, signal)
      continue
    }

    throw new Error(`Crime API: ${res.status}`)
  }
  throw lastErr ?? new Error('fetchWithRetry: exhausted retries')
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  })
}

export async function fetchNearbyCrimes(lat, lng, date, signal) {
  const url = buildUrl(`${POLICE_BASE}/crimes-street/all-crime`, { lat, lng, date })
  try {
    const res = await fetchWithRetry(url, signal)
    return res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw err
    // API unreachable after all retries — fall back to local mock data
    console.warn('data.police.uk unreachable, using mock data:', err.message)
    const mock = await import('../data/mockCrimes.json', { assert: { type: 'json' } })
    return mock.default
  }
}

/**
 * Fetch crimes within a polygon (for LSOA boundary queries).
 * coords: [[lat, lng], ...]  — max ~10,000 results before 503
 */
export async function fetchCrimesByPolygon(coords, date, signal) {
  const poly = coords.map(([lat, lng]) => `${lat},${lng}`).join(':')
  const url  = buildUrl(`${POLICE_BASE}/crimes-street/all-crime`, { poly, date })
  const res  = await fetch(url, { signal })
  if (res.status === 503) throw new Error('Area too large — reduce polygon size')
  if (!res.ok) throw new Error(`Crime API: ${res.status}`)
  return res.json()
}

// ─── TfL Open Data ───────────────────────────────────────────

function tflUrl(path, params = {}) {
  return buildUrl(`${TFL_BASE}${path}`, { ...(TFL_KEY ? { app_key: TFL_KEY } : {}), ...params })
}

/**
 * Find nearby stations (tube, bus, overground) within `radius` metres.
 */
export async function fetchNearbyStations(lat, lng, radius = 600, signal) {
  const url = tflUrl('/StopPoint', {
    lat,
    lon: lng,
    stopTypes: 'NaptanMetroStation,NaptanPublicBusCoachTram,NaptanRailStation',
    radius,
  })
  const effectiveSignal = signal ?? AbortSignal.timeout(10000)
  const res = await fetch(url, { signal: effectiveSignal })
  if (!res.ok) throw new Error(`TfL StopPoint: ${res.status}`)
  const data = await res.json()
  return data.stopPoints ?? []
}

/**
 * Real-time arrivals for a given stop.
 * Returns arrivals sorted by timeToStation ascending.
 */
export async function fetchArrivals(stopId) {
  const url = tflUrl(`/StopPoint/${stopId}/Arrivals`)
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`TfL Arrivals: ${res.status}`)
  const data = await res.json()
  return data.sort((a, b) => a.timeToStation - b.timeToStation)
}

/**
 * Plan a journey between two lat/lng points.
 * Returns an array of journey options.
 */
export async function planJourney(fromLat, fromLng, toLat, toLng) {
  const from = `${fromLat},${fromLng}`
  const to   = `${toLat},${toLng}`
  const url  = tflUrl(`/Journey/JourneyResults/${from}/to/${to}`)
  const res  = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`TfL Journey: ${res.status}`)
  const data = await res.json()
  return data.journeys ?? []
}

/**
 * Fetch all London tube / overground / DLR / Elizabeth line stations in one call.
 * No coordinates needed — returns every station across London.
 */
export async function fetchLondonTransitStations(signal) {
  const modes = 'tube,overground,dlr,elizabeth-line'
  const url = tflUrl(`/StopPoint/Mode/${modes}`)
  const effectiveSignal = signal ?? AbortSignal.timeout(15000)
  const res = await fetch(url, { signal: effectiveSignal })
  if (!res.ok) throw new Error(`TfL StopPoint/Mode: ${res.status}`)
  const data = await res.json()
  return data.stopPoints ?? []
}

/**
 * Current line status for tube / overground / DLR.
 */
export async function fetchLineStatus() {
  const url = tflUrl('/Line/Mode/tube,overground,dlr/Status')
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`TfL LineStatus: ${res.status}`)
  return res.json()
}
