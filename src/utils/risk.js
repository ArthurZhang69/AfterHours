import { CRIME_COLORS } from '../constants/mapStyles'

// ─── Crime severity weights ───────────────────────────────────
const WEIGHTS = {
  'violent-crime':          3.0,
  'robbery':                3.0,
  'theft-from-the-person':  2.0,
  'drugs':                  1.5,
  'public-order':           1.5,
  'other-theft':            1.5,
  'vehicle-crime':          1.0,
  'anti-social-behaviour':  1.0,
}
const DEFAULT_WEIGHT = 1.0

// ─── Crime clustering ─────────────────────────────────────────

/**
 * Groups crimes by approximate location (~100 m grid).
 * Returns an array of cluster objects suitable for map markers.
 */
export function clusterCrimes(crimes) {
  const map = {}

  for (const crime of crimes) {
    // ~278 m grid (1/400 degree) — used only as grouping key, NOT as display position
    const gridLat = Math.round(parseFloat(crime.location.latitude)  * 400) / 400
    const gridLng = Math.round(parseFloat(crime.location.longitude) * 400) / 400
    const key = `${gridLat},${gridLng}`

    if (!map[key]) {
      map[key] = { lat: 0, lng: 0, _latSum: 0, _lngSum: 0, crimes: [], dominant: null, count: 0, score: 0 }
    }
    // Accumulate raw coordinates for true centroid calculation
    map[key]._latSum += parseFloat(crime.location.latitude)
    map[key]._lngSum += parseFloat(crime.location.longitude)
    map[key].crimes.push(crime)
  }

  for (const cluster of Object.values(map)) {
    cluster.count = cluster.crimes.length

    // True geographic centroid — marker sits at the actual centre of its crimes,
    // not snapped to the nearest grid intersection
    cluster.lat = cluster._latSum / cluster.count
    cluster.lng = cluster._lngSum / cluster.count

    // Tally categories
    const counts = {}
    let score = 0
    for (const c of cluster.crimes) {
      counts[c.category] = (counts[c.category] || 0) + 1
      score += WEIGHTS[c.category] ?? DEFAULT_WEIGHT
    }

    cluster.score    = score
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    cluster.dominant  = sorted.length > 0 ? sorted[0][0] : 'other-theft'
    cluster.color     = CRIME_COLORS[cluster.dominant] ?? CRIME_COLORS.default
    cluster.breakdown = counts
  }

  return Object.values(map)
}

// ─── Cluster marker sizing ────────────────────────────────────

export function clusterSize(count) {
  if (count >= 50) return 14
  if (count >= 20) return 11
  if (count >= 10) return 9
  if (count >= 5)  return 7
  return 6
}

// ─── Area risk score (0 – 100) ───────────────────────────────
//
// Model: KDE-based area risk following Galbrun, Pelechrinis & Terzi (2016),
// "Urban navigation beyond shortest route: The case of safe paths".
//   λ(p) = Σ wᵢ · exp( -||cᵢ − p||² / (2h²) )
// where wᵢ is the severity weight of crime i and ||cᵢ − p|| is the great-
// circle distance (km) from the query point p to crime i. Crimes close to
// p contribute more than far crimes; the smooth Gaussian kernel replaces
// the old hard-radius flat sum.

const DEFAULT_BANDWIDTH_KM = 0.4   // h — 400 m kernel bandwidth for area risk
const KDE_CUTOFF_SIGMAS    = 3     // beyond 3h, exp(-d²/2h²) < 0.012

/**
 * Converts a raw weighted crime score to a normalised 0-100 value.
 * Uses a soft cap so extreme outliers don't saturate the scale.
 */
export function normaliseScore(rawScore, maxExpected = 150) {
  return Math.min(100, Math.round((rawScore / maxExpected) * 100))
}

/**
 * Gaussian KDE density at point `center`, summed over `crimes`.
 * Returns the raw unnormalised λ(p).
 */
