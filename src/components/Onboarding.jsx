import { useState, useEffect, useCallback } from 'react'

/**
 * First-run welcome tour. Four short slides introducing the map legend,
 * hotspot drill-down, route comparison, and the 3D tilt control.
 *
 * Dismissal is persisted in localStorage so the user only sees it once.
 * A `?tour=1` URL param forces it back on for screenshots / demos.
 */

const STORAGE_KEY = 'afterhours.onboarded.v1'

const SLIDES = [
  {
    icon: '🔥',
    title: 'Welcome to AfterHours',
    body: 'A London night-time safety companion. The warm glow on the map is a live crime-density heat-map — brighter patches mean more incidents nearby.',
  },
  {
    icon: '📍',
    title: 'Tap a hotspot',
    body: 'Black badges show crime clusters. Tap one to open a breakdown of the last month of incidents in that block, grouped by type.',
  },
  {
    icon: '🛣',
    title: 'Compare safer routes',
    body: 'Search a destination or tap "Compare Routes" in the card. You\'ll get two walking paths side-by-side with a risk score for each, so you can pick the calmer one.',
  },
  {
    icon: '🧭',
    title: '3D & compass',
    body: 'Use the 3D button in the corner to tilt the map. Drag to rotate. Handy for recognising landmarks on an unfamiliar street.',
  },
]

export default function Onboarding() {
  const [visible, setVisible]   = useState(false)
  const [step,    setStep]      = useState(0)
  const [leaving, setLeaving]   = useState(false)

  useEffect(() => {
    // Ship quietly — only appear on a genuinely fresh install. A ?tour=1
    // query param re-triggers the flow so we can recap it during reviews.
    const forced = new URLSearchParams(window.location.search).get('tour') === '1'
    const seen   = window.localStorage.getItem(STORAGE_KEY) === '1'
    if (forced || !seen) setVisible(true)
  }, [])

  const dismiss = useCallback(() => {
    try { window.localStorage.setItem(STORAGE_KEY, '1') } catch { /* private mode */ }
    setLeaving(true)
    // Match the CSS exit transition before fully unmounting.
    setTimeout(() => setVisible(false), 280)
  }, [])

  const next = useCallback(() => {
    if (step >= SLIDES.length - 1) dismiss()
    else setStep((s) => s + 1)
  }, [step, dismiss])

  if (!visible) return null

  const slide  = SLIDES[step]
  const isLast = step === SLIDES.length - 1

  return (
    <div className={`onboarding ${leaving ? 'onboarding--leaving' : ''}`}>
      <div className="onboarding__card">
        <button
          className="onboarding__skip"
          onClick={dismiss}
          aria-label="Skip tour"
        >
          Skip
        </button>

        <div className="onboarding__icon" aria-hidden="true">{slide.icon}</div>
        <h2 className="onboarding__title">{slide.title}</h2>
        <p  className="onboarding__body">{slide.body}</p>

        <div className="onboarding__dots">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`onboarding__dot ${i === step ? 'onboarding__dot--active' : ''}`}
            />
          ))}
        </div>

        <button className="onboarding__cta" onClick={next}>
          {isLast ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  )
}
