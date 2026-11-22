// Hook Echo: boot and wiring. Feeds fill the store; derived data (merged
// alerts, projected paths, trails) is recomputed when its inputs change and
// pushed to the map and the panel.

// First, so the developer console's log sees everything from the start.
import { devlog } from './dev/capture.js';
import { createStore, loadPersisted, savePersisted, safeLocalStorage } from './state/store.js';
import { Feed } from './data/http.js';
import { loadStormAlerts, loadLandAlerts, loadRecentWarnings, loadPointAlerts, mergeAlerts } from './data/alerts.js';
import { loadShapes } from './data/shapes.js';
import { loadRadar } from './data/radar.js';
import { loadReports } from './data/reports.js';
import { loadSurveys } from './data/surveys.js';
import { loadDay1, loadDays23, loadDays48 } from './data/spc.js';
import { loadTropical, loadDevelopment } from './data/tropical.js';
import { loadDiscussions, activeDiscussions } from './data/mcd.js';
import { loadForecast } from './data/points.js';
import { searchPlaces, reversePlace } from './data/geocode.js';
import { createDemo } from './data/demo.js';
import { REFRESH, STALE_MS } from './config.js';
import { projectMotion, nearestStorm } from './lib/paths.js';
import { buildTrails } from './lib/trails.js';
import { isInEffect, placeStatus } from './lib/status.js';
import { geometryBounds } from './lib/geo.js';
import { clock, relative } from './lib/format.js';
import { riskAt } from './lib/outlook.js';
import { headlineFor, coversByAlert, worstLevel, sortBySeverity } from './lib/people.js';
import { sanitizePlaces } from './lib/share.js';
import { splitTrips, localDate } from './lib/trips.js';
import { decideAlarms } from './lib/alarmRules.js';
import { allowedEvents } from './lib/alarmText.js';
import { explainFeature, explainPlace, rankHits, tapAction } from './lib/explain.js';
import { simulatedTornadoWarning } from './lib/sim.js';
import { statusReasons } from './lib/why.js';
import { createMap } from './map/map.js';
import { alertFeatures, pathFeatures, trailFeatures, reportFeatures, surveyFeatures, outlookFeatures, tropicalFeatures, discussionFeatures, developmentFeatures, circlePolygon } from './map/features.js';
import { createReports } from './ui/reports.js';
import { createMapTips } from './ui/mapTips.js';
import { confirmAction } from './ui/confirm.js';
import { createLayersMenu } from './ui/layersMenu.js';
import { createPeople, createPlaceEditor, createPlaceMarkers } from './ui/places.js';
import { createTrips } from './ui/trips.js';
import { createAlarm } from './ui/alarm.js';
import { createSettings } from './ui/settings.js';
import { sharePlaces, importFromHash } from './ui/shareFlow.js';
import { toast } from './ui/toasts.js';
import { createPanel } from './ui/panel.js';
import { createTimeline } from './ui/timeline.js';
import { COUNTS, countAlerts, renderSummary, renderHeadline } from './ui/summary.js';
import { createWarnings, endOf } from './ui/warnings.js';
import { createSources, feedState } from './ui/sources.js';
import { $, esc, icon, tickTimes, announce, rafThrottle } from './ui/dom.js';

// ---------- Persistent settings ----------
const storage = safeLocalStorage();
const KEYS = { settings: 'hook-echo:settings', layers: 'hook-echo:layers', places: 'hook-echo:places' };
const DEFAULT_SETTINGS = { theme: 'system', dataSaver: 'auto', meOn: false, chimes: true, headsUp: true, notifications: false, keepAwake: false };
const DEFAULT_LAYERS = {
  radar: true,
  warnings: true,
  watches: true,
  discussions: true,
  others: true,
  paths: true,
  pathsKind: 'all',
  trails: true,
  surveys: true,
  reports: true,
  outlook: false,
  outlookKind: 'cat',
  outlookDay: 1,
  tropical: true,
  development: true,
  places: true,
  reportTypes: ['tornado', 'funnel', 'hail', 'wind', 'flood'],
};

const store = createStore({
  settings: loadPersisted(storage, KEYS.settings, DEFAULT_SETTINGS),
  layers: loadPersisted(storage, KEYS.layers, DEFAULT_LAYERS),
  places: sanitizePlaces(loadPersisted(storage, KEYS.places, { list: [] }).list),
  me: { on: false, supported: 'geolocation' in navigator, position: null, error: null },
  selectedId: null,
  filter: null,
});

