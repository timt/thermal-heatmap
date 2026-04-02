# UK Thermal Heatmap Web Application — Technical Specification

> **Note:** This spec is a research document capturing API findings, data formats, and algorithm design. Architectural suggestions (Redis caching, WebSocket/SSE, configurable heatmap radius, etc.) have been superseded by decisions in **PLAN.md** section 2. When the two conflict, PLAN.md takes precedence. The API reference (sections 2–3), data abstraction layer (section 4), thermal detection algorithm (section 5), and test data (section 12.3) remain authoritative.

## 1. Overview

A web application that visualises thermal activity across the UK (and potentially other regions) by analysing real glider flight data from **two selectable sources**: **WeGlide** and the **BGA Ladder**. Users select a data source and a date (or date range), and the app fetches flight tracks, runs thermal detection (climb rate + circling analysis), and renders an interactive heatmap overlaid on a map.

This spec is derived from a working prototype that successfully processed 28 UK flights on 26 March 2026, detecting 1,001 thermals with an average climb rate of 1.6 m/s and tops up to 1,848 m.

### 1.1 Data Sources

| Source | Coverage | Best For | Auth | Track Data |
|---|---|---|---|---|
| **WeGlide** | Global (all countries) | International flights, non-UK regions | Browser-like headers required (CloudFront) | High-res JSON tracks (~1s interval) or IGC via BunnyCDN |
| **BGA Ladder** | UK only (BGA member clubs) | Comprehensive UK coverage, simpler API | None required | IGC files (full altitude + time data) |

The user selects which data source to use via a toggle/dropdown in the UI. Both sources feed into the same thermal detection algorithm and heatmap rendering pipeline through a common data abstraction layer.

---

## 2. WeGlide API Reference

All findings below are confirmed through live testing against the production API (April 2026). The WeGlide API is undocumented beyond a Swagger UI at `https://api.weglide.org/docs` which is not publicly accessible without browser-based auth.

### 2.1 Base URL

```
https://api.weglide.org
```

### 2.2 Authentication & Headers

The API is protected by CloudFront (AWS). Requests without browser-like headers receive `403 Forbidden`. Required headers:

```
Accept: application/json
Referer: https://www.weglide.org/
Origin: https://www.weglide.org
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
```

**Important**: Plain `curl` or server-side requests without these headers will be blocked with HTTP 403. The app's backend must include these headers on all API requests.

There is no API key or OAuth token required for read-only access to public flight data. The user's browser session (cookie) is used for authenticated endpoints like `/v1/user/me` but is not required for flight listing.

### 2.3 Flight List Endpoint

```
GET /v1/flight
```

**Working query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `scoring_date_start` | `YYYY-MM-DD` | Yes (for date filtering) | Start of date range (inclusive) |
| `scoring_date_end` | `YYYY-MM-DD` | Yes (for date filtering) | End of date range (inclusive) |
| `skip` | integer | No (default 0) | Pagination offset |
| `limit` | integer | No (default 100) | Page size. **Max is 100** — requests with `limit > 100` return HTTP 422. |
| `include_story` | boolean | No | Include story data. Set to `false` to reduce payload. |
| `include_stats` | boolean | No | Include stats data. Set to `false` to reduce payload. |
| `order_by` | string | No | Sort field, e.g. `-stars` for descending stars |
| `contest` | string | No | Contest type filter, e.g. `free` |

**Parameters that DO NOT work** (confirmed via testing — the API silently ignores them and returns the latest flights instead):
- `scoring_date` — this is a field on the response object, not a query filter
- `date`, `date_from`, `date_to`, `day`, `filter_date`

**Example request:**
```
GET /v1/flight?scoring_date_start=2026-03-26&scoring_date_end=2026-03-26&skip=0&limit=100&include_story=false&include_stats=false
```

**Response:** JSON array of flight objects.

```json
[
  {
    "id": 1022131,
    "user": {
      "id": 9659,
      "name": "Patrick Naegeli",
      "image": "9659/profile/BZZqTnRbQEhP8G989Z3gK6Ng.jpg",
      "badge": false
    },
    "co_user_name": null,
    "takeoff_airport": {
      "id": 154727,
      "name": "Lasham",
      "region": "GB"
    },
    "aircraft": {
      "id": 336,
      "name": "ASG 32 Mi"
    },
    "club": {
      "id": 684,
      "name": "Lasham Gliding Society"
    },
    "takeoff_time": "2026-03-26T09:30:00+00:00",
    "landing_time": "2026-03-26T17:15:00+00:00",
    "scoring_date": "2026-03-26",
    "bbox": [-2.5, 50.8, 0.1, 52.5],
    "junior": false,
    "dmst_index": 120,
    "rank": true,
    "stars": 0,
    "contest": {
      "points": 474.89,
      "distance": 524.79,
      "speed": 98.16
    }
  }
]
```

**Key fields for filtering:**
- `takeoff_airport.region` — ISO region code. UK flights have region starting with `"GB"`.
- `bbox` — Bounding box as `[lon_min, lat_min, lon_max, lat_max]`. Can be used for geographic filtering.

**Pagination:** Use `skip` and `limit`. When the returned array has fewer items than `limit`, you've reached the last page.

