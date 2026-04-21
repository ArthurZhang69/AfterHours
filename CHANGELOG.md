# Changelog

Recent iteration notes for the AfterHours app. Entries are grouped by theme
rather than strict chronology, so related fixes sit together.

---

## Heatmap & performance

- **Grid-aggregated KDE** — crimes are now pre-aggregated into 55 m spatial
  buckets before being fed to the Gaussian kernel, cutting the per-frame point
  count by ~70% on dense central-London views. Each bucket keeps a weighted
  sum that the kernel treats as a single weighted point.
- **Half-resolution backing canvas** — the KDE renders into a canvas at 0.5×
  device scale, then upscales on draw. Imperceptible on mobile; ~4× fewer
  pixels to shade per frame.
- **Four-corner viewport AABB for 3D** — `map.getBounds()` returns a
  north-aligned rectangle, so with tilt/rotation the KDE was rendering a thin
  strip instead of the visible area. Now four container-pixel corners are
  projected through `fromContainerPixelToLatLng` and an axis-aligned bounding
  box is taken from those, so the kernel always covers the whole tilted /
  rotated viewport.
- **Kernel radius tuning** — iterated from 85 m → 55 m (too tight) → 70 m →
  finalised at **80 m**. Hotspots now read as distinct glowing pockets
  without bleeding across half a neighbourhood.
- **No more blank heatmap during pan** — the earlier pan-only fast-path
  drifted in projection and was removed; the heatmap simply stays visible and
  re-renders on `idle`.
- **Hotspot pills stay mounted** — the `if (interacting) return null` guard
  on the 99+ cluster markers was dropped, so they no longer vanish every time
  the user nudges the map.

## Route scoring

- **Score against the full London dataset** — `scoreRoute` was being fed
  `localCrimes` (crimes within ~500 m of the user), which returned 0 for any
  route that ran outside that radius. Switched to the already-loaded
  `londonCrimes` so every segment of every alternative is scored correctly.
- **Stop faking Route B when only one alternative exists** — Google's Routes
  API often returns a single walking route for short / obvious paths.
  Previously the app pushed an empty `[]` into Route B, which `scoreRoute`
  scored as 0 and `RouteCard` displayed with hardcoded fallback
  duration/distance (15 min / 1.4 km), producing a phantom "Route B — LOW —
  Recommended" card. Now the second card is hidden and a small dashed note
  explains that no alternative was found. Selection auto-snaps back to
  Route A.
- **Tighter KDE kernel for corridor scoring** — segment bandwidth was
  reduced from 250 m to **100 m**. Two walking alternatives in central
  London typically run 150-300 m apart; 250 m was smearing the same crime
  cluster into both scores (demo runs capped at ~50 vs 41). At 100 m a
  one-block detour actually moves the needle. Saturation constants
  (`TOTAL_SATURATION`, `PEAK_SATURATION`) were rescaled so a typical
  1.5 km central route still lands in the 50-65 band.

## Map interaction

- **Auto-fit viewport to the full route** — `RouteRenderer` now calls
  `map.fitBounds()` across every point of every alternative the moment
  routes arrive, so the user sees the whole walk at a glance instead of
  staying zoomed into the origin. Padding accounts for the search bar
  (120 px top) and the bottom sheet's HALF snap (~48% bottom).
- **3D toggle actually shows buildings** — Google's vector renderer only
  extrudes building polygons at zoom ≥ 17. The old auto-zoom threshold
  was 16, which produced a tilted flat map. Raised to **17**; user's
  existing closer zooms are preserved.
- **Vector Map ID + AfterHours custom dark style** — both are now wired
  through `VITE_GOOGLE_MAP_ID` in GitHub Actions secrets. The style
  inherits the default 3D building geometry; the style editor preview
  confirms extrusions render at high tilt.
- **User dot and route lines no longer flicker** — previously both
  components unmounted / hid themselves via `useMapInteracting` during
  pan/zoom for FPS reasons. The resulting flash on every drag was worse
  than the cost, so both now stay mounted. Google's native polyline and
  AdvancedMarker renderers handle motion fine on their own.

## Search

- **Suggestions stopped reopening after selection** — in both `SearchBar`
  and the shared `PlaceSearch`, selecting a place called `setValue(name)`,
  which re-ran the autocomplete effect and popped the dropdown open again
  a tick later. Added a `skipNextFetch` ref set right before the
  programmatic `setValue` and consumed by the next effect tick.
- **Browse-area mode removed** — the separate "browse an area" toggle was
  redundant with plain destination search and added confusing dual-mode
  state. Removed entirely; the slot in the header now holds the
  tour-replay `?` button instead.

## Onboarding tour

- **Coach-mark spotlight instead of modal carousel** — each step dims the
  screen and cuts a transparent hole around a real UI element
  (`.search-bar__form`, `.tilt-btn`, `.bottom-sheet__handle-area`) with a
  tooltip card anchored beside it. Far less abstract than the previous
  "welcome screen" modal.
- **Always-on tour** — runs 900 ms after every launch, no `localStorage`
  gate. Users can Skip at any step; for occasional-use apps this works
  better than a "once ever" tour that's forgotten by the second visit.
- **Replay button in the search bar** — the `?` icon dispatches a
  `window.dispatchEvent('afterhours:tour')` that the onboarding component
  listens for, keeping the tour self-contained without prop-drilling a
  trigger.
- **Heatmap legend on the "Read the heat-map" step** — a magma gradient
  bar with Low / Medium / High labels, colours mirror the actual KDE
  ramp in `CrimeHeatmap.jsx`.
- **Tooltip flip guard for edge buttons** — the tilt button sits at
  `left: 16 px`, so `placement: 'left'` produced an off-screen tooltip
  that looked like the tour had silently dismissed itself. `measure()`
  now flips to the opposite side (or above/below) when the requested
  side doesn't have `TIP_W + GAP + 16 px` of slack.

## UI polish

- **Outfit as the primary typeface** — preconnected to Google Fonts in
  `index.html`, `var(--font)` updated globally.
- **AreaCard stat row alignment** — the three stat cells (Incidents /
  Categories / Data period) now share a line-height and use a compact
  modifier for long values like "Feb 2026" so the baselines match.
- **Prominent section labels** — `AREA RISK`, `CRIME TYPES`,
  `NEARBY TRANSIT` bumped to 11 px / 700 / secondary-text colour so they
  no longer read as afterthoughts.
- **Bottom sheet stops short of the search bar** — FULL snap lowered
  from 0.88 → 0.80 of viewport so the rounded top edge doesn't sit
  behind the search bar's safe-area inset on iPhones.
- **Disclaimer pinned to the bottom of AreaCard** — the card is now a
  flex column and the disclaimer has `margin-top: auto`, so when the
  sheet is pulled FULL and the breakdown list is short the disclaimer
  anchors at the bottom instead of floating mid-sheet with dead space
  below it.

## Infrastructure

- **`Cache-Control: no-store` on `index.html`** — iOS Safari was caching
  the entry document for hours, so users kept seeing old UI after a
  successful GitHub Pages deploy. Hashed JS/CSS filenames still cache
  normally; only the entry document is `no-store`.

---

For the precise commit sequence see `git log --oneline`.
