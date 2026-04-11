import { getRiskLevel, getRiskColor } from '../utils/risk'

/**
 * Compact risk level badge — LOW / MEDIUM / HIGH / CRITICAL
 */
export default function RiskBadge({ score, size = 'md' }) {
  const level = getRiskLevel(score)
  const color = getRiskColor(score)

  const pad = size === 'sm' ? '2px 8px' : '4px 12px'
  const fs  = size === 'sm' ? 10 : 11

  return (
    <span style={{
      display:       'inline-block',
      padding:       pad,
      borderRadius:  4,
      border:        `1px solid ${color}55`,
      backgroundColor: `${color}18`,
      color,
      fontSize:      fs,
      fontWeight:    700,
      letterSpacing: '0.08em',
      lineHeight:    1.4,
    }}>
      {level}
    </span>
  )
}