### 2.4 Flight Activity Endpoint (Calendar)

```
GET /v1/flight/activity?season=2026&new_format=true
```

Returns an array of `[date_string, flight_count]` pairs for the entire season. Useful for building a date picker that shows which days had flights.

```json
[
  ["2025-10-01", 209],
  ["2025-10-02", 180],
  ["2026-03-26", 101]
]
```

### 2.5 Individual Flight Detail

**The endpoint `GET /v1/flight/{id}` returns HTTP 404.** This is confirmed — the single-flight REST endpoint does not work for fetching flight details or track data.

Instead, the WeGlide web app uses an internal data-fetching mechanism (via a Pinia store action `flightData.requestEntity(flightId)`) that loads track data into the client-side state. The exact server endpoint this calls could not be captured via network monitoring (it fires before tracking can start), suggesting it may use a WebSocket, SSE, or a very fast HTTP request during SPA navigation.

### 2.6 Flight Track Data Format

When loaded via the web app, each flight's track data has this structure:

```json
{
  "id": 1022131,
  "time": [1774523765, 1774523766.96, ...],
  "alt": [226, 226.14, ...],
  "ground_alt": [184, 184, ...],
  "geom": {
    "type": "LineString",
    "coordinates": [
      [-1.02915, 51.18767, 226, 1774523765],
      [-1.03223, 51.18750, 234.5, 1774523773.9],
      ...
    ]
  },
  "engine_sensor": [999, 999, ...]
}
```

**Coordinate format:** `[longitude, latitude, altitude_metres, unix_timestamp]`

Track data is high-resolution — a typical cross-country flight has 10,000–22,000 points (~1 second interval, interpolated).

### 2.7 IGC File Downloads

IGC files (the standard flight recorder format) are stored on a BunnyCDN:

```
https://weglidefiles.b-cdn.net/{igc_file.file}
```

The `igc_file` object is available on the flight detail response (not on the list response):

```json
{
  "igc_file": {
    "id": 1009757,
    "file": "30035/igcfiles/aa3OueAh24MnJtcSG0LeweGZ.igc",
    "valid": 4,
    "errors": []
  }
}
```

**The CDN does not require authentication or special headers** — direct GET requests work.

### 2.8 Recommended Data Fetching Strategy

Since the single-flight detail endpoint (`/v1/flight/{id}`) returns 404, the recommended approach for the backend is:

**Option A (Preferred): Server-side IGC parsing**
1. Fetch flight list via `/v1/flight?scoring_date_start=...&scoring_date_end=...`
2. For each flight, get the `igc_file.file` path (requires flight detail — see Option B for workaround)
3. Download IGC files from `weglidefiles.b-cdn.net`
4. Parse IGC B-records server-side

**Option B: Headless browser / API proxy**
1. Use a headless browser (Playwright/Puppeteer) to load the WeGlide SPA
2. Navigate to each flight page
3. Extract `flightData` from the Pinia store via `page.evaluate()`
4. Cache the results

**Option C: Direct geom endpoint discovery**
The WeGlide app loads flight geom data through an endpoint that wasn't captured in our testing. Future investigation should:
- Use Playwright with request interception enabled from the start
- Monitor for requests to `api.weglide.org` or `d1q10zuk03jmo1.cloudfront.net`
- The CloudFront domain `d1q10zuk03jmo1.cloudfront.net` serves a `/api/summary` endpoint and may also serve flight data

**Option D: In-browser fetching via WeGlide's own Pinia store**
If the app is loaded within an iframe or browser context on the WeGlide domain:
```javascript
const pinia = document.getElementById('WeGlide').__vue_app__.config.globalProperties.$pinia;
const dataStore = pinia._s.get('flightData');
dataStore.clearList();
await dataStore.requestEntity(flightId);
const flight = dataStore.list[0];
// flight.geom.coordinates = [[lon, lat, alt, time], ...]
```

### 2.9 Rate Limiting

No explicit rate limit headers were observed, but the API is behind CloudFront. Recommended:
- Add 200–500ms delay between individual flight requests
- Process flights in batches of 5 concurrent requests
- Use `include_story=false&include_stats=false` to minimise payload size

---

## 3. BGA Ladder API Reference

All findings below are confirmed through live testing against the production API (April 2026). The BGA Ladder is the British Gliding Association's official flight scoring system used by UK clubs.

### 3.1 Base URL

```
https://api.bgaladder.net
```

### 3.2 Authentication & Headers

**No special headers required.** The API accepts plain requests without browser-like headers, CORS restrictions, or authentication tokens. This makes it significantly simpler to integrate than the WeGlide API.

### 3.3 Date Format

All date parameters use the format `DD-MMM-YYYY`, e.g. `26-Mar-2026`. This is different from WeGlide's `YYYY-MM-DD` format.

### 3.4 Flight IDs Endpoint

```
GET /API/FLIGHTIDS/{date}
```

Returns a flat JSON array of integer flight IDs for the given date.

**Example request:**
```
GET /API/FLIGHTIDS/26-Mar-2026
```

**Response:**
```json
[128982, 128983, 128984, 128985, 128986, ..., 129090]
```

