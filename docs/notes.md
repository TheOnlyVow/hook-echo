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

## How to refresh recorded data

- `npm run fixtures`: re-records feed samples into `test/fixtures/`. SPC may throttle bursts; rerun later if one file fails.
- `node tools/record-demo.mjs`: re-records the demo event. Edit the window and anchor at the top of the script. The NWS API keeps about a week of alerts.

## What's left

- **Notifications while the app is closed:** needs a small alert server (Cloudflare Worker with Web Push or ntfy). Deferred by choice.
- **Rotation view:** storm-relative velocity from the nearest radar for a selected tornado warning.
- **More layers:** satellite, lightning (if a free feed appears) and worldwide tropical storms.
- **Crowded pins:** place labels can overlap when two saved places are a few miles apart at mid zoom.
- **Radar at street level:** the national radar mosaic looks blocky when zoomed in to street level. That's the data's resolution; a single-site radar layer would fix it.
