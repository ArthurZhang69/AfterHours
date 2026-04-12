# AfterHours — Design Document

**Module:** CASA0028: Designing Spatial Data Stories  
**Prototype:** AfterHours — Night-time Safety Navigator  
**Live URL:** https://arthurzhang69.github.io/AfterHours/  
**Repository:** https://github.com/ArthurZhang69/AfterHours

---

## 1. Problem Analysis and Design Approach

### The Problem Space

London's night-time economy serves millions of people weekly, yet the information infrastructure available to late-night travellers remains poorly developed. Navigation apps optimise for speed; transport apps optimise for schedule. Neither accounts for the spatial distribution of crime risk along a given route or in a given area. Travellers making decisions about *where* to walk, *which* route to take, or *whether* to wait at a particular stop typically have no access to data that could meaningfully inform those decisions in the moment.

AfterHours was designed to address this gap — not by claiming to make anyone "safe," but by surfacing publicly available data in a way that allows users to make more *informed* decisions. This framing is deliberate. As Costanza-Chock (2020) argues, design justice requires that we attend carefully to who benefits from a system and who is potentially harmed by it. A safety navigation tool that presents crime data as objective truth risks stigmatising communities, reinforcing surveillance logics, and producing a false sense of certainty. The design response to this tension runs throughout the prototype.

### Approach

The core design premise was to build around *comparison and context* rather than *alarm*. Instead of mapping crime as a warning system, AfterHours gives users two parallel tools: a city-wide heatmap for situational awareness, and a route comparison engine that scores two alternative paths by weighted crime exposure. The user is never told which route is "safe" — they are shown which route has *lower* recorded crime density along it, with the qualifier that this reflects historical reports, not present-day risk.

The prototype integrates three live data sources:
- **data.police.uk** — street-level crime incidents (no API key; monthly updates)
- **TfL Unified API** — real-time transport arrivals and stop locations
- **Google Maps / Directions API** — routing geometry and place search

This combination reflects a user need that is inherently multi-dimensional: deciding how to travel at night requires knowing both where crime clusters historically occur *and* which transport options are currently reachable.

---

## 2. Iteration Log: From Concept to Deployed Prototype

### v0.1 — Initial Scaffold

The first commit established the full component architecture: `MapContainer`, `CrimeHotspots`, `BottomSheet`, `RoutePanel`, `AreaCard`, `StationMarkers`, and a set of custom hooks (`useCrimeData`, `useLondonCrimes`, `useNearbyStations`, `useLondonStations`, `useGeolocation`). Data fetching was routed through a Vite dev-server proxy to avoid CORS issues on the local network.

A key early decision was the **weighted risk scoring model** in `risk.js`. Rather than counting incidents equally, each crime category carries a severity multiplier: violent crime and robbery score 3.0×, personal theft 2.0×, anti-social behaviour 1.0×. This reflects a harm-reduction orientation — not all reported crimes carry equal relevance to a pedestrian's decision-making. The weights are transparent in the code and documented.

### v0.2 — Production Deployment

Moving to GitHub Pages exposed a structural problem: the dev-server proxy that handled CORS for `data.police.uk` and `api.tfl.gov.uk` does not exist in production. The fix was environment-aware API base URLs:

```js
const POLICE_BASE = import.meta.env.PROD
  ? 'https://data.police.uk/api'
  : '/api/police'
```

Both APIs support CORS natively, so direct browser requests work in production. This resolved the issue without requiring a backend proxy — an important constraint given the project's static hosting model.

### v0.3 — Coverage Analysis: The Grid Problem

The initial crime data strategy used a 16-point handcrafted grid to query the police API across inner London. Each query covers a ~1-mile radius. Early user testing revealed systematic blank areas on the map: Angel, St. Paul's / City of London, Belsize Park, Hampstead — all visible as dark patches in an otherwise hot heatmap.

The root cause was geometric: points spaced irregularly left triangular gaps where no query radius reached. The first response was reactive — adding individual points as gaps were discovered. This produced 26 points but gave no coverage guarantee.

**The decisive design shift** came with switching to a mathematically derived hexagonal grid. A regular hexagonal tiling with 2.5km spacing has the property that the maximum distance from any location to its nearest grid centre is `2.5 / √3 ≈ 1.44km` — safely within the API's 1.6km query radius. This reduces 43 points to achieve complete, provably gap-free coverage of inner London (lat 51.45–51.585, lng −0.225 to +0.025), down from the 80-point grid initially generated at tighter spacing.

