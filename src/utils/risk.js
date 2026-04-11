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

/**
 * Converts a raw weighted crime score to a normalised 0-100 value.
 * Uses a soft cap so extreme outliers don't saturate the scale.
 */
export function normaliseScore(rawScore, maxExpected = 150) {
  return Math.min(100, Math.round((rawScore / maxExpected) * 100))
}

export function areaRiskScore(crimes) {
  if (!crimes.length) return 0
  const raw = crimes.reduce((sum, c) => sum + (WEIGHTS[c.category] ?? DEFAULT_WEIGHT), 0)
  // maxExpected calibrated for central London borough volumes (~3000 raw ≈ very high crime)
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

/**
 * Scores a route (array of {lat, lng} waypoints) against a crime dataset.
 * Counts crimes within `corridorKm` kilometres of any point on the path.
 */
export function scoreRoute(routePoints, crimes, corridorKm = 0.1) {
  if (!routePoints?.length || !crimes?.length) return 0

  let totalScore = 0
  const counted  = new Set()

  for (const crime of crimes) {
    const cLat = parseFloat(crime.location.latitude)
    const cLng = parseFloat(crime.location.longitude)

    for (const point of routePoints) {
      const dist = haversineKm(point.lat, point.lng, cLat, cLng)
      if (dist <= corridorKm && !counted.has(crime.id)) {
        totalScore += WEIGHTS[crime.category] ?? DEFAULT_WEIGHT
        counted.add(crime.id)
        break
      }
    }
  }

  return normaliseScore(totalScore, 80)
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
