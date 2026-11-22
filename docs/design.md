# Hook Echo: design

Status: draft for approval · 2026-11-21

A hook echo is the hook-shaped radar signature of a storm that is producing, or about to produce, a tornado. It is also the name of this tracker.

## Why

You follow severe weather across the US and want to keep yourself, your family and your friends safe. That includes wherever you are traveling. You want one place that shows what is happening right now, where tornadoes have been and where they are heading, and whether any of your people are in danger.

## Goals

1. **The national picture at a glance:** a live radar loop, every active warning drawn in the official NWS colors, watches, the last 24 hours of storm reports, and the Storm Prediction Center's (SPC) risk map.
2. **Tornado paths:** for every active tornado warning, show where the storm has been, where it is heading (with arrival times along the way), and the surveyed damage paths of recent tornadoes.
3. **Your people and places:** saved places (home, family, friends), each with a live status. The app sounds an alarm the moment one is under a tornado warning, and gives a heads-up when a tornado's projected path will pass close by.
4. **Travel:** "Where I am" follows your phone's location. Trip stops with dates show each town's storm risk up to 3 days out.
5. **Phone and computer alike:** it can be added to the phone's home screen, and you can text the link to family and friends.

## Non-goals

- Notifications while the site is closed. That needs an alert server (option 2) and can be added later without redoing anything.
- Warnings outside the US.
- Accounts or syncing between devices. A share link covers setting up family members' phones.
- Lightning, satellite and single-radar velocity views. These are candidates for later.
- Replacing official alerts. The app says plainly to keep Wireless Emergency Alerts on.

## Anti-goals (failures even if everything technically works)

- **A false all-clear.** If the warning data is stale or failed, a place shows *Unknown*, never *Clear*.
- **Alarm fatigue.** Advisories, marine alerts and statements never sound the alarm.
- **Tornado warnings lost in clutter.** Life-threatening warnings always draw on top and stand out from everything else.
- **Burning phone data.** The target is about 20 MB an hour normally and under 10 MB an hour with data saver on.
- **Looking official.** The app uses no NWS or NOAA logos and has a clear "not an official source" line.

## Constraints

- **Browser only, no server.** Every feed must allow other websites to read it. That was checked on 2026-11-21 for the NWS alerts API, Iowa Environmental Mesonet, SPC, the NOAA map services, the NWS Damage Assessment Toolkit, CARTO basemaps, Photon and Open-Meteo. The National Hurricane Center's own JSON does not allow it, so tropical data comes from NOAA's tropical map service instead.
- **Alarms only fire while the site is open,** in the foreground or a background tab. Browsers slow background tabs to about one check a minute.
- **Phone limits.** iPhone notifications need the site added to the home screen (iOS 16.4+). Sound needs one tap first, because of browser autoplay rules. Location needs HTTPS (GitHub Pages provides it) plus the viewer's permission.
- **SPC can be slow.** Its server sometimes drops connections, so every feed needs retry and fallback behavior.

## Approaches considered

1. **A website on GitHub Pages: picked.** It works on phone and computer, is shareable, costs nothing and reads all data live. The trade-off is that alarms only fire while it is open.
2. **The same website plus an alert server (Cloudflare): deferred.** It would add notifications while closed, for any saved place. The cost is a Cloudflare account, about double the work, and a dependence on that server staying up.

Dropped:
- An app-store app: $99 a year for Apple, plus a review for every update.
- A computer-only app: no help on the road.
- A claude.ai artifact: its sandbox blocks all outside data, so it could only be a snapshot.

## How it is built

### Platform and hosting

