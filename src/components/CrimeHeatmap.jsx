import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { useMapInteracting } from '../hooks/useMapInteracting'

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

/**
 * Geographic radius for the KDE kernel — fixed in metres, converted to pixels
 * each draw so the heatmap stays geographically consistent at every zoom level.
 * At zoom 14 this is ~18 px; at zoom 17 it is ~140 px (crimes blend properly).
 * Clamped so the canvas never becomes impractically large at extreme zooms.
 */
const GEO_RADIUS_M = 85    // metres — controls the "spread" of each crime
const MIN_RADIUS_PX = 6    // never smaller (prevents invisible dots)
const MAX_RADIUS_PX = 50   // never larger  (prevents huge canvas blowup)

/**
 * Internal render scale. Canvas backing store is drawn at this fraction of
 * the display size, then CSS-scaled up. A KDE heatmap is already a blurred
 * continuous field, so halving resolution is visually imperceptible but
 * quarters the number of pixels the JS color-ramp loop has to touch —
 * the single biggest CPU cost of a full redraw on iOS Safari.
 */
const RENDER_SCALE = 0.5

/**
 * Small padding around the viewport — the canvas is hidden during active
 * pan/zoom, so we no longer need to overshoot to cover motion. Just enough
 * buffer to hide the edge of the fade-in if Maps' idle event lags slightly.
 */
const PAN_BUFFER = 0.1

function buildColorRamp() {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 1
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 256, 0)
  g.addColorStop(0,    'rgba(0,0,0,0)')
  g.addColorStop(0.04, 'rgba(0,0,4,0)')
  g.addColorStop(0.12, 'rgba(28,16,68,0.6)')
  g.addColorStop(0.25, 'rgba(82,9,107,0.72)')
  g.addColorStop(0.38, 'rgba(150,30,100,0.80)')
  g.addColorStop(0.52, 'rgba(208,61,89,0.87)')
  g.addColorStop(0.65, 'rgba(246,110,60,0.92)')
  g.addColorStop(0.78, 'rgba(254,172,96,0.96)')
  g.addColorStop(0.90, 'rgba(254,220,154,0.98)')
  g.addColorStop(1.0,  'rgba(252,253,191,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 1)
  return ctx.getImageData(0, 0, 256, 1).data
}

/** Build a Gaussian spot canvas for a given pixel radius. */
function buildSpot(radius) {
  const c = document.createElement('canvas')
  c.width = c.height = radius * 2
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius)
  g.addColorStop(0,   'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  g.addColorStop(1,   'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, c.width, c.height)
  return c
}

const COLOR_RAMP = buildColorRamp()

/**
 * Compute pixel-equivalent of GEO_RADIUS_M metres at the map's current
 * projection. Uses two lat/lng points separated by GEO_RADIUS_M on the
 * same meridian and measures their pixel distance.
 */
function geoRadiusToPx(proj, centerLatLng) {
  const lat = centerLatLng.lat()
  const lng = centerLatLng.lng()
  // 1 degree latitude ≈ 111 320 m
  const offsetDeg = GEO_RADIUS_M / 111320
  const pxA = proj.fromLatLngToDivPixel(
    new window.google.maps.LatLng(lat,            lng)
  )
  const pxB = proj.fromLatLngToDivPixel(
    new window.google.maps.LatLng(lat + offsetDeg, lng)
  )
  const px = Math.abs(pxA.y - pxB.y)
  return Math.round(Math.max(MIN_RADIUS_PX, Math.min(px, MAX_RADIUS_PX)))
}

/**
 * Above this zoom the heatmap fades out — individual markers are more useful
 * at street level and discrete circles look bad at high magnification.
 */
const FADE_START_ZOOM = 16   // full opacity
const FADE_END_ZOOM   = 18   // mostly hidden

function heatmapOpacity(zoom) {
  if (zoom <= FADE_START_ZOOM) return 0.62
  if (zoom >= FADE_END_ZOOM)   return 0.10
  const t = (zoom - FADE_START_ZOOM) / (FADE_END_ZOOM - FADE_START_ZOOM)
  return 0.62 * (1 - t) + 0.10 * t
}

