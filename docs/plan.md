# Hook Echo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Hook Echo, an installable static web app that tracks US storms, tornado paths and warnings live, and watches the user's saved places and current location.

**Architecture:** A browser-only static site with no build step, served by GitHub Pages from `site/`.
- Pure logic lives in `site/js/lib/` and is unit-tested with Node's test runner.
- Feed loaders and normalizers live in `site/js/data/`, map code in `site/js/map/`, and DOM UI in `site/js/ui/`.
- `site/js/main.js` wires a small observable store to the feeds, the map and the UI.

**Tech Stack:**
- HTML, CSS and JavaScript ES modules.
- MapLibre GL JS 5.24.1 (vendored UMD build, global `maplibregl`).
- Fontsource 5.3.0 woff2 files for Barlow, Barlow Condensed and JetBrains Mono.
- Node 24 `node --test` for tests.
- @resvg/resvg-js 2.6.2 (dev only, for icons).
- GitHub Actions and GitHub Pages for hosting.

**Spec:** `docs/design.md`

## Global Constraints

- US only. Official NWS hazard colors. No NWS or NOAA logos. A visible line: "Not an official warning source. Keep Wireless Emergency Alerts on."
- **Refresh rates (data saver value in parentheses):**
  - storm warnings and watches: 60 s
  - land alerts: 3 min (10 min)
  - zone shapes: 5 min (10 min)
  - per-place point checks: 5 min
  - recent warnings: 2 min
  - radar frames and reports: 5 min
  - surveys: 30 min
  - SPC: Day 1 15 min, Days 2–3 60 min
  - tropical: 15 min
  - forecasts: 60 min
- **Stale rule:** warning data older than 5 min means a place with no live alert shows **Unknown**, never Clear.
- **Path geometry:**
  - heads-up radius 5 mi (8.05 km)
  - cone ±15° direction, ±20% speed
  - ticks every 10 min
  - projections recomputed every 15 s
- **Trails:** link within 15 km and 20 min; keep 4 h.
- **Limits and units:** at most 25 places. US units only (mph, mi, °F).
- **Data use:** about 20 MB/h normally, under 10 MB/h with data saver.
- **Privacy:** places and settings live only in `localStorage`. Coordinates sent to the NWS are rounded to 3 decimals. No analytics.
- **Accessibility:** color is never the only signal, focus is always visible, `prefers-reduced-motion` stops pulses and crossfades, and new warnings are announced in an `aria-live` region.
- **Type:** Barlow Condensed for headings and labels, Barlow for text, JetBrains Mono for times and numbers.
- **Alarm levels:**
  - alarm: tornado warning (any), extreme wind warning, flash flood emergency, severe thunderstorm warning with a destructive damage threat
  - chime: severe thunderstorm warning, flash flood warning, tornado watch, heads-up
  - silent: everything else

## Review Focus

1. **Stale or failing warning feeds:** any place without a live alert shows `unknown`, never `clear`. Tested in Task 6 (`stale feeds never report clear`).
2. **The same alert returned on each refresh:**
   - a routine update must not alarm again (`no repeat alarm on update`, Task 6)
   - an upgrade to a tornado emergency alarms again (`upgrade alarms again`, Task 6)
3. **A zone alert with no geometry and no shape** still sets place status when the NWS point check lists it (`point check covers shapeless alert`, Task 6).
4. **Malformed motion text, or a line of storms with several positions:** never throws; returns `null` or a multi-point motion (`garbage motion is null`, `line of storms`, Task 3).
5. **Blocked storage** (`localStorage` throws): the store uses defaults and saving fails silently (`storage that throws`, Task 9).

## File map

