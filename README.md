# AfterHours — Night-time Safety Navigator

A mobile-first web app for navigating London safely after dark. AfterHours overlays real street-level crime data, live transport arrivals, and risk-scored routes on an interactive map, helping night-time travellers make more informed decisions about where to go and how to get there.

> **Academic context:** Built for Assessment 2 of the CASA MSc module on Urban Data Science. Crime and deprivation data are presented as indicators of *relative risk*, not absolute danger. Language throughout the app uses "lower-risk" rather than "safe" to avoid false assurance.

**Live demo:** https://arthurzhang69.github.io/AfterHours/

---

## Features

- **Crime heatmap** — street-level offences from data.police.uk, filterable by category (Violent, Robbery, Theft, ASB, Drugs)
- **Risk scoring** — area risk badge based on crime density within a configurable radius
- **Route comparison** — two alternative routes between any two points, ranked by crime exposure along the path
- **Live transport** — nearby tube, bus, and rail stations with real-time arrivals from the TfL Unified API
- **Crime detail panel** — tap any cluster to inspect individual incidents, category breakdown, and trend
- **3D tilt control** — toggle between flat and tilted map perspective
- **Splash screen** — animated intro on first load
- **Offline fallback** — mock crime data used if the police API is unreachable

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Maps | @vis.gl/react-google-maps v1.4 |
| Crime data | data.police.uk REST API (no key required) |
| Transport | TfL Unified API (free key) |
| Styling | Pure CSS with CSS custom properties |
| Deployment | GitHub Actions → GitHub Pages |

---

## Data Sources

| Dataset | Source | Notes |
|---|---|---|
| Street-level crime | [data.police.uk](https://data.police.uk/docs/) | No API key required; ~2–3 month lag |
| Transport stops & arrivals | [TfL Open Data](https://api.tfl.gov.uk) | Free registration for higher rate limits |
| Journey planning | TfL Journey Planner API | Included in the same TfL key |

See [AfterHours_DataDocs.md](AfterHours_DataDocs.md) for full API integration documentation.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Google Maps API key](https://console.cloud.google.com) with **Maps JavaScript API** and **Directions API** enabled
- A [TfL API key](https://api-portal.tfl.gov.uk) (optional — the app works without one at reduced rate limits)

### Local setup

```bash
# 1. Clone the repo
git clone https://github.com/ArthurZhang69/AfterHours.git
cd AfterHours

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local and fill in your keys

# 4. Start the dev server
npm run dev
```

Open http://localhost:5173 in your browser.

### Environment variables

Create `.env.local` in the project root (never commit this file):

```env
VITE_GOOGLE_MAPS_KEY=your_google_maps_api_key
VITE_GOOGLE_MAP_ID=your_map_id_optional
VITE_TFL_APP_KEY=your_tfl_app_key
```

---

## Deployment

The app deploys automatically to GitHub Pages on every push to `main` via GitHub Actions.

### One-time setup

1. Fork or push this repo to GitHub
2. Add the three environment variables as **repository secrets** under  
   `Settings → Secrets and variables → Actions`
3. Go to `Settings → Pages` and set the source branch to `gh-pages`

After the first successful Actions run, the app will be live at:

```
https://<your-username>.github.io/AfterHours/
```

### Google Maps key restrictions

In Google Cloud Console, restrict your Maps key to the following HTTP referrers to prevent unauthorised use:

```
https://<your-username>.github.io/*
http://localhost:5173/*
```

---

## Project Structure

```
src/
├── components/        # UI components
│   ├── MapContainer   # Google Map wrapper
│   ├── CrimeHeatmap   # Heatmap layer
│   ├── CrimeHotspots  # Clustered crime markers
│   ├── RoutePanel     # Route A/B comparison panel
│   ├── BottomSheet    # Draggable bottom sheet
│   ├── AreaCard       # Area risk summary card
│   ├── StationMarkers # TfL stop markers
│   └── ...
├── hooks/
│   ├── useCrimeData       # Crime data for current location
│   ├── useLondonCrimes    # Full London crime dataset
│   ├── useGeolocation     # GPS location hook
│   ├── useNearbyStations  # TfL stops near user
│   └── useLondonStations  # All London transit stations
├── services/
│   └── api.js         # All API calls (police.uk + TfL)
├── utils/
│   └── risk.js        # Risk scoring, crime clustering, demo routes
└── constants/
    └── mapStyles.js   # Dark map style, crime colours, route colours
```

---

## Ethical Considerations

Crime data reflects reported offences — not actual danger. High crime counts in an area may indicate high reporting rates, active policing, or data collection artefacts rather than elevated personal risk. This app should be used as one input among many, not as a definitive safety guide.

- Coordinates are **anonymised** by data.police.uk to the nearest street midpoint
- Data is typically **2–3 months behind** the current date
- Unreported crimes (harassment, intimidation) are **significantly under-represented**
- The app uses **relative gradient colour scales** to avoid stigmatising specific neighbourhoods

---

## License

This project is for academic and educational purposes.
