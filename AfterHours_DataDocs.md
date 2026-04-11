# AfterHours — Data Sources & API Integration Guide

**Project:** AfterHours — Night-time Safety Navigator  
**Version:** v1.0  
**Last Updated:** 2026-03-26  
**Description:** A mobile-first safety navigation app for night-time travellers in London, integrating crime, transport, and socioeconomic data to help users make more informed travel decisions.

---

## Table of Contents

1. [Data Sources Overview](#1-data-sources-overview)
2. [Street-Level Crime Data — data.police.uk](#2-street-level-crime-data--datapoliceuк)
3. [TfL Transport Data — TfL Unified API](#3-tfl-transport-data--tfl-unified-api)
4. [LSOA Boundary Data — ONS Geoportal](#4-lsoa-boundary-data--ons-geoportal)
5. [Deprivation Index — Indices of Deprivation](#5-deprivation-index--indices-of-deprivation)
6. [MPS Crime Summary — London Datastore (supplementary)](#6-mps-crime-summary--london-datastore-supplementary)
7. [Frontend Integration Examples](#7-frontend-integration-examples)
8. [Data Limitations & Ethical Considerations](#8-data-limitations--ethical-considerations)

---

## 1. Data Sources Overview

| # | Dataset | Source | Access Method | Granularity | Registration Required |
|---|---|---|---|---|---|
| 1 | Street-level crime data | data.police.uk | REST API | Street-level (lat/lng) | No |
| 2 | TfL transport data | TfL Open Data | REST API | Stop-level | Yes (free) |
| 3 | LSOA 2021 boundaries | ONS Geoportal | Static download (GeoJSON) | LSOA polygon | No |
| 4 | Deprivation index (IMD) | London Datastore | Static download (CSV) | LSOA-level | No |
| 5 | MPS crime summary | London Datastore | Static download (CSV) | Borough / Ward / LSOA | No |

---

## 2. Street-Level Crime Data — data.police.uk

### Overview

- **Documentation:** https://data.police.uk/docs/
- **Base URL:** `https://data.police.uk/api`
- **Authentication:** No API key or registration required
- **Rate limit:** 15 requests/second; burst up to 30
- **Data freshness:** Typically 2–3 months behind; omitting `date` returns the latest available month
- **Coverage:** All police forces in England and Wales; London uses Metropolitan Police Service (MPS) data

> **Note:** Returned coordinates are approximate anonymised locations, not precise crime sites.

---

### 2.1 Endpoint: Nearby Street-Level Crimes

Queries all crimes within a **1-mile radius** of a given lat/lng — the core endpoint for AfterHours.

**Endpoint:**
```
GET https://data.police.uk/api/crimes-street/all-crime
```

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lat` | number | Yes | Latitude (WGS84) |
| `lng` | number | Yes | Longitude (WGS84) |
| `date` | string | No | Format `YYYY-MM`; omit for latest available month |

**Example request:**
```
GET https://data.police.uk/api/crimes-street/all-crime?lat=51.5246&lng=-0.1340&date=2024-10
```

**Example response:**
```json
[
  {
    "category": "violent-crime",
    "persistent_id": "abc123...",
    "id": 116208998,
    "month": "2024-10",
    "location": {
      "latitude": "51.524",
      "longitude": "-0.134",
      "street": {
        "id": 1738842,
        "name": "On or near Parkway"
      }
    },
    "context": "",
    "location_type": "Force",
    "location_subtype": "",
    "outcome_status": {
      "category": "Under investigation",
      "date": "2024-10"
    }
  }
]
```

**JavaScript:**
```js
async function getCrimesNearby(lat, lng, date) {
  const url = new URL("https://data.police.uk/api/crimes-street/all-crime");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lng", lng);
  if (date) url.searchParams.set("date", date);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Usage
const crimes = await getCrimesNearby(51.5246, -0.1340, "2024-10");
```

---

### 2.2 Endpoint: Custom Polygon Query

Useful for map-drawn area selections or querying within LSOA boundaries.

**Endpoint:**
```
GET https://data.police.uk/api/crimes-street/all-crime?poly={coordinates}&date={YYYY-MM}
```

**`poly` format:** `lat,lng:lat,lng:lat,lng` (does not need to be closed — auto-closed)

**Example request (Camden core area):**
```
GET https://data.police.uk/api/crimes-street/all-crime?poly=51.540,-0.155:51.540,-0.120:51.510,-0.120:51.510,-0.155&date=2024-10
```

**JavaScript:**
```js
async function getCrimesByPolygon(coords, date) {
  // coords: [[lat, lng], [lat, lng], ...]
  const poly = coords.map(([lat, lng]) => `${lat},${lng}`).join(":");
  const url = `https://data.police.uk/api/crimes-street/all-crime?poly=${poly}&date=${date}`;

  const res = await fetch(url);
  if (res.status === 503) throw new Error("Area too large — more than 10,000 results. Reduce the polygon.");
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

> **Limit:** Returns `503` if the area contains more than 10,000 results. For all of Camden, query by Ward instead.

---

### 2.3 Endpoint: Filter by Crime Category

Replace `all-crime` with a specific category to reduce response size and improve performance.

**Crime categories relevant to AfterHours:**

| Parameter value | Description |
|---|---|
| `violent-crime` | Violent crime |
| `theft-from-the-person` | Personal theft (pickpocketing, snatching) |
| `robbery` | Robbery |
| `anti-social-behaviour` | Anti-social behaviour (harassment, noise, etc.) |
| `drugs` | Drug-related offences |
| `public-order` | Public order offences |
| `other-theft` | Other theft |

**Example (violent crime only):**
```
GET https://data.police.uk/api/crimes-street/violent-crime?lat=51.5246&lng=-0.1340&date=2024-10
```

---

### 2.4 React Hook

```js
// hooks/useCrimeData.js
import { useEffect, useState } from "react";

export function useCrimeData(lat, lng, date) {
  const [crimes, setCrimes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lat || !lng) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const url = new URL("https://data.police.uk/api/crimes-street/all-crime");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lng", lng);
    if (date) url.searchParams.set("date", date);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setCrimes(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [lat, lng, date]);

  return { crimes, loading, error };
}
```

---

## 3. TfL Transport Data — TfL Unified API

### Overview

- **API documentation:** https://tfl.gov.uk/info-for/open-data-users/api-documentation
- **Swagger Explorer:** https://api.tfl.gov.uk/swagger/ui/index.html
- **Base URL:** `https://api.tfl.gov.uk`
- **Authentication:** Free registration required to obtain an `app_key`
  - Register at: https://api-portal.tfl.gov.uk
  - Append `?app_key=YOUR_KEY` to all requests
- **Free quota:** 500 requests/day (registered); requests without a key are rate-limited

---

### 3.1 Endpoint: Nearby Stops

Returns transport stops (tube, bus, rail, etc.) near a given coordinate.

**Endpoint:**
```
GET https://api.tfl.gov.uk/StopPoint?lat={lat}&lon={lng}&stopTypes=NaptanMetroStation,NaptanPublicBusCoachTram&radius=500&app_key={KEY}
```

**Common stopTypes:**

| Value | Description |
|---|---|
| `NaptanMetroStation` | Underground / Overground / DLR station |
| `NaptanPublicBusCoachTram` | Bus stop |
| `NaptanRailStation` | National Rail station |

**Example request:**
```
GET https://api.tfl.gov.uk/StopPoint?lat=51.5246&lon=-0.1340&stopTypes=NaptanMetroStation&radius=500&app_key=YOUR_KEY
```

**JavaScript:**
```js
const TFL_KEY = process.env.REACT_APP_TFL_KEY;

async function getNearbyStations(lat, lng, radius = 500) {
  const url = new URL("https://api.tfl.gov.uk/StopPoint");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lng);
  url.searchParams.set("stopTypes", "NaptanMetroStation,NaptanPublicBusCoachTram");
  url.searchParams.set("radius", radius);
  url.searchParams.set("app_key", TFL_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TfL API error: ${res.status}`);
  const data = await res.json();
  return data.stopPoints;
}
```

**Key response fields:**
```json
{
  "stopPoints": [
    {
      "naptanId": "940GZZLUCAM",
      "commonName": "Camden Town Underground Station",
      "lat": 51.5393,
      "lon": -0.1426,
      "lines": [{ "id": "northern", "name": "Northern" }],
      "modes": ["tube"]
    }
  ]
}
```

---

### 3.2 Endpoint: Live Arrivals

Returns real-time arrival times for a given stop.

**Endpoint:**
```
GET https://api.tfl.gov.uk/StopPoint/{stopId}/Arrivals?app_key={KEY}
```

**Example request (Camden Town):**
```
GET https://api.tfl.gov.uk/StopPoint/940GZZLUCAM/Arrivals?app_key=YOUR_KEY
```

**JavaScript:**
```js
async function getArrivals(stopId) {
  const res = await fetch(
    `https://api.tfl.gov.uk/StopPoint/${stopId}/Arrivals?app_key=${TFL_KEY}`
  );
  if (!res.ok) throw new Error(`TfL Arrivals error: ${res.status}`);
  const arrivals = await res.json();
  // Sort by expected arrival time
  return arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
}
```

**Key response fields:**
```json
[
  {
    "stationName": "Camden Town Underground Station",
    "lineName": "Northern",
    "destinationName": "Morden Underground Station",
    "timeToStation": 120,
    "expectedArrival": "2024-10-15T23:45:00Z"
  }
]
```

---

### 3.3 Endpoint: Journey Planning

Plans the best route between two points, supporting combinations of walking, tube, and bus.

**Endpoint:**
```
GET https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}?app_key={KEY}
```

**`from` / `to` format:** `lat,lng` or a NaptanId

**Example request:**
```
GET https://api.tfl.gov.uk/Journey/JourneyResults/51.5246,-0.1340/to/51.5074,-0.1278?app_key=YOUR_KEY
```

**JavaScript:**
```js
async function planJourney(fromLat, fromLng, toLat, toLng) {
  const from = `${fromLat},${fromLng}`;
  const to = `${toLat},${toLng}`;
  const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${from}/to/${to}?app_key=${TFL_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Journey API error: ${res.status}`);
  const data = await res.json();
  return data.journeys; // Array of route options
}
```

---

### 3.4 Endpoint: Line Status (Night-time Accessibility)

Returns the current operational status of each line — useful for assessing late-night reachability.

**Endpoint:**
```
GET https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr/Status?app_key={KEY}
```

**JavaScript:**
```js
async function getLineStatus() {
  const res = await fetch(
    `https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr/Status?app_key=${TFL_KEY}`
  );
  if (!res.ok) throw new Error(`Line Status error: ${res.status}`);
  return res.json();
}
```

---

## 4. LSOA Boundary Data — ONS Geoportal

### Overview

- **Download page:** https://geoportal.statistics.gov.uk/datasets/lower-layer-super-output-areas-december-2021-boundaries-ew-bfc-v10-2/about
- **Formats:** GeoJSON / Shapefile / CSV
- **Spatial unit:** LSOA (Lower Layer Super Output Area) polygon boundaries
- **Coverage:** England and Wales — approximately 33,755 LSOAs
- **London LSOAs:** approx. 4,835

### Download Steps

1. Visit the link above and click the **Download** button on the right
2. Select **GeoJSON** format (directly usable in Mapbox/Leaflet)
3. To obtain London only: use the spatial filter on the page before exporting, or filter the full file in code by the `LSOA21NM` field

### Key Fields

| Field | Description |
|---|---|
| `LSOA21CD` | Unique LSOA code (e.g. `E01000001`) |
| `LSOA21NM` | LSOA name (e.g. `Camden 001A`) |
| `geometry` | Polygon coordinates (GeoJSON Polygon) |

### Frontend Loading Example (Mapbox GL JS)

```js
// Load LSOA boundaries and overlay crime heat colours
map.addSource("lsoa", {
  type: "geojson",
  data: "/data/lsoa_london.geojson",
});

map.addLayer({
  id: "lsoa-fill",
  type: "fill",
  source: "lsoa",
  paint: {
    "fill-color": [
      "interpolate", ["linear"],
      ["get", "crime_count"], // inject crime count into properties beforehand
      0, "#E1F5EE",
      50, "#F5C4B3",
      200, "#D85A30",
    ],
    "fill-opacity": 0.6,
  },
});
```

---

## 5. Deprivation Index — Indices of Deprivation

### Overview

- **Download page:** https://data.london.gov.uk/dataset/indices-of-deprivation-2l15g
- **Formats:** CSV / Excel
- **Spatial unit:** LSOA-level
- **Year:** 2019 (latest version, England-wide)
- **Purpose:** Provides structural inequality context alongside crime data — avoids single-cause attribution

### Download Steps

1. Visit the link above and click **Download**, selecting the CSV version
2. The file is typically named `ID 2019 for London.xlsx` or similar

### Recommended Fields

| Field name | Description |
|---|---|
| `LSOA code (2011)` | LSOA code (for joining with boundary data) |
| `Index of Multiple Deprivation (IMD) Score` | Composite deprivation score |
| `Index of Multiple Deprivation (IMD) Rank` | National rank (1 = most deprived) |
| `Income Score` | Income domain score |
| `Employment Score` | Employment domain score |
| `Total population: mid 2015 (excluding prisoners)` | Population count (for normalisation) |

### Data Processing Example (Python)

```python
import pandas as pd
import geopandas as gpd

# Load IMD data
imd = pd.read_csv("imd_2019_london.csv")
imd = imd[["LSOA code (2011)", "IMD Score", "IMD Rank"]].rename(
    columns={"LSOA code (2011)": "LSOA21CD"}
)

# Load LSOA boundaries
lsoa = gpd.read_file("lsoa_london.geojson")

# Spatial join
merged = lsoa.merge(imd, on="LSOA21CD", how="left")
merged.to_file("lsoa_with_imd.geojson", driver="GeoJSON")
```

---

## 6. MPS Crime Summary — London Datastore (supplementary)

### Overview

- **Download page:** https://data.london.gov.uk/dataset/mps-recorded-crime-geographic-breakdown-exy3m
- **Format:** CSV
- **Granularity:** Borough / Ward / LSOA (no street-level coordinates)
- **Time range:** 2008 to present, updated monthly
- **Purpose:** Offline analysis and historical trend comparisons — not suited for live frontend calls

### Use Cases

- Generate monthly crime totals at LSOA level and inject into LSOA GeoJSON `properties` for choropleth map rendering
- Analyse crime category composition to inform in-app explanatory text

### Key Fields (LSOA version)

| Field | Description |
|---|---|
| `LookUp_BoroughName` | Borough name |
| `LSOA Code` | LSOA code |
| `LSOA Name` | LSOA name |
| `Major Category` | Crime major category |
| `Minor Category` | Crime minor category |
| `{YYYY-MM}` | Number of offences in that LSOA for that month (wide format) |

---

## 7. Frontend Integration Examples

### 7.1 Data Flow Architecture

```
User location (lat/lng)
    │
    ├─── data.police.uk API ──► Street-level crime JSON ──► Map heat markers
    │
    ├─── TfL Arrivals API ────► Live arrival data        ──► Nearby stop cards
    │
    └─── Local GeoJSON / CSV
             ├── LSOA boundaries ──► Choropleth base layer
             └── IMD data         ──► Area context overlay
```

### 7.2 Environment Variable Setup

Create a `.env` file in the project root:

```env
REACT_APP_TFL_KEY=your_tfl_app_key
```

> data.police.uk requires no key — no environment variable needed.

### 7.3 Unified Data Service Example

```js
// services/dataService.js

const TFL_KEY = process.env.REACT_APP_TFL_KEY;
const POLICE_BASE = "https://data.police.uk/api";
const TFL_BASE = "https://api.tfl.gov.uk";

// Nearby crimes (police.uk)
export async function fetchNearbyCrimes(lat, lng, date) {
  const url = `${POLICE_BASE}/crimes-street/all-crime?lat=${lat}&lng=${lng}${date ? `&date=${date}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Crime API: ${res.status}`);
  return res.json();
}

// Nearby stops (TfL)
export async function fetchNearbyStations(lat, lng, radius = 500) {
  const url = `${TFL_BASE}/StopPoint?lat=${lat}&lon=${lng}&stopTypes=NaptanMetroStation,NaptanPublicBusCoachTram&radius=${radius}&app_key=${TFL_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TfL StopPoint: ${res.status}`);
  const data = await res.json();
  return data.stopPoints ?? [];
}

// Live arrivals (TfL)
export async function fetchArrivals(stopId) {
  const url = `${TFL_BASE}/StopPoint/${stopId}/Arrivals?app_key=${TFL_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TfL Arrivals: ${res.status}`);
  const data = await res.json();
  return data.sort((a, b) => a.timeToStation - b.timeToStation);
}
```

---

## 8. Data Limitations & Ethical Considerations

The app's UI copy and documentation should clearly communicate the following limitations to avoid misleading users:

| Issue | Explanation |
|---|---|
| **Crime data ≠ actual danger** | Reporting rates and policing intensity affect the data distribution; high crime counts may reflect high reporting rates, not absolute danger |
| **Data is not real-time** | police.uk data is typically 2–3 months behind and does not reflect current conditions |
| **Some crimes are absent** | Unreported offences such as harassment and intimidation are significantly under-represented |
| **LSOA boundaries ≠ lived experience** | Administrative boundaries do not reflect how residents actually experience or perceive their neighbourhood |
| **Recommended wording** | Use "lower-risk route" not "safe route"; use "data suggests" not "the reality is" |
| **Risk of stigmatisation** | Avoid marking high-crime-density areas in red or with strong visual symbols; use relative gradient colour scales instead |

---

*This document was prepared based on the AfterHours Mobile App Proposal and supporting data inventory.*