| Path | Responsibility |
|---|---|
| `package.json`, `.gitignore`, `tools/vendor.mjs` | Dev scripts; copy MapLibre and fonts into `site/` |
| `site/index.html` | App shell markup, templates, `aria-live` region |
| `site/css/tokens.css`, `site/css/app.css` | Theme tokens (dark-first plus light) and components |
| `site/js/config.js` | Feed URLs, event lists, refresh rates, thresholds |
| `site/js/lib/geo.js` | Distance, destination, bearing, point-in-geometry, bounds, centroid |
| `site/js/lib/motion.js`, `vtec.js` | Parse `eventMotionDescription` and VTEC strings |
| `site/js/lib/hazards.js` | Colors, tags, alarm level, place level, rank |
| `site/js/lib/paths.js` | Projected path, cone, closest approach, heads-up |
| `site/js/lib/trails.js` | Chain storm positions into trails |
| `site/js/lib/status.js`, `alarmRules.js` | Place status; which alarms to fire |
| `site/js/lib/outlook.js`, `forecast.js` | SPC risk at a point and by date; forecast wording by date |
| `site/js/lib/format.js`, `share.js` | Display formatting; share-link encode and decode |
| `site/js/state/store.js` | Observable store with safe persistence |
| `site/js/data/http.js` | `fetchJSON`, `Feed` (schedule, backoff, staleness, data saver) |
| `site/js/data/*.js` | Loaders and normalizers per feed |
| `site/js/map/*.js` | Map creation, layers, radar loop, patterns and icons |
| `site/js/ui/*.js` | Panel and sheet, summary, warnings, places, trips, reports, layers menu, timeline, alarm, settings, toasts |
| `site/js/main.js` | Boot and wiring; `#demo` and `#import=` handling |
| `site/sw.js`, `site/manifest.webmanifest`, `site/icons/` | Installable app |
| `site/demo/event.json`, `tools/record-fixtures.mjs` | Recorded event for demo mode; test fixtures |
| `test/*.test.js`, `test/fixtures/` | Unit tests |
| `.github/workflows/pages.yml` | Test, then deploy `site/` to Pages |

---

### Task 1: Scaffold

**Files:** Create `package.json`, `.gitignore`, `tools/vendor.mjs`, `test/smoke.test.js`.

- [ ] Step 1: `package.json`:
  - `"type":"module"`, `"private":true`
  - scripts: `test` = `node --test test/`, `vendor` = `node tools/vendor.mjs`, `icons` = `node tools/make-icons.mjs`, `fixtures` = `node tools/record-fixtures.mjs`
  - devDependencies: `maplibre-gl@5.24.1`, `@fontsource/barlow@5.3.0`, `@fontsource/barlow-condensed@5.3.0`, `@fontsource/jetbrains-mono@5.3.0`, `@resvg/resvg-js@2.6.2`
- [ ] Step 2: `tools/vendor.mjs` copies these into `site/`:
  - `dist/maplibre-gl.js`, `dist/maplibre-gl.css` and `LICENSE.txt` into `site/vendor/maplibre-gl/`
  - latin woff2 files into `site/fonts/`: Barlow 400/500/600, Barlow Condensed 500/600/700, JetBrains Mono 400/600
- [ ] Step 3: Run `npm install && npm run vendor && npm test`. Expected: the files exist, and the smoke test passes (`pass 1`).

### Task 2: Geometry (`site/js/lib/geo.js`)

**Produces:**
- `distanceKm(a:LatLon,b:LatLon):number`
- `destination(p:LatLon,bearingDeg:number,km:number):LatLon`
- `bearingDeg(a,b):number` (0–360)
- `pointInGeometry(p:LatLon,g:Geometry|null):boolean`: Polygon, MultiPolygon and GeometryCollection; holes respected; GeoJSON coordinates are `[lon,lat]`
- `geometryBounds(g):[w,s,e,n]|null`
- `centroid(pts:LatLon[]):LatLon`

`LatLon = {lat:number, lon:number}`.

- [ ] Write `test/geo.test.js`:
  - `distanceKm({lat:35.4676,lon:-97.5164},{lat:36.154,lon:-95.993})` ≈ 158 ± 2.
  - `destination({lat:35,lon:-97},90,100)` gives lat 34.99 ± 0.02 and lon −95.90 ± 0.02.
  - `bearingDeg` of that pair is 90 ± 0.6.
  - `pointInGeometry`:
    - inside a square: true
    - outside: false
    - inside the square's hole: false
    - in a MultiPolygon's second part: true
    - `null`: false
