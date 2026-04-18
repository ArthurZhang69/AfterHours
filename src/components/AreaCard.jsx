import RiskBadge from './RiskBadge'
import { areaRiskScore, getRiskColor } from '../utils/risk'
import { CRIME_COLORS, CRIME_LABELS } from '../constants/mapStyles'

/**
 * Area summary card shown in the bottom sheet.
 * Displays risk score, crime breakdown, and nearby stations.
 */
export default function AreaCard({ crimes, center, stations, dataMonth, loading, error, onRouteMode, browseName }) {
  if (loading) {
    return (
      <div className="area-card area-card--loading">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--body" />
        <div className="skeleton skeleton--body" style={{ width: '70%' }} />
      </div>
    )
  }

  if (error && !crimes?.length) {
    return (
      <div className="area-card area-card--error">
        <p className="area-card__error-msg">{error}</p>
      </div>
    )
  }

  const score = crimes?.length ? areaRiskScore(crimes, center) : 0
  const color = getRiskColor(score)

  // Build category breakdown
  const counts = {}
  for (const c of crimes ?? []) {
    counts[c.category] = (counts[c.category] || 0) + 1
  }
  const breakdown = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const maxCount = breakdown[0]?.[1] ?? 1

  return (
    <div className="area-card">
      {/* Browse area indicator */}
      {browseName && (
        <div className="area-card__browse-chip">
          Showing data for: {browseName}
        </div>
      )}

      {/* Header */}
      <div className="area-card__header">
        <div>
          <p className="area-card__label">AREA RISK</p>
          <div className="area-card__score-row">
            <span className="area-card__score" style={{ color }}>{score}</span>
            <span className="area-card__score-max">/100</span>
            <RiskBadge score={score} />
          </div>
        </div>
        <button className="area-card__route-btn" onClick={onRouteMode}>
          <span>Compare Routes</span>
          <span className="area-card__route-icon">↗</span>
        </button>
      </div>

      <div className="divider" />

      {/* Crime stats row */}
      <div className="stat-row">
        <div className="stat-item">
          <span className="stat-value">{crimes?.length ?? 0}</span>
          <span className="stat-label">Incidents</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{breakdown.length}</span>
          <span className="stat-label">Categories</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ fontSize: 12 }}>{dataMonth ?? '—'}</span>
          <span className="stat-label">Data period</span>
        </div>
      </div>

      <div className="divider" />

      {/* Crime breakdown bars */}
      {breakdown.length > 0 && (
        <div className="area-card__breakdown">
          <p className="area-card__section-label">CRIME TYPES</p>
          {breakdown.map(([cat, count]) => (
            <div key={cat} className="breakdown-row">
              <span className="breakdown-name">
                {CRIME_LABELS[cat] ?? cat}
              </span>
              <div className="breakdown-bar-track">
                <div
                  className="breakdown-bar-fill"
                  style={{
                    width: `${(count / maxCount) * 100}%`,
                    backgroundColor: CRIME_COLORS[cat] ?? CRIME_COLORS.default,
                  }}
                />
              </div>
              <span className="breakdown-count">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Nearby stations */}
      {stations?.length > 0 && (
        <>
          <div className="divider" />
          <div className="area-card__stations">
            <p className="area-card__section-label">NEARBY TRANSIT</p>
            {stations.slice(0, 4).map((s) => (
              <div key={s.naptanId} className="station-row">
                <span className="station-icon">⟠</span>
                <span className="station-name">
                  {s.commonName?.replace(' Underground Station', '').replace(' Rail Station', '')}
                </span>
                <span className="station-modes">
                  {(s.modes ?? []).slice(0, 2).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="area-card__disclaimer">
        Crime data from data.police.uk · {dataMonth ?? 'latest available'} · Approximate locations only
      </div>
    </div>
  )
}
