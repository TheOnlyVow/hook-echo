// Hook Echo: boot and wiring. Feeds fill the store; derived data (merged
// alerts, projected paths, trails) is recomputed when its inputs change and
// pushed to the map and the panel.

import { createStore, loadPersisted, savePersisted, safeLocalStorage } from './state/store.js';
import { Feed } from './data/http.js';
import { loadStormAlerts, loadLandAlerts, loadRecentWarnings } from './data/alerts.js';
import { loadShapes } from './data/shapes.js';
import { loadRadar } from './data/radar.js';
import { loadReports } from './data/reports.js';
import { loadSurveys } from './data/surveys.js';
import { loadDay1, loadDays23 } from './data/spc.js';
import { loadTropical } from './data/tropical.js';
import { createDemo } from './data/demo.js';
import { REFRESH, STALE_MS } from './config.js';
import { projectMotion } from './lib/paths.js';
import { buildTrails } from './lib/trails.js';
import { isInEffect } from './lib/status.js';
import { geometryBounds } from './lib/geo.js';
import { clock, relative, statesIn } from './lib/format.js';
import { createMap } from './map/map.js';
import { alertFeatures, pathFeatures, trailFeatures, reportFeatures, surveyFeatures, outlookFeatures, tropicalFeatures } from './map/features.js';
import { createReports, reportPopup, surveyPopup, tropicalPopup } from './ui/reports.js';
import { createLayersMenu } from './ui/layersMenu.js';
import { createPanel } from './ui/panel.js';
import { createTimeline } from './ui/timeline.js';
import { COUNTS, countAlerts, renderSummary, renderHeadline } from './ui/summary.js';
import { createWarnings, endOf } from './ui/warnings.js';
import { createSources, feedState } from './ui/sources.js';
import { $, esc, icon, tickTimes, announce, rafThrottle } from './ui/dom.js';

// ---------- Persistent settings ----------
const storage = safeLocalStorage();
const KEYS = { settings: 'hook-echo:settings', layers: 'hook-echo:layers' };
const DEFAULT_SETTINGS = { theme: 'system', dataSaver: 'auto' };
const DEFAULT_LAYERS = { radar: true, warnings: true, watches: true, others: true, paths: true, trails: true, surveys: true, reports: true, outlook: false, outlookKind: 'cat', tropical: true, places: true, reportTypes: ['tornado', 'funnel', 'hail', 'wind', 'flood'] };

const store = createStore({
  settings: loadPersisted(storage, KEYS.settings, DEFAULT_SETTINGS),
  layers: loadPersisted(storage, KEYS.layers, DEFAULT_LAYERS),
  selectedId: null,
  filter: null,
});

/** Created once the page is ready; null until then. */
let mapApi = null;
let timeline = null;

// ---------- Theme ----------
const lightQuery = matchMedia('(prefers-color-scheme: light)');
const effectiveTheme = () => {
  const t = store.get().settings.theme;
  return t === 'dark' || t === 'light' ? t : lightQuery.matches ? 'light' : 'dark';
};
function applyTheme() {
  const t = store.get().settings.theme;
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effectiveTheme() === 'light' ? '#eef2f6' : '#0d1217');
  mapApi?.setTheme(effectiveTheme());
}
lightQuery.addEventListener('change', applyTheme);

