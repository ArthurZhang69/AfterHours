import { useEffect, useRef, useState } from 'react'
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { ROUTE_COLORS } from '../constants/mapStyles'
import { DEMO_ROUTE_A, DEMO_ROUTE_B, DEMO_ORIGIN } from '../utils/risk'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
const HAS_KEY  = Boolean(MAPS_KEY)

// ── Encoded-polyline decoder ────────────────────────────────────────────────
function decodePolyline(encoded) {
  const pts = []
  let i = 0, lat = 0, lng = 0
  while (i < encoded.length) {
    let s = 0, r = 0, b
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5 } while (b >= 0x20)
    lat += (r & 1) ? ~(r >> 1) : (r >> 1); s = 0; r = 0
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5 } while (b >= 0x20)
    lng += (r & 1) ? ~(r >> 1) : (r >> 1)
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return pts
}

// ── Routes API (new) ────────────────────────────────────────────────────────
async function fetchRoutesAPI(origin, destination) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   MAPS_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin:                   { location: { latLng: { latitude: origin.lat,      longitude: origin.lng      } } },
      destination:              { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode:               'WALK',
      computeAlternativeRoutes: true,
      units:                    'METRIC',
    }),
  })
  if (!res.ok) throw new Error(`Routes API ${res.status}`)
  const data = await res.json()
  if (!data.routes?.length) throw new Error('No routes')

  // Normalise to { path, durationSec, distanceM }
  return data.routes.slice(0, 2).map((r) => ({
    path:        decodePolyline(r.polyline.encodedPolyline),
    durationSec: Number(r.duration?.replace?.('s', '') ?? 0),
    distanceM:   r.distanceMeters ?? 0,
  }))
}

// ── DirectionsService fallback (deprecated but still functional) ────────────
function fetchDirections(routesLib, origin, destination) {
  return new Promise((resolve, reject) => {
    const svc = new routesLib.DirectionsService()
    svc.route(
      {
        origin,
        destination,
        travelMode:               routesLib.TravelMode.WALKING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status !== 'OK' || !result?.routes?.length) {
          return reject(new Error(`DirectionsService: ${status}`))
        }
        const pathOf = (route) =>
          route.legs.flatMap((leg) =>
            leg.steps.flatMap((step) =>
              (step.path ?? []).map((p) => ({ lat: p.lat(), lng: p.lng() }))
            )
          )
        resolve(
          result.routes.slice(0, 2).map((r) => ({
            path:        pathOf(r),
            durationSec: r.legs.reduce((s, l) => s + (l.duration?.value ?? 0), 0),
            distanceM:   r.legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0),
          }))
        )
      }
    )
  })
}

// ── Component ───────────────────────────────────────────────────────────────
export default function RouteRenderer({ origin, destination, activeRoute = 'A', onRoutesReady }) {
  const map         = useMap()
  const routesLib   = useMapsLibrary('routes')

  const [routes, setRoutes] = useState(null)   // null | 'DEMO' | NormRoute[]
  const linesRef = useRef([])

  // Polylines used to be hidden during pan/zoom to save a few frames,
  // but the setVisible(false) → true cycle produced a visible flash
  // every time the user nudged the map — worse than the FPS cost.
  // Google's native polyline renderer handles viewport motion fine;
  // we just leave the lines on.

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return

    if (!HAS_KEY) {
      setRoutes('DEMO')
      onRoutesReady?.({ routeA: DEMO_ROUTE_A, routeB: DEMO_ROUTE_B })
      return
    }
    if (!destination) return

    let cancelled = false
    const org = origin ?? DEMO_ORIGIN

    const resolve = (normalized) => {
      if (cancelled) return
      setRoutes(normalized)
      onRoutesReady?.({
        routeA:      normalized[0]?.path ?? [],
        routeB:      normalized[1]?.path ?? [],
        durationSecA: normalized[0]?.durationSec,
        distanceMa:   normalized[0]?.distanceM,
        durationSecB: normalized[1]?.durationSec,
        distanceMb:   normalized[1]?.distanceM,
      })
    }

    fetchRoutesAPI(org, destination)
      .then(resolve)
      .catch((err) => {
        console.warn('[RouteRenderer] Routes API failed, trying DirectionsService:', err.message)
        if (!routesLib || cancelled) return
        fetchDirections(routesLib, org, destination)
          .then(resolve)
          .catch((e) => console.warn('[RouteRenderer] Both routing methods failed:', e.message))
      })

    return () => { cancelled = true; setRoutes(null) }
  }, [map, routesLib, origin?.lat, origin?.lng, destination?.lat, destination?.lng])

  // Auto-fit the viewport to both alternatives as soon as they arrive,
  // so the user sees the whole walk at a glance instead of still being
  // zoomed into the origin neighbourhood. Re-runs only when the route
  // data itself changes — not on every activeRoute toggle.
  useEffect(() => {
    if (!map || !routes || routes === 'DEMO') return
    const bounds = new window.google.maps.LatLngBounds()
    let hasPoints = false
    for (const r of routes) {
      for (const p of r.path ?? []) {
        bounds.extend(p)
        hasPoints = true
      }
    }
    if (!hasPoints) return
    // Padding keeps the polyline clear of the search bar at the top
    // and the bottom sheet at the bottom (which covers ~46% of the
    // viewport in its default HALF snap).
    const vh = window.innerHeight || 800
    map.fitBounds(bounds, {
      top:    120,
      right:  40,
      bottom: Math.round(vh * 0.48),
      left:   40,
    })
  }, [map, routes])

  // ── Draw polylines ────────────────────────────────────────────────────────
  useEffect(() => {
    linesRef.current.forEach((l) => l.setMap(null))
    linesRef.current = []
    if (!map || !routes) return

    const draw = (path, color, weight, opacity, zIndex) => {
      linesRef.current.push(
        new window.google.maps.Polyline({
          path, map, strokeColor: color, strokeWeight: weight,
          strokeOpacity: opacity, zIndex, geodesic: true,
        })
      )
    }

    const paths = routes === 'DEMO'
      ? [DEMO_ROUTE_A, DEMO_ROUTE_B]
      : routes.map((r) => r.path)

    const colors  = [ROUTE_COLORS.safe,  ROUTE_COLORS.risky]
    const actives = ['A', 'B'].map((id) => id === activeRoute)

    paths.forEach((path, i) => {
      if (!path?.length) return
      draw(
        path,
        actives[i] ? ROUTE_COLORS.active : colors[i],
        actives[i] ? 8 : 4,
        actives[i] ? 1.0 : 0.45,
        actives[i] ? 20 : 5,
      )
    })

    return () => linesRef.current.forEach((l) => l.setMap(null))
  }, [routes, activeRoute, map])

  return null
}
