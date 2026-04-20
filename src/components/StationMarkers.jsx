import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { useMemo } from 'react'
import { useMapInteracting } from '../hooks/useMapInteracting'

// TfL official line colours (lightened for dark-map legibility)
const LINE_COLORS = {
  northern:         '#868F98',
  central:          '#E32017',
  victoria:         '#0098D4',
  jubilee:          '#76D0BD',
  piccadilly:       '#4C6DAE',
  bakerloo:         '#B36305',
  circle:           '#FFD300',
  district:         '#00782A',
  metropolitan:     '#9B0056',
  hammersmith:      '#F3A9BB',
  'elizabeth-line': '#9B85C9',
  overground:       '#EE7C0E',
  dlr:              '#00A4A7',
}

function getLineColor(station) {
  for (const line of station.lines ?? []) {
    const c = LINE_COLORS[line.id]
    if (c) return c
  }
  return '#AAAAAA'
}

function getPrimaryMode(station) {
  const modes = station.modes ?? []
  if (modes.includes('dlr'))             return 'dlr'
  if (modes.includes('elizabeth-line'))  return 'elizabeth-line'
  if (modes.includes('overground'))      return 'overground'
  if (modes.includes('tube'))            return 'tube'
  return 'tube'
}

/**
 * TfL Roundel — the iconic circle-with-horizontal-bar used on all London
 * transit signage. Ring and bar use the line's official colour so each
 * mode/line is immediately recognisable without needing text.
 *
 * Size: 20 × 20 px  (compact enough for dense urban maps)
 */
function Roundel({ color }) {
  const size   = 20
  const cx     = size / 2        // 10
  const cy     = size / 2        // 10
  const r      = 8               // ring radius
  const stroke = 2               // ring stroke width
  const barH   = 5               // horizontal bar height
  const barW   = size - 2        // bar spans nearly full width

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ cursor: 'pointer', display: 'block' }}
    >
      {/* Dark fill inside the ring so the map doesn't bleed through */}
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill="rgba(8,9,18,0.75)" />

      {/* Horizontal bar */}
      <rect
        x={(size - barW) / 2}
        y={cy - barH / 2}
        width={barW}
        height={barH}
        fill={color}
        rx={1.5}
      />

      {/* Ring (drawn on top so it clips the bar ends cleanly) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
      />
    </svg>
  )
}

/**
 * Renders TfL station markers as mini roundels.
 * Shape is unmistakably "transit signage" and distinct from
 * the circular crime-hotspot badges.
 */
export default function StationMarkers({ stations, onSelect }) {
  const map         = useMap()
  const interacting = useMapInteracting()

  // Render only stations currently in the viewport, capped to 60. Otherwise
  // all-London data produces hundreds of AdvancedMarkers — each an absolute
  // div that Google repositions every frame.
  const visible = useMemo(() => {
    if (!stations?.length || !map) return []
    const bounds = map.getBounds()
    if (!bounds) return stations.slice(0, 60)
    const ne = bounds.getNorthEast(), sw = bounds.getSouthWest()
    const n = ne.lat(), s = sw.lat(), e = ne.lng(), w = sw.lng()
    return stations
      .filter((st) => st.lat >= s && st.lat <= n && st.lon >= w && st.lon <= e)
      .slice(0, 60)
  }, [stations, map, interacting])   // interacting re-triggers on idle → viewport refresh

  if (interacting) return null
  if (!visible.length) return null

  return visible.map((station) => {
    const color = getLineColor(station)
    const label = station.commonName
      ?.replace(/ Underground Station$/i, '')
      .replace(/ Rail Station$/i, '')
      .replace(/ DLR Station$/i, '')
      .replace(/ Elizabeth Line Station$/i, '')

    return (
      <AdvancedMarker
        key={station.naptanId}
        position={{ lat: station.lat, lng: station.lon }}
        onClick={() => onSelect?.(station)}
        title={label}
        zIndex={5}
      >
        <Roundel color={color} />
      </AdvancedMarker>
    )
  })
}