- [ ] Run `node --test test/geo.test.js`. Expected: FAIL (the module is missing).
- [ ] Implement with haversine and spherical destination formulas, and even-odd ray casting per ring.
- [ ] Run the tests again. Expected: PASS.

### Task 3: Motion and VTEC (`site/js/lib/motion.js`, `site/js/lib/vtec.js`)

**Produces:**
- `parseMotion(text?:string):Motion|null`, with `Motion = {time:Date, dirFrom:number, speedKt:number, points:LatLon[]}`.
- `parseVtec(text?:string):Vtec|null`, with `Vtec = {action, office, phenomena, significance, etn:number, start:Date|null, end:Date|null, key:string}`. The key is `office.phen.sig.etn(4-digit).year`.

- [ ] Write `test/motion.test.js`:
  - `parseMotion('2026-11-22T01:40:00-00:00...storm...221DEG...16KT...27.6,-80.49')` gives:
    - time `2026-11-22T01:40:00.000Z`
    - dirFrom 221, speedKt 16
    - points `[{lat:27.6,lon:-80.49}]`
  - **line of storms:** `'…...storms...250DEG...30KT...35.12,-97.45 35.30,-97.20'` gives 2 points.
  - **garbage motion is null:** `'abc'`, `''` and `undefined` all return `null`.
- [ ] Write `test/vtec.test.js`:
  - `'/O.NEW.KMLB.SV.W.0123.261122T0139Z-261122T0215Z/'` gives:
    - action `NEW`, office `KMLB`, phenomena `SV`, significance `W`, etn 123
    - start `2026-11-22T01:39:00Z`, end `2026-11-22T02:15:00Z`
    - key `KMLB.SV.W.0123.2026`
  - A start of `000000T0000Z` gives `start === null`, and the key year comes from the end.
  - Garbage returns `null`.
- [ ] Run the tests. Expected: FAIL. Implement both with anchored regexes. Run again. Expected: PASS.

### Task 4: Hazards (`site/js/lib/hazards.js`)

**Produces:**
- `hazardColor(event):string` (fallback `#8A94A6`)
- `alertTags(event, params, text):Tag[]`
- `alertLevel(event, tags):'alarm'|'chime'|'silent'`
- `placeLevel(event):'shelter'|'warning'|'watch'|'advisory'`
- `alertRank(event, tags):number`

`Tag = {kind:'emergency'|'pds'|'observed'|'radar'|'destructive'|'considerable'|'hail'|'wind', label:string}`.

- [ ] Write `test/hazards.test.js`:
  - **Colors:** Tornado Warning `#FF0000`, Severe Thunderstorm Warning `#FFA500`, Flash Flood Warning `#8B0000`, Tornado Watch `#FFFF00`, Severe Thunderstorm Watch `#DB7093`, unknown `#8A94A6`.
  - **Tags:**
    - `tornadoDamageThreat:['CATASTROPHIC']` gives emergency "Tornado emergency"
    - `['CONSIDERABLE']` gives pds "PDS"
    - `tornadoDetection` OBSERVED gives observed "Observed"; RADAR INDICATED gives radar "Radar indicated"
    - `maxHailSize:['2.75']` gives hail "2.75 in hail"
    - `maxWindGust:['80 MPH']` gives wind "80 mph wind"
    - `thunderstormDamageThreat:['DESTRUCTIVE']` gives destructive "Destructive"
    - `flashFloodDamageThreat:['CATASTROPHIC']` gives emergency "Flash flood emergency"
  - **Levels:**
    - alarm: Tornado Warning, Extreme Wind Warning, Flash Flood Warning with emergency, Severe Thunderstorm Warning with destructive
    - chime: Severe Thunderstorm Warning, Flash Flood Warning, Tornado Watch
    - silent: Severe Thunderstorm Watch, Winter Storm Warning, Small Craft Advisory
  - **Place levels:**
    - shelter: Tornado Warning
    - warning: Winter Storm Warning
    - watch: Tornado Watch
    - advisory: Wind Advisory and Special Weather Statement
  - **Rank order**, strictly decreasing:
    1. tornado emergency
    2. PDS tornado
    3. observed tornado
    4. radar tornado
    5. Extreme Wind
    6. flash flood emergency
    7. destructive severe thunderstorm
    8. severe thunderstorm
    9. Flash Flood Warning
    10. Winter Storm Warning
    11. Tornado Watch
    12. Severe Thunderstorm Watch
    13. Winter Storm Watch
    14. Wind Advisory
    15. Special Weather Statement
