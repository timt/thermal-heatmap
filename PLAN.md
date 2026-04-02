# Thermal Heatmap — Planning Document

## 1. Vision

A web application that visualises thermal activity across the UK by analysing real glider flight data. Pilots use it to review conditions on past days, plan future flights based on historical patterns, and (in future) monitor live thermal activity.

## 2. Design Decisions

| # | Decision | Answer | Rationale |
|---|---|---|---|
| 1 | Primary users | Pilots planning, reviewing, and (future) live tracking | Three modes served by one unified interface |
| 2 | UI modes | Single unified view, progressive complexity via date picker | Avoids mode-switching; review = pick a date, planning = pick a range, live = future "today" option |
| 3 | Weather context | Future epic, togglable overlay | Valuable but significant scope; pilots already use RASP/SkySight separately |
| 4 | Flight trace overlay | Both flight list selection + IGC upload, post-MVP | Serves review use case directly |
| 5 | Codebase | Repurpose existing Weather Bookmarks scaffold | Infrastructure (Next.js 16, Prisma v7, Supabase, Vercel) is reusable |
| 6 | Caching/persistence | Postgres (Supabase) as persistence and cache layer | No Redis — one fewer piece of infrastructure |
| 7 | Processing trigger | On-demand, persist results for reuse | First request computes, subsequent requests served from DB |
| 8 | Processing model | Client-driven incremental batches of 5 flights | Stays within Vercel function timeout, gives progress for free |
| 9 | Raw data storage | Store normalised metadata + thermals + IGC source reference | Not raw IGC — always re-fetchable from source APIs |
| 10 | Data sources (MVP) | BGA Ladder only; WeGlide as fast-follow | BGA is simpler API, better UK coverage (76 vs 28 flights on reference day) |
| 11 | Map library | Leaflet.js + leaflet-heat | Free, no API key, sufficient for MVP volumes. Document Mapbox GL JS as future migration path if scale demands it |
| 12 | Basemap | Dark CartoDB default + layer switcher (terrain, satellite) | Best heatmap contrast with terrain context available on demand |
| 13 | Auth | Fully public, no login | Data sources are public; no user-specific data yet |
| 14 | Algorithm params | Min climb rate slider exposed; other params via URL query params only | One intuitive control for users, power-user tuning via URL |
| 15 | Mobile | Desktop-first MVP; no decisions that block mobile later | Live mode will need mobile — keep layout flexible |
| 16 | Progress indication | Client-driven from batch orchestration | No SSE/WebSocket needed — client knows batch state |
| 17 | Heatmap radius | Fixed default (25), not exposed in UI | Most users won't touch it; add control later if requested |
| 18 | Layout | Floating overlay cards on the map | Stats in one corner, controls in another; maximises map real estate |
| 19 | Thermal markers | Shown for thermals above the min climb rate slider value | One control, two effects (heatmap + markers) |
| 20 | Cache freshness | "Last processed" timestamp + refresh button; background flight count check | BGA flights trickle in for days; inform user of new flights, let them choose to refresh |
| 21 | Marker popups | Climb rate, altitude gain, base/top altitude, time of day, observation count | All derivable from computed data; time and observation count are high value for pilots |
| 22 | Date picker | Self-populating calendar from processed dates in our DB | No BGA activity calendar API; improves with use |
| 23 | Page structure | Single page route `/`, broken into components | App is fundamentally one map view with controls |

## 3. MVP User Stories

### Epic 1: Foundation & Data Layer

**S1: Data source abstraction types**
> As a developer, I want shared TypeScript interfaces for normalised flights, track points, and source providers, so that both data sources feed into the same pipeline.

Acceptance criteria:
- `NormalisedFlight` interface defined per spec section 4.1
- `TrackPoint` interface defined per spec section 4.2
- `FlightSourceProvider` interface defined per spec section 4.3
- Flight IDs prefixed with source (`bga:128982`)
- IGC source reference (URL/path) included in flight metadata

