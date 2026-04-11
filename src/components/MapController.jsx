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

  // Boost zoom to show 3D buildings (need ≥ 16), restore on exit
  useEffect(() => {
    if (!map) return
    if (is3D) {
      if (map.getZoom() < 16) map.setZoom(16)
    }
  }, [map, is3D])

  return null
}