/** Created once the page is ready; null until then. */
let mapApi = null;
let timeline = null;
let tips = null;

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
  spc23: new Feed({ id: 'spc23', load: demo ? none({ day2: null, day2torn: null, day3: null }) : loadDays23, intervalMs: REFRESH.spcDays23.normal, staleMs: 3 * 60 * MIN }),
  spc48: new Feed({ id: 'spc48', load: demo ? none({}) : loadDays48, intervalMs: REFRESH.spcDays48.normal, staleMs: 8 * 60 * MIN }),
  discussions: new Feed({ id: 'discussions', load: demo ? none([]) : (signal) => loadDiscussions(signal), intervalMs: REFRESH.discussions.normal, saverIntervalMs: REFRESH.discussions.saver, staleMs: 20 * MIN }),
  tropical: new Feed({ id: 'tropical', load: demo ? none([]) : loadTropical, intervalMs: REFRESH.tropical.normal, staleMs: 60 * MIN }),
  development: new Feed({ id: 'development', load: demo ? none({ areas: [], points: [] }) : loadDevelopment, intervalMs: REFRESH.development.normal, staleMs: 3 * 60 * MIN }),
  // The NWS point check for every watched place, staggered to be gentle on the API.
  points: new Feed({
    id: 'points',
    load: demo
      ? none(new Map())
      : async (signal) => {
          const out = new Map();
          for (const p of watchedPlaces()) {
            try {
              out.set(p.id, await loadPointAlerts(p, signal));
            } catch (e) {
              if (e?.code === 'aborted') throw e;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          return out;
        },
    intervalMs: REFRESH.pointChecks.normal,
    staleMs: 20 * MIN,
  }),
};
addEventListener('hashchange', () => {
  // #dev opens the developer console and never leaves or enters the demo.
  if (location.hash === '#dev') return;
  if ((location.hash === '#demo') !== Boolean(demo)) location.reload();
});
const snap = (id) => feeds[id].snapshot;

// What every feed does goes to the developer console's log.
for (const [id, feed] of Object.entries(feeds)) {
  let started = 0;
  feed.subscribe((s) => {
    if (s.loading && !started) started = performance.now();
    if (s.loading || !started) return;
    const ms = Math.round(performance.now() - started);
    started = 0;
    if (s.status === 'error') devlog.push({ level: 'warn', source: id, message: `Failed after ${ms} ms: ${s.error?.message ?? 'unknown error'}${s.data ? ' (keeping the last good data)' : ''}` });
    else {
      const d = s.data;
      const n = Array.isArray(d) ? d.length : d instanceof Map ? d.size : d && typeof d === 'object' ? Object.values(d).filter((v) => v != null).length : null;
      devlog.push({ level: 'debug', source: id, message: `Updated in ${ms} ms${n != null ? `, ${n} item${n === 1 ? '' : 's'}` : ''}` });
    }
  });
}

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
const derived = { alerts: [], byId: new Map(), projections: new Map(), trails: [], people: [], meView: null };

/**
 * Simulated tornado warnings from the developer console. Memory only, so a
 * reload always ends them; each one is labeled "Simulated" wherever it shows.
 * @type {{alert: object, history: object[], placeName: string}[]}
 */
let simulations = [];
let simSeq = 0;

/** Every place being watched right now, Where I am included. */
function watchedPlaces() {
  const me = store.get().me;
  const mePlace = me.on && me.position ? [{ id: 'me', kind: 'me', name: 'Where I am', lat: me.position.lat, lon: me.position.lon }] : [];
  return [...mePlace, ...store.get().places];
}

function accuracyText(m) {
  if (!m) return '';
  return m < 1609 ? `Accurate to about ${Math.max(10, Math.round((m * 3.28084) / 10) * 10)} ft` : `Accurate to about ${Math.round(m / 1609)} mi`;
}

function computeStatuses(now = new Date()) {
  const s = snap('storm');
  const stale = Boolean(s.stale) || (s.status === 'error' && !s.data);
  const checking = s.status === 'idle';
  const ctx = { alerts: derived.alerts, shapes: snap('shapes').data ?? new Map(), projections: derived.projections, now, stale };
  const cat = snap('spc1').data?.cat ?? null;
  const view = (place) => {
    let status = placeStatus(place, { ...ctx, pointHits: snap('points').data?.get(place.id) });
    if (checking) status = { ...status, level: 'checking' };
    return { place, status, nearest: nearestStorm(place, derived.projections), risk: riskAt(place, cat) };
  };
  derived.people = store.get().places.map(view);
  const me = store.get().me;
  derived.meView = me.on && me.position ? view({ id: 'me', kind: 'me', name: 'Where I am', lat: me.position.lat, lon: me.position.lon, detail: accuracyText(me.position.accuracy) }) : null;
}

const everyone = () => [...(derived.meView ? [derived.meView] : []), ...derived.people];

function computeAlerts(now = new Date()) {
  simulations = simulations.filter((s) => isInEffect(s.alert, now));
  derived.alerts = [...mergeAlerts(snap('storm').data, snap('land').data), ...simulations.map((s) => s.alert)].filter((a) => isInEffect(a, now));
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
  const messages = [...(snap('recent').data ?? []), ...(snap('storm').data ?? []).filter((a) => a.vtec && a.motion), ...simulations.flatMap((s) => [...s.history, s.alert])];
  derived.trails = buildTrails(messages, now);
}

/** Everything that depends on the alert list, recomputed and redrawn. */
function refreshAlertsEverywhere() {
  const now = new Date();
  computeAlerts(now);
  computeProjections(now);
  computeTrails(now);
  pushAlertsToMap();
  pushPathsToMap();
  pushTrailsToMap();
  computeStatuses(now);
  runAlarms();
  renderPeople();
  renderNow();
  renderTop();
  renderBanners();
  const sel = store.get().selectedId;
  if (sel && !derived.byId.has(sel) && panel.isDetailOpen()) panel.closeDetail({ restoreFocus: false });
}

function simulate(placeId, opts = {}) {
  const view = everyone().find((p) => p.place.id === placeId);
  if (!view) throw new Error(`No watched place with id ${placeId}`);
  simSeq += 1;
  const sim = simulatedTornadoWarning(view.place, { ...opts, now: new Date(), seq: simSeq });
  simulations.push({ ...sim, placeName: view.place.name });
  devlog.push({ level: 'warn', source: 'sim', message: `Started a simulated tornado warning for ${view.place.name} (${sim.alert.id})` });
  refreshAlertsEverywhere();
  return sim.alert;
}

function endSimulations(id = null) {
  const before = simulations.length;
  simulations = id ? simulations.filter((s) => s.alert.id !== id) : [];
  if (simulations.length === before) return 0;
  devlog.push({ level: 'info', source: 'sim', message: id ? `Ended simulation ${id}` : 'Ended every simulation' });
  refreshAlertsEverywhere();
  return before - simulations.length;
}

// ---------- UI ----------
const panel = createPanel({
  onSheetChange: (s) => timeline?.setHidden(s === 'full'),
  onTabChange: (tab) => {
    if (tab === 'reports') renderReports();
    if (tab === 'people' || tab === 'trips') ensureForecasts();
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
    tips?.showCard([r.lon, r.lat], explainHits(rankHits([{ layer: 'reports', props: { id: r.id, type: r.type, label: r.label } }])));
  },
  onShowSurvey: (id) => {
    const s = (snap('surveys').data ?? []).find((x) => x.id === id);
    if (!s || !mapApi) return;
    const b = geometryBounds(s.geometry);
    mapApi.fitBounds(b, panel.mapPadding(), 12);
    const coords = s.geometry.type === 'LineString' ? s.geometry.coordinates : s.geometry.coordinates.flat();
    tips?.showCard(coords[Math.floor(coords.length / 2)], explainHits(rankHits([{ layer: 'survey-line', props: { id: s.id, ef: s.ef } }])));
  },
  onRetry: () => feeds.reports.refresh(),
});
const renderReports = rafThrottle(() => {
  reportsTab.render({ reports: snap('reports').data, reportFeed: snap('reports'), surveys: snap('surveys').data, surveyFeed: snap('surveys'), enabled: reportTypes(), now: new Date() });
});

// ---------- Storm risk forecast: which SPC day and map ----------
const weekdayShort = (d) => d.toLocaleDateString('en-US', { weekday: 'short' });

/** The SPC outlook chosen in the layers menu, and the feed it comes from. */
function outlookInfo() {
  const l = store.get().layers;
  const day = Math.min(8, Math.max(1, Math.round(Number(l.outlookDay) || 1)));
  const torn = l.outlookKind === 'torn';
  let outlook = null;
  let feedId = 'spc1';
  if (day === 1) outlook = torn ? snap('spc1').data?.torn : snap('spc1').data?.cat;
  else if (day <= 3) {
    feedId = 'spc23';
    const d = snap('spc23').data;
    outlook = day === 2 ? (torn ? d?.day2torn : d?.day2) : d?.day3;
  } else {
    feedId = 'spc48';
    outlook = snap('spc48').data?.[`day${day}`] ?? null;
  }
  // Day names come from the Day 1 outlook's date when it has loaded.
  const day1 = snap('spc1').data?.cat?.valid ?? new Date();
  const days = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ day: n, label: n === 1 ? 'Today' : n === 2 ? 'Tomorrow' : weekdayShort(new Date(day1.getTime() + (n - 1) * 864e5)) }));
  return { day, kind: day >= 3 ? (day === 3 ? 'cat' : 'prob') : torn ? 'torn' : 'cat', outlook: outlook ?? null, feedId, days };
}