**S2: IGC file parser**
> As a developer, I want a parser that converts IGC B-records into `TrackPoint[]`, so that flight track data from any source can be analysed.

Acceptance criteria:
- Parse B-record format: time (HHMMSS UTC), lat/lon (milliminutes to decimal degrees), pressure and GPS altitude
- Filter out invalid fixes (validity flag `V`)
- Prefer GPS altitude over pressure altitude
- Handle both BGA Ladder and WeGlide IGC formats
- Return sorted `TrackPoint[]` array

**S3: Thermal detection algorithm**
> As a developer, I want a thermal detection algorithm that identifies thermals from a flight track, so that thermal locations and strengths can be mapped.

Acceptance criteria:
- Input: `TrackPoint[]`, configurable parameters (min climb rate, window size, min heading change, extension factor, min altitude gain, sample rate)
- Sliding window scan with climb check + circling check (accumulated heading change)
- Thermal extension forward while climb persists
- Output: array of thermal objects with centroid lat/lon, avg climb rate, altitude gain, base/top altitude, entry/exit timestamps
- Sensible defaults per spec section 5.3
- Track point sampling (every Nth point) for performance

### Epic 2: BGA Ladder Integration

**S4: BGA Ladder provider — flight list**
> As a developer, I want to fetch and normalise flight metadata from the BGA Ladder API, so that UK flights can be listed and filtered.

Acceptance criteria:
- Fetch flight IDs from `/API/FLIGHTIDS/{date}` (date format: `DD-MMM-YYYY`)
- Fetch flight detail from `/API/FLIGHT/{id}` with concurrent batching (max 10)
- Normalise into `NormalisedFlight` format
- Include `LoggerFileAvailable` flag and IGC source reference
- Handle launchpoint altitude conversion (feet to metres)
- Store `sourceUrl` linking back to BGA Ladder

**S5: BGA Ladder provider — track data**
> As a developer, I want to fetch and parse IGC files from the BGA Ladder, so that flight tracks can be fed into the thermal detection algorithm.

Acceptance criteria:
- Check `LoggerFileAvailable` before requesting
- Fetch IGC from `/API/FLIGHTIGC/{id}`
- Parse via the IGC parser (S2) into `TrackPoint[]`
- Respect rate limiting (max 10 concurrent, 100ms between batches)
- Return empty array (not error) for flights without logger data

**S6: Database schema for flights and thermals**
> As a developer, I want a database schema that stores normalised flight metadata and computed thermals, so that processed results can be served without re-computation.

Acceptance criteria:
- `processed_dates` table: source, date, flight count, thermal count, algorithm version, processed timestamp
- `flights` table: normalised flight metadata, IGC source reference, foreign key to processed_date
- `thermals` table: centroid lat/lon, avg climb rate, altitude gain, base/top altitude, entry/exit time, foreign key to flight
- Prisma v7 schema with migrations
- Index on source + date for fast lookups

**S7: Backend API — thermals endpoint**
> As a pilot, I want to request thermal data for a specific date, so that I can see where thermals were active.

Acceptance criteria:
- `GET /api/thermals?source=bga&date=2026-03-26&min_climb=0.5`
- If cached in DB with matching algorithm version, return stored results
- If not cached, return 404/empty with flight count hint (client drives batch processing)
- Response includes thermal array + metadata (flight count, processing timestamp)

**S8: Backend API — batch processing endpoint**
> As a frontend client, I want to submit batches of flights for thermal detection, so that processing stays within Vercel function timeouts and I can show progress.

Acceptance criteria:
- `POST /api/thermals/process` with body: `{ source, date, flightIds: string[] }`
- Fetch IGC for each flight, run thermal detection, persist results to DB
- Batch size ~5 flights per request
- Return detected thermals for the batch + running totals
- Update `processed_dates` record on completion

**S9: Backend API — flights endpoint**
> As a frontend client, I want to fetch the flight list for a date, so that I can orchestrate batch processing and show flight count.

