import { useEffect } from 'react'
import { useMap } from '@vis.gl/react-google-maps'

/**
 * Invisible component — pans the map when `panTo` changes,
 * and boosts zoom when entering 3D so buildings become visible.
 * Must be rendered inside a <Map> context.
 */
export default function MapController({ panTo, is3D }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !panTo) return
    map.panTo(panTo)
    if (map.getZoom() < 13) map.setZoom(15)
  }, [map, panTo])

  // Google's vector renderer only extrudes building polygons once
  // you're at zoom ≥ 17 — below that you just get flat outlines even
  // at tilt 45°. So when the user hits the 3D toggle, auto-zoom to
  // at least 17 around the current centre. If they're already closer
  // (17+), leave their zoom alone so we don't jerk them out of a
  // street-level view they deliberately set.
  useEffect(() => {
    if (!map) return
    if (is3D && map.getZoom() < 17) {
      map.setZoom(17)
    }
  }, [map, is3D])

  return null
}