- A static site of plain HTML, CSS and JavaScript modules, with no build step.
- The map uses **MapLibre GL JS**, pinned to one version and copied into the repo so a CDN outage can't break it. Fonts are also hosted in the repo.
- **Installable app (PWA):** a web app manifest plus a service worker. The worker caches the app shell so the site opens instantly, and when the connection drops it shows the last data with an offline banner.
- **Hosting:** a new public GitHub repo, `hook-echo`, on your GitHub account. GitHub Pages publishes the `site/` folder through a GitHub Actions workflow on every push, at `https://<account>.github.io/hook-echo/`. The repo is created only after you OK it.
- **Repo layout:**
  - `site/`: the app
  - `test/`: unit tests and recorded NWS samples
  - `tools/`: one-off helper scripts
  - `docs/`: this design and the build notes

### Data feeds

| Feed | Source | Refresh | Used for |
|---|---|---|---|
| Storm warnings and watches | NWS alerts API, filtered to the event types under the table | 60 s | Warning shapes, storm motion and projected paths, hazard tags, place checks |
| All land alerts | NWS alerts API, `region_type=land` (about 450 KB; the full feed is about 2 MB) | 3 min (10 min with data saver) | The "any warnings" list, alert details, place checks |
| County and zone shapes | NOAA watch/warning/advisory map service (WatchesWarnings layer): land only, simplified by the server, linked to each alert by its id | 5 min (10 min with data saver) | Drawing zone-wide alerts: watches, winter storms, floods, heat, wind |
| Place check backup | NWS alerts API `?point=` for each place, staggered | 5 min | Catches anything the shapes miss |
| Radar | Iowa Environmental Mesonet NEXRAD mosaic (base reflectivity), 11 time-stamped frames 5 min apart | New frame every 5 min | Radar loop |
| Recent tornado and severe warnings, including expired ones | NWS alerts API, starting 4 h ago | 2 min | Storm trails (where a storm has been) |
| Storm reports | Iowa Environmental Mesonet Local Storm Reports, last 24 h | 5 min | Tornado, funnel, hail, wind and flood markers |
| Surveyed tornado paths | NWS Damage Assessment Toolkit, damage lines, last 14 days | 30 min | EF-rated paths with length, width, peak wind, injuries |
| Storm risk | SPC Day 1 categorical and tornado probability, Day 2 and Day 3 categorical | 15 min (Day 1), 60 min (Days 2–3) | Risk map layer, place and trip risk |
| Tropical storms | NOAA tropical map service: forecast cone, track, points and past track for active Atlantic, East Pacific and Central Pacific storms | 15 min | Hurricane layer |
| Place search | Photon (towns, addresses, schools, venues, biased to the US), with Open-Meteo as backup | On demand | Adding places |
| Place forecasts | NWS points lookup, then the 7-day forecast | 60 min | Place cards and trip stops |
| Basemap | CARTO dark and light map tiles, with labels drawn above the radar | n/a | Map |

The storm-warnings feed covers these event types: tornado, severe thunderstorm, flash flood, extreme wind, snow squall, dust storm and special marine warnings, tornado and severe thunderstorm watches, and special weather statements.

### Map layers

| Layer | Default | Look |
|---|---|---|
| Radar loop | On | Standard reflectivity colors, under the place labels, with play, pause and a time scrubber |
| Storm-based warnings | On | Official NWS colors. Tornado warnings get a thick outline and a slow pulse. A tornado emergency or a "particularly dangerous situation" (PDS) gets a hatched fill. |
| Watches | On | Zone shading with a dashed outline in the official watch colors |
| Other alerts (winter, flood, heat, wind…) | On, faint | Official colors at low opacity |
| Projected tornado paths | On | Dashed center line with 10-minute arrival ticks and a widening uncertainty cone |
| Storm trails | On | Solid line that fades with age, with time labels |
| Surveyed tornado paths | On | Colored by EF rating; tap for the survey facts |
| Storm reports, last 24 h | On | A distinct marker per report type, fading with age |
| SPC risk, Day 1 | Off | Official SPC category colors, translucent; can switch to tornado probability |
| Tropical storms | On whenever one is active | Cone, track and points with category labels |
| My places | On | Pins with a status ring |

### Tornado paths