// ---------- Feeds ----------
const MIN = 60_000;
/** #demo replays a recorded event through the same pipeline. */
const demo = location.hash === '#demo' ? createDemo() : null;
const none = (value) => async () => value;
const feeds = {
  storm: new Feed({ id: 'storm', load: demo ? demo.storm : loadStormAlerts, intervalMs: REFRESH.stormAlerts.normal, staleMs: STALE_MS }),
  land: new Feed({ id: 'land', load: demo ? none([]) : loadLandAlerts, intervalMs: REFRESH.landAlerts.normal, saverIntervalMs: REFRESH.landAlerts.saver, staleMs: 15 * MIN }),
  shapes: new Feed({ id: 'shapes', load: demo ? none(new Map()) : loadShapes, intervalMs: REFRESH.shapes.normal, saverIntervalMs: REFRESH.shapes.saver, staleMs: 20 * MIN }),
  recent: new Feed({ id: 'recent', load: demo ? demo.recent : (signal) => loadRecentWarnings(signal), intervalMs: REFRESH.recentWarnings.normal, staleMs: 10 * MIN }),
  radar: new Feed({ id: 'radar', load: demo ? demo.radar : loadRadar, intervalMs: REFRESH.radar.normal, saverIntervalMs: REFRESH.radar.saver, staleMs: 15 * MIN }),
  reports: new Feed({ id: 'reports', load: demo ? demo.reports : loadReports, intervalMs: REFRESH.reports.normal, staleMs: 20 * MIN }),
  surveys: new Feed({ id: 'surveys', load: demo ? none([]) : (signal) => loadSurveys(signal), intervalMs: REFRESH.surveys.normal, staleMs: 2 * 60 * MIN }),
  spc1: new Feed({ id: 'spc1', load: demo ? none({ cat: null, torn: null }) : loadDay1, intervalMs: REFRESH.spcDay1.normal, staleMs: 60 * MIN }),
  spc23: new Feed({ id: 'spc23', load: demo ? none({ day2: null, day3: null }) : loadDays23, intervalMs: REFRESH.spcDays23.normal, staleMs: 3 * 60 * MIN }),
  tropical: new Feed({ id: 'tropical', load: demo ? none([]) : loadTropical, intervalMs: REFRESH.tropical.normal, staleMs: 60 * MIN }),
};
addEventListener('hashchange', () => {
  if ((location.hash === '#demo') !== Boolean(demo)) location.reload();
});
const snap = (id) => feeds[id].snapshot;

function dataSaverOn() {
  const pref = store.get().settings.dataSaver;
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  const c = navigator.connection;
  return Boolean(c?.saveData || /(^|-)2g|3g/.test(c?.effectiveType ?? ''));
}
function applyDataSaver() {
  const on = dataSaverOn();
  for (const f of Object.values(feeds)) f.setDataSaver(on);
}
navigator.connection?.addEventListener?.('change', applyDataSaver);

// ---------- Derived data ----------
const derived = { alerts: [], byId: new Map(), projections: new Map(), trails: [] };

function computeAlerts(now = new Date()) {
  const merged = new Map();
  for (const a of snap('land').data ?? []) merged.set(a.id, a);
  for (const a of snap('storm').data ?? []) merged.set(a.id, a);
  derived.alerts = [...merged.values()].filter((a) => isInEffect(a, now));
  derived.byId = new Map(derived.alerts.map((a) => [a.id, a]));
}

function computeProjections(now = new Date()) {
  const out = new Map();
  for (const a of derived.alerts) {
    if (!a.motion || (a.event !== 'Tornado Warning' && a.event !== 'Severe Thunderstorm Warning')) continue;
    const proj = projectMotion(a.motion, now, endOf(a));
    if (proj) out.set(a.id, proj);
  }
  derived.projections = out;
}

function computeTrails(now = new Date()) {
  const messages = [...(snap('recent').data ?? []), ...(snap('storm').data ?? []).filter((a) => a.vtec && a.motion)];
  derived.trails = buildTrails(messages, now);
}

// ---------- UI ----------
const panel = createPanel({
  onSheetChange: (s) => timeline?.setHidden(s === 'full'),
  onTabChange: (tab) => {
    if (tab === 'reports') renderReports();
  },
});
const warnings = createWarnings({
  el: $('#view-now'),
  onSelect: (id) => selectAlert(id, { fit: true }),
  onRetry: () => feeds.storm.refresh(),
  onClearFilter: () => store.set({ filter: null }),
});
const sources = createSources({ dialog: $('#sources-dialog'), feeds });
$('#live-status').addEventListener('click', () => sources.open());