const layersMenu = createLayersMenu({
  menu: $('#layers-menu'),
  button: $('#btn-layers'),
  getLayers: () => store.get().layers,
  setLayer,
  getFeed: (id) => snap(id),
  outlookInfo,
  extraNote: (key) => {
    if (key === 'tropical' && snap('tropical').status === 'ok' && !snap('tropical').data?.length) return 'No active storms in the Atlantic or Pacific';
    if (key === 'development' && snap('development').status === 'ok' && !snap('development').data?.areas.length && !snap('development').data?.points.length) return 'Nothing expected to form in the next 7 days';
    if (key === 'discussions' && snap('discussions').status === 'ok' && !activeDiscussions(snap('discussions').data ?? [], new Date()).length) return 'None right now. SPC posts these before most watches.';
    return null;
  },
});

// ---------- People: places, Where I am, forecasts ----------
const forecasts = new Map();
let forecastQueue = Promise.resolve();
function ensureForecasts() {
  for (const p of watchedPlaces()) {
    const f = forecasts.get(p.id);
    const near = f && Math.abs(f.lat - p.lat) < 0.05 && Math.abs(f.lon - p.lon) < 0.05;
    if (f?.pending || (near && Date.now() - f.at < 60 * MIN)) continue;
    forecasts.set(p.id, { ...(f ?? { periods: [] }), pending: true });
    forecastQueue = forecastQueue.then(async () => {
      try {
        const data = await loadForecast(p);
        forecasts.set(p.id, { ...data, at: Date.now(), lat: p.lat, lon: p.lon });
      } catch {
        // Try again in about ten minutes.
        forecasts.set(p.id, { periods: [], at: Date.now() - 50 * MIN, lat: p.lat, lon: p.lon });
      }
      renderPeople();
    });
  }
}

let placeMarkers = null;
let meMarker = null;
let pickResolve = null;

