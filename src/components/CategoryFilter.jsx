import { CRIME_COLORS } from '../constants/mapStyles'

const CATEGORIES = [
  { id: 'all',                   label: 'All',          icon: '◈' },
  { id: 'violent-crime',         label: 'Violent',      icon: '🥊' },
  { id: 'robbery',               label: 'Robbery',      icon: '🔫' },
  { id: 'theft-from-the-person', label: 'Theft',        icon: '👜' },
  { id: 'anti-social-behaviour', label: 'ASB',          icon: '🚨' },
  { id: 'drugs',                 label: 'Drugs',        icon: '💊' },
  { id: 'vehicle-crime',         label: 'Vehicle',      icon: '🚗' },
  { id: 'other-theft',           label: 'Other Theft',  icon: '📦' },
  { id: 'public-order',          label: 'Order',        icon: '⚖️' },
]

export default function CategoryFilter({ selected, onChange }) {
  return (
    <div className="category-filter">
      {CATEGORIES.map((cat) => {
        const accent = cat.id === 'all' ? '#00E5FF' : (CRIME_COLORS[cat.id] ?? '#9E9E9E')
        const isActive = selected === cat.id
        return (
          <button
            key={cat.id}
            className={`category-filter__pill ${isActive ? 'category-filter__pill--active' : ''}`}
            style={isActive ? { borderColor: accent, color: accent } : {}}
            onClick={() => onChange(cat.id)}
          >
            <span className="category-filter__icon">{cat.icon}</span>
            {cat.label}
          </button>
        )
      })}
    </div>
  )
}
