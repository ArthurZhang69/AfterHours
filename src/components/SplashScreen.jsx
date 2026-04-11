/**
 * SplashScreen — shown while London crime data loads on first visit.
 * Receives `progress` (0–100) and `fading` (bool) from App.
 * The parent removes it from the DOM only after the CSS fade-out completes.
 */
export default function SplashScreen({ progress, fading }) {
  return (
    <div className={`splash${fading ? ' splash--fading' : ''}`} aria-live="polite">
      <div className="splash__content">

        {/* Animated moon glyph */}
        <div className="splash__icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="72" height="72" fill="none">
            <circle cx="32" cy="32" r="30" stroke="rgba(79,195,247,0.18)" strokeWidth="1.5" />
            <path
              d="M38 14a20 20 0 1 0 0 36 16 16 0 1 1 0-36z"
              fill="url(#moon-grad)"
            />
            <defs>
              <linearGradient id="moon-grad" x1="24" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
                <stop offset="0%"   stopColor="#4FC3F7" />
                <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.6" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className="splash__title">AfterHours</h1>
        <p className="splash__subtitle">London Night Safety</p>

        {/* Progress track */}
        <div className="splash__track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
          <div className="splash__bar" style={{ width: `${progress}%` }} />
        </div>

        <p className="splash__label">
          {progress < 100
            ? `Loading crime data… ${progress}%`
            : 'Ready'}
        </p>
      </div>
    </div>
  )
}