function pickOnMap() {
  return new Promise((resolve) => {
    pickResolve = resolve;
    const hint = $('#map-hint');
    hint.innerHTML = '<span>Tap the map where this place is.</span><button type="button" data-cancel-pick>Cancel</button>';
    hint.hidden = false;
    panel.setSheet('peek');
  });
}
function finishPick(lngLat) {
  const resolve = pickResolve;
  pickResolve = null;
  $('#map-hint').hidden = true;
  resolve?.(lngLat ? { lat: lngLat.lat, lon: lngLat.lng } : null);
}
$('#map-hint').addEventListener('click', (e) => e.target.closest('[data-cancel-pick]') && finishPick(null));

function locateOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition((pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 });
  });
}

const editor = createPlaceEditor({
  dialog: $('#place-dialog'),
  search: searchPlaces,
  reverse: (p) => reversePlace(p),
  locateOnce,
  pickOnMap,
  onSave: (place) => {
    const list = store.get().places;
    const exists = list.some((p) => p.id === place.id);
    store.set({ places: exists ? list.map((p) => (p.id === place.id ? place : p)) : [...list, place] });
    toast({ title: exists ? `Updated ${place.name}` : `Now watching ${place.name}`, tone: 'ok' });
  },
  onDelete: (id) => {
    const gone = store.get().places.find((p) => p.id === id);
    store.set({ places: store.get().places.filter((p) => p.id !== id) });
    toast({ title: `Stopped watching ${gone?.name ?? 'that place'}`, tone: 'info' });
  },
});

function showPlace(id) {
  const p = id === 'me' ? derived.meView?.place : store.get().places.find((x) => x.id === id);
  if (p) mapApi?.flyTo([p.lon, p.lat], 9, panel.mapPadding());
}

function focusPlace(id) {
  const p = store.get().places.find((x) => x.id === id);
  panel.selectTab(p?.kind === 'trip' ? 'trips' : 'people');
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-place="${CSS.escape(id)}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    card.classList.remove('is-flash');
    void card.offsetWidth;
    card.classList.add('is-flash');
    card.focus({ preventScroll: true });
  });
}

const peopleTab = createPeople({
  el: $('#view-people'),
  onAdd: () => editor.open(null, { kind: 'family' }),
  onEdit: (id) => {
    const p = store.get().places.find((x) => x.id === id);
    if (p) editor.open(p);
  },
  onShow: showPlace,
  onMe: (on) => (on ? startMe() : stopMe()),
  onShare: () => sharePlaces(store.get().places),
});

const tripsTab = createTrips({
  el: $('#view-trips'),
  onAdd: () => editor.open(null, { kind: 'trip' }),
  onEdit: (id) => {
    const p = store.get().places.find((x) => x.id === id);
    if (p) editor.open(p);
  },
  onShow: showPlace,
});

const renderTrips = rafThrottle(() => {
  const today = localDate();
  const { upcoming, past } = splitTrips(store.get().places, today);
  tripsTab.render({
    upcoming,
    past,
    views: new Map(derived.people.map((p) => [p.place.id, p])),
    outlooks: [snap('spc1').data?.cat, snap('spc23').data?.day2, snap('spc23').data?.day3],
    forecasts,
    today,
    full: store.get().places.length >= 25,
  });
  const soon = upcoming.filter((s) => s.from <= today).length;
  $('#tab-trips').innerHTML = `Trips${soon ? `<span class="tab-badge" aria-label="${soon} today">${soon}</span>` : ''}`;
});

const renderPeople = rafThrottle(() => {
  renderTrips();
  const outlookLoaded = snap('spc1').status === 'ok' && Boolean(snap('spc1').data?.cat);
  peopleTab.render({
    people: sortBySeverity(derived.people.filter((p) => p.place.kind !== 'trip')),
    meView: derived.meView,
    me: store.get().me,
    forecasts,
    outlookLoaded,
    now: new Date(),
    count: store.get().places.length,
  });
  placeMarkers?.set(store.get().layers.places ? derived.people : []);
  const { level, count } = worstLevel(everyone().map((p) => p.status));
  $('#tab-people').innerHTML = `People${count ? `<span class="tab-badge is-${level === 'shelter' ? 'shelter' : 'warning'}" aria-label="${count} in danger">${count}</span>` : ''}`;
});

let watchId = null;
function startMe() {
  if (!navigator.geolocation) return;
  store.set({ me: { ...store.get().me, on: true, error: null }, settings: { ...store.get().settings, meOn: true } });
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const first = !store.get().me.position;
      const position = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
      store.set({ me: { ...store.get().me, position, error: null } });
      if (first) {
        mapApi?.flyTo([position.lon, position.lat], 8.5, panel.mapPadding());
        feeds.points.refresh();
      }
    },
    (err) => {
      if (err.code === 1) {
        stopMe();
        store.set({ me: { ...store.get().me, error: 'denied' } });
      } else store.set({ me: { ...store.get().me, error: 'unavailable' } });
    },
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
  );
}
function stopMe() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  store.set({ me: { ...store.get().me, on: false, position: null, error: null }, settings: { ...store.get().settings, meOn: false } });
}