/**
 * Continuous KDE heatmap using google.maps.OverlayView + Canvas.
 *
 * Performance design:
 * - Overlay is created ONCE per map instance (not on every crimes update).
 * - crimes/category changes only update a mutable ref; the actual canvas
 *   redraw is debounced by 900 ms so that rapid batch-load updates
 *   (useLondonCrimes fires every ~1 s) collapse into a single draw.
 * - Pan/zoom: a 25% viewport buffer is baked into the canvas so the user
 *   can pan up to ¼ of the screen without revealing blank edges.
 *   During pan, 'bounds_changed' fires a cheap CSS translate to track the
 *   map movement frame-by-frame, keeping the canvas visually aligned until
 *   the next full redraw on 'idle'.
 * - Radius is computed geographically (GEO_RADIUS_M metres → pixels) so
 *   the kernel spread is consistent across all zoom levels. A spot canvas
 *   is rebuilt each draw only when the radius changes.
 */
export default function CrimeHeatmap({ crimes, category = 'all' }) {
  const map          = useMap()
  const interacting  = useMapInteracting()
  const overlayRef   = useRef(null)
  const listenersRef = useRef([])
  const dataRef      = useRef({ crimes, category })
  const dataTimerRef = useRef(null)
  const idleTimerRef = useRef(null)
  const anchorRef    = useRef(null)   // { latLng, px: {x, y} }
  // Cache the last-used spot so we don't rebuild it on every draw when
  // the radius hasn't changed (common during plain pan/data updates).
  const spotCacheRef = useRef({ radius: -1, canvas: null })
  const rafRef         = useRef(null)

  // ── Create overlay once when the map is available ──────────────────────
  useEffect(() => {
    if (!map) return

    const overlay = new window.google.maps.OverlayView()

    overlay.onAdd = function () {
      const canvas = document.createElement('canvas')
      // will-change pins the canvas onto its own compositor layer so the
      // RAF translate/scale during pan and zoom stays on the GPU and doesn't
      // trigger layout or full-layer repaints.
      canvas.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:none;' +
        'will-change:transform;transform:translateZ(0);'
      this._canvas = canvas
      this.getPanes().overlayLayer.appendChild(canvas)
    }

    overlay.draw = function () {
      const proj = this.getProjection()
      if (!proj) return
      const bounds = map.getBounds()
      if (!bounds) return

      const { crimes: c, category: cat } = dataRef.current
      if (!c?.length) return

      const zoom = map.getZoom() ?? 14

      const ne = proj.fromLatLngToDivPixel(bounds.getNorthEast())
      const sw = proj.fromLatLngToDivPixel(bounds.getSouthWest())
      const vpW  = Math.abs(ne.x - sw.x)
      const vpH  = Math.abs(sw.y - ne.y)
      const bufX = Math.ceil(vpW * PAN_BUFFER)
      const bufY = Math.ceil(vpH * PAN_BUFFER)

      // Note: a pan-only "fast path" (reposition cached pixels without
      // re-projecting each crime) was tried and removed — Google Maps'
      // OverlayView pane can renormalise its pixel origin between
      // gestures, so deltas don't reliably describe the transform. The
      // heatmap drifted off its real crime positions, which is strictly
      // worse than a performance dip. Always fully re-render.

      const filtered = cat === 'all' ? c : c.filter((x) => x.category === cat)
      if (!filtered.length) return

      // ── Dynamic geographic radius (at display px), then scaled internally
      const RADIUS = geoRadiusToPx(proj, bounds.getCenter())

      // Canvas covers viewport + buffer on all four sides (display pixels)
      const left = Math.floor(Math.min(ne.x, sw.x)) - bufX - RADIUS
      const top  = Math.floor(Math.min(ne.y, sw.y)) - bufY - RADIUS
      const dispW = Math.ceil(vpW) + bufX * 2 + RADIUS * 2
      const dispH = Math.ceil(vpH) + bufY * 2 + RADIUS * 2

      // Internal backing-store size (half res). All pixel work happens here.
      const w = Math.max(1, Math.round(dispW * RENDER_SCALE))
      const h = Math.max(1, Math.round(dispH * RENDER_SCALE))
      const R = Math.max(MIN_RADIUS_PX * RENDER_SCALE, Math.round(RADIUS * RENDER_SCALE))

      // Rebuild spot only when internal radius changes
      if (spotCacheRef.current.radius !== R) {
        spotCacheRef.current = { radius: R, canvas: buildSpot(R) }
      }
      const SPOT = spotCacheRef.current.canvas

      const canvas = this._canvas
      canvas.style.left     = `${left}px`
      canvas.style.top      = `${top}px`
      canvas.style.width    = `${dispW}px`
      canvas.style.height   = `${dispH}px`
      canvas.style.opacity  = String(heatmapOpacity(zoom))
      canvas.width  = w
      canvas.height = h

      anchorRef.current = { latLng: bounds.getNorthEast(), vpW }

      // Phase 1: accumulate density at half-res
      const density = document.createElement('canvas')
      density.width = w; density.height = h
      const dCtx = density.getContext('2d')
      dCtx.fillStyle = '#000'
      dCtx.fillRect(0, 0, w, h)
      dCtx.globalCompositeOperation = 'lighter'

      for (const p of filtered) {
        const px = proj.fromLatLngToDivPixel(
          new window.google.maps.LatLng(
            parseFloat(p.location.latitude),
            parseFloat(p.location.longitude)
          )
        )
        const x = (px.x - left) * RENDER_SCALE - R
        const y = (px.y - top)  * RENDER_SCALE - R
        // Cull points whose spot can't touch the canvas at all
        if (x + R * 2 < 0 || y + R * 2 < 0 || x > w || y > h) continue
        dCtx.globalAlpha = Math.min((WEIGHTS[p.category] ?? 1.0) * 0.04, 1)
        dCtx.drawImage(SPOT, x, y)
      }

      // Phase 2: apply colour ramp. Fast-path skips transparent pixels,
      // which on a sparse heatmap is 70-90% of the canvas.
      const raw = dCtx.getImageData(0, 0, w, h).data
      const out = new ImageData(w, h)
      const dst = out.data
      const N = raw.length
      for (let i = 0; i < N; i += 4) {
        const v = raw[i]
        if (v === 0) continue            // leave dst transparent
        const idx = v << 2               // v * 4
        dst[i]     = COLOR_RAMP[idx]
        dst[i + 1] = COLOR_RAMP[idx + 1]
        dst[i + 2] = COLOR_RAMP[idx + 2]
        dst[i + 3] = COLOR_RAMP[idx + 3]
      }

      canvas.getContext('2d').putImageData(out, 0, 0)
    }

    overlay.onRemove = function () {
      this._canvas?.parentNode?.removeChild(this._canvas)
    }

    overlay.setMap(map)
    overlayRef.current = overlay

    // ── Full redraw after map settles ─────────────────────────────────────
    // No RAF pan/zoom tracking: canvas is hidden during interaction (see the
    // second effect below) and simply redrawn in place on idle. That removes
    // per-frame projection calls + layer re-compositing — the two things that
    // most visibly drop iOS Safari below 60 fps on a complex custom overlay.
    listenersRef.current.push(
      map.addListener('idle', () => {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(() => {
          // rAF defers the actual pixel work by one frame so the gesture
          // stack can unwind first. Without this, the heavy redraw fires
          // synchronously on 'idle' and blocks the frame right after the
          // user lifts their finger — exactly when they notice a stutter.
          cancelAnimationFrame(rafRef.current)
          rafRef.current = requestAnimationFrame(() => overlay.draw())
        }, 120)
      })
    )

    return () => {
      clearTimeout(dataTimerRef.current)
      clearTimeout(idleTimerRef.current)
      cancelAnimationFrame(rafRef.current)
      listenersRef.current.forEach((l) => window.google.maps.event.removeListener(l))
      listenersRef.current = []
      overlay.setMap(null)
      overlayRef.current = null
      anchorRef.current  = null
    }
  }, [map])

  // ── Freeze/restore canvas visibility during interaction ─────────────────
  // Use `display: none` (not opacity 0): opacity:0 still holds a compositor
  // layer on iOS Safari which must be transformed frame-by-frame as the map
  // pans. display:none detaches the layer entirely so the compositor has
  // strictly less work — the GPU can dedicate itself to the vector tiles.
  useEffect(() => {
    const canvas = overlayRef.current?._canvas
    if (!canvas) return
    if (interacting) {
      canvas.style.display    = 'none'
      canvas.style.transition = ''
    } else {
      const z = map?.getZoom() ?? 14
      canvas.style.display    = 'block'
      canvas.style.transition = 'opacity 180ms ease-out'
      canvas.style.opacity    = String(heatmapOpacity(z))
    }
  }, [interacting, map])

  // ── Update data ref + schedule debounced redraw on data changes ─────────
  useEffect(() => {
    dataRef.current = { crimes, category }
    clearTimeout(dataTimerRef.current)
    dataTimerRef.current = setTimeout(() => {
      overlayRef.current?.draw()
    }, 900)
    return () => clearTimeout(dataTimerRef.current)
  }, [crimes, category])

  return null
}