const reportTypes = () => new Set(store.get().layers.reportTypes ?? DEFAULT_LAYERS.reportTypes);
const setLayer = (key, value) => store.set({ layers: { ...store.get().layers, [key]: value } });
const reportsTab = createReports({
  el: $('#view-reports'),
  onToggleType: (type) => {
    const set = reportTypes();
    if (set.has(type)) set.delete(type);
    else set.add(type);
    setLayer('reportTypes', [...set]);
  },
  onShowReport: (id) => {
    const r = (snap('reports').data ?? []).find((x) => x.id === id);
    if (!r || !mapApi) return;
    mapApi.flyTo([r.lon, r.lat], 9, panel.mapPadding());
    mapApi.popup([r.lon, r.lat], reportPopup(r));
  },
  onShowSurvey: (id) => {
    const s = (snap('surveys').data ?? []).find((x) => x.id === id);
    if (!s || !mapApi) return;
    const b = geometryBounds(s.geometry);
    mapApi.fitBounds(b, panel.mapPadding(), 12);
    const coords = s.geometry.type === 'LineString' ? s.geometry.coordinates : s.geometry.coordinates.flat();
    mapApi.popup(coords[Math.floor(coords.length / 2)], surveyPopup(s));
  },
  onRetry: () => feeds.reports.refresh(),
});
const renderReports = rafThrottle(() => {
  reportsTab.render({ reports: snap('reports').data, reportFeed: snap('reports'), surveys: snap('surveys').data, surveyFeed: snap('surveys'), enabled: reportTypes(), now: new Date() });
});

const layersMenu = createLayersMenu({
  menu: $('#layers-menu'),
  button: $('#btn-layers'),
  getLayers: () => store.get().layers,
  setLayer,
  getFeed: (id) => snap(id),
  extraNote: (key) => {
    if (key === 'tropical' && snap('tropical').status === 'ok' && !snap('tropical').data?.length) return 'No active storms in the Atlantic or Pacific';
    if (key === 'outlook' && snap('spc1').status === 'ok' && !snap('spc1').data?.cat?.features.length) return 'No thunderstorms expected today';
    return null;
  },
});

function lastTornado() {
  let best = null;
  for (const a of snap('recent').data ?? []) {
    if (a.event !== 'Tornado Warning') continue;
    const end = a.vtec?.end ?? a.ends ?? a.expires;
    if (end && (!best || end > best.ended)) best = { ended: end, area: a.areaDesc };
  }
  return best;
}

const renderNow = rafThrottle(() => {
  const s = store.get();
  const filterDef = COUNTS.find((c) => c.key === s.filter);
  warnings.render({
    alerts: derived.alerts,
    feed: snap('storm'),
    filter: filterDef ? { key: filterDef.key, label: filterDef.label, match: filterDef.match } : null,
    selectedId: s.selectedId,
    covers: new Map(),
    lastTornado: lastTornado(),
    now: new Date(),
  });
  tickTimes($('#view-now'));
});

const renderTop = rafThrottle(() => {
  const s = store.get();
  const loaded = snap('storm').status !== 'idle';
  renderSummary($('#summary'), { counts: loaded ? countAlerts(derived.alerts) : null, filter: s.filter }, (key) => {
    store.set({ filter: key });
    panel.selectTab('now');
  });
  renderHeadline($('#headline'), headline(), () => {
    const h = headline();
    if (h?.alertId) selectAlert(h.alertId, { fit: true });
    else panel.selectTab('now');
  });
});

function headline() {
  if (snap('storm').status === 'idle') return null;
  const tors = derived.alerts.filter((a) => a.event === 'Tornado Warning').sort((a, b) => b.rank - a.rank);
  if (tors.length) {
    const states = [...new Set(tors.flatMap((a) => statesIn(a.areaDesc)))];
    return {
      tone: 'national',
      icon: 'tornado',
      title: `${tors.length} tornado warning${tors.length > 1 ? 's' : ''} right now`,
      text: states.length ? `In ${states.join(', ')}. Tap to see the most serious.` : 'Tap to see the most serious.',
      alertId: tors[0].id,
    };
  }
  const last = lastTornado();
  return {
    tone: 'quiet',
    icon: 'check',
    title: 'No tornado warnings right now',
    text: last ? `The last one ended ${relative(last.ended, new Date())}.` : 'Hook Echo is watching the whole country.',
  };
}