- [ ] Run (FAIL), implement with the NWS color table from weather.gov/help-map, run (PASS).

### Task 5: Projected paths (`site/js/lib/paths.js`)

**Consumes:** `geo.js`, `Motion`.

**Produces:**
- `projectMotion(m:Motion, now:Date, until:Date, opts?):Projection|null`, with:
  - `Projection = {tracks: Track[], until: Date}`
  - `Track = {now: LatLon, end: LatLon, line: LatLon[], ticks: {pos: LatLon, time: Date}[], cone: LatLon[]}`
- `closestApproach(p:LatLon, proj:Projection):{distanceKm, eta:Date, insideCone:boolean}|null`
- `headsUp(p, proj, now, radiusKm=8.05):{eta, distanceKm, minutes}|null`
- `nearestStorm(p, projections:Map<alertId,Projection>):{alertId, distanceKm, bearingFromPlace, toward:boolean}|null`. A storm counts as toward when its heading is within 90° of the bearing from the storm to the place.

- [ ] Write `test/paths.test.js`, using motion at (35, −97), time = now − 6 min, dirFrom 270, 30 kt:
  - A place 30 km east gives `nearestStorm` `toward === true`, and one 30 km west gives `toward === false`.
  - The now-position longitude is −96.939 ± 0.003.
  - Ticks fall on whole 10-minute clock times and are all strictly between now and until.
  - The cone contains a point 20 km east of now-position, and excludes one 20 km north.
  - A place 20 km east and 1 km north has distance 1 ± 0.2 km and an ETA of now + 21.6 ± 0.5 min.
  - A place 10 km west gives `headsUp` `null`.
  - An `until` before now gives `projectMotion` `null`.
  - A speed under 1 kt gives `null`.
- [ ] Run (FAIL), implement, run (PASS). Implementation notes:
  - The heading is `(dirFrom+180)%360`; km/h is kt × 1.852.
  - The cone is the origin with ±1.5 km offsets, then an arc at radius 1.2·v·T from heading −15° to +15°.
  - Closest approach uses a local equirectangular frame centered on the place.

### Task 6: Place status and alarm rules (`site/js/lib/status.js`, `site/js/lib/alarmRules.js`)

**Consumes:** `hazards.js`, `geo.js`, `paths.js`. `Alert` comes from Task 11 (`id, event, expires:Date, geometry, vtec, tags, rank, level, placeLevel`).

**Produces:**
- `coveringAlerts(p, alerts, shapes:Map<id,{geometry}>, pointHits:Set<id>|undefined, now):Alert[]`, sorted by rank and excluding expired alerts.
- `placeStatus(p, ctx:{alerts, shapes, pointHits, projections:Map<alertId,Projection>, now, stale}):PlaceStatus`, with `PlaceStatus = {level:'shelter'|'warning'|'watch'|'advisory'|'clear'|'unknown', alerts, top, headsUp:{alertId, eta, distanceKm, minutes}|null, stale:boolean}`.
- `decideAlarms(memory:Record<placeId,string[]>, statuses:Record<placeId,PlaceStatus>):{events:{placeId, alert, kind:'alarm'|'chime'|'headsup'}[], memory}`.
  - The fingerprint is `(vtec?.key ?? id)+'|'+rank`.
  - Heads-ups use `'hu|'+key`.
  - Memory drops fingerprints that are no longer present.

