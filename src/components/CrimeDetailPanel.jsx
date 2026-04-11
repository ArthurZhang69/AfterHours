import { CRIME_LABELS, CRIME_COLORS } from '../constants/mapStyles'
import { normaliseScore, getRiskLevel, getRiskColor } from '../utils/risk'

export default function CrimeDetailPanel({ cluster, onClose }) {
  if (!cluster) return null

  // maxExpected = count × 3.0 (all violent crimes); score reflects severity relative to cluster size
  const score    = Math.min(100, Math.round(normaliseScore(cluster.score, Math.max(cluster.count * 3.0, 10))))
  const level    = getRiskLevel(score)
  const color    = getRiskColor(score)
  const sorted   = Object.entries(cluster.breakdown).sort((a, b) => b[1] - a[1])

  return (
    <div className="crime-detail">
      {/* Header */}
      <div className="crime-detail__header">
        <div>
          <p className="area-card__label">CRIME HOTSPOT</p>
          <p className="crime-detail__count">{cluster.count} incidents recorded</p>
        </div>
        <button className="crime-detail__close" onClick={onClose}>✕</button>
      </div>

      {/* Risk badge */}
      <div className="crime-detail__badge" style={{ borderColor: color, color }}>
        {level} · {score}/100
      </div>

      <div className="divider" />

      {/* Crime breakdown */}
      <p className="area-card__section-label">CRIME BREAKDOWN</p>
      <div className="crime-detail__breakdown">
        {sorted.map(([cat, count]) => {
          const accent  = CRIME_COLORS[cat] ?? '#9E9E9E'
          const label   = CRIME_LABELS[cat] ?? cat
          const pct     = cluster.count > 0 ? Math.round((count / cluster.count) * 100) : 0
          return (
            <div key={cat} className="crime-detail__row">
              <div className="crime-detail__row-label">
                <span className="crime-detail__dot" style={{ background: accent }} />
                <span>{label}</span>
              </div>
              <div className="crime-detail__row-right">
                <div className="crime-detail__bar-track">
                  <div
                    className="crime-detail__bar-fill"
                    style={{ width: `${pct}%`, background: accent }}
                  />
                </div>
                <span className="crime-detail__row-count">{count}</span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="area-card__disclaimer">
        Location is approximate — UK police data is anonymised to the nearest street node.
      </p>
    </div>
  )
}