- **Motion.** Each warning's `TIME...MOT...LOC` line gives the time, the direction the storm is moving from, its speed in knots, and one or more storm positions.
- **Projected path.** Starting from the storm's estimated position now (moved forward from the warning's time), the path runs to the warning's expiration:
  - Arrival ticks every 10 minutes, labeled with clock times.
  - A cone that widens by ±15° in direction and ±20% in speed.
  - Recomputed every 15 seconds, so the "now" marker creeps along the path.
  - Labeled as an estimate: *"Projected from the NWS storm motion. Storms can turn."*
  - A line of storms (several positions) is projected as a moving line.
- **Where it has been.**
  - Storm positions are chained across a warning's updates (same office, type and event number).
  - Then across follow-on warnings for the same storm: a new warning that starts within 15 km of the previous storm's projected spot, within 20 minutes of the previous warning ending.
  - Trails are kept for up to 4 hours.
- **Ground truth.** Surveyed damage paths from the last 14 days, and tornado reports from the last 24 hours.
- **Heads-up.** If a projected cone passes within 5 miles of a saved place or your location before the warning ends, that place gets a heads-up with an arrival estimate: *"could reach Mom's in about 18 min, around 8:32 PM"*.

### People and places

- **Saved places:** each has a kind (Home, Family, Friend, Trip stop), a name and a location, up to 25 places. Add one by search, by "use my current location", or by long-pressing (right-clicking on a computer) the map.
- **Status per place,** most serious first:
  - **Take shelter:** tornado warning or tornado emergency
  - **Warning:** severe thunderstorm, flash flood, extreme wind and other warnings
  - **Watch**
  - **Advisory**
  - **Clear**
  - **Unknown:** warning data older than 5 minutes, or failed
- **Place card:**
  - The alerts covering it.
  - The nearest storm: distance, direction, and whether it is moving toward or away.
  - Today's SPC risk.
  - The NWS forecast for the next two periods.
- **Trip stops:**
  - Each has a date or a date range, listed in date order with the storm risk for that day.
  - Days 1–3 use the SPC outlook. Days 4–7 use thunderstorm and severe wording in the NWS forecast. Beyond that it shows *"too far out to tell."*
  - Stops in the past drop to a collapsed "Past trips" group.
- **Where I am:**
  - A toggle that follows the phone's location while the site is open.
  - Shown as a blue dot with an accuracy ring.
  - Gets the same status, alarms and heads-ups as a saved place.
- **Share my places:** builds a link that carries the list after the `#` in the URL, so it is never sent to any server. Opening the link asks *"Add these 5 places?"* before saving anything.

### Alarms

| Level | Triggers | What happens |
|---|---|---|
| Alarm | Tornado warning (including emergency and PDS), extreme wind warning, flash flood emergency, severe thunderstorm warning with a "destructive" damage threat | Loud two-tone siren (generated in the browser), vibration, full-screen takeover, system notification if allowed. Repeats until acknowledged. |
| Chime | Severe thunderstorm warning, flash flood warning, tornado watch, projected-path heads-up | Short chime, banner, notification if allowed |
| Silent | Everything else | Status only |

- Each alert sounds once per place, and again only if it is upgraded (for example, to a tornado emergency).
- **First run:** a one-tap "Turn on alarm sound" step unlocks audio and explains the notification prompt.
- **Settings:**
  - Chime on or off for severe thunderstorm and flash flood warnings.
  - Heads-up on or off.
  - "Keep screen on" for storm nights.
  - **Test alarm**, to check volume and permissions.

### Screens and layout

- **Computer (960 px and wider):**
  - A left panel (about 400 px) beside the map.
  - The panel has a header with the name and a live status, then a threat summary strip of counts by type, each tappable to filter.
  - Under that, tabs: **Now** (warnings), **People** (places), **Trips**, **Reports**.
  - Map controls: layers, my location and zoom, with the radar timeline along the bottom.
