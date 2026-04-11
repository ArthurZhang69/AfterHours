import { useCallback, useRef } from 'react'

const ROTATE_STEP = 15   // degrees per tap
const ROTATE_INTERVAL = 80  // ms when holding

/**
 * Floating 3D / compass control.
 * Shows a "3D" toggle; when active, shows a compass needle + rotate buttons.
 */
export default function TiltControl({ is3D, heading, onToggle3D, onHeadingChange }) {
  const intervalRef = useRef(null)

  const startRotate = useCallback((dir) => {
    const step = () => onHeadingChange((h) => (h + dir * ROTATE_STEP + 360) % 360)
    step()
    intervalRef.current = setInterval(step, ROTATE_INTERVAL)
  }, [onHeadingChange])

  const stopRotate = useCallback(() => {
    clearInterval(intervalRef.current)
  }, [])

  const resetNorth = useCallback(() => {
    onHeadingChange(0)
  }, [onHeadingChange])

  return (
    <div className="tilt-control">
      {/* Compass — only shown in 3D mode */}
      {is3D && (
        <div className="tilt-compass" onClick={resetNorth} title="Tap to reset north">
          <div
            className="tilt-compass__needle"
            style={{ transform: `rotate(${heading}deg)` }}
          >
            <div className="tilt-compass__north" />
            <div className="tilt-compass__south" />
          </div>
          <div className="tilt-compass__label">N</div>
        </div>
      )}

      {/* Rotate buttons — only in 3D mode */}
      {is3D && (
        <div className="tilt-rotate">
          <button
            className="tilt-rotate__btn"
            onPointerDown={() => startRotate(-1)}
            onPointerUp={stopRotate}
            onPointerLeave={stopRotate}
            title="Rotate left"
          >←</button>
          <button
            className="tilt-rotate__btn"
            onPointerDown={() => startRotate(1)}
            onPointerUp={stopRotate}
            onPointerLeave={stopRotate}
            title="Rotate right"
          >→</button>
        </div>
      )}

      {/* 3D toggle button */}
      <button
        className={`tilt-btn ${is3D ? 'tilt-btn--active' : ''}`}
        onClick={onToggle3D}
        title={is3D ? 'Switch to 2D view' : 'Switch to 3D view'}
      >
        {is3D ? '2D' : '3D'}
      </button>
    </div>
  )
}