On 26 March 2026, this returned **76 flight IDs** — more UK flights than the 28 found via WeGlide for the same day, since the BGA Ladder captures flights from pilots who don't use WeGlide.

### 3.5 Flight Detail Endpoint

```
GET /API/FLIGHT/{id}
```

Returns comprehensive flight metadata. **Unlike WeGlide, this endpoint works reliably.**

**Example request:**
```
GET /API/FLIGHT/128982
```

**Response structure:**

```json
{
  "FlightID": 128982,
  "Season": "2026",
  "FlightDate": "2026-03-26T00:00:00",
  "Pilot": {
    "PilotID": 2371,
    "Fullname": "Paul Fritche",
    "Forename": "Paul",
    "Surname": "Fritche",
    "ClubID": "LAS",
    "Active": true
  },
  "Club": {
    "ClubID": "LAS",
    "Name": "Lasham",
    "University": false,
    "Service": false
  },
  "Launchpoint": {
    "LPCode": 48,
    "Site": "Lasham",
    "ClubName": "Lasham Gliding Society",
    "Altitude": 618,
    "Latitude": 51.189,
    "Longitude": -1.031,
    "ClubSite": "Lasham Gliding Society (Lasham)"
  },
  "Glider": {
    "GliderID": 137,
    "GliderType": "LS8",
    "Registration": "G-LLLL",
    "Handicap": 100,
    "Seats": 1,
    "Vintage": false,
    "Turbo": false
  },
  "LoggerFile": "63QV8LR1.igc",
  "LoggerFileAvailable": true,
  "Task": {
    "TaskTPs": ["LAS", "HVS", "TED", "BR1", "", "LAS"],
    "TP_OK": [true, true, true, true, false, true],
    "TaskDescription": "..."
  },
  "ScoringDistance": 303.67,
  "ActualSpeed": 94.15,
  "HandicapSpeed": 94.15,
  "TaskTime": "03h 13m 32s",
  "TaskAchievement": "Declared/Completed",
  "HeightGain": 0,
  "MaxHeight": 0,
  "Points": 2339,
  "DistancePoints": 1475,
  "SpeedPoints": 651,
  "HeightPoints": 0,
  "BonusPoints": 213,
  "TotalPoints": 2339
}
```

**Key fields for the thermal heatmap:**
- `Launchpoint.Latitude`, `Launchpoint.Longitude` — launch site position (useful for map markers and filtering)
- `Launchpoint.Altitude` — launch site altitude in feet
- `Pilot.Fullname` — for the flight list panel
- `Club.Name` — for filtering/display
- `Glider.GliderType` — for display
- `ScoringDistance` — task distance in km
- `LoggerFileAvailable` — **check this before attempting IGC download**

**All top-level fields** (for reference): FlightID, Season, FlightDate, Pilot, Club, Launchpoint, Glider, LoggerFile, LoggerFileAvailable, LoggerURL, LoggerDeclaration, MapPath, BaroPath, CompetitionFlight, ExpedFlight, NoScoreFlight, ClaimType, ClubTask, PilotComment, Task, Landout, GPSLandout, LandoutPosition, LandingPoint, Abandoned, AbandonedPosition, AbandonedPoint, TaskTime, Handicap, HeightLoss, HeightLossPenalty, ScoringDistance, ActualSpeed, HandicapDistance, HandicapDistance2, HandicapSpeed, HandicapSpeed2, TaskAchievement, ScoringDistance2, TaskTime2, ActualSpeed2, HeightGain, MaxHeight, Points, DistancePoints, SpeedPoints, HeightPoints, BonusPoints, TotalPoints, Penalty, PenaltyOverrideDate, PenaltyDetails, ViewCount, SubmittedDate, CommentCount, Comments, WeekendLadder, JuniorLadder, TwoSeatLadder, LocalLadder1–5, PhotoCount, SecondPilot, StartRadius, FinishRadius, FinishRing, Likes, VStatus, VReason.

### 3.6 Flight Path Endpoint

```
GET /API/FLIGHTPATH/{id}
```

Returns a GeoJSON LineString with simplified track coordinates.

**Response:**
```json
{
  "type": "LineString",
  "coordinates": [
    [-1.028983, 51.18875],
    [-1.029050, 51.18880],
    ...
  ]
}
```

**Coordinate format:** `[longitude, latitude]` — **no altitude or time data**.

This endpoint returns a simplified track (~671 points for a typical cross-country) and is useful for drawing flight paths on the map but is **NOT suitable for thermal detection** (which requires altitude and time data). For thermal detection, use the IGC file endpoint instead.

### 3.7 IGC File Endpoint

```
GET /API/FLIGHTIGC/{id}
```

Returns the raw IGC file content as `application/octet-stream`. **No authentication required.**

**Example:**
```
GET /API/FLIGHTIGC/128982
```

Returns a full IGC file (~1.4 MB for a cross-country flight) with standard headers and B-records containing time, position, pressure altitude, and GPS altitude. This is the **primary data source for thermal detection** when using the BGA Ladder.

**Important:** Check `LoggerFileAvailable` from the FLIGHT endpoint before requesting the IGC file — some flights may not have logger data available.

### 3.8 Recommended BGA Ladder Data Fetching Strategy