function renderLive() {
  const s = snap('storm');
  const el = $('#live-status');
  const state = feedState(s);
  el.dataset.state = state;
  const age = s.updatedAt ? relative(new Date(s.updatedAt), new Date()) : '';
  let text = state === 'loading' ? 'Loading' : state === 'error' ? "Can't reach NWS" : state === 'stale' ? `Delayed, ${age}` : `Updated ${age}`;
  if (demo && state !== 'loading') text = 'Demo replay';
  el.querySelector('.live-text').textContent = text;
  el.setAttribute('aria-label', `Data status: ${text}. Open data sources.`);
}

let demoInfo = null;
function renderBanners() {
  const html = [];
  if (demo && demoInfo) {
    html.push(`<div class="banner is-demo" role="status">${icon('info')}<span><strong>Demo replay.</strong> ${esc(demoInfo.label)}, with times shifted to now.${demoInfo.finished ? ' The replay has finished.' : ''}</span>
      <span class="banner-actions">${demoInfo.finished ? '<button class="btn btn-small" type="button" data-demo-restart>Restart</button>' : ''}<button class="btn btn-small" type="button" data-demo-leave>Leave demo</button></span></div>`);
  }
  if (!navigator.onLine) {
    html.push(`<div class="banner is-error" role="status">${icon('offline')}<span><strong>You're offline.</strong> Showing the last data received${snap('storm').updatedAt ? `, from ${esc(clock(new Date(snap('storm').updatedAt)))}` : ''}.</span></div>`);
  } else if (snap('storm').stale && snap('storm').data) {
    html.push(`<div class="banner is-warning" role="status">${icon('alert')}<span><strong>Warnings may be out of date.</strong> Last update ${esc(relative(new Date(snap('storm').updatedAt), new Date()))}. Retrying.</span></div>`);
  }
  $('#banners').innerHTML = html.join('');
}
$('#banners').addEventListener('click', (e) => {
  if (e.target.closest('[data-demo-leave]')) {
    demo?.restart();
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  }
  if (e.target.closest('[data-demo-restart]')) {
    demo?.restart();
    location.reload();
  }
});
async function refreshDemoInfo() {
  if (!demo) return;
  try {
    demoInfo = await demo.info();
    renderBanners();
  } catch {
    demoInfo = { label: 'Recorded event unavailable', finished: true };
    renderBanners();
  }
}
addEventListener('online', () => {
  renderBanners();
  for (const f of Object.values(feeds)) f.refresh();
});
addEventListener('offline', renderBanners);

// ---------- Map ----------
function pushAlertsToMap() {
  if (!mapApi) return;
  mapApi.setData('alerts', alertFeatures(derived.alerts, snap('shapes').data, new Date()));
}

function pushPathsToMap() {
  if (!mapApi) return;
  const selected = store.get().selectedId;
  const shown = new Map([...derived.projections].filter(([id]) => derived.byId.get(id)?.event === 'Tornado Warning' || id === selected));
  const f = pathFeatures(shown, derived.byId);
  mapApi.setData('cones', f.cones);
  mapApi.setData('paths', f.paths);
  mapApi.setData('path-ends', f.ends);
  for (const t of f.ticks.features) t.properties.label = clock(new Date(t.properties.time));
  mapApi.setData('ticks', f.ticks);
  mapApi.setData('storms-now', f.storms);
}

function pushTrailsToMap() {
  if (!mapApi) return;
  const selected = store.get().selectedId;
  const sel = derived.byId.get(selected);
  const shown = derived.trails.filter((t) => t.phenomena === 'TO' || (sel?.vtec && t.keys.includes(sel.vtec.key)));
  const f = trailFeatures(shown, new Date());
  mapApi.setData('trails', f.lines);
  mapApi.setData('trail-dots', f.dots);
}

function pushReportsToMap() {
  if (!mapApi) return;
  mapApi.setData('reports', reportFeatures(snap('reports').data ?? [], new Date(), reportTypes()));
}