- [ ] Write `test/status.test.js`:
  - **`stale feeds never report clear`:** stale with no alerts gives `unknown`; stale with a covering tornado warning gives `shelter` with stale true; fresh with none gives `clear`.
  - **`point check covers shapeless alert`:** geometry null and no shape, with the id in pointHits, is covered; with neither, it is not.
  - A shape covering the place counts. An expired alert is excluded.
- [ ] Write `test/alarmRules.test.js`:
  - A first tornado warning gives 1 `alarm`.
  - **`no repeat alarm on update`:** the same VTEC key and rank with a new id gives 0 events.
  - **`upgrade alarms again`:** a higher rank gives 1 `alarm`.
  - A severe thunderstorm warning gives `chime`. A severe thunderstorm watch gives none.
  - A heads-up gives one `headsup`, then none on repeat.
- [ ] Run (FAIL), implement, run (PASS).

### Task 7: Trails (`site/js/lib/trails.js`)

**Produces:** `buildTrails(alerts:Alert[], now:Date, opts?):Trail[]`, with `Trail = {id, phenomena, points:{pos, time}[], latestAlertId}`.

- [ ] Write `test/trails.test.js`:
  - 3 messages with the same key, 15 min apart, moving east, give 1 trail of 3 time-ordered points.
  - A new ETN within 10 km of the projected spot, 5 min after the first ended, is merged.
  - One 50 km away gives 2 trails.
  - Points older than 4 h are dropped.
  - A duplicate time point is kept once.
- [ ] Run (FAIL), implement, run (PASS).

### Task 8: Format and share (`site/js/lib/format.js`, `site/js/lib/share.js`)

**Produces:**
- `clock(d, opts?)`
- `relative(d, now)`
- `duration(ms)`
- `miles(km)`
- `compass(deg)`
- `mph(kt)`
- `motionText(m)`
- `encodePlaces(places):string`
- `decodePlaces(s):Place[]`, with `Place = {id, kind:'home'|'family'|'friend'|'trip', name, lat, lon, from?:'YYYY-MM-DD', to?:'YYYY-MM-DD'}`

- [ ] Write `test/format.test.js`:
  - `clock(new Date('2026-11-22T02:32:00Z'),{timeZone:'America/Chicago'})` is `'8:32 PM'`.
  - `relative`: −20 s gives "just now", −3 min gives "3 min ago", +18 min gives "in 18 min", −2 h gives "2 h ago".
  - `duration(65*60e3)` is `'1 h 5 min'`.
  - `miles`: 0.5 gives "under 1 mi"; 6.76 gives "4.2 mi"; 61 gives "38 mi".
  - `compass(41)` is `'NE'`.
  - `motionText({dirFrom:221, speedKt:30})` is `'→ NE at 35 mph'`.
- [ ] Write `test/share.test.js`:
  - A round trip of 3 places is equal.
  - A tampered string throws `'invalid share link'`.
  - 26 places throws.
  - Out-of-range latitude throws.
  - A name longer than 60 characters throws.
- [ ] Run (FAIL), implement (base64url of compact JSON), run (PASS).

### Task 9: Outlook, forecast, store

**Produces:**
- `riskAt(p, outlook):{code, level, name, color}|null` (codes TSTM, MRGL, SLGT, ENH, MDT, HIGH map to levels 0–5)
- `tornadoProbAt(p, outlook):{percent, significant}|null`
- `outlookForDate(date, outlooks)`: matches the EXPIRE_ISO UTC date minus 1 day
- `forecastForDate(periods, date):{summary, thunder, severe}|null`
- `createStore(initial)` with `get / set(patch) / subscribe(fn)→unsub`
- `loadPersisted(storage, key, defaults)` and `savePersisted(storage, key, value)`