```
1. GET /API/FLIGHTIDS/{date}          → Array of flight IDs
2. For each ID (concurrently, max 10):
   a. GET /API/FLIGHT/{id}            → Flight metadata (pilot, club, glider, launchpoint)
   b. If LoggerFileAvailable:
      GET /API/FLIGHTIGC/{id}         → Raw IGC file for thermal detection
3. Parse IGC B-records for thermal detection
4. Optionally: GET /API/FLIGHTPATH/{id} → Simplified track for map display
```

Since the BGA Ladder API has no CloudFront protection and no observed rate limiting, concurrent requests can be more aggressive than with WeGlide — batch sizes of 10 flights simultaneously should be safe.

### 3.9 Rate Limiting

No rate limiting headers observed. However, be respectful:
- Batch concurrent requests (max 10 simultaneous)
- Consider adding a small delay (100ms) between batches
- Cache results aggressively — BGA Ladder flight data is immutable once submitted

### 3.10 Limitations

- **UK only**: The BGA Ladder only covers flights from BGA member clubs in the UK. For international coverage, use WeGlide.
- **No activity calendar**: There is no equivalent to WeGlide's `/v1/flight/activity` endpoint. To populate a date picker, you would need to check dates individually or scrape the BGA Ladder website's calendar.
- **FLIGHTPATH lacks altitude/time**: The simplified path endpoint cannot be used for thermal detection — always use the IGC file.
- **Launchpoint altitude in feet**: The `Launchpoint.Altitude` field appears to be in feet (618 ft for Lasham ≈ 188 m), not metres. Confirm and convert as needed.

---

## 4. Data Source Abstraction Layer

Both WeGlide and the BGA Ladder ultimately feed into the same thermal detection and rendering pipeline. The backend should implement a **source abstraction** that normalises data from either source into a common format.

### 4.1 Common Flight Interface

```typescript
interface NormalisedFlight {
  id: string;                  // Source-prefixed: "weglide:1022131" or "bga:128982"
  source: "weglide" | "bga";
  date: string;                // ISO format: "2026-03-26"
  pilot: string;               // Full name
  club: string;                // Club name
  aircraft: string;            // Glider type
  registration: string | null; // Aircraft registration (BGA has this, WeGlide may not)
  launchSite: string;          // Airport/site name
  launchLat: number;           // Decimal degrees
  launchLon: number;           // Decimal degrees
  distance: number;            // Scoring distance in km
  speed: number | null;        // Handicap speed in km/h
  points: number | null;       // Scoring points
  sourceUrl: string;           // Link back to original: weglide.org/flight/... or bgaladder.net/...
  hasTrackData: boolean;       // Whether IGC/track data is available
}
```

### 4.2 Common Track Point Interface

```typescript
interface TrackPoint {
  lat: number;    // Decimal degrees
  lon: number;    // Decimal degrees
  alt: number;    // Altitude in metres (GPS altitude preferred)
  time: number;   // Unix timestamp in seconds
}
```

Both sources must produce `TrackPoint[]` arrays:
- **WeGlide**: Parse from JSON track data (`geom.coordinates` → `[lon, lat, alt, timestamp]`) or from IGC file via BunnyCDN
- **BGA Ladder**: Parse from IGC file via `/API/FLIGHTIGC/{id}`

### 4.3 Source Provider Interface

```typescript
interface FlightSourceProvider {
  name: string;
  getFlightIds(date: string): Promise<string[]>;
  getFlightDetail(id: string): Promise<NormalisedFlight>;
  getTrackPoints(id: string): Promise<TrackPoint[]>;
  getActivityCalendar?(season: string): Promise<Map<string, number>>; // Optional
}
```

Implement `WeGlideProvider` and `BGALadderProvider` classes that conform to this interface. The thermal detection pipeline then works identically regardless of source.

---

## 5. Thermal Detection Algorithm

### 5.1 Overview

Thermals are detected by finding segments of a flight track where the glider is both **climbing** (sustained positive vertical speed) and **circling** (accumulated heading change indicating thermalling rather than ridge lift or straight-line climbs).

### 5.2 Input

An array of track points: `[{lat, lon, alt, time}, ...]` where:
- `lat`, `lon`: decimal degrees (WGS84)
- `alt`: altitude in metres (GPS altitude preferred over pressure altitude)
- `time`: Unix timestamp in seconds (can be fractional)

### 5.3 Parameters

| Parameter | Default | Description |
|---|---|---|
| `minClimbRate` | 0.5 m/s | Minimum average climb rate to consider as thermal entry |
| `windowSize` | 8 points | Sliding window for initial climb/circling detection |
| `minHeadingChange` | 180° | Minimum accumulated heading change within window to confirm circling |
| `extensionClimbFactor` | 0.3 | Once a thermal is found, extend it while climb rate stays above `minClimbRate * factor` |
| `minAltGain` | 30 m | Minimum altitude gain for a thermal to be recorded |
| `sampleRate` | 4 | Sample every Nth point from the raw track (for performance). Adjust based on track resolution. |

### 5.4 Algorithm Steps