function pushSurveysToMap() {
  if (!mapApi) return;
  mapApi.setData('surveys', surveyFeatures(snap('surveys').data ?? []));
}

function pushOutlookToMap() {
  if (!mapApi) return;
  const d = snap('spc1').data;
  mapApi.setData('spc', outlookFeatures(store.get().layers.outlookKind === 'torn' ? d?.torn : d?.cat));
}

function pushTropicalToMap() {
  if (!mapApi) return;
  const f = tropicalFeatures(snap('tropical').data ?? []);
  mapApi.setData('trop-cones', f.cones);
  mapApi.setData('trop-past', f.past);
  mapApi.setData('trop-tracks', f.tracks);
  mapApi.setData('trop-points', f.points);
}

function onMapFeature(layer, feature, lngLat) {
  if (!feature) return;
  const id = feature.properties?.id;
  if (layer === 'reports') {
    const r = (snap('reports').data ?? []).find((x) => x.id === id);
    if (r) mapApi.popup([r.lon, r.lat], reportPopup(r));
  } else if (layer === 'survey-line') {
    const s = (snap('surveys').data ?? []).find((x) => x.id === String(id));
    if (s) mapApi.popup(lngLat, surveyPopup(s));
  } else if (layer === 'trop-points') {
    const storm = (snap('tropical').data ?? []).find((x) => x.id === feature.properties.storm);
    const point = storm?.points.find((p) => p.tau === feature.properties.tau);
    if (storm) mapApi.popup(lngLat, tropicalPopup(storm, point));
  } else if (layer === 'storm-now') {
    selectAlert(id);
  }
}

function applyLayerVisibility() {
  if (!mapApi) return;
  const l = store.get().layers;
  pushOutlookToMap();
  pushReportsToMap();
  layersMenu.refresh();
  for (const g of ['warnings', 'watches', 'others', 'paths', 'trails', 'surveys', 'reports', 'outlook', 'tropical']) mapApi.setGroupVisible(g, Boolean(l[g]));
  mapApi.ready.then(() => mapApi.radar.setVisible(Boolean(l.radar)));
}

// ---------- Selection ----------
function selectAlert(id, { fit = false } = {}) {
  const a = derived.byId.get(id);
  if (!a) return;
  store.set({ selectedId: id });
  mapApi?.setSelected(id);
  pushPathsToMap();
  pushTrailsToMap();
  panel.showDetail(warnings.detailHtml(a, { projection: derived.projections.get(id), now: new Date() }), {
    label: a.event,
    onBack: () => {
      store.set({ selectedId: null });
      mapApi?.setSelected(null);
      pushPathsToMap();
      pushTrailsToMap();
    },
  });
  tickTimes($('#view-detail'));
  if (fit) fitAlert(a);
  announce(`${a.event}. ${a.headline}`);
}

function fitAlert(a) {
  const g = a.geometry ?? snap('shapes').data?.get(a.id)?.geometry;
  const proj = derived.projections.get(a.id);
  let b = geometryBounds(g);
  for (const t of proj?.tracks ?? []) {
    const ends = [t.now, t.end];
    for (const p of ends) b = b ? [Math.min(b[0], p.lon), Math.min(b[1], p.lat), Math.max(b[2], p.lon), Math.max(b[3], p.lat)] : [p.lon, p.lat, p.lon, p.lat];
  }
  if (b) mapApi?.fitBounds(b, panel.mapPadding());
}

$('#view-detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) panel.closeDetail();
  if (e.target.closest('[data-show-on-map]')) {
    const a = derived.byId.get(store.get().selectedId);
    if (a) fitAlert(a);
  }
});