function updateMeOnMap() {
  const me = store.get().me;
  $('#btn-locate').setAttribute('aria-pressed', String(me.on));
  $('#btn-locate').classList.toggle('is-busy', me.on && !me.position && !me.error);
  if (!mapApi) return;
  if (me.on && me.position) {
    const at = [me.position.lon, me.position.lat];
    if (!meMarker) {
      const el = document.createElement('div');
      el.className = 'me-marker';
      el.setAttribute('aria-label', 'Where I am');
      tips?.attach(el, () => (derived.meView ? explainPlace(derived.meView) : null));
      meMarker = mapApi.marker(el, at);
    } else meMarker.setLngLat(at);
    mapApi.setData('me-acc', me.position.accuracy > 60 ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: circlePolygon(me.position, me.position.accuracy / 1000), properties: { id: 'me' } }] } : null);
  } else {
    meMarker?.remove();
    meMarker = null;
    mapApi.setData('me-acc', null);
  }
}

$('#btn-locate').addEventListener('click', () => {
  const me = store.get().me;
  if (!me.on) startMe();
  else if (me.position) mapApi?.flyTo([me.position.lon, me.position.lat], 9, panel.mapPadding());
});

// ---------- Alarms ----------
const alarm = createAlarm({ dialog: $('#takeover'), onShowOnMap: (id) => selectAlert(id, { fit: true }), demo: Boolean(demo) });
let sessionStore = null;
try {
  sessionStore = globalThis.sessionStorage;
} catch {
  sessionStore = null;
}
// The demo keeps its own alarm memory for the session, so a replay never silences a real alarm.
const memoryStore = demo ? sessionStore : storage;
const MEMORY_KEY = demo ? 'hook-echo:alarm-memory-demo' : 'hook-echo:alarm-memory';
let alarmMemory = loadPersisted(memoryStore, MEMORY_KEY, {});

function runAlarms() {
  if (snap('storm').status === 'idle') return;
  const people = everyone();
  const statuses = Object.fromEntries(people.map((p) => [p.place.id, p.status]));
  const { events, memory } = decideAlarms(alarmMemory, statuses, derived.alerts);
  alarmMemory = memory;
  savePersisted(memoryStore, MEMORY_KEY, memory);
  const placeById = new Map(people.map((p) => [p.place.id, p.place]));
  const allowed = allowedEvents(
    events.map((e) => ({ ...e, place: placeById.get(e.placeId) })),
    store.get().settings,
  );
  if (allowed.length) alarm.trigger(allowed);
}

// Any click or key press counts as the gesture browsers require before sound.
const unlockSound = () => {
  if (!alarm.unlocked() && alarm.unlock()) renderBanners();
};
document.addEventListener('click', unlockSound, { capture: true });
document.addEventListener('keydown', unlockSound, { capture: true });