```
1. PRE-PROCESS
   - Sample every Nth point from the raw track
   - Ensure points are sorted by time

2. SLIDING WINDOW SCAN (i = 0 to len(track) - windowSize)
   a. CLIMB CHECK
      - Calculate average climb rate over the window:
        climbRate = (track[i + window].alt - track[i].alt) / (track[i + window].time - track[i].time)
      - If climbRate < minClimbRate, advance i by 1 and continue

   b. CIRCLING CHECK
      - For each consecutive pair of points in the window, calculate bearing
      - Accumulate absolute heading changes between consecutive bearings
      - If totalHeadingChange < minHeadingChange, advance i by 1 and continue

   c. THERMAL EXTENSION
      - Starting from i + windowSize, extend the thermal forward:
        While (localClimbRate >= minClimbRate * extensionClimbFactor):
          extend end pointer by 1
      - Stop when climb drops off

   d. THERMAL RECORDING
      - thermalPoints = track[i : end+1]
      - centroidLat = mean(thermalPoints.lat)
      - centroidLon = mean(thermalPoints.lon)
      - altGain = last.alt - first.alt
      - avgClimb = altGain / (last.time - first.time)
      - If altGain > minAltGain AND centroid is within bounds:
          Record thermal: {lat, lon, avgClimb, altGain, baseAlt, topAlt}

   e. Advance i to end + 1 (skip past this thermal)

3. OUTPUT
   - Array of thermal objects with centroid location and strength metrics
```

### 5.5 Bearing Calculation

```
bearing(lat1, lon1, lat2, lon2):
  dLon = radians(lon2 - lon1)
  y = sin(dLon) * cos(radians(lat2))
  x = cos(radians(lat1)) * sin(radians(lat2)) -
      sin(radians(lat1)) * cos(radians(lat2)) * cos(dLon)
  return degrees(atan2(y, x))
```

### 5.6 Angle Difference (normalised to -180..+180)

```
angleDiff(a, b):
  d = b - a
  while d > 180: d -= 360
  while d < -180: d += 360
  return d
```

### 5.7 IGC File Parsing

If using IGC files as the data source rather than the WeGlide JSON track format, parse B-records:

```
B record format: BHHMMSSLLLLLLLNLLLLLLLLEVPPPPPGGGGG
                  ^time  ^lat    ^lon      ^press ^gps alt

Position:  B HHMMSS DDMM.MMMN DDDMM.MMME V PPPPP GGGGG
Bytes:     1 6      8         9           1 5     5
```

- Time: `HH:MM:SS` UTC
- Latitude: `DDMMmmmN/S` where `mmm` = milliminutes (divide by 1000, then by 60 to get decimal degrees)
- Longitude: `DDDMMmmmE/W`
- Validity: `A` = 3D fix, `V` = 2D/no fix
- Pressure altitude and GPS altitude in metres

### 5.8 Thermal Clustering (Optional Enhancement)

Multiple flights often thermal in the same location. To aggregate overlapping thermals:

1. Spatially cluster thermals within a radius (e.g., 500m)
2. For each cluster, compute: mean position, max climb rate, mean climb rate, total observations, altitude range
3. This produces "thermal hotspots" which are more statistically meaningful than individual thermals

---

## 6. Feature Specification

### 6.1 Core Features (MVP)

**F1: Data Source Selection**
- Toggle or dropdown to choose between "WeGlide" and "BGA Ladder"
- Default to BGA Ladder when region is UK (better coverage)
- Default to WeGlide for non-UK regions (BGA Ladder is UK-only)
- Persist user's preference in local storage
- Display source-specific metadata (e.g., BGA Ladder shows club & points; WeGlide shows stars & contest distance)

