/**
 * Floating layer-toggle buttons on the map (crime / route).
 *
 * Transit was dropped: Google Maps' own basemap already renders London's
 * Underground and National Rail roundel labels, so a duplicate station
 * overlay was visual noise. The station-data pipeline stays wired up in
 * case a future view wants it; this component just doesn't expose it.
 */
export default function LayerToggle({ showCrime, showRoute, onChange }) {
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
      {btn('showCrime', 'Crime', '⚠', showCrime)}
      {btn('showRoute', 'Route', '↗', showRoute)}
    </div>
  )
}
