# Hook Echo

A live US storm tracker that watches the places your people are. It shows the radar loop, every active warning, where each tornado has been and where it's heading, and sounds an alarm when a tornado warning covers one of your places.

A hook echo is the hook-shaped radar signature of a storm producing, or about to produce, a tornado.

## What it does

- **Live map:** NEXRAD radar loop (last 50 minutes), every active NWS warning, watch and advisory in the official hazard colors, the last 24 hours of storm reports, NWS-surveyed tornado damage paths and active tropical storms.
- **Explains itself:** hover over anything on the map (on a computer) or tap it (on a phone) for a plain-language explanation: trails, projected paths and cones, warnings, reports, risk areas, discussions and tropical areas. Overlapping things are listed under "Also here".
- **Storm paths:**
  - Where each warned storm has been: a trail built from each warning update.
  - Where it's heading: a projected path with clock-time ticks and an uncertainty cone, from the NWS storm motion. Tornado warnings draw bold; severe thunderstorm warnings draw lighter, or can be turned off.
- **Forecasts:** official forecasts only, never invented ones.
  - The SPC storm-risk outlook for today, tomorrow and day 3 (all severe storms or tornadoes), and the chance of severe storms on days 4 to 8.
  - SPC mesoscale discussions: areas forecasters are watching closely, with the chance a watch follows.
  - Where tropical storms could form in the next 7 days (NHC), and hurricane forecast cones.
- **Your people:** save home, family and friends.
  - Each place shows *Take shelter*, *Warning*, *Watch*, *Advisory*, *Clear* or *Unknown*.
  - Each card also shows the nearest warned storm and whether it's heading toward the place, today's storm risk and the next forecast periods.
- **Heads-up:** a warning when a tornado's projected path will pass within 5 miles of a place, before that place is warned.
- **Alarms:** a full-screen alarm with the emergency attention tone for tornado warnings and other life-threatening warnings, plus chimes for other warnings. Phone notifications work when allowed.
- **Travel:** *Where I am* follows your phone. Trip stops with dates show the storm risk for each day you'll be there.
- **Share:** send your list of places to family as a link. It carries the places after the `#`, so nothing goes to a server.
- **Installable:** add it to your home screen. The app itself works offline; weather data needs a connection.
- **Demo:** open `#demo` to replay the South Florida tornado warnings of November 21, 2026, with times shifted to now.
- **Developer console:** open `#dev` once to turn on developer mode. Then the ` key (or Settings) opens a console with feed health, raw alerts, why each place has its status, map debug views, a live log, simulated tornado warnings and a JavaScript command line (`hook.help()`). It works on a phone as a bottom sheet, and it loads only when opened.

Hook Echo is **not an official warning source**. It only alarms while it's open. Keep Wireless Emergency Alerts on, since they reach your phone even when it's locked.

## Run it locally

Requires Node 22 or newer.

```sh
npm install
npm run serve    # http://localhost:5173
npm test         # unit tests, style validation, smoke checks
```

The map library and fonts are already copied into `site/`. Run `npm run vendor` only after changing their versions in `package.json`.

## Deploy

`site/` is a static site with no build step. The workflow in `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main`:

1. Run the tests.
2. Run `npm run precache`, which lists every file for offline use and stamps a new service-worker version.
3. Deploy.

## Data sources

All feeds are public and read directly by the browser:

| Data | Source |
|---|---|
| Warnings, watches and advisories; storm motion; point forecasts | National Weather Service API (api.weather.gov) |
| Alert areas | NOAA map services (watch/warning/advisory layer) |
| Radar | Iowa Environmental Mesonet NEXRAD mosaic |
| Storm reports | Iowa Environmental Mesonet Local Storm Reports |
| Damage surveys | NWS Damage Assessment Toolkit |
| Storm risk, days 1 to 8 | Storm Prediction Center convective outlooks |
| Mesoscale discussions | Storm Prediction Center, through the Iowa Environmental Mesonet API |
| Tropical storms and development areas | National Hurricane Center (NOAA map services) |
| Place search | Photon (komoot) and Open-Meteo geocoding |
| Basemap | OpenFreeMap vector tiles (OpenMapTiles, OpenStreetMap data) |

## Privacy

Places and settings are stored only in your browser. Coordinates sent to the NWS for point checks and forecasts are rounded to about 100 m. There are no accounts, analytics or cookies.

## Project layout

| Path | What's there |
|---|---|
| `site/` | The app: `js/lib` (pure logic, unit-tested), `js/data` (feeds), `js/map` (map), `js/ui` (interface) |
| `test/` | Node test runner suites and recorded feed fixtures |
| `tools/` | Vendoring, icons, precache list, fixture and demo recorders, dev server |
| `docs/` | Design, implementation plan and build notes |

## Licenses

- **The app's own code:** no license yet; add one before inviting contributions.
- **MapLibre GL JS:** BSD-3-Clause, see `site/vendor/maplibre-gl/LICENSE.txt`.
- **Barlow fonts:** SIL Open Font License, see `site/fonts/LICENSE-fonts.txt`.
- **Map data:** © OpenStreetMap contributors.
