# AfterHours — 数据源与 API 接入文档

**项目名称：** AfterHours — Night-time Safety Navigator  
**文档版本：** v1.0  
**更新日期：** 2026-03-26  
**项目简介：** 面向伦敦夜间出行者的移动端安全导航应用，整合犯罪、交通、社会经济数据，帮助用户做出更明智的出行决策。

---

## 目录

1. [数据源总览](#1-数据源总览)
2. [街道级犯罪数据 — data.police.uk](#2-街道级犯罪数据--datapoliceuк)
3. [TfL 交通数据 — TfL Unified API](#3-tfl-交通数据--tfl-unified-api)
4. [LSOA 边界数据 — ONS Geoportal](#4-lsoa-边界数据--ons-geoportal)
5. [贫困指数数据 — Indices of Deprivation](#5-贫困指数数据--indices-of-deprivation)
6. [MPS 犯罪汇总数据 — London Datastore（辅助）](#6-mps-犯罪汇总数据--london-datastore辅助)
7. [前端集成示例](#7-前端集成示例)
8. [数据局限性与伦理说明](#8-数据局限性与伦理说明)

---

## 1. 数据源总览

| # | 数据名称 | 来源 | 获取方式 | 精度 | 是否需要注册 |
|---|---|---|---|---|---|
| 1 | 街道级犯罪数据 | data.police.uk | REST API | 街道级（经纬度） | 否 |
| 2 | TfL 交通数据 | TfL Open Data | REST API | 站点级 | 是（免费） |
| 3 | LSOA 2021 边界 | ONS Geoportal | 静态下载（GeoJSON） | LSOA 面状 | 否 |
| 4 | 贫困指数（IMD） | London Datastore | 静态下载（CSV） | LSOA 级 | 否 |
| 5 | MPS 犯罪汇总 | London Datastore | 静态下载（CSV） | Borough / Ward / LSOA | 否 |

---

## 2. 街道级犯罪数据 — data.police.uk

### 概述

- **文档地址：** https://data.police.uk/docs/
- **Base URL：** `https://data.police.uk/api`
- **认证：** 无需 API Key，无需注册
- **频率限制：** 每秒 15 次请求，单次爆发最多 30 次
- **数据时效：** 通常滞后 2–3 个月；`date` 不填时返回最新可用月
- **覆盖范围：** 英格兰与威尔士所有警察辖区，伦敦使用 Metropolitan Police Service（MPS）数据

> **注意：** 返回坐标为近似位置，经过匿名化处理，非精确犯罪地点。

---

### 2.1 接口：附近街道级犯罪

在指定经纬度 **1 英里半径内**查询所有犯罪记录，是 AfterHours 最核心的接口。

**Endpoint：**
```
GET https://data.police.uk/api/crimes-street/all-crime
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `lat` | number | 是 | 纬度（WGS84） |
| `lng` | number | 是 | 经度（WGS84） |
| `date` | string | 否 | 格式 `YYYY-MM`，不填返回最新月 |

**示例请求：**
```
GET https://data.police.uk/api/crimes-street/all-crime?lat=51.5246&lng=-0.1340&date=2024-10
```

**示例响应：**
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

**JavaScript 调用：**
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

// 用法
const crimes = await getCrimesNearby(51.5246, -0.1340, "2024-10");
```

---

### 2.2 接口：自定义多边形区域查询

适用于地图上框选区域、或 LSOA 边界内查询。

**Endpoint：**
```
GET https://data.police.uk/api/crimes-street/all-crime?poly={坐标串}&date={YYYY-MM}
```

**`poly` 格式：** `lat,lng:lat,lng:lat,lng`（首尾不必相同，自动闭合）

**示例请求（Camden 核心区域）：**
```
GET https://data.police.uk/api/crimes-street/all-crime?poly=51.540,-0.155:51.540,-0.120:51.510,-0.120:51.510,-0.155&date=2024-10
```

**JavaScript 调用：**
```js
async function getCrimesByPolygon(coords, date) {
  // coords: [[lat, lng], [lat, lng], ...]
  const poly = coords.map(([lat, lng]) => `${lat},${lng}`).join(":");
  const url = `https://data.police.uk/api/crimes-street/all-crime?poly=${poly}&date=${date}`;

  const res = await fetch(url);
  if (res.status === 503) throw new Error("区域内数据超过 10,000 条，请缩小范围");
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

> **限制：** 区域内结果超过 10,000 条时返回 `503`，Camden 全区建议按 Ward 分块查询。

---

### 2.3 接口：按犯罪类型筛选

将 `all-crime` 替换为指定类别，减少返回数据量，提升性能。

**与 AfterHours 相关的犯罪类别：**

| 参数值 | 中文说明 |
|---|---|
| `violent-crime` | 暴力犯罪 |
| `theft-from-the-person` | 人身盗窃（扒窃、抢夺） |
| `robbery` | 抢劫 |
| `anti-social-behaviour` | 反社会行为（骚扰、噪音等） |
| `drugs` | 毒品相关 |
| `public-order` | 公共秩序 |
| `other-theft` | 其他盗窃 |

**示例（仅查暴力犯罪）：**
```
GET https://data.police.uk/api/crimes-street/violent-crime?lat=51.5246&lng=-0.1340&date=2024-10
```

---

### 2.4 React Hook 封装

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

## 3. TfL 交通数据 — TfL Unified API

### 概述

- **API 文档：** https://tfl.gov.uk/info-for/open-data-users/api-documentation
- **Swagger Explorer：** https://api.tfl.gov.uk/swagger/ui/index.html
- **Base URL：** `https://api.tfl.gov.uk`
- **认证：** 需免费注册获取 `app_key`
  - 注册地址：https://api-portal.tfl.gov.uk
  - 注册后在请求中附加 `?app_key=YOUR_KEY`
- **免费配额：** 每天 500 次（注册后）；不带 key 也能请求但频率受限

---

### 3.1 接口：附近站点查询

查询指定坐标附近的交通站点（地铁、公交、国铁等）。

**Endpoint：**
```
GET https://api.tfl.gov.uk/StopPoint?lat={lat}&lon={lng}&stopTypes=NaptanMetroStation,NaptanPublicBusCoachTram&radius=500&app_key={KEY}
```

**常用 stopTypes：**

| 值 | 说明 |
|---|---|
| `NaptanMetroStation` | 地铁站（Underground/Overground/DLR） |
| `NaptanPublicBusCoachTram` | 公交站 |
| `NaptanRailStation` | 国铁站 |

**示例请求：**
```
GET https://api.tfl.gov.uk/StopPoint?lat=51.5246&lon=-0.1340&stopTypes=NaptanMetroStation&radius=500&app_key=YOUR_KEY
```

**JavaScript 调用：**
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
  return data.stopPoints; // 站点数组
}
```

**关键响应字段：**
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

### 3.2 接口：实时到站信息

获取指定站点的实时列车/公交到站时间。

**Endpoint：**
```
GET https://api.tfl.gov.uk/StopPoint/{stopId}/Arrivals?app_key={KEY}
```

**示例请求（Camden Town 站）：**
```
GET https://api.tfl.gov.uk/StopPoint/940GZZLUCAM/Arrivals?app_key=YOUR_KEY
```

**JavaScript 调用：**
```js
async function getArrivals(stopId) {
  const res = await fetch(
    `https://api.tfl.gov.uk/StopPoint/${stopId}/Arrivals?app_key=${TFL_KEY}`
  );
  if (!res.ok) throw new Error(`TfL Arrivals error: ${res.status}`);
  const arrivals = await res.json();
  // 按预计到达时间排序
  return arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
}
```

**关键响应字段：**
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

### 3.3 接口：路径规划

规划两点之间的最优路线，支持步行、地铁、公交等组合。

**Endpoint：**
```
GET https://api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}?app_key={KEY}
```

**`from` / `to` 格式：** `lat,lng` 或 NaptanId

**示例请求：**
```
GET https://api.tfl.gov.uk/Journey/JourneyResults/51.5246,-0.1340/to/51.5074,-0.1278?app_key=YOUR_KEY
```

**JavaScript 调用：**
```js
async function planJourney(fromLat, fromLng, toLat, toLng) {
  const from = `${fromLat},${fromLng}`;
  const to = `${toLat},${toLng}`;
  const url = `https://api.tfl.gov.uk/Journey/JourneyResults/${from}/to/${to}?app_key=${TFL_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Journey API error: ${res.status}`);
  const data = await res.json();
  return data.journeys; // 多条备选路线
}
```

---

### 3.4 接口：线路状态（夜间出行可达性）

查询各条线路当前是否正常运营，适合判断深夜出行可达性。

**Endpoint：**
```
GET https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr/Status?app_key={KEY}
```

**JavaScript 调用：**
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

## 4. LSOA 边界数据 — ONS Geoportal

### 概述

- **下载页面：** https://geoportal.statistics.gov.uk/datasets/lower-layer-super-output-areas-december-2021-boundaries-ew-bfc-v10-2/about
- **格式：** GeoJSON / Shapefile / CSV
- **空间单位：** LSOA（Lower Layer Super Output Area）面状边界
- **覆盖范围：** 英格兰与威尔士，约 33,755 个 LSOA
- **伦敦 LSOA 数量：** 约 4,835 个

### 下载步骤

1. 访问上方链接，点击页面右侧 **Download** 按钮
2. 选择 **GeoJSON** 格式（前端 Mapbox/Leaflet 可直接读取）
3. 如需仅下载伦敦范围，可在页面上使用空间筛选后导出，或下载完整文件后在代码中按 `LSOA21NM` 字段筛选

### 关键字段

| 字段名 | 说明 |
|---|---|
| `LSOA21CD` | LSOA 唯一代码（如 `E01000001`） |
| `LSOA21NM` | LSOA 名称（如 `Camden 001A`） |
| `geometry` | 多边形坐标（GeoJSON Polygon） |

### 前端加载示例（Mapbox GL JS）

```js
// 加载 LSOA 边界并叠加犯罪热力色
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
      ["get", "crime_count"], // 需提前将犯罪数注入 properties
      0, "#E1F5EE",
      50, "#F5C4B3",
      200, "#D85A30",
    ],
    "fill-opacity": 0.6,
  },
});
```

---

## 5. 贫困指数数据 — Indices of Deprivation

### 概述

- **下载页面：** https://data.london.gov.uk/dataset/indices-of-deprivation-2l15g
- **格式：** CSV / Excel
- **空间单位：** LSOA 级别
- **数据年份：** 2019（最新版，英格兰全国）
- **用途：** 作为结构性不平等的背景解释层，辅助解读犯罪数据，避免单一归因

### 下载步骤

1. 访问上方链接，点击页面 **Download** 选择 CSV 版本
2. 文件名通常为 `ID 2019 for London.xlsx` 或类似

### 推荐使用字段

| 字段名 | 说明 |
|---|---|
| `LSOA code (2011)` | LSOA 代码（用于与边界数据 Join） |
| `Index of Multiple Deprivation (IMD) Score` | 综合贫困指数得分 |
| `Index of Multiple Deprivation (IMD) Rank` | 全国排名（1 = 最贫困） |
| `Income Score` | 收入维度分 |
| `Employment Score` | 就业维度分 |
| `Total population: mid 2015 (excluding prisoners)` | 人口数（用于归一化） |

### 数据处理示例（Python）

```python
import pandas as pd
import geopandas as gpd

# 读取 IMD 数据
imd = pd.read_csv("imd_2019_london.csv")
imd = imd[["LSOA code (2011)", "IMD Score", "IMD Rank"]].rename(
    columns={"LSOA code (2011)": "LSOA21CD"}
)

# 读取 LSOA 边界
lsoa = gpd.read_file("lsoa_london.geojson")

# 空间连接
merged = lsoa.merge(imd, on="LSOA21CD", how="left")
merged.to_file("lsoa_with_imd.geojson", driver="GeoJSON")
```

---

## 6. MPS 犯罪汇总数据 — London Datastore（辅助）

### 概述

- **下载页面：** https://data.london.gov.uk/dataset/mps-recorded-crime-geographic-breakdown-exy3m
- **格式：** CSV
- **精度：** Borough / Ward / LSOA（无街道级坐标）
- **时间跨度：** 2008 年至今，按月更新
- **用途：** 用于离线分析、历史趋势对比，不适合前端实时调用

### 适用场景

- 生成 LSOA 级别的月度犯罪总量，注入 LSOA GeoJSON 的 `properties` 中用于 choropleth 地图渲染
- 分析犯罪类型构成，辅助 app 内的说明文字

### 关键字段（LSOA 版本）

| 字段名 | 说明 |
|---|---|
| `LookUp_BoroughName` | 行政区名称 |
| `LSOA Code` | LSOA 代码 |
| `LSOA Name` | LSOA 名称 |
| `Major Category` | 犯罪大类 |
| `Minor Category` | 犯罪小类 |
| `{YYYY-MM}` | 该月该 LSOA 的案件数量（宽表格式） |

---

## 7. 前端集成示例

### 7.1 数据流架构

```
用户位置 (lat/lng)
    │
    ├─── data.police.uk API ──► 街道级犯罪 JSON ──► 地图热力标记
    │
    ├─── TfL Arrivals API ────► 实时到站数据   ──► 附近站点卡片
    │
    └─── 本地 GeoJSON / CSV
             ├── LSOA 边界   ──► Choropleth 底图
             └── IMD 数据    ──► 区域背景解释
```

### 7.2 环境变量配置

在项目根目录创建 `.env` 文件：

```env
REACT_APP_TFL_KEY=你的TfL_app_key
```

> data.police.uk 无需 key，无需在环境变量中配置。

### 7.3 统一数据获取层示例

```js
// services/dataService.js

const TFL_KEY = process.env.REACT_APP_TFL_KEY;
const POLICE_BASE = "https://data.police.uk/api";
const TFL_BASE = "https://api.tfl.gov.uk";

// 附近犯罪（police.uk）
export async function fetchNearbyCrimes(lat, lng, date) {
  const url = `${POLICE_BASE}/crimes-street/all-crime?lat=${lat}&lng=${lng}${date ? `&date=${date}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Crime API: ${res.status}`);
  return res.json();
}

// 附近站点（TfL）
export async function fetchNearbyStations(lat, lng, radius = 500) {
  const url = `${TFL_BASE}/StopPoint?lat=${lat}&lon=${lng}&stopTypes=NaptanMetroStation,NaptanPublicBusCoachTram&radius=${radius}&app_key=${TFL_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TfL StopPoint: ${res.status}`);
  const data = await res.json();
  return data.stopPoints ?? [];
}

// 实时到站（TfL）
export async function fetchArrivals(stopId) {
  const url = `${TFL_BASE}/StopPoint/${stopId}/Arrivals?app_key=${TFL_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TfL Arrivals: ${res.status}`);
  const data = await res.json();
  return data.sort((a, b) => a.timeToStation - b.timeToStation);
}
```

---

## 8. 数据局限性与伦理说明

在 app 的界面文案和文档中，需明确以下限制，避免误导用户：

| 问题 | 说明 |
|---|---|
| **犯罪数据≠实际危险** | 报案率、警力部署强度影响数据分布，高犯罪数量可能反映高报案率，而非绝对更危险 |
| **数据存在滞后** | police.uk 数据通常滞后 2–3 个月，不反映当下实时情况 |
| **部分犯罪不在统计内** | 骚扰、恐吓等未被报案的犯罪类型严重缺失 |
| **LSOA 边界≠生活感知** | 行政分区不代表居民的实际生活区域和安全感知 |
| **界面用语建议** | 使用"较低风险路线"而非"安全路线"；使用"数据显示"而非"实际情况是" |
| **区域污名化风险** | 避免将高犯罪密度区域标红或以强烈视觉符号呈现，建议使用相对渐变色阶 |

---

*本文档基于项目提案 AfterHours Mobile App Proposal 及数据整理表整理生成。*
