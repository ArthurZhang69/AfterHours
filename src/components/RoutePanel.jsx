import { useState, useEffect } from 'react'
import RiskBadge from './RiskBadge'
import PlaceSearch from './PlaceSearch'
import { scoreRoute, getRiskColor, DEMO_ORIGIN, DEMO_DESTINATION, DEMO_ROUTE_A, DEMO_ROUTE_B } from '../utils/risk'
import { ROUTE_COLORS } from '../constants/mapStyles'
import { planJourney } from '../services/api'

// Defined outside RoutePanel so React does not unmount/remount it on every
// parent render (defining components inside a render function discards and
// recreates them, losing state and triggering extra DOM work).
const WARNING_MAX_THRESHOLD = 70   // r_m ≥ 0.70 → flag a high-risk segment

function RouteCard({ id, score, maxRisk, meta, activeRoute, recommended, onRouteSelect }) {
  const isActive = activeRoute === id
  const color    = id === 'A' ? ROUTE_COLORS.safe : ROUTE_COLORS.risky
  const rColor   = getRiskColor(score)
  const isRec    = recommended === id

  const duration = meta?.durationSec != null
    ? `${Math.round(meta.durationSec / 60)} min`
    : (id === 'A' ? '18 min' : '15 min')
  const distance = meta?.distanceM != null
    ? `${(meta.distanceM / 1000).toFixed(1)} km`
    : (id === 'A' ? '1.6 km' : '1.4 km')

  return (
    <div
      className={`route-card ${isActive ? 'route-card--active' : ''}`}
      onClick={() => onRouteSelect(id)}
      style={isActive ? { borderColor: color } : {}}
    >
      <div className="route-card__stripe" style={{ backgroundColor: color }} />

      <div className="route-card__body">
        <div className="route-card__top-row">
          <div className="route-card__label-col">
            <span className="route-card__id" style={{ color }}>Route {id}</span>
            {isRec && <span className="route-card__recommended">Recommended</span>}
            {maxRisk >= WARNING_MAX_THRESHOLD && (
              <span className="route-card__warning" title={`Contains a high-risk segment (peak ${maxRisk}/100)`}>
                ⚠ High-risk segment
              </span>
            )}
          </div>
          <RiskBadge score={score} />
        </div>

        <div className="route-card__stats">
          <div className="route-stat">
            <span className="route-stat__value">{duration}</span>
            <span className="route-stat__label">Duration</span>
          </div>
          <div className="route-stat">
            <span className="route-stat__value">{distance}</span>
            <span className="route-stat__label">Distance</span>
          </div>
          <div className="route-stat">
            <span className="route-stat__value" style={{ color: rColor }}>{score}</span>
            <span className="route-stat__label">Risk Score</span>
          </div>
        </div>

        <div className="route-card__risk-track">
          <div
            className="route-card__risk-fill"
            style={{ width: `${score}%`, backgroundColor: rColor }}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Route comparison panel (reference image 4 style).
 * Shows Route A vs Route B with risk scores, time, and distance.
 */
export default function RoutePanel({
  origin,
  destination,
  userLocation,
  crimes,
  routePathA,
  routePathB,
  metaA,
  metaB,
  activeRoute,
  onRouteSelect,
  onOriginChange,
  onClose,
}) {
  const [tflJourneys,   setTflJourneys]   = useState([])
  const [editingOrigin, setEditingOrigin] = useState(false)
  const hasTfl = Boolean(import.meta.env.VITE_TFL_APP_KEY)

  const org  = origin      ?? DEMO_ORIGIN
  const dest = destination ?? DEMO_DESTINATION

  // Score each route — Galbrun et al. (2016) formulas 2 (total) & 3 (max).
  // `total` drives the headline score; `max` flags any single high-risk segment.
  const { total: scoreA, max: maxA } = scoreRoute(routePathA ?? DEMO_ROUTE_A, crimes ?? [])
  const { total: scoreB, max: maxB } = scoreRoute(routePathB ?? DEMO_ROUTE_B, crimes ?? [])

  // Recommended = lower total exposure
  const recommended = scoreA <= scoreB ? 'A' : 'B'

  // Fetch TfL journey options
  useEffect(() => {
    if (!hasTfl) return
    planJourney(org.lat, org.lng, dest.lat, dest.lng)
      .then(setTflJourneys)
      .catch(() => {})
  }, [org.lat, org.lng, dest.lat, dest.lng, hasTfl])

  const originLabel = origin?.name ?? 'My Location'
  const destLabel   = destination?.name ?? (destination ? 'Destination' : null)

  return (
    <div className="route-panel">
      {/* Header */}
      <div className="route-panel__header">
        <div className="route-panel__header-main">
          <p className="area-card__label">ROUTE COMPARISON</p>

          {/* Origin row */}
          <div className="route-panel__endpoint">
            <span className="route-panel__endpoint-dot route-panel__endpoint-dot--origin" />
            {editingOrigin ? (
              <PlaceSearch
                placeholder="Start location…"
                className="route-panel__origin-search"
                onSelect={(place) => {
                  onOriginChange?.(place)
                  setEditingOrigin(false)
                }}
                onClear={() => {
                  onOriginChange?.(null)
                  setEditingOrigin(false)
                }}
              />
            ) : (
              <button
                className="route-panel__endpoint-btn"
                onClick={() => setEditingOrigin(true)}
              >
                {originLabel}
                <span className="route-panel__endpoint-edit">✎</span>
              </button>
            )}
          </div>

          {/* Destination row */}
          <div className="route-panel__endpoint">
            <span className="route-panel__endpoint-dot route-panel__endpoint-dot--dest" />
            <span className="route-panel__endpoint-label">
              {destLabel ?? 'UCL → Camden Town (demo)'}
            </span>
          </div>
        </div>
        <button className="route-panel__close" onClick={onClose}>✕</button>
      </div>

      <div className="divider" />

      {/* Route cards */}
      <div className="route-panel__cards">
        <RouteCard id="A" score={scoreA} maxRisk={maxA} meta={metaA} activeRoute={activeRoute} recommended={recommended} onRouteSelect={onRouteSelect} />
        <RouteCard id="B" score={scoreB} maxRisk={maxB} meta={metaB} activeRoute={activeRoute} recommended={recommended} onRouteSelect={onRouteSelect} />
      </div>

      {/* TfL public transport options */}
      {hasTfl && tflJourneys.length > 0 && (
        <>
          <div className="divider" />
          <p className="area-card__section-label">PUBLIC TRANSPORT</p>
          {tflJourneys.slice(0, 2).map((j, i) => {
            const mins = Math.round(j.duration)
            const legs  = j.legs ?? []
            const modes = [...new Set(legs.map((l) => l.mode?.name).filter(Boolean))]

            return (
              <div key={i} className="tfl-journey">
                <span className="tfl-journey__time">{mins} min</span>
                <div className="tfl-journey__modes">
                  {modes.map((m) => (
                    <span key={m} className="tfl-mode-chip">{m}</span>
                  ))}
                </div>
                <span className="tfl-journey__changes">
                  {legs.length > 1 ? `${legs.length - 1} change${legs.length > 2 ? 's' : ''}` : 'Direct'}
                </span>
              </div>
            )
          })}
        </>
      )}

      <div className="area-card__disclaimer">
        Risk score based on recorded crimes along each route corridor
      </div>
    </div>
  )
}
