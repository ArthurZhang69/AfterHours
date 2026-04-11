/**
 * Floating layer-toggle buttons on the map (crime / transport / route).
 */
export default function LayerToggle({ showCrime, showTransport, showRoute, onChange }) {
  const btn = (key, label, icon, active) => (
    <button
      key={key}
      className={`layer-btn ${active ? 'layer-btn--active' : ''}`}
      onClick={() => onChange(key, !active)}
      title={label}
    >
      <span className="layer-btn__icon">{icon}</span>
      <span className="layer-btn__label">{label}</span>
    </button>
  )

  return (
    <div className="layer-toggle">
      {btn('showCrime',     'Crime',     '⚠', showCrime)}
      {btn('showTransport', 'Transit',   '⟠', showTransport)}
      {btn('showRoute',     'Route',     '↗', showRoute)}
    </div>
  )
}
