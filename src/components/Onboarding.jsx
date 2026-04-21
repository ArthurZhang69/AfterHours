import { useState, useEffect, useCallback, useLayoutEffect } from 'react'

/**
 * Coach-mark style first-run tour.
 *
 * Instead of a modal carousel that just describes features in the
 * abstract, each step dims the whole screen and cuts a spotlight hole
 * around a real UI element — the search bar, the 3D button, the sheet
 * handle — with a small tooltip anchored beside it. The user sees
 * exactly where to tap next.
 *
 * The tour runs every time the app opens — it's short and the user
 * can Skip out of any step. Rationale: for an app someone only uses
 * occasionally (after-hours walks home), a single "once ever" tour
 * is forgotten by the second visit. A five-second recap keeps the
 * feature set fresh without being annoying, and Skip is always one
 * tap away.
 */

/**
 * - target: CSS selector of the element to highlight. null → centred
 *   narrative step with no spotlight hole (used for the heat-map
 *   explanation, since the whole map is the target).
 * - placement: where to anchor the tooltip relative to target rect.
 *   'auto' picks whichever side has more room.
 * - padding: extra px around the target rect so the spotlight doesn't
 *   clip the element's own shadows/outline.
 */
const STEPS = [
  {
    title: 'Welcome to AfterHours',
    body: 'A night-time safety companion for London. Let\'s walk through the four things you\'ll use the most — takes 20 seconds.',
    target: null,
    placement: 'centre',
  },
  {
    title: 'Search a destination',
    body: 'Type any London address or landmark. We\'ll plot two walking routes side-by-side and score each by the crime density it passes through.',
    target: '.search-bar__form',
    placement: 'below',
    padding: 6,
  },
  {
    title: 'Read the heat-map',
    body: 'The warm glow is real crime data from data.police.uk. Brighter patches = more incidents recently. The black 99+ badges are clickable hotspot clusters.',
    target: null,
    placement: 'centre',
  },
  {
    title: 'Tilt & rotate',
    body: 'Tap to toggle 3D. Drag the map with two fingers to rotate. Useful for recognising landmarks on an unfamiliar street at night.',
    target: '.tilt-btn',
    placement: 'left',
    padding: 8,
  },
  {
    title: 'Your area card',
    body: 'Drag this sheet up to see the risk score, crime breakdown, and nearby transit for wherever you are. The "Compare Routes" button starts the route planner.',
    target: '.bottom-sheet__handle-area',
    placement: 'above',
    padding: 4,
  },
]

/**
 * Geometry helper: query the target rect and pick a tooltip position
 * that fits on screen. Returns null if the target can't be found yet
 * (e.g. the element is rendered conditionally).
 */
function measure(step, viewportW, viewportH) {
  if (!step.target) {
    return {
      hole:    null,
      tooltip: {
        top:  viewportH / 2,
        left: viewportW / 2,
        transform: 'translate(-50%, -50%)',
        arrow: null,
      },
    }
  }
  const el = document.querySelector(step.target)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const pad = step.padding ?? 6

  const hole = {
    top:    r.top    - pad,
    left:   r.left   - pad,
    width:  r.width  + pad * 2,
    height: r.height + pad * 2,
  }

  // Pick a side with space. The tooltip is ~300px × ~140px on mobile.
  const TIP_W = Math.min(300, viewportW - 32)
  const GAP   = 14
  let placement = step.placement
  if (placement === 'auto') {
    const spaceBelow = viewportH - r.bottom
    const spaceAbove = r.top
    placement = spaceBelow > spaceAbove ? 'below' : 'above'
  }

  let top, left, transform, arrow
  switch (placement) {
    case 'below': {
      top  = r.bottom + pad + GAP
      left = Math.min(Math.max(r.left + r.width / 2, TIP_W / 2 + 16), viewportW - TIP_W / 2 - 16)
      transform = 'translateX(-50%)'
      arrow = { side: 'top', offset: (r.left + r.width / 2) - (left - TIP_W / 2) }
      break
    }
    case 'above': {
      top  = r.top - pad - GAP
      left = Math.min(Math.max(r.left + r.width / 2, TIP_W / 2 + 16), viewportW - TIP_W / 2 - 16)
      transform = 'translate(-50%, -100%)'
      arrow = { side: 'bottom', offset: (r.left + r.width / 2) - (left - TIP_W / 2) }
      break
    }
    case 'left': {
      top  = r.top + r.height / 2
      left = r.left - pad - GAP
      transform = 'translate(-100%, -50%)'
      arrow = { side: 'right', offset: null }
      break
    }
    case 'right': {
      top  = r.top + r.height / 2
      left = r.right + pad + GAP
      transform = 'translateY(-50%)'
      arrow = { side: 'left', offset: null }
      break
    }
    default: {
      top  = viewportH / 2
      left = viewportW / 2
      transform = 'translate(-50%, -50%)'
      arrow = null
    }
  }
  return {
    hole,
    tooltip: { top, left, transform, arrow, width: TIP_W },
  }
}