- [ ] Write the tests (`test/outlook.test.js`, `test/forecast.test.js`, `test/store.test.js`):
  - A point in SLGT nested inside MRGL gives SLGT. Outside gives `null`.
  - `outlookForDate('2026-11-23', [day1 expiring 2026-11-23T12Z, day2 expiring 2026-11-24T12Z])` gives day2.
  - "Chance Showers And Thunderstorms" gives `thunder` true and `severe` false. "Some storms could be severe" gives `severe` true.
  - **`storage that throws`:** the store loads defaults, and saving does not throw.
  - `subscribe` fires after `set` and stops after unsubscribe.
- [ ] Run (FAIL), implement, run (PASS).

### Task 10: Feeds (`site/js/data/http.js`)

**Produces:**
- `fetchJSON(url, {timeoutMs=20000, signal}):Promise<any>`, throwing `FeedError{code:'timeout'|'network'|'http'|'parse', status?}`.
- `new Feed({id, load:(signal)=>Promise<T>, intervalMs, saverIntervalMs?, staleMs})`, with:
  - `.start() .stop() .refresh() .subscribe(fn) .snapshot` (`{status, data, updatedAt, error, stale}`)
  - `.setDataSaver(on)`

- [ ] Write `test/http.test.js`, using `mock.timers` and a fake `load`:
  - Success sets `ok` and the data.
  - A failure keeps the last data and sets the error.
  - The stale flag turns on after `staleMs`.
  - The retry delays are 15 s, then 30 s, then 60 s, capped at the interval.
  - Overlapping `refresh()` calls run `load` once.
- [ ] Run (FAIL), implement, run (PASS).

### Task 11: Loaders and normalizers (`site/js/data/*.js`, `tools/record-fixtures.mjs`)

**Produces:**
- `alerts.js`:
  - `normalizeAlert(feature):Alert` (`id, event, headline, description, instruction, areaDesc, sent, effective, onset, expires, ends, senderName, geometry, ugc, same, vtec, motion, tags, level, placeLevel, rank, color, messageType`)
  - `loadStormAlerts`, `loadLandAlerts`, `loadRecentWarnings`, `loadPointAlerts(p)→Set<id>`
- `shapes.js`: `normalizeShapes(fc):Map<id,{geometry, event, expires}>` (id comes from `url`), and `loadShapes`.
- `reports.js`: `normalizeReports(fc):Report[]` (types tornado, funnel, hail, wind, flood, other), and `loadReports`.
- `surveys.js`: `normalizeSurveys(fc):Survey[]`, and `loadSurveys`.
- `radar.js`: `radarFrames(validIso, count=11):{time, tiles}[]`, and `loadRadar`.
- `spc.js`: `normalizeOutlook(fc, day, kind)`, and `loadOutlooks`.
- `tropical.js`: `stormLayerIds(serviceJson)`, and `loadTropical`.
- `geocode.js`: `searchPlaces(q)` (Photon, falling back to Open-Meteo).
- `points.js`: `loadForecast(p)`.

- [ ] `tools/record-fixtures.mjs` saves real samples to `test/fixtures/`: storm alerts, land alerts, recent tornado warnings, shapes, reports, surveys, SPC Day 1 and Day 2, and the tropical service JSON.
- [ ] Write `test/normalize.test.js`:
  - A fixture alert with VTEC has `vtec.key`, a `Date` `expires` and `rank > 0`.
  - Shapes are keyed by alert id.
  - Report types map: TORNADO to tornado, FUNNEL CLOUD to funnel, HAIL to hail, TSTM WND DMG to wind, FLASH FLOOD to flood.
  - `radarFrames('2026-11-22T01:45:00Z')` gives 11 frames. Frame 0's tiles contain `ridge::USCOMP-N0Q-202611220055`, and frame 10's contain `nexrad-n0q-900913`.
  - `stormLayerIds` finds `AT1` with cone 8, track 7, points 6 and past 12.
- [ ] Run (FAIL), implement, run (PASS).

### Task 12: App shell and visual system