**F2: Date Selection**
- Date picker with calendar view
- Highlight days with available flights (use WeGlide's `/v1/flight/activity` endpoint when WeGlide is selected; for BGA Ladder, probe recent dates or rely on manual entry)
- Default to the most recent day with >10 flights

**F3: Flight Fetching**
- Fetch all flights for the selected date from the chosen data source
- Display total flight count and UK flight count
- Show progress indicator during data loading

**F4: Region Filtering**
- WeGlide: Filter flights by `takeoff_airport.region`
- BGA Ladder: All flights are UK by definition — region filter is implicit
- Default to `GB` (UK)
- Support other regions: `DE` (Germany), `FR` (France), `AT` (Austria), `AU-*` (Australia), etc.
- Allow "All regions" mode for global view

**F5: Thermal Detection**
- Run climb + circling algorithm on all filtered flights
- Configurable minimum climb rate (slider: 0.0 – 3.0 m/s)
- Show detection progress (flight X of Y)

**F6: Interactive Heatmap**
- Leaflet.js map with leaflet-heat plugin
- Dark basemap (CartoDB dark_all)
- Heatmap gradient: blue (weak) → green → yellow → orange → red (strong)
- Intensity based on climb rate (normalised to strongest thermal)
- Configurable heatmap radius (tight / normal / wide)

**F7: Thermal Markers**
- Clickable circle markers for thermals above a threshold (e.g., >1.5 m/s)
- Popup with: climb rate, altitude gain, base/top altitude, coordinates
- Colour-coded by strength

**F8: Statistics Panel**
- Flights analysed count
- Thermals detected count
- Average / best climb rate
- Maximum altitude gain
- Highest thermal top

### 6.2 Extended Features

**F9: Date Range Mode**
- Select a date range (e.g., "last 7 days" or custom range)
- Aggregate thermals from multiple days
- Apply thermal clustering (section 5.8) to find persistent hotspots
- Show observation count per hotspot

**F10: Airport Filter**
- Filter by specific takeoff airport (dropdown populated from flight data)
- Multi-select supported

**F11: Flight List Panel**
- Sidebar with list of flights used in the analysis
- Pilot name, distance, aircraft, airport
- Click to highlight that flight's thermals on the map
- Link to source flight page (WeGlide or BGA Ladder)

**F12: Time-of-Day Animation**
- Slider to filter thermals by time window
- Animate thermal development throughout the day
- Shows how thermals progress geographically and strengthen/weaken

**F13: Thermal Altitude Profile**
- Side panel showing altitude distribution of thermals
- Histogram of thermal base heights and top heights
- Helps pilots understand the convective boundary layer height for the day

**F14: Comparison Mode**
- Compare two dates side-by-side
- Useful for analysing similar weather patterns

**F15: Shareable URLs**
- Encode all filters (source, date, region, min climb, map position) in the URL
- Users can share specific views with others

**F16: Export**
- Download thermal data as CSV or GeoJSON
- Export the heatmap as a static PNG image
- Generate a standalone HTML file (like our prototype) for offline use

---

## 7. Data Flow Architecture

```
                                      ┌──────────────┐
                                 ┌───▶│  WeGlide API │
                                 │    │ (needs hdrs) │
┌──────────┐     ┌───────────┐  │    └──────────────┘     ┌──────────┐
│  Client   │────▶│  Backend  │──┤                          │ BunnyCDN │
│ (Browser) │◀────│  (API)    │  │    ┌──────────────┐     │ (IGC)    │
└──────────┘     └───────────┘  └───▶│ BGA Ladder   │     └──────────┘
                       │              │   API        │           ▲
                       │              └──────────────┘           │
                       │              ┌──────────┐               │
                       └─────────────▶│  Cache   │───────────────┘
                                      │ (Redis)  │
                                      └──────────┘
```

### 7.1 Backend Responsibilities

1. **Source Router**: Route requests to the appropriate data source provider (WeGlide or BGA Ladder) based on user selection
2. **API Proxy**: Relay requests to WeGlide API with required browser headers (solves CORS). BGA Ladder requests need no special handling.
3. **Flight Data Fetching**: Fetch and paginate through flight lists (WeGlide uses skip/limit; BGA Ladder returns all IDs at once)
4. **Track Data Loading**: Fetch flight track data — WeGlide via JSON tracks or IGC from BunnyCDN; BGA Ladder via `/API/FLIGHTIGC/{id}`
5. **Data Normalisation**: Convert source-specific responses into the common `NormalisedFlight` and `TrackPoint` formats (section 4)
6. **Thermal Detection**: Run the algorithm server-side (compute-intensive, don't do in browser)
7. **Caching**: Cache flight lists and thermal results per source+date+region (flights don't change after upload)
8. **Rate Limiting**: Throttle requests to WeGlide (200–500ms between requests); BGA Ladder can be more aggressive (100ms between batches)

### 7.2 Caching Strategy

Flight data for past dates is immutable (flights aren't re-scored retroactively in practice). Aggressive caching is safe:

| Data | Cache TTL | Key |
|---|---|---|
| Flight list for a date | 24 hours (or permanent for dates >7 days ago) | `flights:{source}:{date}` |
| Track data for a flight | Permanent | `track:{source}:{flight_id}` |
| Thermal results | Permanent (bust on algorithm version change) | `thermals:{source}:{date}:{region}:{algo_version}:{min_climb}` |
| Flight activity calendar | 1 hour | `activity:{season}` (WeGlide only) |

For today's date, use shorter TTLs (flights are still being uploaded). Cache keys are prefixed with the source to keep WeGlide and BGA Ladder data separate.

### 7.3 API Endpoints (Backend)

```
GET /api/activity?season=2026
  → Returns flight count per day (WeGlide only; BGA Ladder has no equivalent)

GET /api/thermals?source=bga&date=2026-03-26&region=GB&min_climb=0.5
  → Returns thermal array for the given date, source, and region
  → If cached, return immediately; otherwise trigger processing pipeline

GET /api/thermals?source=weglide&date_start=2026-03-20&date_end=2026-03-26&region=GB&min_climb=0.5&cluster=true
  → Returns clustered thermal hotspots for a date range

GET /api/flights?source=bga&date=2026-03-26&region=GB
  → Returns normalised flight metadata list (id, pilot, club, glider, distance, etc.)

GET /api/flight/{source}/{id}/track
  → Returns the processed track data for a single flight

GET /api/status/{job_id}
  → Returns processing status for async thermal detection jobs
```

The `source` parameter accepts `weglide` or `bga`. All responses use the normalised format from section 4.

### 7.4 Processing Pipeline

For a new source+date+region request:

```
1. Check cache → if hit, return immediately
2. Route to the appropriate source provider:

   WeGlide:
     a. Fetch flight list from /v1/flight (paginate with skip/limit=100)
     b. Filter by takeoff_airport.region
     c. For each flight (concurrently, max 5):
        - Download IGC from BunnyCDN and parse
        - Run thermal detection algorithm

   BGA Ladder:
     a. Fetch flight IDs from /API/FLIGHTIDS/{date}
     b. For each ID (concurrently, max 10):
        - Fetch flight detail from /API/FLIGHT/{id}
        - If LoggerFileAvailable, download IGC from /API/FLIGHTIGC/{id}
        - Parse IGC and run thermal detection algorithm

3. Normalise all results into common format
4. Aggregate all thermals
5. Cache result
6. Return to client
```

### 7.5 WebSocket / SSE for Progress

Since processing 20-50 flights can take 30-60 seconds:
- Use WebSocket or Server-Sent Events to stream progress updates
- Client shows: "Processing flight 12 of 28... (342 thermals found)"

---

## 8. Geographic Bounds

### 8.1 UK Bounding Box

```
lat_min: 49.5, lat_max: 61.0
lon_min: -8.5, lon_max: 2.0
```

### 8.2 Region Codes

Filter `takeoff_airport.region` by ISO 3166-2 prefix:

| Region | Code prefix | Notes |
|---|---|---|
| United Kingdom | `GB` | Includes England, Scotland, Wales, Northern Ireland |
| Germany | `DE` | Largest gliding community on WeGlide |
| France | `FR` | |
| Austria | `AT` | |
| Australia | `AU` | Region codes are `AU-NSW`, `AU-VIC`, etc. |
| South Africa | `ZA` | |
| USA | `US` | |

---

## 9. Frontend Map Specification

### 9.1 Map Library

Use **Leaflet.js** with the **leaflet-heat** plugin for the heatmap layer.

### 9.2 Tile Layers

| Layer | URL | Use |
|---|---|---|
| Dark (default) | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` | Best contrast for heat overlay |
| Satellite | Use a suitable satellite tile provider | For terrain context |
| Terrain | OpenTopoMap or similar | For ridge/hill context |

### 9.3 Heatmap Configuration

```javascript
L.heatLayer(data, {
  radius: 25,        // Configurable: 15 (tight), 25 (normal), 40 (wide)
  blur: 20,
  maxZoom: 12,
  max: 1.0,
  gradient: {
    0.0:  '#3b82f6',  // Blue - weak
    0.25: '#22c55e',  // Green
    0.5:  '#eab308',  // Yellow
    0.75: '#f97316',  // Orange
    1.0:  '#ef4444'   // Red - strong
  }
})
```

Heat data format: `[lat, lon, intensity]` where intensity = `climbRate / maxClimbRate`, clamped to 0–1.

### 9.4 Default Map Views

| Region | Center | Zoom |
|---|---|---|
| UK | [52.5, -1.5] | 6 |
| Germany | [51.0, 10.0] | 6 |
| Global | [30, 0] | 3 |

---

## 10. Performance Considerations

### 10.1 Track Sampling

Raw tracks have ~1 point/second, producing 10,000–22,000 points per flight. For thermal detection, sampling every 4th point is sufficient and reduces processing time by 75% without meaningfully affecting detection accuracy.

### 10.2 Heatmap Rendering

With 1,000+ thermals, Leaflet's heatmap performs well. For date ranges producing 5,000+ thermals, consider:
- Server-side pre-rendering of heatmap tiles
- Viewport-based filtering (only render thermals in the current map bounds)
- Level-of-detail: at low zoom, cluster nearby thermals; at high zoom, show individuals

### 10.3 Estimated Processing Times

**WeGlide** (28 UK flights, 304K track points):
- Flight list fetch: ~1 second (paginated, max 100/page)
- IGC download (28 flights, sequential with 500ms delay): ~15 seconds
- Thermal detection (76K sampled points): <1 second
- Total: ~20 seconds

**BGA Ladder** (76 UK flights for the same day):
- Flight IDs fetch: <1 second
- Flight details + IGC download (76 flights, 10 concurrent): ~10 seconds
- Thermal detection: ~2 seconds
- Total: ~15 seconds (faster due to no rate-limiting constraints and higher concurrency)

For busy European days on WeGlide (500+ flights, 50+ in a single country): estimate 2–3 minutes for initial processing (cached thereafter).

---

## 11. Known Limitations & Future Investigation

### 11.1 WeGlide: Flight Detail Endpoint

`GET /v1/flight/{id}` returns 404. This needs further investigation:
- May require authentication (cookie/token from logged-in session)
- May have been deprecated or moved to a different path
- The `v2` endpoint returned 503 (service unavailable), suggesting it exists but isn't stable
- **Action**: Use Playwright with full request interception to capture the exact endpoint the SPA uses

### 11.2 WeGlide: IGC File Path

The `igc_file.file` field is only available on flight detail responses, not on the list response. Workaround options:
- Construct the path heuristically from user ID and flight ID (unconfirmed)
- Use the headless browser approach to get flight details
- **Action**: Investigate whether the flight list endpoint supports an `include` parameter for additional fields

### 11.3 WeGlide: CORS

The WeGlide API blocks cross-origin requests from non-WeGlide domains. The backend proxy pattern (section 7) is the correct solution. Do not attempt to call the WeGlide API directly from the browser. The BGA Ladder API does not have this restriction, but using a backend proxy is still recommended for consistency and caching.

### 11.4 API Stability

WeGlide states their API is not finalised. Endpoint paths and parameter names may change. The BGA Ladder API appears more stable (serving a long-running competitive scoring system) but is also undocumented. The backend should include robust error handling and logging to detect API changes quickly for both sources.

### 11.5 BGA Ladder: No Activity Calendar

The BGA Ladder has no equivalent to WeGlide's `/v1/flight/activity` endpoint. To show which dates have flights, the app would need to either probe individual dates or scrape the BGA Ladder website. For the MVP, a manual date input is sufficient when using the BGA Ladder source.

### 11.6 BGA Ladder: FLIGHTPATH Lacks Altitude/Time

The `/API/FLIGHTPATH/{id}` endpoint returns only `[lon, lat]` coordinates — no altitude or time data. This means the simplified path cannot be used for thermal detection. Always use the IGC file via `/API/FLIGHTIGC/{id}` for thermal analysis. The FLIGHTPATH endpoint is still useful for drawing flight traces on the map.

### 11.7 Source Coverage Differences

For the reference date of 26 March 2026:
- WeGlide found **28 UK flights** (out of 101 total worldwide)
- BGA Ladder found **76 UK flights**

The BGA Ladder provides significantly better UK coverage because many BGA club pilots submit flights to the Ladder but not to WeGlide. However, WeGlide has international coverage that the BGA Ladder lacks entirely. The dual-source approach gives users the best of both worlds.

---

## 12. Implementation Guidance for Claude Code

### 12.1 Recommended Stack

The spec is stack-agnostic, but a solid choice would be:
- **Frontend**: React/Next.js or Vue/Nuxt (to match WeGlide's Vue ecosystem)
- **Backend**: Node.js (Express/Fastify) or Python (FastAPI)
- **Cache**: Redis or SQLite for caching
- **Map**: Leaflet.js + leaflet-heat

### 12.2 Implementation Order

1. **Data source abstraction** — Implement the `FlightSourceProvider` interface (section 4) and the normalised data types
2. **BGA Ladder provider** — Start with BGA Ladder (simpler API, no auth headaches, better UK coverage)
3. **IGC parsing** — IGC B-record parser (shared by both sources) per section 5.7
4. **Thermal detection** — Port the algorithm (section 5) to the backend language
5. **Backend API** — REST endpoints with source parameter (section 7.3)
6. **WeGlide provider** — Add WeGlide support with browser-like headers
7. **Caching layer** — Cache results per source+date+region
8. **Frontend map** — Leaflet heatmap with the thermal data
9. **UI controls** — Source selector, date picker, region selector, climb threshold slider
10. **Progress updates** — WebSocket/SSE for processing status
11. **Extended features** — Date ranges, clustering, flight list panel, etc.

### 12.3 Test Data

For development and testing, use **26 March 2026** as the reference date:

**WeGlide:**
- 101 total flights worldwide
- 28 UK flights (region `GB`)
- Expected output: ~1,000 thermals
- Key airports: Lasham, Dunstable, Nympsfield

**BGA Ladder:**
- 76 UK flights
- Expected output: ~2,500–3,000 thermals (estimated, ~2.7x more flights)
- Key clubs: Lasham, London Gliding Club (Dunstable), Bristol & Gloucestershire (Nympsfield)
- Good coverage across southern and central England

### 12.4 Key Gotchas

**WeGlide-specific:**
1. **Date parameters**: Use `scoring_date_start` and `scoring_date_end`, NOT `scoring_date`
2. **Limit cap**: API returns 422 if `limit > 100` — always paginate
3. **Headers required**: CloudFront blocks requests without browser-like headers (Accept, Referer, Origin, User-Agent)
4. **No single-flight endpoint**: `/v1/flight/{id}` returns 404 — use IGC download or headless browser
5. **CDN for IGC files**: `weglidefiles.b-cdn.net/{igc_file.file}` — no auth needed
6. **Region field**: `takeoff_airport.region` is a simple string like `"GB"`, not a nested country code

**BGA Ladder-specific:**
7. **Date format**: Uses `DD-MMM-YYYY` (e.g., `26-Mar-2026`), NOT ISO format
8. **Check LoggerFileAvailable**: Not all flights have IGC data — always check before requesting
9. **FLIGHTPATH has no altitude/time**: Only `[lon, lat]` — must use IGC for thermal detection
10. **Launchpoint altitude in feet**: The `Altitude` field appears to be feet, not metres — convert as needed
11. **UK only**: BGA Ladder has no non-UK flights — disable region filter when BGA is selected

**Common:**
12. **Coordinate order**: GeoJSON uses `[lon, lat]`, but Leaflet uses `[lat, lon]` — watch for swaps
13. **Time format**: WeGlide track timestamps are Unix seconds (fractional); IGC B-records use HHMMSS UTC
14. **Altitude**: GPS altitude is preferred; some flights only have pressure altitude
15. **Sampling**: Every 4th point is fine for thermal detection; use full resolution only for track display
16. **Source prefixing**: Always prefix flight IDs with the source (`weglide:` or `bga:`) to avoid collisions
