# AfterHours — Design Document

**Module:** CASA0028: Designing Spatial Data Stories
**Prototype:** AfterHours — Night-time Safety Navigator
**Live URL:** https://arthurzhang69.github.io/AfterHours/
**Repository:** https://github.com/ArthurZhang69/AfterHours

---

## 1. Executive Summary

AfterHours is a mobile-first web prototype that helps people making late-night journeys in London compare walking routes and surrounding areas by historical crime exposure. It combines three live data sources — `data.police.uk` street-level crime, the TfL Unified API, and the Google Maps / Routes API — inside a single React + Vite interface.

The design is deliberately framed around **comparison and context, not alarm**. Navigation apps optimise for speed; transport apps optimise for schedule. Neither accounts for the spatial distribution of crime exposure along a corridor. AfterHours fills that gap while actively resisting the surveillance and stigmatisation logics that crime maps typically reproduce. It never tells a user a route is "safe"; it shows which of two alternatives carries *lower recorded crime density*, annotated as historical and relative.

---

## 2. Problem Analysis and Design Approach

### The problem space

London's night-time economy serves millions weekly, yet the information infrastructure available to late-night travellers is poorly developed. Travellers deciding *where* to walk, *which* route to take, or *whether* to wait at a given stop typically have no access to data that could meaningfully inform those decisions in the moment.

As Costanza-Chock (2020) argues, design justice demands attention to who benefits from a system and who is potentially harmed. A tool that presents crime data as objective truth risks stigmatising communities, reinforcing policing biases, and producing false certainty. Scott (1998) makes a parallel point about the state's tendency to render complex social realities legible by stripping out their texture. These tensions run throughout the design.

### Target user and context

The primary user is someone travelling in London between roughly 22:00 and 03:00 — after tube services thin out and before night-bus coverage peaks. This includes people leaving bars, restaurants or venues, shift workers ending late shifts, and students returning from campus events. The app is used *in-situ* on a phone, typically while deciding whether to walk, wait, or re-route; the draggable bottom sheet is designed so that map context is never lost while reading data.

Three decisions the prototype informs:
- Which of two walking routes between an origin and destination carries lower recorded crime exposure.
- Whether nearby transport stops are currently active (live arrivals via TfL).
- Whether a given area has unusually high density of a particular crime type (violent, robbery, theft, ASB, drugs).

### Design approach

Instead of mapping crime as a warning system, AfterHours offers two parallel tools: a city-wide Kernel Density heatmap for situational awareness, and a route comparison engine that scores two alternative paths by weighted crime exposure. The user never sees a binary verdict; they see a relative score and a qualitative risk badge, with the data month surfaced explicitly on the AreaCard.

---

## 3. Formal Model: KDE and Route Scoring

The scoring model follows Galbrun, Pelechrinis & Terzi (2016) on *safe paths in urban environments*. A 2-D Gaussian KDE is evaluated over the set of weighted crime incidents *C* to produce a continuous risk surface:

$$\lambda(p) \;=\; \sum_{c \in C} w_c \cdot \frac{1}{2\pi h^2} \exp\!\left(-\frac{\lVert p - c \rVert^2}{2h^2}\right)$$

where `w_c` is the category severity weight (violent crime and robbery 3.0×, personal theft 2.0×, anti-social behaviour 1.0×) and `h` is the kernel bandwidth. The weights encode a harm-reduction orientation — not all reported crimes carry equal relevance to a pedestrian's decision.

For a walking route *R* sampled at points `p_i` with segment lengths `ℓ_i`, Galbrun et al. define two complementary summaries:

- **Total exposure** (integrated risk along the path):

  $$\text{RiskTotal}(R) \;=\; \sum_i \lambda(p_i)\, \ell_i$$

- **Peak exposure** (worst single segment):

  $$\text{RiskMax}(R) \;=\; \max_i \lambda(p_i)$$

AfterHours reports a normalised `total` as the headline score driving the "lower-risk route" recommendation, and flags any individual segment above a peak threshold with a ⚠ *High-risk segment* notice — so a route with one bad block cannot hide behind a favourable average.

### Implementation in the repo

The continuous λ(p) surface is approximated by two discretisations tuned for browser performance:

- **AreaScore_repo** — the city-wide heatmap pre-aggregates crimes into 55 m spatial buckets; each bucket contributes a single weighted point to the KDE with bandwidth 80 m, rendered into a half-resolution backing canvas upscaled on draw. This cuts per-frame point count by ~70% on dense views without visible quality loss.
- **RouteScore_repo** — corridor scoring uses a tighter bandwidth (100 m, down from an earlier 250 m). Walking alternatives in central London typically diverge by 150–300 m; a 250 m kernel smeared the same cluster into both corridors, compressing scores. At 100 m a one-block detour moves the needle, and `TOTAL_SATURATION` / `PEAK_SATURATION` constants are rescaled so a typical 1.5 km central route still lands in the 50–65 band.

---

## 4. Iteration Log

### v0.1 — Scaffold

The first commit established the component architecture: MapContainer, CrimeHeatmap, BottomSheet, RoutePanel, AreaCard, StationMarkers, and custom hooks (useCrimeData, useLondonCrimes, useNearbyStations, useLondonStations, useGeolocation). Data fetching was routed through a Vite dev-server proxy to avoid CORS issues locally. The weighted risk model in risk.js was fixed early so that every later iteration could reason about a stable scoring contract.

### v0.2 — Production deployment

Moving to GitHub Pages exposed a structural problem: the dev-server proxy does not exist in production. The fix was environment-aware API base URLs:


const POLICE_BASE = import.meta.env.PROD
  ? 'https://data.police.uk/api'
  : '/api/police'


Both `data.police.uk` and `api.tfl.gov.uk` support CORS natively, so direct browser requests work in production without a backend proxy — an important constraint given static hosting.