Acceptance criteria:
- `GET /api/flights?source=bga&date=2026-03-26`
- Returns normalised flight metadata list
- Includes total count and count with track data available
- If already in DB, serve from DB; otherwise fetch from BGA and persist

### Epic 3: Frontend — Map & Heatmap

**S10: Base map with Leaflet**
> As a pilot, I want an interactive map centred on the UK, so that I can explore thermal activity geographically.

Acceptance criteria:
- Leaflet.js map, full viewport (floating controls overlay)
- Dark CartoDB basemap as default
- Layer switcher with terrain (OpenTopoMap) and satellite options
- Default centre: UK [52.5, -1.5], zoom 6
- Touch-friendly (pan, zoom, pinch)
- No fixed-width layout decisions that block future mobile responsiveness

**S11: Heatmap layer**
> As a pilot, I want thermal locations rendered as a heatmap, so that I can quickly see areas of strong thermal activity.

Acceptance criteria:
- leaflet-heat layer rendering thermal data as `[lat, lon, intensity]`
- Intensity = climb rate normalised to strongest thermal (0-1)
- Gradient: blue (weak) to green to yellow to orange to red (strong)
- Fixed radius of 25, blur 20
- Re-renders when min climb rate slider changes
- Progressively updates as batches complete

**S12: Thermal markers**
> As a pilot, I want clickable markers on strong thermals, so that I can inspect individual thermal details.

Acceptance criteria:
- Circle markers for thermals above the min climb rate slider value
- Colour-coded by strength
- Popup on click showing: climb rate (m/s), altitude gain (m), base altitude (m), top altitude (m), time of day (HH:MM), observation count
- Markers update when slider value changes
- Markers appear progressively as batches complete

**S13: Statistics panel**
> As a pilot, I want a summary of thermal activity for the selected date, so that I can quickly assess how good the soaring day was.

Acceptance criteria:
- Floating overlay card (bottom-left or top-right corner)
- Displays: flights analysed, thermals detected, average climb rate, best climb rate, maximum altitude gain, highest thermal top
- Collapsible to a summary line
- Updates progressively as batches complete

### Epic 4: UI Controls

**S14: Date picker**
> As a pilot, I want to select a date to view thermal activity, so that I can review past soaring days.

Acceptance criteria:
- Calendar-based date picker
- Highlights dates that have been previously processed (from `processed_dates` table)
- Defaults to the most recent processed date, or yesterday if no data exists
- Selecting a date triggers the data loading flow

**S15: Min climb rate slider**
> As a pilot, I want to adjust the minimum climb rate threshold, so that I can filter for stronger thermals.

Acceptance criteria:
- Slider range: 0.0 to 3.0 m/s, step 0.1
- Default: 0.5 m/s
- Adjusting the slider filters both the heatmap layer and thermal markers in real time (client-side filtering of already-loaded data)
- Current value displayed alongside the slider

**S16: Processing progress indicator**
> As a pilot, I want to see progress while thermal data is being computed, so that I know the app is working and roughly how long to wait.

Acceptance criteria:
- Shown when batch processing is active
- Displays: "Processing flight X of Y... (N thermals found)"
- Progress bar or percentage
- Heatmap and markers render progressively as each batch completes
- Disappears when all batches are done

**S17: Cache freshness indicator**
> As a pilot, I want to know when the displayed data was last processed and whether new flights are available, so that I can decide whether to refresh.

Acceptance criteria:
- Display "Last processed: [timestamp] - [N] flights" when serving cached data
- On load, background check BGA flight ID count for the selected date
- If count differs from stored count, show "X new flights available" with a refresh button
- Refresh button triggers full re-processing for that date
- Unobtrusive — small text or icon, not a modal

### Epic 5: Scaffold Cleanup

**S18: Remove Weather Bookmarks code**
> As a developer, I want to remove the bookmarks proof-of-concept code, so that the codebase is clean for the thermal heatmap.