export default function Onboarding({ ready = true }) {
  const [visible, setVisible] = useState(false)
  const [step,    setStep]    = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [geom,    setGeom]    = useState(null)

  // Trigger once the app is interactive (splash gone). Runs every
  // time — Skip is the opt-out, not a persistent localStorage flag.
  //
  // Hard fallback at 5 s: if London crime data hasn't loaded (slow
  // connection, rate limit, data.police.uk outage) `ready` will never
  // flip, but the user is already looking at a functional map — we
  // should still run the tour rather than stall forever.
  useEffect(() => {
    if (ready) { setVisible(true); return }
    const id = setTimeout(() => setVisible(true), 5000)
    return () => clearTimeout(id)
  }, [ready])

  // Re-measure target on step change, resize, and orientation change.
  // Re-uses useLayoutEffect so the tooltip jumps into place in the same
  // paint that the step advances — no visual "flash at 0,0" on mobile.
  useLayoutEffect(() => {
    if (!visible) return

    let raf = 0
    const recompute = () => {
      const m = measure(STEPS[step], window.innerWidth, window.innerHeight)
      if (m) setGeom(m)
      else {
        // Target not in the DOM yet; retry on the next frame.
        raf = requestAnimationFrame(recompute)
      }
    }
    recompute()

    const onResize = () => recompute()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [visible, step])

  const dismiss = useCallback(() => {
    setLeaving(true)
    setTimeout(() => { setVisible(false); setLeaving(false); setStep(0) }, 240)
  }, [])

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) dismiss()
    else setStep((s) => s + 1)
  }, [step, dismiss])

  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  if (!visible || !geom) return null

  const s = STEPS[step]
  const { hole, tooltip } = geom
  const isLast = step === STEPS.length - 1

  return (
    <div
      className={`coach ${leaving ? 'coach--leaving' : ''}`}
      // Tapping the dim area advances — same behaviour as the CTA,
      // but the tooltip stops propagation so users can still tap its
      // buttons without dismissing.
      onClick={next}
    >
      {/* Spotlight: a full-screen dark box with a transparent hole.
          Using box-shadow (not SVG masks) because Safari's mask
          support for animated positions is flaky under PWA. */}
      {hole ? (
        <div
          className="coach__hole"
          style={{
            top:    hole.top,
            left:   hole.left,
            width:  hole.width,
            height: hole.height,
          }}
        />
      ) : (
        <div className="coach__dim" />
      )}

      <div
        className="coach__tip"
        style={{
          top:       tooltip.top,
          left:      tooltip.left,
          transform: tooltip.transform,
          width:     tooltip.width,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {tooltip.arrow && (
          <span
            className={`coach__arrow coach__arrow--${tooltip.arrow.side}`}
            style={
              tooltip.arrow.offset != null
                ? { left: tooltip.arrow.offset }
                : undefined
            }
          />
        )}

        <h3 className="coach__title">{s.title}</h3>
        <p  className="coach__body">{s.body}</p>

        <div className="coach__footer">
          <div className="coach__dots">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`coach__dot ${i === step ? 'coach__dot--active' : ''}`}
              />
            ))}
          </div>
          <div className="coach__actions">
            {step > 0 && (
              <button className="coach__btn coach__btn--ghost" onClick={prev}>
                Back
              </button>
            )}
            <button className="coach__btn coach__btn--primary" onClick={next}>
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>

        <button
          className="coach__skip"
          onClick={dismiss}
          aria-label="Skip tour"
        >
          Skip tour
        </button>
      </div>
    </div>
  )
}