### v0.3 — Coverage: the grid problem

Initial crime fetching used a 16-point handcrafted grid, each query covering a ~1-mile radius. User testing revealed systematic blank patches — Angel, St. Paul's, Belsize Park, Hampstead. Points spaced irregularly left triangular gaps where no query radius reached.

The decisive shift was a mathematically derived **hexagonal grid** with 2.5 km spacing. The maximum distance from any location to its nearest grid centre is `2.5 / √3 ≈ 1.44 km`, safely inside the API's 1.6 km query radius. Forty-three centres achieve provably gap-free coverage of inner London (51.45–51.585 N, −0.225 to +0.025 E). Systematic solutions outperform reactive patches.

### v0.4 — Performance: concurrency pool

The original loader batched queries 2-at-a-time with a 1 s gap between batches. With 43 points this produced a worst-case >20 s cold load — fatal on mobile. The rewrite uses a **concurrency pool**:

```
withConcurrency(tasks, limit = 12, onDone, signal)
```

Up to twelve queries run at once, and each completed request immediately updates the map — grid points are ordered centre-first, so the central city appears in ~2 s with outer areas filling over the next 3–4 s. A 24-hour versioned `localStorage` cache (`afterhours_london_crimes_v4`) makes repeat visits instantaneous; bumping the key on grid changes forces a fresh fetch.

### v0.5 — Scoring, interaction, and visual polish

Later iterations closed a set of UX and modelling gaps. Route B was previously faked into existence when Google returned only one walking alternative — an empty path was scored as 0, paired with a hardcoded "15 min / 1.4 km", producing a phantom "LOW — Recommended" card. The UI now collapses to a single card with a dashed note. The KDE bandwidth was tuned (85 → 55 → 70 → **80 m**) so hotspots read as distinct pockets rather than bleeding across neighbourhoods. `map.fitBounds()` auto-frames the full route on arrival; the 3D tilt auto-zooms to z ≥ 17, the threshold at which Google's vector renderer extrudes buildings. An onboarding coach-mark tour dims the screen and anchors tooltips on real UI elements (search bar, tilt button, sheet handle, heatmap legend) rather than relying on an abstract welcome modal.

---

## 5. Critical Evaluation

### Epistemic limits of crime data

`data.police.uk` records *reported* crimes, not crimes that occurred. Areas with higher police presence generate more reports; under-reporting communities appear statistically "safer." Displaying this as a heatmap without qualification risks encoding policing biases into a tool users may treat as authoritative. AfterHours mitigates this through language — "lower-risk route" not "safe route"; "data suggests" not "this area is dangerous" — and by exposing the data month directly on the AreaCard (lag is typically 2–3 months). These are small mitigations, not solutions.

### Planar vs network KDE

The KDE implemented here is planar: risk diffuses isotropically through space, ignoring the street network. Xie & Yan (2008) show that for linear phenomena such as pedestrian crime, planar KDE can mis-attribute density across barriers (rivers, railway cuttings, closed estates) that a pedestrian cannot actually cross. A network-constrained KDE would be more faithful; it is a natural next step but was out of scope for a browser-side prototype. The current mitigation is that the 80 m area-bandwidth and 100 m route-bandwidth are both small relative to typical London block sizes, limiting diffusion across physical barriers.

### Stigmatisation

Any choropleth of crime data risks stigmatising the neighbourhoods it highlights. AfterHours uses a continuous magma gradient rather than discrete tiers, and avoids labelling any area as "dangerous." The category filter (Violent, Robbery, Theft, ASB, Drugs) lets users interrogate the *type* of crime rather than receiving one undifferentiated score — resisting the reduction of complex social conditions to a single number. This echoes the Risk Terrain Modeling tradition (NIJ) in which crime exposure is disaggregated into contributing risk factors rather than summarised as a black-box score.

### Who is not served

The prototype assumes smartphone access, data connectivity, and familiarity with map interfaces. It is English-only and focuses on inner London — a reflection of academic scope, but a genuine limitation for any commercial extension. Users without smartphones, tourists without roaming data, and people whose night-time travel concerns are not captured by police-reported crime (harassment, stalking, environmental lighting) all sit outside the current design envelope.

---

## 6. Short-term Roadmap

- **Network-constrained KDE** using the OS Open Roads graph, replacing planar diffusion at the route-scoring layer.
- **Time-of-day weighting** — the police feed aggregates monthly; pairing it with TfL night-bus load and London Datastore street-lighting could better express *night-time* rather than all-hours risk.
- **Category-aware route scoring** — let the user weight categories relevant to their own journey (e.g. down-weight drugs offences, up-weight robbery) rather than relying on fixed harm multipliers.
- **Accessibility pass** — screen-reader labelling of the heatmap legend and route cards; high-contrast mode.

---

## References

Costanza-Chock, S. (2020). *Design Justice: Community-Led Practices to Build the Worlds We Need*. MIT Press. https://doi.org/10.7551/mitpress/12255.001.0001

Galbrun, E., Pelechrinis, K., & Terzi, E. (2016). Urban navigation beyond shortest route: The case of safe paths. *Information Systems*, 57, 160–171.

Scott, J. C. (1998). *Seeing Like a State: How Certain Schemes to Improve the Human Condition Have Failed*. Yale University Press.

Xie, Z., & Yan, J. (2008). Kernel Density Estimation of traffic accidents in a network space. *Computers, Environment and Urban Systems*, 32(5), 396–406.

National Institute of Justice (2024). *Risk Terrain Modeling*. https://nij.ojp.gov/

data.police.uk (2024). *Street-level crime API documentation*. https://data.police.uk/docs/

Transport for London (2024). *TfL Unified API documentation*. https://api.tfl.gov.uk
