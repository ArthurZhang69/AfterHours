import { useState, useEffect, useMemo } from 'react'
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { CRIME_COLORS } from '../constants/mapStyles'

/**
 * Zoom-aware crime hotspot markers.
 * At low zoom levels, nearby clusters are merged so markers don't overlap.
 * At high zoom levels, individual clusters are shown with full detail.
 * In 3D mode, markers render as floating pins with a ground stem for depth.
 */

function tierColor(count) {
  if (count >= 60) return '#ff4444'
  if (count >= 30) return '#ff8c00'
  if (count >= 15) return '#f5c542'
  return '#aaaaaa'
}

/** Stem height in px — taller = more severe, gives 3D scene a sense of scale */
function stemHeight(count) {
  if (count >= 60) return 54
  if (count >= 30) return 40
  if (count >= 15) return 28
  return 18
}

/**
 * Merge clusters that fall within the same grid cell for the current zoom.
 * gridPx: how many pixels wide each merge cell is.
 */
function mergeClusters(clusters, zoom, gridPx = 48) {
  const degPerPx = 360 / (256 * Math.pow(2, zoom))
  const cellDeg  = degPerPx * gridPx

  const grid = {}
  for (const c of clusters) {
    const key = `${Math.round(c.lat / cellDeg)},${Math.round(c.lng / cellDeg)}`
    if (!grid[key]) {
      grid[key] = {
        lat:       0,
        lng:       0,
        count:     0,
        score:     0,
        breakdown: {},
        _weightSum: 0,
      }
    }
    const cell = grid[key]
    cell.lat        += c.lat * c.count
    cell.lng        += c.lng * c.count
    cell._weightSum += c.count
    cell.count      += c.count
    cell.score      += c.score
    for (const [cat, n] of Object.entries(c.breakdown ?? {})) {
      cell.breakdown[cat] = (cell.breakdown[cat] ?? 0) + n
    }
  }

  return Object.values(grid).map((cell) => {
    cell.lat = cell.lat / cell._weightSum
    cell.lng = cell.lng / cell._weightSum
    const sorted   = Object.entries(cell.breakdown).sort((a, b) => b[1] - a[1])
    cell.dominant  = sorted[0]?.[0] ?? 'other-theft'
    cell.color     = CRIME_COLORS[cell.dominant] ?? CRIME_COLORS.default
    return cell
  })
}

/** Flat badge — same as before (2D mode) */
function FlatMarker({ cluster, accent, label, minW, onSelect }) {
  return (
    <div
      onClick={() => onSelect?.(cluster)}
      style={{
        minWidth:       minW,
        height:         24,
        padding:        '0 7px',
        borderRadius:   12,
        background:     'rgba(8,9,18,0.88)',
        border:         `1.5px solid ${accent}`,
        color:          '#ffffff',
        fontSize:       11,
        fontWeight:     700,
        fontFamily:     'system-ui, sans-serif',
        lineHeight:     '22px',
        textAlign:      'center',
        cursor:         'pointer',
        userSelect:     'none',
        backdropFilter: 'blur(4px)',
        boxShadow:      '0 1px 4px rgba(0,0,0,0.5)',
        transition:     'transform 0.15s ease, box-shadow 0.15s ease',
        whiteSpace:     'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.15)'
        e.currentTarget.style.boxShadow = `0 2px 8px ${accent}66`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.5)'
      }}
    >
      {label}
    </div>
  )
}

/**
 * 3D floating pin — badge hovers above ground on a glowing stem.
 * The AdvancedMarker anchor is at the bottom of the element (ground dot),
 * so the stem and badge float upward above the geo-coordinate.
 */
function PinMarker({ cluster, accent, label, minW, onSelect }) {
  const h = stemHeight(cluster.count)

  return (
    <div
      onClick={() => onSelect?.(cluster)}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        cursor:         'pointer',
        userSelect:     'none',
        // Offset so the ground dot (not the badge) sits at the marker anchor
        // transformOrigin must match: anchor is bottom-center
      }}
      onMouseEnter={(e) => {
        e.currentTarget.querySelector('.pin-badge').style.transform = 'scale(1.15)'
        e.currentTarget.querySelector('.pin-badge').style.boxShadow = `0 4px 14px ${accent}88`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.querySelector('.pin-badge').style.transform = 'scale(1)'
        e.currentTarget.querySelector('.pin-badge').style.boxShadow = `0 2px 8px ${accent}55`
      }}
    >
      {/* ── Floating badge ── */}
      <div
        className="pin-badge"
        style={{
          minWidth:       minW,
          height:         24,
          padding:        '0 7px',
          borderRadius:   12,
          background:     'rgba(8,9,18,0.92)',
          border:         `1.5px solid ${accent}`,
          color:          '#ffffff',
          fontSize:       11,
          fontWeight:     700,
          fontFamily:     'system-ui, sans-serif',
          lineHeight:     '22px',
          textAlign:      'center',
          whiteSpace:     'nowrap',
          backdropFilter: 'blur(6px)',
          boxShadow:      `0 2px 8px ${accent}55, 0 0 0 1px rgba(255,255,255,0.04) inset`,
          transition:     'transform 0.15s ease, box-shadow 0.15s ease',
          // Subtle bottom glow to reinforce floating
          filter:         `drop-shadow(0 4px 6px ${accent}44)`,
        }}
      >
        {label}
      </div>

      {/* ── Stem line ── */}
      <div
        style={{
          width:      2,
          height:     h,
          // Gradient: opaque at top (badge end) → transparent at bottom (ground)
          background: `linear-gradient(to bottom, ${accent}cc 0%, ${accent}44 60%, transparent 100%)`,
          boxShadow:  `0 0 4px ${accent}66`,
          borderRadius: 1,
          flexShrink:  0,
        }}
      />

      {/* ── Ground anchor dot — subtle, just enough to anchor the stem ── */}
      <div
        style={{
          width:        3,
          height:       3,
          borderRadius: '50%',
          background:   `${accent}66`,
          flexShrink:   0,
        }}
      />
    </div>
  )
}

export default function CrimeHotspots({ clusters, onSelect, is3D = false }) {
  const map = useMap()
  const [zoom, setZoom] = useState(14)

  useEffect(() => {
    if (!map) return
    setZoom(map.getZoom() ?? 14)
    const listener = map.addListener('idle', () => {
      setZoom(map.getZoom() ?? 14)
    })
    return () => window.google.maps.event.removeListener(listener)
  }, [map])

  const visible = useMemo(() => {
    if (!clusters?.length) return []
    const filtered = clusters.filter((c) => c.count >= 5)
    const merged   = mergeClusters(filtered, zoom)
    return merged
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
  }, [clusters, zoom])

  if (!visible.length) return null

  return visible.map((cluster) => {
    const accent = tierColor(cluster.count)
    const label  = cluster.count >= 100 ? '99+' : String(cluster.count)
    const minW   = label.length >= 3 ? 36 : 28

    return (
      <AdvancedMarker
        key={`${cluster.lat.toFixed(5)},${cluster.lng.toFixed(5)}`}
        position={{ lat: cluster.lat, lng: cluster.lng }}
        zIndex={cluster.count}
        // In 3D pin mode the anchor is at the bottom of the element (ground dot).
        // Default anchorPoint is BOTTOM_CENTER which matches our layout.
      >
        {is3D
          ? <PinMarker cluster={cluster} accent={accent} label={label} minW={minW} onSelect={onSelect} />
          : <FlatMarker cluster={cluster} accent={accent} label={label} minW={minW} onSelect={onSelect} />
        }
      </AdvancedMarker>
    )
  })
}
