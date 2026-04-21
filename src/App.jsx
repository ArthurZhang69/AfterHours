import { useState, useCallback, useEffect, useMemo } from 'react'
import { APIProvider } from '@vis.gl/react-google-maps'
import MapContainer    from './components/MapContainer'
import SearchBar       from './components/SearchBar'
import BottomSheet     from './components/BottomSheet'
import AreaCard        from './components/AreaCard'
import RoutePanel      from './components/RoutePanel'
import LayerToggle     from './components/LayerToggle'
import CategoryFilter  from './components/CategoryFilter'
import CrimeDetailPanel from './components/CrimeDetailPanel'
import SplashScreen    from './components/SplashScreen'
import { useGeolocation }      from './hooks/useGeolocation'
import { useCrimeData }        from './hooks/useCrimeData'
import { useLondonCrimes }     from './hooks/useLondonCrimes'
import { useNearbyStations }   from './hooks/useNearbyStations'
import { useLondonStations }   from './hooks/useLondonStations'
import { areaRiskScore, getRiskLevel, filterCrimesByRadius, DEMO_ORIGIN } from './utils/risk'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

const VIEW = { MAP: 'map', ROUTE: 'route', HOTSPOT: 'hotspot' }

export default function App() {
  const [view,         setView]         = useState(VIEW.MAP)
  const [layers,       setLayers]       = useState({ showCrime: true, showTransport: false, showRoute: false })
  const [activeRoute,  setActiveRoute]  = useState('A')
  const [routePaths,   setRoutePaths]   = useState({ A: null, B: null })
  const [routeMeta,    setRouteMeta]    = useState({ A: null, B: null })
  const [toast,        setToast]        = useState(null)
  const [selectedCluster, setSelectedCluster] = useState(null)
  const [destination,  setDestination]  = useState(null)
  const [browseArea,   setBrowseArea]   = useState(null)   // { name, location }
  const [customOrigin, setCustomOrigin] = useState(null)   // { name, location }
  const [crimeCategory, setCrimeCategory] = useState('all')
  const [splashFading,  setSplashFading]  = useState(false)
  const [splashGone,    setSplashGone]    = useState(false)
  const [sheetHeight,   setSheetHeight]   = useState(Math.round(0.46 * (typeof window !== 'undefined' ? window.innerHeight : 800)))

  const { location } = useGeolocation()

  // data.police.uk + TfL only cover the UK — if GPS puts us outside UK bounds
  // (e.g. developer is abroad), fall back to the London default centre.
  const UK_BOUNDS = { latMin: 49.9, latMax: 60.9, lngMin: -8.2, lngMax: 1.9 }
  function inUK(loc) {
    if (!loc) return false
    return loc.lat >= UK_BOUNDS.latMin && loc.lat <= UK_BOUNDS.latMax &&
           loc.lng >= UK_BOUNDS.lngMin && loc.lng <= UK_BOUNDS.lngMax
  }
  const londonLocation = inUK(location) ? location : DEMO_ORIGIN

  // Full London crime data — used for heatmap + hotspot visualisation on the map
  const {
    crimes:   londonCrimes,
    clusters: londonClusters,
    loading:  londonLoading,
    progress: londonProgress,
    dataMonth: londonDataMonth,
  } = useLondonCrimes()

  // Local crime data — used for area risk score + AreaCard breakdown
  // Follows browse area when set, otherwise nearest London location
  const crimeCenter = browseArea?.location ?? londonLocation
  const { crimes: localCrimes, loading: crimeLoading, error: crimeError, dataMonth } =
    useCrimeData(crimeCenter?.lat, crimeCenter?.lng)

  // Nearby stations (for AreaCard walking-distance info)
  const { stations: nearbyStations } = useNearbyStations(londonLocation?.lat, londonLocation?.lng)
  // All London transit stations (for map overlay)
  const { stations: londonStations } = useLondonStations()

  // Memoise the filtered local crime list — avoids a new array on every render
  // which would cause AreaCard and the risk useEffect to re-run needlessly.
  const nearbyLocalCrimes = useMemo(
    () => filterCrimesByRadius(localCrimes, londonLocation, 0.5),
    [localCrimes, londonLocation]
  )

  // ── Splash screen: fade out when London crime data finishes loading ──
  useEffect(() => {
    if (londonProgress === 100 && !splashFading) {
      setSplashFading(true)
      const id = setTimeout(() => setSplashGone(true), 600) // matches CSS transition duration
      return () => clearTimeout(id)
    }
  }, [londonProgress, splashFading])

  // Risk warning: use local crimes within 500 m of user
  useEffect(() => {
    if (!nearbyLocalCrimes?.length || !londonLocation) return
    const local = nearbyLocalCrimes
    const score = areaRiskScore(local, londonLocation)
    const level = getRiskLevel(score)
    if (level === 'HIGH' || level === 'CRITICAL') {
      setToast({ score, level })
      const id = setTimeout(() => setToast(null), 6000)
      return () => clearTimeout(id)
    }
  }, [nearbyLocalCrimes, londonLocation])

  const handleLayerChange = useCallback((key, value) => {
    setLayers((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleRoutesReady = useCallback(({ routeA, routeB, durationSecA, distanceMa, durationSecB, distanceMb }) => {
    setRoutePaths({ A: routeA, B: routeB })
    setRouteMeta({
      A: durationSecA != null ? { durationSec: durationSecA, distanceM: distanceMa } : null,
      B: durationSecB != null ? { durationSec: durationSecB, distanceM: distanceMb } : null,
    })
  }, [])

  const handleSearch = useCallback(({ location, name }) => {
    setDestination({ ...location, name })
    setView(VIEW.ROUTE)
    setLayers((prev) => ({ ...prev, showRoute: true }))
  }, [])

  const handleBrowse = useCallback(({ location, name }) => {
    setBrowseArea({ location, name })
  }, [])

  const handleBrowseReset = useCallback(() => {
    setBrowseArea(null)
  }, [])

  const enterRouteMode = useCallback(() => {
    setView(VIEW.ROUTE)
    setLayers((prev) => ({ ...prev, showRoute: true }))
  }, [])

  const exitRouteMode = useCallback(() => {
    setView(VIEW.MAP)
    setLayers((prev) => ({ ...prev, showRoute: false }))
  }, [])

  const handleCrimeSelect = useCallback((cluster) => {
    setSelectedCluster(cluster)
    setView(VIEW.HOTSPOT)
  }, [])

  const handleHotspotClose = useCallback(() => {
    setSelectedCluster(null)
    setView(VIEW.MAP)
  }, [])

  return (
    <APIProvider apiKey={MAPS_KEY} libraries={['places', 'marker']}>
    <div className="app" style={{ '--sheet-h': `${sheetHeight}px` }}>
      {/* ── Splash screen (removed from DOM after fade-out completes) ── */}
      {!splashGone && <SplashScreen progress={londonProgress} fading={splashFading} />}

      {/* ── Full-screen map ── */}
      <div className="map-wrapper">
        <MapContainer
          center={londonLocation}
          panTo={browseArea?.location ?? destination}
          destination={destination}
          crimes={londonCrimes}
          clusters={londonClusters}
          crimeCategory={crimeCategory}
          stations={londonStations}
          showCrime={layers.showCrime}
          showTransport={layers.showTransport}
          showRoute={layers.showRoute}
          activeRoute={activeRoute}
          origin={customOrigin ?? londonLocation}
          onCrimeSelect={handleCrimeSelect}
          onStationSelect={null}
          onRoutesReady={handleRoutesReady}
        />
      </div>

      {/* ── Search bar ── */}
      <SearchBar
        onSearch={handleSearch}
        onBrowse={handleBrowse}
        onBrowseReset={handleBrowseReset}
        browseArea={browseArea?.name}
        onRouteMode={enterRouteMode}
      />


      {/* ── Risk warning toast ── */}
      {toast && (
        <div className="risk-toast">
          <span className="risk-toast__icon">⚠</span>
          <div className="risk-toast__body">
            <p className="risk-toast__title">{toast.level} risk area</p>
            <p className="risk-toast__text">
              Risk score {toast.score}/100 in your current vicinity. Consider a safer route.
            </p>
          </div>
          <button className="risk-toast__close" onClick={() => setToast(null)}>✕</button>
        </div>
      )}

      {/* ── Layer toggles ── */}
      <LayerToggle
        showCrime={layers.showCrime}
        showRoute={layers.showRoute}
        onChange={handleLayerChange}
      />

      {/* ── Bottom sheet ── */}
      <BottomSheet onHeightChange={setSheetHeight}>
        {view === VIEW.ROUTE ? (
          <RoutePanel
            origin={customOrigin ?? londonLocation}
            destination={destination ?? DEMO_ORIGIN}
            userLocation={location}
            onOriginChange={(place) => setCustomOrigin(place ? { ...place.location, name: place.name } : null)}
            crimes={localCrimes}
            routePathA={routePaths.A}
            routePathB={routePaths.B}
            metaA={routeMeta.A}
            metaB={routeMeta.B}
            activeRoute={activeRoute}
            onRouteSelect={setActiveRoute}
            onClose={exitRouteMode}
          />
        ) : view === VIEW.HOTSPOT ? (
          <CrimeDetailPanel
            cluster={selectedCluster}
            onClose={handleHotspotClose}
          />
        ) : (
          <>
            {layers.showCrime && (
              <CategoryFilter selected={crimeCategory} onChange={setCrimeCategory} />
            )}
            <AreaCard
              crimes={nearbyLocalCrimes}
              center={crimeCenter}
              stations={nearbyStations}
              dataMonth={dataMonth}
              loading={crimeLoading}
              error={crimeError}
              onRouteMode={enterRouteMode}
              browseName={browseArea?.name}
            />
          </>
        )}
      </BottomSheet>
    </div>
    </APIProvider>
  )
}