**Files:** `site/index.html`, `site/css/tokens.css`, `site/css/app.css`, `site/js/ui/dom.js`, `site/js/ui/panel.js`.

- [ ] **Tokens:** dark-first (`:root`) and light (`prefers-color-scheme: light` and `[data-theme=light]`); hazard and radar palettes as tokens; fonts with fallbacks.
- [ ] **Shell:**
  - The header shows the name, a live dot with "Updated 30 s ago", and settings.
  - A summary strip.
  - The tabs Now / People / Trips / Reports.
  - The map container.
  - The timeline.
  - Toasts, the takeover dialog and the settings dialog.
- [ ] **Panel and sheet:** a 400 px side panel at 960 px and wider. Below that, a bottom sheet with peek, half and full heights, using pointer drag, keyboard and a handle button.
- [ ] **Verify in the browser pane:**
  - at 1440×900 and 390×844, dark and light
  - no horizontal scroll; visible focus rings
  - the sheet snaps between the three heights

### Task 13: Map, radar, warnings

**Files:** `site/js/map/map.js`, `layers.js`, `patterns.js`, `radarLoop.js`; `site/js/ui/timeline.js`; `site/js/main.js`.

- [ ] **Map and layer order:** the CARTO no-labels basemap, the SPC risk layer, zone alerts, radar, survey paths, storm-based warnings, trails, projections, reports, tropical, then the CARTO labels-only layer, places and the "me" dot. The theme swaps the tile URLs.
- [ ] **Radar loop:** 11 raster layers at opacity 0 with one visible at a time, crossfading over 300 ms (instant under reduced motion). Play/pause, a scrubber and frame times are in the timeline. Tiles pause while the tab is hidden.
- [ ] **Warnings:**
  - Fills and outlines in hazard colors with a casing.
  - Tornado warnings pulse at 0.5 Hz.
  - Emergency and PDS use a hatched fill pattern drawn on a canvas.
- [ ] **Verify live:** radar animates; the active warnings draw where the NWS map shows them; frame times match the IEM `valid` time.

### Task 14: Warnings UI and tornado paths

**Files:** `site/js/ui/warnings.js`, `site/js/ui/summary.js`, plus `layers.js` updates.

- [ ] **List:** sorted by rank; each card shows a severity stripe, event, tags, area, a live countdown, motion text and the covered places. The empty state names the last tornado warning and when it ended.
- [ ] **Details:** headline, description, instruction, the projected-path summary (*"Projected from the NWS storm motion. Storms can turn."*) and Show on map, which fits the bounds.
- [ ] **Map paths:** the dashed projected line, the cone, the tick labels and a moving "now" marker every 15 s; trails use a line gradient by age.
- [ ] **Verify in `#demo` (Task 21) and live:** paths start at the warning's storm position; ticks are labeled with clock times.

### Task 15: Reports, surveys, outlook, tropical, layers menu

**Files:** `site/js/ui/reports.js`, `site/js/ui/layersMenu.js`, plus `layers.js` updates.

- [ ] **Reports:** marker icons per type, fading with age, popups. The Reports tab lists them newest first, with type filter chips.
- [ ] **Surveys:** EF-colored lines with a popup (EF, date, length in mi, width in yd, peak wind, injuries, fatalities).
- [ ] **Outlook:** SPC fill and stroke from the feed. The menu toggles between categorical and tornado probability.
- [ ] **Tropical:** cone, track and points with category labels. Hidden when there are no storms.
- [ ] **Layers menu:** toggles for every layer in the spec table, remembered per device.
- [ ] **Verify:** every toggle works; each layer's empty or failed state shows in the menu (for example "No active tropical storms", or "SPC unavailable, retrying").

### Task 16: People and Where I am

**Files:** `site/js/ui/places.js`, plus `main.js` wiring.

- [ ] **People tab:**
  - Cards with a status chip and word.
  - Alerts, the nearest storm (distance, compass and toward/away), today's SPC risk and the next two forecast periods.
  - Add (search, use my location, or long-press / right-click the map), edit, and delete with an in-page confirm.
  - The empty state explains how to add the first place.