Acceptance criteria:
- Remove `src/app/api/cities/` routes
- Remove `src/app/api/weather/` routes
- Remove bookmarks UI from `src/app/page.tsx`
- Remove City model from Prisma schema
- Create migration to drop cities table
- Keep infrastructure: Prisma config, Docker Compose, Next.js config, Vercel deployment, Tailwind setup

## 4. Post-MVP User Stories

### Epic 6: WeGlide Integration

**S19: WeGlide provider — flight list**
> As a pilot, I want to view thermal data from WeGlide flights, so that I can access international coverage and flights not on the BGA Ladder.

Acceptance criteria:
- Fetch from `/v1/flight` with `scoring_date_start`/`scoring_date_end`, paginate with `skip`/`limit=100`
- Include browser-like headers (Accept, Referer, Origin, User-Agent) for CloudFront
- Filter by `takeoff_airport.region`
- Normalise into `NormalisedFlight` format

**S20: WeGlide provider — track data**
> As a developer, I want to fetch and parse IGC files from WeGlide's BunnyCDN, so that WeGlide flight tracks can be analysed.

Acceptance criteria:
- Download IGC from `weglidefiles.b-cdn.net/{igc_file.file}`
- Parse via IGC parser into `TrackPoint[]`
- Rate-limit: max 5 concurrent, 200-500ms delay between requests
- Handle missing IGC file paths gracefully

**S21: WeGlide activity calendar**
> As a pilot, I want the date picker to show which days had flights on WeGlide, so that I can pick interesting soaring days.

Acceptance criteria:
- Fetch `/v1/flight/activity?season={year}&new_format=true` when WeGlide is selected
- Highlight dates with flights in the calendar
- Merge with self-populated calendar data from processed dates

**S22: Data source selector**
> As a pilot, I want to toggle between BGA Ladder and WeGlide, so that I can choose the best data source for my needs.

Acceptance criteria:
- Toggle/dropdown in the controls panel
- Persist preference in localStorage
- Default to BGA Ladder for UK region
- Switching source triggers fresh data load for the selected date
- Disable region filter when BGA is selected (UK only)

**S23: Region filter**
> As a pilot, I want to filter flights by region, so that I can focus on thermal activity in a specific country.

Acceptance criteria:
- Dropdown with region codes (GB, DE, FR, AT, AU, ZA, US, "All")
- Default: GB
- Only enabled when WeGlide is selected
- Adjusts map default centre/zoom to match selected region

### Epic 7: Flight Trace Overlay

**S24: Flight list panel**
> As a pilot reviewing a day's flying, I want to see a list of flights and click one to overlay its track on the map, so that I can see which thermals a specific pilot found.

Acceptance criteria:
- Sidebar or floating panel listing flights for the selected date
- Shows: pilot name, aircraft, club, distance
- Click highlights that flight's thermals on the map
- Click draws the flight track as a polyline on the map
- Link to source (BGA Ladder or WeGlide flight page)

**S25: IGC file upload**
> As a pilot, I want to upload my own IGC file and overlay it on the thermal heatmap, so that I can see what thermals I missed.

Acceptance criteria:
- File upload control (drag-and-drop or file picker)
- Parse IGC client-side or server-side
- Draw flight track as a polyline on the map
- Optionally run thermal detection on the uploaded track and highlight the pilot's thermals differently

### Epic 8: Enhanced Analysis

**S26: Date range mode**
> As a pilot planning a flight, I want to view aggregated thermals across multiple days, so that I can identify reliable thermal hotspots.

Acceptance criteria:
- Date range picker (start/end date or presets: last 7 days, last 30 days)
- Aggregate thermals from all dates in range
- Apply spatial clustering (500m radius) to identify hotspots
- Show observation count per hotspot
- Cluster popup shows: mean climb rate, max climb rate, altitude range, number of observations, dates observed

**S27: Time-of-day animation**
> As a pilot, I want to scrub through the day and see how thermals develop over time, so that I can understand the daily thermal cycle.

