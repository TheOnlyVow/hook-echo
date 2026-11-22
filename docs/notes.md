# Hook Echo: build notes

Built 2026-11-21 from `docs/design.md` following `docs/plan.md`, on the branch `feat/hook-echo`.

## What was built

- **The app:** a static, installable web app (no build step) in `site/`.
  - Pure logic lives in `site/js/lib` and is unit-tested: geometry, storm motion, VTEC, hazards, path projection, trails, place status, alarm rules, outlooks, forecasts, trips, people, share links, alarm text.
  - Feed loaders and normalizers live in `site/js/data`, map code in `site/js/map` and the interface in `site/js/ui`.
- **The suite:** 155 tests. The map style is validated against MapLibre's own style spec in both themes.
- **Demo:** `#demo` replays a recorded real event, with archived radar, through the same pipeline as live data.

## Decisions made during the build

- **Basemap:** CARTO raster basemaps now return an "API key required" tile, so the basemap is our own vector style on OpenFreeMap tiles (no key). Place labels draw above the radar.
- **Fonts:** the monospace face was dropped. Times and counts use Barlow's tabular figures.
- **SPC outlooks:** SPC sometimes resets connections for one file name, so the outlook loader falls back from `*.nolyr.geojson` to `*.lyr.geojson`.
- **Watch counts:** watches count by watch number, since one watch is issued once per forecast office.
- **Storm events, one source:** the one-minute storm feed is the only source for storm events while it has data. Otherwise a cancelled warning could linger for up to three minutes from the slower all-alerts feed.
- **Alarm memory:** kept per place and per warning event, with its highest rank. Routine updates and downgrades never re-alarm; an upgrade (such as a tornado emergency) does. The demo keeps its own session memory.
- **Where I am:** resumes on load only when location permission is already granted, so opening the page never prompts.
- **Offline:** `tools/precache.mjs` lists every app file and stamps a content hash into `sw.js`. Run it before deploying; the Pages workflow does.
- **Report colors:** storm-report colors and the EF-scale ramp were checked with a palette validator (lightness, chroma, color-blind separation, contrast) for both themes. Shape is the backup encoding.

## Update: explanations, forecasts and a developer console (2026-11-21)

Built on the branch `feat/explain-predict-devconsole`. The suite grew from 155 to 196 tests.

- **Explanations:** `lib/explain.js` turns any map feature into a title, a plain sentence, a time or source line, details and actions.
  - `rankHits` orders what is under the pointer from most to least specific, one entry per thing.
  - `tapAction` decides what a tap does: warnings and the storm-now dot open the warning's detail; everything else shows a card.
  - `ui/mapTips.js` draws the hover tooltip (fine pointers only) and the tap card. On phones the card docks at the top and the map shifts so the tapped spot stays visible; on wider screens it sits beside the spot and stays clear of the panel, the map buttons and the radar bar.
- **Forecasts:**
  - Projected paths and trails now cover severe thunderstorm warnings too, drawn lighter than tornado warnings. A layers-menu switch limits them to tornado warnings.
  - The storm-risk layer has a day picker: today, tomorrow, day 3, and days 4 to 8. Days 1 and 2 also offer tornado probability. The legend comes from the areas actually on the map.
  - Mesoscale discussions (`data/mcd.js`) come from the Iowa Environmental Mesonet API, because SPC's own files don't allow browser access. Each one is labeled on the map with its watch chance.
  - NHC seven-day development areas and disturbance marks (`loadDevelopment` in `data/tropical.js`) use NHC's low, medium and high colors.
- **Developer console:** `dev/capture.js` always runs and keeps a 600-entry log of console output, page errors, rejected promises and feed timings. `dev/console.js` and `css/devconsole.css` load only when the console opens.
  - Tabs: Log, Feeds, Alerts, Places (why each place has its status, from `lib/why.js`), Map (debug views, overlay counts), Tools.
  - The command line evaluates JavaScript with top-level `await`; `hook.help()` lists what it can reach.
  - Simulated tornado warnings (`lib/sim.js`) run through the real alarm, path and status code. They are labeled "Simulated" on the alarm screen, in notifications, in a banner and as a chip, and they live only in memory.

### Decisions

- **Empty SPC outlooks:** SPC marks "nothing expected" with a placeholder area that has an empty geometry. It used to count as an area. It's now dropped, and its label ("Potential Too Low") becomes the outlook's `note`, shown in the layers menu.
- **Card, not map popup:** the tap card is drawn in the map overlay instead of as a MapLibre popup. On phones a popup opened under the radar bar and the bottom sheet.
- **Alarm screen:** a place already told to take shelter is no longer also listed as "a tornado could also reach" (`alsoApproaching`).
- **Labels:** "Simulated" wins over "Demo" on the alarm screen and in notifications.
- **Developer mode:** stored in `localStorage` under `hook-echo:dev`. `#dev` turns it on and opens the console, then restores the address, including `#demo` in the demo.

## How to refresh recorded data

- `npm run fixtures`: re-records feed samples into `test/fixtures/`. SPC may throttle bursts; rerun later if one file fails.
- `npm run fixtures -- spc-mcd.json tropical-outlook.json`: re-records only the named fixtures.
- `node tools/record-demo.mjs`: re-records the demo event. Edit the window and anchor at the top of the script. The NWS API keeps about a week of alerts.

## What's left

- **Notifications while the app is closed:** needs a small alert server (Cloudflare Worker with Web Push or ntfy). Deferred by choice.
- **Rotation view:** storm-relative velocity from the nearest radar for a selected tornado warning.
- **More layers:** satellite, lightning (if a free feed appears) and worldwide tropical storms.
- **Crowded pins:** place labels can overlap when two saved places are a few miles apart at mid zoom.
- **Radar at street level:** the national radar mosaic looks blocky when zoomed in to street level. That's the data's resolution; a single-site radar layer would fix it.
- **Trips beyond day 3:** trip stops show storm risk for days 1 to 3. The days 4 to 8 chances are loaded now and could cover trips up to a week out.
- **Discussions in the Now tab:** mesoscale discussions show on the map. A short list in the Now tab ("Watch likely soon") would make them visible without opening the map.
