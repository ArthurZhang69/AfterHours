import { useEffect, useState } from 'react'
import { useMap } from '@vis.gl/react-google-maps'

/**
 * Returns `true` while the map is being actively panned or zoomed, `false`
 * once it settles (`idle`). Used by marker layers to drop their DOM during
 * interaction — on iOS Safari, recomputing the positions of dozens of
 * absolutely-positioned AdvancedMarker divs every frame is the single
 * biggest pan-FPS killer. Hiding markers while moving buys us 60 fps;
 * users can't read the labels mid-fling anyway.
 */
export function useMapInteracting() {
  const map = useMap()
  const [interacting, setInteracting] = useState(false)

  useEffect(() => {
    if (!map) return
    const start = () => setInteracting(true)
    const stop  = () => setInteracting(false)

    const l1 = map.addListener('dragstart',    start)
    const l2 = map.addListener('zoom_changed', start)
    const l3 = map.addListener('idle',         stop)

    return () => {
      window.google.maps.event.removeListener(l1)
      window.google.maps.event.removeListener(l2)
      window.google.maps.event.removeListener(l3)
    }
  }, [map])

  return interacting
}