Acceptance criteria:
- Time slider (e.g. 09:00 to 18:00 in 30-minute steps)
- Filters heatmap and markers to thermals within the selected time window
- Play/pause button for animation
- Shows how thermal activity progresses geographically through the day

**S28: Altitude profile panel**
> As a pilot, I want to see the distribution of thermal base and top heights, so that I can understand the convective boundary layer for the day.

Acceptance criteria:
- Histogram or box plot showing thermal base heights and top heights
- Updates with slider filter
- Helps pilots gauge expected cloudbase and usable thermal height

**S29: Weather context overlay**
> As a pilot, I want to see weather data alongside the thermal heatmap, so that I can correlate thermal activity with conditions.

Acceptance criteria:
- Togglable overlay
- Wind direction/speed indicators
- Temperature data
- Instability indices if available
- Data source TBD (Met Office, Open-Meteo, or similar)

### Epic 9: Sharing & Export

**S30: Shareable URLs**
> As a pilot, I want to share a specific heatmap view with other pilots, so that we can discuss conditions.

Acceptance criteria:
- Encode source, date, region, min climb rate, and map position/zoom in URL params
- Loading a URL with params restores the exact view
- Algorithm tuning params also encoded

**S31: Data export**
> As a pilot or researcher, I want to export thermal data, so that I can use it in other tools.

Acceptance criteria:
- Export as CSV (thermal list with coordinates, climb rates, altitudes)
- Export as GeoJSON (for use in mapping tools)
- Export heatmap as PNG image

### Epic 10: Future — Live Mode

**S32: Live thermal tracking**
> As a pilot at the airfield, I want to see where thermals are right now based on live flight tracking, so that I can decide when and where to launch.

Acceptance criteria:
- Integration with OGN (Open Glider Network) or similar live tracking service
- "Today (live)" option in date picker switches to streaming mode
- Auto-refreshing heatmap as new data arrives
- Must work on mobile
- Specific design and data source TBD — requires further investigation

### Epic 11: Future — User Accounts & Monetisation

**S36: User authentication**
> As a pilot, I want to create an account, so that my preferences and activity are saved across sessions.

Acceptance criteria:
- Lightweight auth (social login via Google, or email/password)
- Optional — app remains fully usable without an account
- Persist: preferred data source, home region, default min climb rate, favourite dates
- Consider BGA membership number as an identity option for the gliding community

**S37: User profile & linked accounts**
> As a pilot, I want to link my BGA Ladder or WeGlide profile, so that my flights are automatically highlighted on the heatmap.

Acceptance criteria:
- Link BGA pilot ID and/or WeGlide user ID to account
- Auto-highlight the user's own flights in the flight list and on the map
- "My flights" filter option

**S38: Usage analytics & community features**
> As the app operator, I want to understand who is using the app and how, so that I can identify opportunities for community features and monetisation.

Acceptance criteria:
- Track anonymous usage metrics (dates viewed, sources used, regions)
- For authenticated users: usage patterns, favourite airfields, active clubs
- Foundation for future features: comments on days, shared annotations, club dashboards
- Foundation for monetisation: premium features (date range analysis, export, live mode), club subscriptions

### Epic 12: Future — Additional Map Features

**S33: Comparison mode**
> As a pilot, I want to compare thermal activity across two dates side by side, so that I can analyse similar weather patterns.

**S34: Mapbox GL migration**
> As a developer, I want to migrate from Leaflet to Mapbox GL JS, so that the app can handle larger datasets with GPU-accelerated rendering.

Note: Only pursue if Leaflet performance becomes a bottleneck with date-range aggregation (5000+ thermals).

**S35b: Mobile-optimised layout** *(moved from Epic 12)*

### Epic 13: Custom Domain

**S39: Map custom domain thermal.gliderzone.com**
> As a user, I want to access the app via thermal.gliderzone.com, so that it has a memorable, community-appropriate URL.

