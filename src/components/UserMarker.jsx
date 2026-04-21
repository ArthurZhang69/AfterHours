import { AdvancedMarker } from '@vis.gl/react-google-maps'

/**
 * Pulsing blue dot for the user's current location.
 * Stays mounted during pan/zoom — the previous unmount-on-interaction
 * optimisation caused a distracting flicker every time the user dragged
 * the map, which was worse than the small compositor tax of keeping
 * the ring-pulse animation running.
 */
export default function UserMarker({ position }) {
  if (!position) return null

  return (
    <AdvancedMarker position={position} zIndex={20}>
      <div className="user-marker">
        <div className="user-marker__ring" />
        <div className="user-marker__dot" />
      </div>
    </AdvancedMarker>
  )
}