export function kdeDensity(crimes, center, bandwidthKm = DEFAULT_BANDWIDTH_KM) {
  if (!crimes?.length || center?.lat == null || center?.lng == null) return 0
  const h2     = bandwidthKm * bandwidthKm
  const cutoff = KDE_CUTOFF_SIGMAS * bandwidthKm
  let sum = 0
  for (const c of crimes) {
    const d = haversineKm(
      center.lat, center.lng,
      parseFloat(c.location.latitude),
      parseFloat(c.location.longitude),
    )
    if (d > cutoff) continue
    const w = WEIGHTS[c.category] ?? DEFAULT_WEIGHT
    sum += w * Math.exp(-(d * d) / (2 * h2))
  }
  return sum
}

/**
 * Area risk score on 0–100.
 *   Primary path (center given): KDE density normalised by `maxExpected`.
 *   Fallback (no center): legacy flat weighted sum — preserved for any
 *   caller that has already spatially filtered its crime list.
 */
export function areaRiskScore(crimes, center, bandwidthKm = DEFAULT_BANDWIDTH_KM) {
  if (!crimes?.length) return 0
  if (center?.lat != null && center?.lng != null) {
    const density = kdeDensity(crimes, center, bandwidthKm)
    // Calibration (empirical, against live inner-London data):
    //   - quiet residential (~50 crimes / 500 m)  → raw ≈  60   → score  ~6
    //   - typical inner London (~280 crimes / 500 m) → raw ≈ 500 → score ~50
    //   - hotspot (~500 crimes / 500 m, heavy weights) → raw ≈ 900 → score ~90
    return normaliseScore(density, 1000)
  }
  const raw = crimes.reduce((s, c) => s + (WEIGHTS[c.category] ?? DEFAULT_WEIGHT), 0)
  return normaliseScore(raw, 3000)
}

// ─── Risk level labels ────────────────────────────────────────

export function getRiskLevel(score) {
  if (score >= 75) return 'CRITICAL'
  if (score >= 50) return 'HIGH'
  if (score >= 25) return 'MEDIUM'
  return 'LOW'
}

export function getRiskColor(score) {
  if (score >= 75) return '#FF1744'
  if (score >= 50) return '#FF5252'
  if (score >= 25) return '#FFAB40'
  return '#00E676'
}

export function getRiskLabel(score) {
  const level = getRiskLevel(score)
  const labels = {
    CRITICAL: 'Critical Risk',
    HIGH:     'High Risk',
    MEDIUM:   'Medium Risk',
    LOW:      'Low Risk',
  }
  return labels[level]
}

// ─── Local radius filter ──────────────────────────────────────

/**
 * Returns only crimes within radiusKm of center {lat, lng}.
 * Used to compute area risk for the user's immediate vicinity.
 */
export function filterCrimesByRadius(crimes, center, radiusKm = 0.5) {
  if (!center?.lat || !center?.lng || !crimes?.length) return crimes ?? []
  return crimes.filter((c) =>
    haversineKm(
      center.lat, center.lng,
      parseFloat(c.location.latitude),
      parseFloat(c.location.longitude),
    ) <= radiusKm
  )
}

// ─── Route risk scoring ───────────────────────────────────────
//
// Following Galbrun et al. (2016) formulas 2 & 3:
//   Total route risk:  r_t(P) = 1 − Π (1 − r(e))       ← overall exposure
//   Max route risk:    r_m(P) = max r(e)               ← warning trigger
// where r(e) ∈ [0, 1] is a per-segment risk derived from the local KDE
// density at the segment midpoint, mapped through r = 1 − exp(−λ / s).

const SEGMENT_BANDWIDTH_KM    = 0.1   // h — narrow kernel for corridor-local density
const SEGMENT_SATURATION      = 30    // s — density at which r(e) ≈ 0.63
const DEFAULT_MAX_SEGMENTS    = 20    // downsample polylines to keep scoring fast

/**
 * Maps a raw KDE density λ to a segment probability r(e) ∈ [0, 1] via
 * r = 1 − exp(−λ / s). Monotone in λ; saturates smoothly.
 */