This iteration demonstrates a broader design principle: *systematic solutions outperform reactive patches*. The hexagonal grid approach is resistant to future edge cases in a way that manual gap-filling is not.

### v0.4 — Performance: Concurrency Architecture

The original loading strategy batched queries in groups of 2 with a 1-second delay between batches — a conservative approach designed to avoid rate-limiting. With 43 grid points, this produced a worst-case loading time of over 20 seconds, which is fatal to usability on a mobile device.

The redesigned architecture uses a **concurrency pool** rather than fixed batching:

```
withConcurrency(tasks, limit=12, onDone, signal)
```

Any of the 43 tasks can run at once up to the concurrency limit of 12. Crucially, each completed request immediately updates the map — the heatmap builds progressively from the centre outward (grid points are ordered centre-first) rather than waiting for a full batch to complete. This reduces perceived loading time dramatically: the central city area appears within ~2 seconds, with outer areas filling in over the next 3–4 seconds.

A 24-hour `localStorage` cache (`afterhours_london_crimes_v4`) ensures that repeat visits are instantaneous. Cache keys are versioned — bumping the key on grid changes forces a fresh fetch, preventing stale data from the previous grid configuration persisting in users' browsers.

---

## 3. User Evaluation

**Primary user:** Someone preparing to travel in London between approximately 22:00 and 03:00 — after tube services become limited and before the night bus network peaks. This includes people leaving restaurants, bars, or entertainment venues; shift workers ending late shifts; students returning from campus events.

**Use context:** The app is designed for mobile, used in-situ while deciding whether to walk, wait for a bus, or take a different route. The bottom sheet UX — a draggable panel that coexists with the map — reflects this: the user keeps spatial context while reading the data. The app is not designed for desktop planning sessions, though it functions in that context.

**Decisions the prototype informs:**
- Which of two routes between a known origin and destination has lower recorded crime exposure
- Whether nearby transport stops are currently active (live arrivals)
- Whether a particular area of London has an unusually high density of a specific crime type (e.g., robbery vs. anti-social behaviour)

---

## 4. Ethical Implications and Critical Reflection

### The Limits of Crime Data

data.police.uk records *reported* crimes, not crimes that occurred. This distinction matters enormously. Areas with higher police presence generate more reports; communities less likely to report crimes appear statistically "safer." Displaying this data as a heatmap without qualification risks encoding existing policing biases into a tool that users may treat as authoritative.

AfterHours addresses this through careful language throughout the interface: "lower-risk route" not "safe route"; "data suggests" not "this area is dangerous"; risk scores labelled as *relative* and *historical*. The AreaCard explicitly notes the data month and acknowledges lag (typically 2–3 months). These are small mitigations, not solutions — but they reflect the kind of epistemic humility that Scott (1998) describes when critiquing the state's tendency to render complex social realities legible in ways that strip out their texture.

### Stigmatisation Risk

Any choropleth or heatmap of crime data risks stigmatising the neighbourhoods it highlights. AfterHours uses continuous gradient colour scales rather than discrete risk tiers, and avoids labelling any area as "dangerous." The category filter (Violent, Robbery, Theft, ASB, Drugs) allows users to interrogate the *type* of crime rather than receiving a single undifferentiated risk score — a design choice intended to resist the reduction of complex social conditions to a single number.

### Who Is Not Served

The prototype assumes smartphone access, internet connectivity, and familiarity with map-based interfaces. It is in English only. It focuses exclusively on Camden and inner London — a reflection of the project's academic scope but a genuine limitation for a tool that, were it deployed commercially, would need to address its geographic and linguistic boundaries explicitly.

---

## References

Costanza-Chock, S. (2020). *Design Justice: Community-Led Practices to Build the Worlds We Need*. MIT Press. https://doi.org/10.7551/mitpress/12255.001.0001

Scott, J. C. (1998). *Seeing Like a State: How Certain Schemes to Improve the Human Condition Have Failed*. Yale University Press.

data.police.uk (2024). *Street-level crime API documentation*. https://data.police.uk/docs/

Transport for London (2024). *TfL Unified API documentation*. https://api.tfl.gov.uk
