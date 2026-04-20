import { AdvancedMarker } from '@vis.gl/react-google-maps'
import { useMapInteracting } from '../hooks/useMapInteracting'

/**
 * Pulsing blue dot for the user's current location.
 * Unmounted during pan/zoom so the ring-pulse animation isn't consuming
 * compositor cycles while Google Maps is trying to render smooth tile motion.
 */
export default function UserMarker({ position }) {
  const interacting = useMapInteracting()
  if (!position || interacting) return null

  return (
    <AdvancedMarker position={position} zIndex={20}>
      <div className="user-marker">
        <div className="user-marker__ring" />
        <div className="user-marker__dot" />
      </div>
    </AdvancedMarker>
  )
}