// ---------- Settings ----------
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
addEventListener('appinstalled', () => {
  installPrompt = null;
  toast({ title: 'Hook Echo is installed', text: 'Open it from your home screen or app list.', tone: 'ok' });
});
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let wakeLock = null;
async function applyWakeLock() {
  const want = store.get().settings.keepAwake && document.visibilityState === 'visible';
  if (want && !wakeLock && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  } else if (!want && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', applyWakeLock);

function setSetting(key, value) {
  store.set({ settings: { ...store.get().settings, [key]: value } });
  if (key === 'theme') applyTheme();
  if (key === 'dataSaver') applyDataSaver();
  if (key === 'keepAwake') applyWakeLock();
}

const settingsDialog = createSettings({
  dialog: $('#settings-dialog'),
  getSettings: () => store.get().settings,
  setSetting,
  alarm,
  onOpenSources: () => sources.open(),
  getInstall: () => installPrompt,
  isStandalone,
  isDev: () => devOn(),
  onOpenDev: () => openDev(),
});
$('#open-settings').addEventListener('click', () => settingsDialog.open());

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
    covers: coversByAlert(everyone()),
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
  return headlineFor({ people: everyone(), tornadoes: derived.alerts.filter((a) => a.event === 'Tornado Warning'), lastTornado: lastTornado(), now: new Date() });
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
    html.push(`<div class="banner is-demo" role="status" title="Times are shifted so the event plays as if it were happening now.">${icon('info')}<span><strong>Demo replay:</strong> ${esc(demoInfo.label)}.${demoInfo.finished ? ' The replay has finished.' : ''}</span>
      <span class="banner-actions">${demoInfo.finished ? '<button class="btn btn-small" type="button" data-demo-restart>Restart</button>' : ''}<button class="btn btn-small" type="button" data-demo-leave>Leave demo</button></span></div>`);
  }
  if (simulations.length) {
    const who = [...new Set(simulations.map((s) => s.placeName))];
    html.push(`<div class="banner is-sim" role="status">${icon('alert')}<span><strong>Simulation running.</strong> A test tornado warning for ${esc(who.join(', '))}. No real warning is in effect.</span>
      <span class="banner-actions"><button class="btn btn-small" type="button" data-sim-end>End ${simulations.length > 1 ? 'simulations' : 'simulation'}</button></span></div>`);
  }
  if (watchedPlaces().length && !alarm.unlocked()) {
    html.push(`<div class="banner is-warning" role="status">${icon('sound')}<span><strong>Alarm sound is off.</strong> Browsers keep sound off until you tap the page.</span>
      <span class="banner-actions"><button class="btn btn-small" type="button" data-sound-on>Turn on sound</button></span></div>`);
  }
  if (!navigator.onLine) {
    html.push(`<div class="banner is-error" role="status">${icon('offline')}<span><strong>You're offline.</strong> Showing the last data received${snap('storm').updatedAt ? `, from ${esc(clock(new Date(snap('storm').updatedAt)))}` : ''}.</span></div>`);
  } else if (snap('storm').stale && snap('storm').data) {
    html.push(`<div class="banner is-warning" role="status">${icon('alert')}<span><strong>Warnings may be out of date.</strong> Last update ${esc(relative(new Date(snap('storm').updatedAt), new Date()))}. Retrying.</span></div>`);
  }
  $('#banners').innerHTML = html.join('');
}
$('#banners').addEventListener('click', (e) => {
  if (e.target.closest('[data-sound-on]')) {
    alarm.unlock();
    alarm.chime();
    renderBanners();
    toast({ title: 'Alarm sound is on', text: 'Keep your volume up on storm nights.', tone: 'ok' });
  }
  if (e.target.closest('[data-demo-leave]')) {
    demo?.restart();
    history.replaceState(null, '', location.pathname + location.search);
    location.reload();
  }
  if (e.target.closest('[data-demo-restart]')) {
    demo?.restart();
    location.reload();
  }
  if (e.target.closest('[data-sim-end]')) {
    endSimulations();
    toast({ title: 'Simulation ended', tone: 'ok' });
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

/** Tornado-warned storms always get paths and trails; severe thunderstorms too unless the menu says tornadoes only. */
const allStorms = () => store.get().layers.pathsKind !== 'tor';

function pushPathsToMap() {
  if (!mapApi) return;
  const selected = store.get().selectedId;
  const all = allStorms();
  const shown = new Map(
    [...derived.projections].filter(([id]) => {
      const event = derived.byId.get(id)?.event;
      return event === 'Tornado Warning' || (all && event === 'Severe Thunderstorm Warning') || id === selected;
    }),
  );
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
  const all = allStorms();
  const shown = derived.trails.filter((t) => t.phenomena === 'TO' || (all && t.phenomena === 'SV') || (sel?.vtec && t.keys.includes(sel.vtec.key)));
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
  mapApi.setData('spc', outlookFeatures(outlookInfo().outlook));
}

function pushDiscussionsToMap() {
  if (!mapApi) return;
  mapApi.setData('mcd', discussionFeatures(activeDiscussions(snap('discussions').data ?? [], new Date())));
}

function pushDevelopmentToMap() {
  if (!mapApi) return;
  const f = developmentFeatures(snap('development').data);
  mapApi.setData('dev-areas', f.areas);
  mapApi.setData('dev-points', f.points);
}

function pushTropicalToMap() {
  if (!mapApi) return;
  const f = tropicalFeatures(snap('tropical').data ?? []);
  mapApi.setData('trop-cones', f.cones);
  mapApi.setData('trop-past', f.past);
  mapApi.setData('trop-tracks', f.tracks);
  mapApi.setData('trop-points', f.points);
}

// ---------- What is on the map: hover tooltips and tap cards ----------
/** The alert, report, storm or discussion a map feature belongs to. */
function contextFor(hit, now) {
  const p = hit.props;
  const ctx = { now };
  switch (hit.kind) {
    case 'alert':
    case 'path':
    case 'cone':
    case 'tick':
    case 'path-end':
    case 'storm-now':
      ctx.alert = derived.byId.get(String(p.id));
      break;
    case 'trail':
    case 'trail-dot':
      ctx.alert = derived.byId.get(String(p.alertId));
      break;
    case 'report':
      ctx.report = (snap('reports').data ?? []).find((r) => r.id === String(p.id));
      break;
    case 'survey':
      ctx.survey = (snap('surveys').data ?? []).find((s) => s.id === String(p.id));
      break;
    case 'mcd':
      ctx.discussion = (snap('discussions').data ?? []).find((d) => d.id === String(p.id));
      break;
    case 'trop-cone':
    case 'trop-track':
    case 'trop-past':
    case 'trop-point':
      ctx.storm = (snap('tropical').data ?? []).find((s) => s.id === String(p.storm ?? p.id));
      if (hit.kind === 'trop-point') ctx.point = ctx.storm?.points.find((x) => x.tau === p.tau);
      break;
    default:
      break;
  }
  return ctx;
}

function explainHits(ranked) {
  const now = new Date();
  return ranked.map((h) => explainFeature(h.layer, h.props, contextFor(h, now))).filter(Boolean);
}

function onMapHover(hits, point) {
  if (!tips) return;
  if (!hits || pickResolve) return tips.hover(null);
  const ranked = rankHits(hits);
  const explained = explainHits(ranked.slice(0, 3));
  if (!explained.length) return tips.hover(null);
  const action = tapAction(ranked);
  const main = explained[0];
  const hint = action?.type === 'select' ? 'Click to open the warning' : main.actions.length || main.details.length || explained.length > 1 ? 'Click for more' : '';
  tips.hover(point, explained, hint);
}

function onMapTap(hits, lngLat) {
  if (pickResolve) return finishPick(lngLat);
  const ranked = rankHits(hits);
  const action = tapAction(ranked);
  if (!action) return tips?.closeCard();
  if (action.type === 'select') {
    tips?.closeCard();
    return selectAlert(action.id);
  }
  tips?.showCard(lngLat, explainHits(action.hits.slice(0, 4)));
}

function applyLayerVisibility() {
  if (!mapApi) return;
  const l = store.get().layers;
  pushOutlookToMap();
  pushReportsToMap();
  pushPathsToMap();
  pushTrailsToMap();
  layersMenu.refresh();
  for (const g of ['warnings', 'watches', 'discussions', 'others', 'paths', 'trails', 'surveys', 'reports', 'outlook', 'tropical', 'development']) mapApi.setGroupVisible(g, Boolean(l[g]));
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
  const people = everyone();
  const headsUps = people.filter((p) => p.status.headsUp?.alertId === id).map((p) => ({ name: p.place.name, eta: p.status.headsUp.eta }));
  panel.showDetail(warnings.detailHtml(a, { projection: derived.projections.get(id), headsUps, covers: coversByAlert(people).get(id) ?? [], now: new Date() }), {
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
  if (id === 'spc1' || id === 'spc23' || id === 'spc48') pushOutlookToMap();
  if (id === 'discussions') pushDiscussionsToMap();
  if (id === 'development') pushDevelopmentToMap();
  if (id === 'tropical') pushTropicalToMap();
  if (['storm', 'land', 'shapes', 'points', 'spc1', 'spc23'].includes(id)) {
    computeStatuses(now);
    runAlarms();
    renderPeople();
    renderNow();
    renderTop();
  }
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
  computeStatuses(now);
  runAlarms();
  renderPeople();
  renderTop();
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
  pushDiscussionsToMap();
  if (panel.tab === 'reports') pushReportsToMap();
}, 30_000);

// ---------- Developer console ----------
// Hidden until #dev turns developer mode on. The console's code loads only when it opens.
const DEV_KEY = 'hook-echo:dev';
const devOn = () => {
  try {
    return storage?.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
};
/** Feature counts last drawn per map source, for the console's Map tab. */
const mapCounts = {};
let devModule = null;
const devConsole = async () => (devModule ??= await import('./dev/console.js'));

function itemCount(data) {
  if (Array.isArray(data)) return data.length;
  if (data instanceof Map) return data.size;
  if (data && typeof data === 'object') return Object.values(data).filter((v) => v != null).length;
  return null;
}

const devApi = {
  devlog,
  feeds,
  store,
  derived,
  demo: Boolean(demo),
  get mapApi() {
    return mapApi;
  },
  async version() {
    try {
      return (await (await fetch('precache.json', { cache: 'no-store' })).json()).version ?? '';
    } catch {
      return '';
    }
  },
  everyone,
  reasons(placeId) {
    const view = everyone().find((p) => p.place.id === placeId);
    if (!view) return null;
    const s = snap('storm');
    return statusReasons(view.place, {
      alerts: derived.alerts,
      shapes: snap('shapes').data ?? new Map(),
      pointHits: snap('points').data?.get(view.place.id),
      projections: derived.projections,
      now: new Date(),
      stale: Boolean(s.stale) || (s.status === 'error' && !s.data),
      feedAgeMs: s.updatedAt ? Date.now() - s.updatedAt : null,
    });
  },
  alarmMemory: () => alarmMemory,
  resetAlarmMemory() {
    alarmMemory = {};
    savePersisted(memoryStore, MEMORY_KEY, alarmMemory);
    devlog.push({ level: 'warn', source: 'alarms', message: 'Alarm memory reset' });
    runAlarms();
  },
  simulate,
  endSimulations,
  simulations: () => simulations.slice(),
  selectAlert: (id) => selectAlert(id, { fit: true }),
  showPlace,
  shapeFor: (id) => snap('shapes').data?.get(id) ?? null,
  testAlarm: () => alarm.test(),
  mapCounts: () => ({ ...mapCounts }),
  exportState() {
    const s = store.get();
    return {
      app: 'Hook Echo',
      exportedAt: new Date().toISOString(),
      demo: Boolean(demo),
      online: navigator.onLine,
      userAgent: navigator.userAgent,
      settings: s.settings,
      layers: s.layers,
      places: s.places,
      whereIAm: { on: s.me.on, located: Boolean(s.me.position) },
      feeds: Object.fromEntries(
        Object.entries(feeds).map(([id, f]) => {
          const x = f.snapshot;
          return [id, { status: x.status, stale: x.stale, updatedAt: x.updatedAt ? new Date(x.updatedAt).toISOString() : null, error: x.error?.message ?? null, items: itemCount(x.data) }];
        }),
      ),
      alerts: derived.alerts.map((a) => ({ id: a.id, event: a.event, vtec: a.vtec?.key ?? null, expires: a.expires?.toISOString() ?? null, simulated: Boolean(a.simulated) })),
      alarmMemory,
    };
  },
  async clearOfflineFiles() {
    try {
      for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
    } catch {
      // No service worker to remove.
    }
    try {
      for (const k of await caches.keys()) await caches.delete(k);
    } catch {
      // Cache storage unavailable.
    }
    location.reload();
  },
  disable() {
    try {
      storage?.removeItem(DEV_KEY);
    } catch {
      // Storage blocked: developer mode ends with this page.
    }
    delete globalThis.hook;
    toast({ title: 'Developer mode is off', text: 'Open #dev to turn it back on.', tone: 'info' });
  },
  confirm: confirmAction,
  toast,
};

/** What the command line can reach as `hook`. */
devApi.hook = Object.freeze({
  help: () => ({
    'hook.alerts()': 'alerts in effect, simulations included',
    'hook.places()': 'watched places and their status',
    'hook.simulate(placeId, {minutes, dirFrom, speedKt})': 'start a simulated tornado warning',
    'hook.endSimulations()': 'end every simulation',
    'hook.refresh(feedId)': 'reload one feed, or all with no id',
    'hook.explain(layerId, props)': 'the explanation a map feature would show',
    'hook.store / hook.feeds / hook.derived': 'app state, feeds and computed data',
    'hook.map / hook.mapApi': 'the MapLibre map and Hook Echo’s map helpers',
    'hook.log': 'this console’s log',
  }),
  store,
  feeds,
  derived,
  log: devlog,
  get map() {
    return mapApi?.map;
  },
  get mapApi() {
    return mapApi;
  },
  alerts: () => derived.alerts,
  places: () => everyone().map((v) => ({ id: v.place.id, name: v.place.name, kind: v.place.kind, level: v.status.level })),
  simulate: (placeId = everyone()[0]?.place.id, opts) => simulate(placeId, opts),
  endSimulations,
  refresh: (id) => (id ? feeds[id]?.refresh() : Promise.all(Object.values(feeds).map((f) => f.refresh()))),
  explain: (layer, props = {}) => explainFeature(layer, props, { now: new Date() }),
});

async function openDev() {
  try {
    storage?.setItem(DEV_KEY, '1');
  } catch {
    // Blocked storage: developer mode lasts for this page only.
  }
  try {
    await (await devConsole()).openConsole(devApi);
  } catch (e) {
    console.error('The developer console failed to open:', e);
    toast({ title: 'The developer console didn’t open', text: 'Reload the page and try again.', tone: 'warning' });
  }
}

/** #dev turns developer mode on and opens the console, then leaves the address as it was. */
function checkDevHash() {
  if (location.hash !== '#dev') return;
  history.replaceState(null, '', location.pathname + location.search + (demo ? '#demo' : ''));
  openDev();
}
addEventListener('hashchange', checkDevHash);

// The ` key opens and closes the console once developer mode is on.
document.addEventListener('keydown', (e) => {
  if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey || !devOn()) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  e.preventDefault();
  devConsole()
    .then((m) => m.toggleConsole(devApi))
    .catch((err) => console.error('The developer console failed to load:', err));
});

// ---------- Boot ----------
applyTheme();
applyDataSaver();
applyWakeLock();
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
  if (changed.has('places')) {
    savePersisted(storage, KEYS.places, { list: s.places });
    feeds.points.refresh();
    ensureForecasts();
  }
  if (changed.has('places') || changed.has('me')) {
    computeStatuses();
    runAlarms();
    renderBanners();
    renderPeople();
    renderNow();
    renderTop();
    updateMeOnMap();
  }
  if (changed.has('layers')) renderPeople();
});

addEventListener('hashchange', () => {
  if (location.hash.startsWith('#import=')) runImport();
});
async function runImport() {
  const adding = await importFromHash(store.get().places);
  if (adding.length) {
    store.set({ places: [...store.get().places, ...adding] });
    toast({ title: `Added ${adding.length} place${adding.length === 1 ? '' : 's'}`, text: 'Hook Echo is watching them now.', tone: 'ok' });
    panel.selectTab('people');
  }
}
runImport();

// Resume Where I am only when location is already allowed, so loading the page never prompts.
if (store.get().settings.meOn && navigator.geolocation && !demo) {
  navigator.permissions
    ?.query({ name: 'geolocation' })
    .then((p) => p.state === 'granted' && startMe())
    .catch(() => {});
}
updateMeOnMap();

mapApi = createMap({
  container: $('#map'),
  theme: effectiveTheme(),
  onHover: onMapHover,
  onTap: onMapTap,
  onPick: async (lngLat) => {
    if (pickResolve) return finishPick(lngLat);
    if (store.get().places.length >= 25) return toast({ title: 'You already watch 25 places', text: 'Remove one to add another.', tone: 'warning' });
    const p = { lat: lngLat.lat, lon: lngLat.lng };
    const r = await reversePlace(p);
    editor.open({ kind: 'family', name: r.name, lat: p.lat, lon: p.lon, detail: r.name ? `${r.name}${r.detail ? `, ${r.detail}` : ''}` : r.detail }, { keepDraft: true });
  },
});
{
  // Count what each overlay draws, for the developer console.
  const draw = mapApi.setData;
  mapApi.setData = (id, fc) => {
    mapCounts[id] = fc?.features?.length ?? 0;
    return draw(id, fc);
  };
}
tips = createMapTips({ host: $('.map-chrome'), mapApi, onOpenAlert: (id) => selectAlert(id, { fit: true }) });
checkDevHash();
$('#zoom-in').addEventListener('click', () => mapApi.map.zoomIn());
$('#zoom-out').addEventListener('click', () => mapApi.map.zoomOut());
mapApi.ready.then(() => {
  timeline = createTimeline($('#timeline'), mapApi.radar);
  placeMarkers = createPlaceMarkers(mapApi, focusPlace, { attach: (el, current) => tips.attach(el, () => (current() ? explainPlace(current()) : null)) });
  updateMeOnMap();
  renderPeople();
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

// Installable app: the service worker keeps the app shell available offline.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'select-alert' && e.data.id) selectAlert(e.data.id, { fit: true });
  });
}

// Keyboard: space toggles the radar loop when focus is on the map.
$('#map').addEventListener('keydown', (e) => {
  if (e.key === ' ' && mapApi?.radar) {
    e.preventDefault();
    mapApi.radar.toggle();
  }
});

export { store, feeds, derived, mapApi };