- **Phone:**
  - A full-screen map with a bottom sheet in three heights. The peek height shows the summary and the most serious warning; then half, then full.
  - The radar timeline floats above the sheet. Safe areas (notches, home bar) are respected.
- **Warning card:**
  - A severity stripe and the event name.
  - Tags: Observed or Radar indicated, PDS, Emergency, hail size, wind gust.
  - The area, a countdown ("ends in 23 min"), motion ("→ NE 35 mph"), and which of your places it covers.
  - Tapping opens the details: the full NWS text (headline, description, what to do), the projected-path summary, and "Show on map".
- **Alarm takeover:** the warning name in huge type, the place, *"Take shelter now"*, time left, the first line of the NWS instructions, and **Silence** and **Show on map** buttons.
- **Every state is designed:**
  - First-load skeletons.
  - Each feed's own error with a retry button and its last-updated time.
  - Offline banner and stale-data badges.
  - Empty states: no tornado warnings (with the most recent one and when it ended), no places yet (with how to add the first), no reports, no tropical storms.

### Visual direction

- **A night-shift radar console.** A deep blue-slate ground makes the map the hero, and nearly all color comes from the official hazard and radar palettes, so warnings read instantly.
- **Type:**
  - Barlow Condensed for headings and labels, compact like road signage.
  - Barlow for text.
  - JetBrains Mono for times and numbers.
- **Light theme** for daylight: a light basemap and darker outlines, with the same layout.
- **Motion:** tornado warnings pulse slowly and radar frames crossfade. All motion is switched off for viewers who ask for reduced motion.
- **Accessibility:** color is never the only signal (every status also has a word), keyboard focus is always visible, and new warnings are announced to screen readers.

### Privacy

- Places and settings stay in the browser on each device.
- Location leaves the device only as rounded coordinates (about 100 m), sent to the NWS for point alert checks and forecasts. Search text goes to the place-search service.
- No analytics, no cookies, no accounts.

### Reliability and data use

- **Every feed:**
  - A timeout and retries with backoff.
  - Keeps its last good data and shows its age.
  - Fails on its own, without taking the rest of the app down.
- **When the zone-shape feed fails:** storm-based warnings still draw, zone alerts still list, and places fall back to the point checks.
- **Polling while hidden:** it continues in the background so alarms still work. Radar tiles pause while the tab is hidden.
- **Data saver:**
  - Turns on automatically when the browser reports Save-Data, or by a manual toggle.
  - Stretches the non-critical refreshes.
  - Never slows the 60-second warnings feed.

### Testing

- **Unit tests** (Node's built-in test runner) for the pure logic, using recorded real NWS alerts as fixtures:
  - motion parsing, path projection and closest approach
  - point-in-polygon
  - VTEC parsing
  - severity ranking and place status
  - trail chaining
  - time and distance formatting
- **A demo mode** (`#demo`) replays a recorded tornado event, clearly labeled with its date, so the tornado-path features can be checked on a quiet day.
- **Browser checks** in the app's browser pane, at computer and phone sizes, light and dark:
  - every map layer and the radar loop
  - warnings list to details
  - searching and adding places, and trip stops
  - the alarm takeover, through Test alarm
  - the offline and failed-feed states

## Calls I made (change any of them)

- **Name:** Hook Echo.
- **Refresh rates:** 60 s for warnings, 3 min for all alerts, 5 min for radar, shapes and reports.
- **Distances and units:**
  - Heads-up radius of 5 miles; ±15° and ±20% for the path cone.
  - Up to 25 places.
  - US units (mph, miles, °F) only.
- **Defaults:** the alarm levels in the table above, and the SPC risk layer off.
- **Map tools:** MapLibre GL JS with the CARTO basemap.

## Later

- Option 2: an alert server for notifications while the site is closed.
- A rotation view: storm-relative velocity from the nearest radar for a selected tornado warning.
- A satellite layer, and lightning if a free feed appears.
- Tropical storms worldwide.