function segmentProbability(density, scale = SEGMENT_SATURATION) {
  return 1 - Math.exp(-density / scale)
}

/**
 * Scores a route polyline against a crime dataset using Galbrun et al.'s
 * total and max route-risk formulas.
 *
 * @param {Array<{lat:number,lng:number}>} routePoints — polyline waypoints
 * @param {Array} crimes — crime incidents (data.police.uk format)
 * @param {Object} [opts]
 * @param {number} [opts.bandwidthKm=0.1]  — KDE bandwidth for segment risk
 * @param {number} [opts.maxSegments=20]   — downsample cap for long polylines
 * @returns {{ total:number, max:number, segments:Array }}
 *   total, max on 0–100; segments is an array of {lat, lng, risk} midpoints.
 */
export function scoreRoute(routePoints, crimes, opts = {}) {
  const {
    bandwidthKm = SEGMENT_BANDWIDTH_KM,
    maxSegments = DEFAULT_MAX_SEGMENTS,
  } = opts

  if (!routePoints?.length || !crimes?.length) {
    return { total: 0, max: 0, segments: [] }
  }

  // Stride-sample the polyline so we compute at most `maxSegments` midpoints.
  const n      = routePoints.length
  const step   = Math.max(1, Math.floor(n / maxSegments))
  const sample = []
  for (let i = 0; i < n; i += step) sample.push(routePoints[i])
  if (sample[sample.length - 1] !== routePoints[n - 1]) sample.push(routePoints[n - 1])

  // Per-segment risk: r(e) = 1 − exp(−λ(mid) / s)
  const segments = []
  for (let i = 0; i < sample.length - 1; i++) {
    const a = sample[i], b = sample[i + 1]
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
    const density = kdeDensity(crimes, mid, bandwidthKm)
    segments.push({ ...mid, risk: segmentProbability(density) })
  }

  // Formula 2: r_t = 1 − Π(1 − r(e));  Formula 3: r_m = max r(e)
  // Sum log(1 − r) instead of multiplying to stay numerically stable.
  let logSafe = 0
  let maxR    = 0
  for (const s of segments) {
    logSafe += Math.log(1 - Math.min(s.risk, 0.9999))
    if (s.risk > maxR) maxR = s.risk
  }
  const total = 1 - Math.exp(logSafe)

  return {
    total:    Math.round(total * 100),
    max:      Math.round(maxR * 100),
    segments,
  }
}

// ─── Haversine distance (km) ──────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg) { return (deg * Math.PI) / 180 }

// ─── Demo / mock routes (used when Google Maps key not set) ───

export const DEMO_ORIGIN      = { lat: 51.5246, lng: -0.1340 } // UCL
export const DEMO_DESTINATION = { lat: 51.5393, lng: -0.1426 } // Camden Town

// Route A — via Gower St → Euston → Camden Rd (busier, better lit)
export const DEMO_ROUTE_A = [
  { lat: 51.5246, lng: -0.1340 },
  { lat: 51.5265, lng: -0.1335 },
  { lat: 51.5285, lng: -0.1318 },
  { lat: 51.5300, lng: -0.1290 },
  { lat: 51.5318, lng: -0.1295 },
  { lat: 51.5340, lng: -0.1340 },
  { lat: 51.5360, lng: -0.1375 },
  { lat: 51.5393, lng: -0.1426 },
]

// Route B — via Tottenham Court Rd → Hampstead Rd (more direct, darker)
export const DEMO_ROUTE_B = [
  { lat: 51.5246, lng: -0.1340 },
  { lat: 51.5230, lng: -0.1310 },
  { lat: 51.5245, lng: -0.1270 },
  { lat: 51.5270, lng: -0.1260 },
  { lat: 51.5295, lng: -0.1275 },
  { lat: 51.5330, lng: -0.1305 },
  { lat: 51.5365, lng: -0.1360 },
  { lat: 51.5393, lng: -0.1426 },
]
