import { Component, useState, useCallback } from 'react'
import { Map } from '@vis.gl/react-google-maps'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../constants/mapStyles'
import CrimeHeatmap   from './CrimeHeatmap'
import CrimeHotspots  from './CrimeHotspots'
import StationMarkers from './StationMarkers'
import RouteRenderer  from './RouteRenderer'
import UserMarker     from './UserMarker'
import MapController  from './MapController'
import TiltControl   from './TiltControl'

/**
 * Catches AdvancedMarkerElement crashes caused by the zh_CN build of Google Maps
 * API v3.64.x, where `new AdvancedMarkerElement()` throws internally regardless
 * of how it is called. Renders nothing on failure so the rest of the map still works.
 */
class MarkerErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) {
    console.warn('[MarkerErrorBoundary] Advanced marker failed (Maps API locale bug):', err.message)
  }
  render() { return this.state.failed ? null : this.props.children }
}

const MAP_ID    = import.meta.env.VITE_GOOGLE_MAP_ID   || 'DEMO_MAP_ID'
const HAS_KEY   = Boolean(import.meta.env.VITE_GOOGLE_MAPS_KEY)

const MAP_OPTIONS = {
  disableDefaultUI:  true,
  gestureHandling:   'greedy',
  clickableIcons:    false,
  keyboardShortcuts: false,
  colorScheme:       'DARK',
  // Snap zoom to integer levels. Fractional zoom is gorgeous on desktop
  // but forces the vector renderer to re-rasterise tiles on every pinch
  // frame — a measurable FPS drop on iOS Safari.
  isFractionalZoomEnabled: false,
}

/**
 * Top-level map wrapper.
 *
 * Shows a "no API key" placeholder when VITE_GOOGLE_MAPS_KEY is not set.
 */
export default function MapContainer({
  center,
  panTo,
  destination,
  crimes,
  clusters,
  crimeCategory,
  stations,
  showCrime,
  showTransport,
  showRoute,
  activeRoute,
  origin,
  onCrimeSelect,
  onStationSelect,
  onRoutesReady,
}) {
  const [is3D,    setIs3D]    = useState(false)
  const [heading, setHeading] = useState(0)

  const handleToggle3D = useCallback(() => {
    setIs3D((prev) => {
      if (prev) setHeading(0)
      return !prev
    })
  }, [])

  if (!HAS_KEY) {
    return (
      <div className="map-placeholder">
        <div className="map-placeholder__inner">
          <div className="map-placeholder__icon">🗺</div>
          <p className="map-placeholder__title">Map not configured</p>
          <p className="map-placeholder__body">
            Add your Google Maps API key to <code>.env.local</code>:
          </p>
          <code className="map-placeholder__code">
            VITE_GOOGLE_MAPS_KEY=your_key_here
          </code>
          <p className="map-placeholder__note">
            Crime data and risk scores are still loading below.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Map
        mapId={MAP_ID}
        defaultCenter={center ?? DEFAULT_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        tilt={is3D ? 45 : 0}
        heading={heading ?? 0}
        {...MAP_OPTIONS}
        style={{ width: '100%', height: '100%' }}
      >
        <MapController panTo={panTo} is3D={is3D} />
        <MarkerErrorBoundary>
          <UserMarker position={center ?? DEFAULT_CENTER} />
        </MarkerErrorBoundary>

        {showCrime && (
          <>
            <CrimeHeatmap crimes={crimes} category={crimeCategory} />
            <MarkerErrorBoundary>
              <CrimeHotspots clusters={clusters} onSelect={onCrimeSelect} is3D={is3D} />
            </MarkerErrorBoundary>
          </>
        )}

        {showTransport && (
          <StationMarkers stations={stations} onSelect={onStationSelect} />
        )}

        {showRoute && (
          <RouteRenderer
            origin={origin}
            destination={destination}
            activeRoute={activeRoute}
            onRoutesReady={onRoutesReady}
          />
        )}
      </Map>

      <TiltControl
        is3D={is3D}
        heading={heading}
        onToggle3D={handleToggle3D}
        onHeadingChange={setHeading}
      />
    </>
  )
}