Acceptance criteria:
- Add `thermal.gliderzone.com` as a custom domain in Vercel
- Configure DNS (CNAME or A record) on gliderzone.com
- Verify SSL certificate is provisioned
- Redirect or alias `thermal-heatmap.vercel.app` to the custom domain

**S35: Mobile-optimised layout**
> As a pilot at the airfield on my phone, I want a mobile-friendly layout, so that I can use the app without a laptop.

Acceptance criteria:
- Responsive layout: controls as bottom sheet or collapsible panels
- Touch-optimised interactions
- Required before live mode (S32) ships

## 5. Suggested Implementation Order

```
Phase 1 — MVP ✅ (2026-04-02)
  ✅ S18  Remove Weather Bookmarks code
  ✅ S1   Data source abstraction types
  ✅ S2   IGC file parser
  ✅ S3   Thermal detection algorithm
  ✅ S6   Database schema
  ✅ S4   BGA Ladder provider — flight list
  ✅ S5   BGA Ladder provider — track data
  ✅ S9   Backend API — flights endpoint
  ✅ S7   Backend API — thermals endpoint
  ✅ S8   Backend API — batch processing endpoint
  ✅ S10  Base map with Leaflet
  ✅ S11  Heatmap layer
  ✅ S12  Thermal markers
  ✅ S13  Statistics panel
  ✅ S14  Date picker
  ✅ S15  Min climb rate slider
  ✅ S16  Processing progress indicator
  ✅ S17  Cache freshness indicator
  ✅ CI/CD — GitHub Actions pipeline (migrate + Vercel deploy on push)

Phase 2 — WeGlide & Source Selection
  S19  WeGlide provider — flight list
  S20  WeGlide provider — track data
  S21  WeGlide activity calendar
  S22  Data source selector
  S23  Region filter

Phase 3 — Flight Overlay
  S24  Flight list panel
  S25  IGC file upload

Phase 4 — Enhanced Analysis
  S26  Date range mode + clustering
  S27  Time-of-day animation
  S28  Altitude profile panel
  S29  Weather context overlay

Phase 5 — Sharing & Export
  S30  Shareable URLs
  S31  Data export

Phase 6 — Live & Mobile
  S35  Mobile-optimised layout
  S32  Live thermal tracking

Phase 7 — User Accounts & Monetisation
  S36  User authentication
  S37  User profile & linked accounts
  S38  Usage analytics & community features

Phase 8 — Custom Domain
  S39  Map thermal.gliderzone.com to Vercel

Phase 9 — Scale & Polish
  S33  Comparison mode
  S34  Mapbox GL migration (if needed)
```

## 6. Session Guidance

- Read this plan fully before starting implementation
- **Do not** read `SPEC-thermal-heatmap-webapp.md` in full — it is ~12,000 tokens. Instead, read only the specific sections referenced by the story you are implementing (e.g. "spec section 4.1" means read only that section). Key sections: §2 (WeGlide API), §3 (BGA Ladder API), §4 (data abstraction), §5 (thermal detection algorithm), §12.3 (test data)
- Use sub-agents to parallelise independent stories where possible
- This plan's design decisions (section 2) supersede any conflicting suggestions in the spec

## 7. Technical Notes

- **Vercel timeout**: Incremental batch processing (5 flights per request) keeps each API call well within standard Vercel function limits
- **Coordinate order**: GeoJSON uses `[lon, lat]`, Leaflet uses `[lat, lon]` — watch for swaps throughout
- **BGA date format**: `DD-MMM-YYYY` (e.g. `26-Mar-2026`), not ISO
- **BGA altitude**: Launchpoint altitude is in feet — convert to metres
- **Algorithm versioning**: Store version alongside cached results; auto-reprocess if version mismatch
- **Mapbox future migration**: If Leaflet performance degrades with 5000+ thermals (likely in date-range mode), Mapbox GL JS with its built-in heatmap layer is the documented upgrade path
