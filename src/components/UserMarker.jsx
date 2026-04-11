import { AdvancedMarker } from '@vis.gl/react-google-maps'

/**
 * Pulsing blue dot for the user's current location (reference image 3 style).
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
