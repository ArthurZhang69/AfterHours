import { useRef, useState, useEffect, useCallback } from 'react'

const SNAP = { COLLAPSED: 0, HALF: 1, FULL: 2 }

// FULL stops short of the top edge so the search bar (which sits
// at safe-area-inset-top + ~56px) stays fully visible instead of
// being overlapped by the sheet's rounded top border.
const SNAP_HEIGHTS = {
  [SNAP.COLLAPSED]: 72,   // px — drag handle + summary line
  [SNAP.HALF]:      0.46, // fraction of screen height
  [SNAP.FULL]:      0.80,
}

/**
 * Slide-up bottom sheet with 3 snap points (collapsed / half / full).
 * Children receive { snap, setSnap } via render prop or just render normally.
 */
export default function BottomSheet({ children, defaultSnap = SNAP.HALF, onHeightChange }) {
  const [snap,     setSnap]     = useState(defaultSnap)
  const [dragging, setDragging] = useState(false)
  const startY   = useRef(0)
  const startSnap = useRef(snap)
  const sheetRef = useRef(null)

  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800

  function snapToHeight(s) {
    const h = SNAP_HEIGHTS[s]
    return typeof h === 'number' && h < 1 ? Math.round(h * screenH) : h
  }

  const height = snapToHeight(snap)

  // Notify parent whenever the sheet height changes so floating controls
  // can reposition themselves above the sheet top edge.
  useEffect(() => {
    onHeightChange?.(height)
  }, [height, onHeightChange])

  function onPointerDown(e) {
    startY.current   = e.touches ? e.touches[0].clientY : e.clientY
    startSnap.current = snap
    setDragging(true)
  }

  const onPointerMove = useCallback((e) => {
    if (!dragging) return
    const y     = e.touches ? e.touches[0].clientY : e.clientY
    const delta = startY.current - y          // positive = dragging up

    if (delta > 60)       setSnap(Math.min(SNAP.FULL, startSnap.current + 1))
    else if (delta < -60) setSnap(Math.max(SNAP.COLLAPSED, startSnap.current - 1))
  }, [dragging])

  const onPointerUp = useCallback(() => { setDragging(false) }, [])

  useEffect(() => {
    window.addEventListener('touchmove',  onPointerMove, { passive: true })
    window.addEventListener('touchend',   onPointerUp)
    window.addEventListener('mousemove',  onPointerMove)
    window.addEventListener('mouseup',    onPointerUp)
    return () => {
      window.removeEventListener('touchmove',  onPointerMove)
      window.removeEventListener('touchend',   onPointerUp)
      window.removeEventListener('mousemove',  onPointerMove)
      window.removeEventListener('mouseup',    onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  return (
    <div
      ref={sheetRef}
      className={`bottom-sheet ${dragging ? 'bottom-sheet--dragging' : ''}`}
      style={{ height, transition: dragging ? 'none' : 'height 0.32s cubic-bezier(0.32,0,0.67,1)' }}
    >
      {/* Drag handle */}
      <div
        className="bottom-sheet__handle-area"
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
      >
        <div className="bottom-sheet__handle" />
      </div>

      {/* Scrollable content */}
      <div className="bottom-sheet__content">
        {typeof children === 'function'
          ? children({ snap, setSnap, SNAP })
          : children}
      </div>
    </div>
  )
}

BottomSheet.SNAP = SNAP