// ---------- Feed updates ----------
function onFeed(id) {
  const now = new Date();
  if (id === 'storm' || id === 'land') {
    computeAlerts(now);
    computeProjections(now);
    computeTrails(now);
    pushAlertsToMap();
    pushPathsToMap();
    pushTrailsToMap();
    renderNow();
    renderTop();
    if (id === 'storm') {
      renderLive();
      renderBanners();
    }
    const sel = store.get().selectedId;
    if (sel && !derived.byId.has(sel) && panel.isDetailOpen()) panel.closeDetail({ restoreFocus: false });
  }
  if (id === 'shapes') pushAlertsToMap();
  if (id === 'recent') {
    computeTrails(now);
    pushTrailsToMap();
    renderNow();
    renderTop();
  }
  if (id === 'reports') {
    pushReportsToMap();
    renderReports();
  }
  if (id === 'surveys') {
    pushSurveysToMap();
    renderReports();
  }
  if (id === 'spc1') pushOutlookToMap();
  if (id === 'tropical') pushTropicalToMap();
  layersMenu.refresh();
  if (id === 'radar' && mapApi) {
    const r = snap('radar');
    mapApi.ready.then(() => {
      if (r.data) mapApi.radar.setFrames(r.data.frames);
      timeline?.setUnavailable(r.status === 'error' && !r.data ? 'Radar unavailable, retrying' : null);
    });
  }
}
const lastSeen = {};
for (const [id, feed] of Object.entries(feeds)) {
  feed.subscribe((s) => {
    // Only react when data or status actually changed, not on every loading flag.
    const key = `${s.status}|${s.updatedAt}|${s.error?.message ?? ''}`;
    if (lastSeen[id] === key) return;
    lastSeen[id] = key;
    onFeed(id);
  });
}

// ---------- Clock ----------
let countLast = 0;
setInterval(() => {
  tickTimes(document);
  renderLive();
}, 1000);
setInterval(() => {
  const now = new Date();
  computeAlerts(now);
  computeProjections(now);
  pushPathsToMap();
  if (derived.alerts.length !== countLast) {
    countLast = derived.alerts.length;
    pushAlertsToMap();
    renderNow();
    renderTop();
  }
}, 15_000);
setInterval(() => {
  renderBanners();
  renderTop();
  layersMenu.refresh();
  if (panel.tab === 'reports') pushReportsToMap();
}, 30_000);

// ---------- Boot ----------
applyTheme();
applyDataSaver();
renderTop();
renderNow();
renderLive();
for (const f of Object.values(feeds)) f.start();

store.subscribe((s, changed) => {
  if (changed.has('settings')) savePersisted(storage, KEYS.settings, s.settings);
  if (changed.has('layers')) {
    savePersisted(storage, KEYS.layers, s.layers);
    applyLayerVisibility();
    renderReports();
  }
  if (changed.has('filter')) {
    renderNow();
    renderTop();
  }
});

mapApi = createMap({
  container: $('#map'),
  theme: effectiveTheme(),
  onSelectAlert: (id) => selectAlert(id),
  onFeatureClick: onMapFeature,
});
$('#zoom-in').addEventListener('click', () => mapApi.map.zoomIn());
$('#zoom-out').addEventListener('click', () => mapApi.map.zoomOut());
mapApi.ready.then(() => {
  timeline = createTimeline($('#timeline'), mapApi.radar);
  applyLayerVisibility();
  for (const id of Object.keys(feeds)) onFeed(id);
  if (demo) {
    refreshDemoInfo();
    setInterval(refreshDemoInfo, 60_000);
    // Frame the recorded event once its warnings arrive.
    const frame = () => {
      let b = null;
      for (const a of snap('recent').data ?? []) {
        const g = geometryBounds(a.geometry);
        if (g) b = b ? [Math.min(b[0], g[0]), Math.min(b[1], g[1]), Math.max(b[2], g[2]), Math.max(b[3], g[3])] : g;
      }
      if (b) mapApi.fitBounds(b, panel.mapPadding(), 8.5);
      return Boolean(b);
    };
    if (!frame()) {
      const off = feeds.recent.subscribe(() => frame() && off());
    }
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Start the loop once the frames have had a moment to load.
    setTimeout(() => mapApi.radar.state.frames.length && mapApi.radar.play(), 2500);
  }
});

// Keyboard: space toggles the radar loop when focus is on the map.
$('#map').addEventListener('keydown', (e) => {
  if (e.key === ' ' && mapApi?.radar) {
    e.preventDefault();
    mapApi.radar.toggle();
  }
});

export { store, feeds, derived, mapApi };