- [ ] **Where I am:** `watchPosition` while the toggle is on, a blue dot with an accuracy ring, and the same status pipeline.
- [ ] **Point checks:** staggered `loadPointAlerts` every 5 min, with rounded coordinates.
- [ ] **Verify:**
  - Add Tulsa, OK by search.
  - Add a place inside an active warning: the chip reads correctly.
  - With the feeds blocked, the chip reads Unknown.

### Task 17: Trips

**Files:** `site/js/ui/trips.js`.

- [ ] **Stops:** each has a date or range, in date order, with the risk for its date:
  - SPC for Days 1–3
  - forecast wording for Days 4–7
  - "too far out to tell" beyond that
- [ ] Past stops are grouped under a collapsed "Past trips".
- [ ] **Verify:** a stop dated tomorrow shows the Day 2 risk; one 10 days out shows "too far out to tell".

### Task 18: Alarms, notifications, settings

**Files:** `site/js/ui/alarm.js`, `site/js/ui/settings.js`, `site/js/ui/toasts.js`.

- [ ] **Siren:** a Web Audio two-tone (853 Hz / 960 Hz alternating every 0.5 s) at 80% gain, repeating until Silence; vibration `[600,300,600,300,600]`.
- [ ] **Chime:** two short sine notes.
- [ ] **Takeover:** the event in huge type, the place name, *"Take shelter now"* (for shelter level), the time left, the first instruction line, and Silence and Show on map buttons; `role="alertdialog"` with focus trapped.
- [ ] **Notifications:** `registration.showNotification` when permission is granted.
- [ ] **Settings:** first-run "Turn on alarm sound"; toggles for chimes, heads-up, keep screen on (wake lock), data saver and theme; Test alarm.
- [ ] **Verify:** Test alarm sounds and shows the takeover; Silence stops it; a refresh does not re-trigger.

### Task 19: Share links

- [ ] "Share my places" copies `…/#import=<encoded>`. On load with `#import=`, show "Add these N places?" with a preview list and Add / Cancel buttons, then clear the hash.
- [ ] **Verify:** a round trip in a second tab adds the places; a tampered link shows "This share link is damaged."

### Task 20: Installable app

**Files:** `site/manifest.webmanifest`, `site/sw.js`, `site/icons/icon.svg`, `tools/make-icons.mjs`; PNGs at 192, 512, maskable 512 and 180 (Apple).

- [ ] **Service worker:** precache the app shell with a versioned cache, cache-first for the shell, and network-only for feeds.
- [ ] **Verify:** Lighthouse-style checks pass in the browser (the manifest is valid, the service worker is active); a reload while offline shows the shell plus the offline banner.

### Task 21: Demo mode

**Files:** `site/demo/event.json` (recorded tornado warnings with motion, plus reports from the same event), and the demo loaders in `site/js/data/demo.js`.

- [ ] `#demo` swaps the feed loaders so they shift recorded times to now, with a banner reading "Demo: replaying the tornado warnings from <date>" and a Leave demo button.
- [ ] **Verify:** projected paths, trails, the warnings list and the alarm (for a place inside a polygon) all work in demo.

### Task 22: Full browser check

- [ ] At 1440×900 and 390×844, dark and light, work through every tab, layer, dialog and state (loading, empty, error, offline, stale). Fix what fails.
- [ ] Run `npm test`. Expected: every test passes.

### Task 23: Publish (only after the user OKs creating the public repo)

**Files:** `.github/workflows/pages.yml`, `README.md`.

- [ ] **Workflow:** on push to `main`, run `npm ci` and `npm test`, then `actions/upload-pages-artifact` with path `site`, then `actions/deploy-pages`.
- [ ] Run `git init`, commit, `gh repo create hook-echo --public --source . --push`, then enable Pages with build type `workflow`.
- [ ] **Verify:** the Pages URL loads on desktop and in a phone-sized viewport, and the live feeds load there.
