// The developer console: every feed's health, the raw alerts, why each place
// has its status, map internals, a live log, tools to simulate a warning or
// reset state, and a JavaScript command line. It loads only when opened
// (#dev, the ` key once developer mode is on, or Settings), and works on a
// phone as a bottom sheet.

import { esc, icon, statusChip } from '../ui/dom.js';
import { FEED_INFO, feedState, feedNote } from '../ui/sources.js';
import { inspect } from '../lib/inspect.js';
import { relative, duration, areaSummary, motionShort } from '../lib/format.js';
import { GROUPS } from '../map/layers.js';

const TABS = [
  ['log', 'Log'],
  ['feeds', 'Feeds'],
  ['alerts', 'Alerts'],
  ['places', 'Places'],
  ['map', 'Map'],
  ['tools', 'Tools'],
];
const LOG_FILTERS = [
  ['', 'All'],
  ['error', 'Errors'],
  ['warn', 'Warnings'],
  ['info', 'Info'],
  ['debug', 'Feeds'],
  ['result', 'Results'],
];
const DIRECTIONS = [['225', 'Southwest'], ['270', 'West'], ['315', 'Northwest'], ['180', 'South'], ['0', 'North'], ['135', 'Southeast'], ['90', 'East'], ['45', 'Northeast']];
const MPH_TO_KT = 0.868976;

let root = null;
let body = null;
let api = null;
let tab = 'log';
let ticker = 0;
let unsubscribe = null;
let opener = null;
let stylesReady = null;
const ui = { logLevel: '', logText: '', alertText: '', openAlert: null, history: [], historyAt: -1, build: '' };

const time = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour12: false });
const fine = () => globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

function loadStyles() {
  stylesReady ??= new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/devconsole.css';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
  return stylesReady;
}

function build() {
  root = document.createElement('section');
  root.className = 'devcon';
  root.id = 'devcon';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-labelledby', 'devcon-title');
  root.innerHTML = `<header class="devcon-head">
      <h2 id="devcon-title">Developer console</h2>
      <span class="devcon-build" data-build></span>
      <button class="icon-btn" type="button" data-dev-close aria-label="Close the developer console">${icon('close')}</button>
    </header>
    <nav class="devcon-tabs" role="tablist" aria-label="Console sections">${TABS.map(([id, label]) => `<button class="devcon-tab" type="button" role="tab" id="devtab-${id}" data-tab="${id}" aria-controls="devcon-body">${label}<span class="devcon-count" data-count="${id}"></span></button>`).join('')}</nav>
    <div class="devcon-body" id="devcon-body" role="tabpanel" tabindex="0"></div>
    <form class="devcon-cmd" autocomplete="off">
      <label class="sr-only" for="devcon-input">Run JavaScript</label>
      <span class="devcon-prompt" aria-hidden="true">›</span>
      <input id="devcon-input" class="devcon-input" type="text" spellcheck="false" autocapitalize="off" autocorrect="off" enterkeyhint="go" placeholder="hook.help()">
      <button class="btn btn-small" type="submit">Run</button>
    </form>
    <p class="devcon-warn">Code runs on this device only. Run only code you understand: it can read your saved places.</p>`;
  document.body.append(root);
  body = root.querySelector('.devcon-body');

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.querySelector('.devcon-cmd').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('#devcon-input');
    const code = input.value.trim();
    if (!code) return;
    ui.history.push(code);
    ui.history = ui.history.slice(-50);
    ui.historyAt = -1;
    input.value = '';
    runCommand(code);
  });
  root.querySelector('#devcon-input').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!ui.history.length) return;
    e.preventDefault();
    if (ui.historyAt < 0) ui.historyAt = ui.history.length;
    ui.historyAt = Math.max(0, Math.min(ui.history.length, ui.historyAt + (e.key === 'ArrowUp' ? -1 : 1)));
    e.target.value = ui.history[ui.historyAt] ?? '';
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      e.stopPropagation();
      closeConsole();
    }
  });
}

/** Opens the console. `a` is the app's debug API from main.js. */
export async function openConsole(a) {
  api = a;
  globalThis.hook = a.hook;
  await loadStyles();
  if (!root) build();
  opener = document.activeElement instanceof HTMLElement && !root.contains(document.activeElement) ? document.activeElement : null;
  root.hidden = false;
  document.documentElement.classList.add('has-devcon');
  render();
  a.version().then((v) => {
    ui.build = v;
    const el = root.querySelector('[data-build]');
    if (el) el.textContent = v ? `Build ${v.slice(0, 7)}` : 'Build unknown';
  });
  unsubscribe?.();
  unsubscribe = a.devlog.subscribe(onLogEntry);
  clearInterval(ticker);
  ticker = setInterval(tick, 1000);
  (fine() ? root.querySelector('#devcon-input') : root.querySelector(`#devtab-${tab}`))?.focus({ preventScroll: true });
  if (!a.devlog.list({ source: 'console' }).some((e) => e.level === 'input')) {
    a.devlog.push({ level: 'info', source: 'console', message: 'Type JavaScript below. hook.help() lists what you can reach.' });
  }
}

export function closeConsole() {
  if (!root || root.hidden) return;
  root.hidden = true;
  document.documentElement.classList.remove('has-devcon');
  clearInterval(ticker);
  unsubscribe?.();
  unsubscribe = null;
  opener?.focus?.({ preventScroll: true });
}

export const isOpen = () => Boolean(root && !root.hidden);

export function toggleConsole(a) {
  if (isOpen()) closeConsole();
  else openConsole(a);
}

// ---------- Rendering ----------

function render() {
  for (const b of root.querySelectorAll('[data-tab]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  body.setAttribute('aria-labelledby', `devtab-${tab}`);
  body.innerHTML = { log: logTab, feeds: feedsTab, alerts: alertsTab, places: placesTab, map: mapTab, tools: toolsTab }[tab]();
  if (tab === 'log') {
    renderLogList();
    scrollLogToEnd();
  }
  if (tab === 'alerts') renderAlertList();
  updateCounts();
}

function updateCounts() {
  const c = api.devlog.counts();
  const set = (id, n, cls = '') => {
    const el = root.querySelector(`[data-count="${id}"]`);
    if (!el) return;
    el.textContent = n ? String(n) : '';
    el.className = `devcon-count${cls ? ` ${cls}` : ''}`;
  };
  set('log', c.error || c.warn, c.error ? 'is-error' : c.warn ? 'is-warn' : '');
  const failing = Object.values(api.feeds).filter((f) => f.snapshot.status === 'error').length;
  set('feeds', failing, failing ? 'is-warn' : '');
  set('alerts', api.derived.alerts.length);
}

/** Re-renders live tabs once a second, unless someone is using a control in them. */
function tick() {
  updateCounts();
  if (body.contains(document.activeElement) && document.activeElement !== body) return;
  if (tab === 'feeds' || tab === 'map') render();
}

function onLogEntry(e) {
  updateCounts();
  if (tab !== 'log' || !matchesLog(e)) return;
  const list = body.querySelector('[data-log-list]');
  if (!list) return;
  const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.querySelector('.devcon-empty')?.remove();
  list.insertAdjacentHTML('beforeend', logRow(e));
  while (list.children.length > 400) list.firstElementChild.remove();
  if (atEnd) list.scrollTop = list.scrollHeight;
}

const matchesLog = (e) => (!ui.logLevel || e.level === ui.logLevel || (ui.logLevel === 'result' && e.level === 'input')) && (!ui.logText || `${e.source} ${e.message}`.toLowerCase().includes(ui.logText.toLowerCase()));

function logRow(e) {
  const mark = e.level === 'input' ? '› ' : e.level === 'result' ? '‹ ' : '';
  return `<div class="devlog-row is-${e.level}"><time>${time(e.time)}</time><span class="devlog-src">${esc(e.source)}</span><pre class="devlog-msg">${esc(mark + e.message)}</pre></div>`;
}

function logTab() {
  const c = api.devlog.counts();
  const n = { '': null, error: c.error, warn: c.warn, info: c.info, debug: c.debug, result: c.result + c.input };
  return `<div class="devcon-toolbar">
      <div class="segmented devcon-seg" role="radiogroup" aria-label="Show">${LOG_FILTERS.map(([v, label]) => `<button type="button" role="radio" data-log-level="${v}" aria-checked="${ui.logLevel === v}">${label}${n[v] ? ` ${n[v]}` : ''}</button>`).join('')}</div>
      <div class="devcon-row-tools">
        <input class="input devcon-search" type="search" data-log-text value="${esc(ui.logText)}" placeholder="Filter the log" aria-label="Filter the log">
        <button class="btn btn-small" type="button" data-log-copy>Copy</button>
        <button class="btn btn-small btn-ghost" type="button" data-log-clear>Clear</button>
      </div>
    </div>
    <div class="devlog" data-log-list aria-live="off"></div>`;
}

function renderLogList() {
  const list = body.querySelector('[data-log-list]');
  const entries = api.devlog.list().filter(matchesLog).slice(-400);
  list.innerHTML = entries.length ? entries.map(logRow).join('') : `<p class="devcon-empty">${ui.logLevel || ui.logText ? 'Nothing matches this filter.' : 'Nothing logged yet.'}</p>`;
}

function scrollLogToEnd() {
  const list = body.querySelector('[data-log-list]');
  if (list) list.scrollTop = list.scrollHeight;
}

function countOf(data) {
  if (Array.isArray(data)) return data.length;
  if (data instanceof Map) return data.size;
  if (data && typeof data === 'object') return Object.values(data).filter((v) => v != null).length;
  return null;
}

function feedsTab() {
  const entries = Object.entries(api.feeds);
  const live = entries.filter(([, f]) => feedState(f.snapshot) === 'live').length;
  const now = Date.now();
  return `<div class="devcon-toolbar"><p class="devcon-summary"><strong>${live} of ${entries.length}</strong> feeds live${api.demo ? ', demo replay' : ''}${navigator.onLine ? '' : ', offline'}</p>
      <button class="btn btn-small" type="button" data-refresh-all>${icon('refresh')}Refresh all</button></div>
    <div class="devcon-list">${entries
      .map(([id, f]) => {
        const s = f.snapshot;
        const info = FEED_INFO[id] ?? { name: id, by: '' };
        const n = countOf(s.data);
        return `<div class="devfeed">
          <span class="live-dot" data-state="${feedState(s)}" aria-hidden="true"></span>
          <div class="devfeed-main"><p><strong>${esc(info.name)}</strong> <code>${esc(id)}</code></p>
            <p class="devcon-dim">${esc(feedNote(s, now))}${s.nextAt ? `, next in ${esc(duration(Math.max(0, s.nextAt - now)))}` : ''}${s.loading ? ', loading now' : ''}</p>
            ${s.error ? `<p class="devcon-err">${esc(s.error.code ? `${s.error.code}: ` : '')}${esc(s.error.message)}</p>` : ''}</div>
          <span class="devfeed-n" title="Items">${n == null ? '' : n}</span>
          <button class="btn btn-small btn-ghost" type="button" data-refresh="${esc(id)}" aria-label="Refresh ${esc(info.name)}">${icon('refresh')}</button>
        </div>`;
      })
      .join('')}</div>`;
}

function alertsTab() {
  const byEvent = new Map();
  for (const a of api.derived.alerts) byEvent.set(a.event, (byEvent.get(a.event) ?? 0) + 1);
  const top = [...byEvent].sort((x, y) => y[1] - x[1]).slice(0, 6);
  return `<div class="devcon-toolbar">
      <p class="devcon-summary"><strong>${api.derived.alerts.length}</strong> alerts in effect${top.length ? `: ${top.map(([e, n]) => `${n} ${esc(e)}`).join(', ')}` : ''}</p>
      <input class="input devcon-search" type="search" data-alert-text value="${esc(ui.alertText)}" placeholder="Search event, area or id" aria-label="Search alerts">
    </div>
    <div class="devcon-list" data-alert-list></div>`;
}

function alertDetail(a) {
  const proj = api.derived.projections.get(a.id);
  const shape = api.shapeFor(a.id);
  const vertices = (g) => (g ? JSON.stringify(g.coordinates ?? []).split('],[').length : 0);
  const rows = [
    ['Id', a.id],
    ['VTEC', a.vtec?.key ?? 'none'],
    ['Sent', `${new Date(a.sent).toLocaleString()} (${relative(a.sent, new Date())})`],
    ['Ends', `${new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0)).toLocaleString()}`],
    ['From', a.senderName || 'unknown'],
    ['Level', `${a.level}, place level ${a.placeLevel}, rank ${a.rank}`],
    ['Tags', a.tags.map((t) => t.label).join(', ') || 'none'],
    ['Motion', a.motion ? `${motionShort(a.motion)} at ${new Date(a.motion.time).toLocaleTimeString()}, ${a.motion.points.length} point${a.motion.points.length === 1 ? '' : 's'}` : 'none'],
    ['Path', proj ? `heading ${Math.round(proj.heading)}°, until ${new Date(proj.until).toLocaleTimeString()}` : 'none'],
    ['Shape', a.geometry ? `storm polygon, ${vertices(a.geometry)} points` : shape ? `zone shape, ${shape.geometry.type}` : 'no shape loaded'],
  ];
  return `<div class="devalert-detail"><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="detail-actions"><button class="btn btn-small btn-primary" type="button" data-alert-show="${esc(a.id)}">${icon('target')}Show on map</button>
    <button class="btn btn-small" type="button" data-alert-copy="${esc(a.id)}">Copy JSON</button>
    <button class="btn btn-small btn-ghost" type="button" data-alert-log="${esc(a.id)}">Send to log</button></div></div>`;
}

function renderAlertList() {
  const list = body.querySelector('[data-alert-list]');
  const q = ui.alertText.trim().toLowerCase();
  const alerts = [...api.derived.alerts].sort((a, b) => b.rank - a.rank).filter((a) => !q || `${a.event} ${a.areaDesc} ${a.id} ${a.vtec?.key ?? ''}`.toLowerCase().includes(q));
  if (!alerts.length) {
    list.innerHTML = `<p class="devcon-empty">${q ? 'No alert matches this search.' : 'No alerts are in effect.'}</p>`;
    return;
  }
  const now = Date.now();
  list.innerHTML = alerts
    .slice(0, 150)
    .map((a) => {
      const open = ui.openAlert === a.id;
      const end = Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0);
      const flags = [a.simulated ? 'simulated' : '', a.geometry ? 'polygon' : 'zone', a.motion ? 'motion' : ''].filter(Boolean);
      return `<div class="devalert${open ? ' is-open' : ''}">
        <button class="devalert-head" type="button" data-alert-toggle="${esc(a.id)}" aria-expanded="${open}">
          <span class="alert-swatch" style="--hz:${esc(a.color)}" aria-hidden="true"></span>
          <span class="devalert-main"><strong>${esc(a.event)}</strong><span class="devcon-dim">${esc(areaSummary(a.areaDesc, 2))}</span><span class="devalert-flags">${flags.map((f) => `<span class="devflag${f === 'simulated' ? ' is-sim' : ''}">${f}</span>`).join('')}</span></span>
          <span class="devcon-dim devalert-ends">${end > now ? `${esc(duration(end - now))} left` : 'Ended'}</span>
        </button>
        ${open ? alertDetail(a) : ''}
      </div>`;
    })
    .join('') + (alerts.length > 150 ? `<p class="devcon-empty">Showing 150 of ${alerts.length}. Search to narrow it down.</p>` : '');
}

function placesTab() {
  const views = api.everyone();
  if (!views.length) return '<p class="devcon-empty">No places are watched yet. Add one in the People tab, or turn on Where I am.</p>';
  const memory = api.alarmMemory();
  return `<div class="devcon-list">${views
    .map(({ place, status }) => {
      const why = api.reasons(place.id);
      const mem = Object.entries(memory[place.id] ?? {});
      return `<div class="devplace">
        <div class="devplace-head"><div><p><strong>${esc(place.name)}</strong> <span class="devcon-dim">${esc(place.kind)}</span></p>
          <p class="devcon-dim"><code>${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}</code></p></div>${statusChip(status.level)}</div>
        <ul class="devplace-why">${(why?.lines ?? []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
        ${mem.length ? `<p class="devcon-dim">Alarm memory: ${mem.map(([k, r]) => `<code>${esc(k)}</code> ${r}`).join(', ')}</p>` : ''}
        <div class="detail-actions"><button class="btn btn-small" type="button" data-sim-place="${esc(place.id)}">Simulate a tornado warning here</button>
        <button class="btn btn-small btn-ghost" type="button" data-place-show="${esc(place.id)}">${icon('target')}Show on map</button></div>
      </div>`;
    })
    .join('')}</div>`;
}

const toggle = (key, on, label, help) => `<div class="switch-row"><label for="devdbg-${key}"><span class="switch-label">${esc(label)}</span><br><span class="switch-help">${esc(help)}</span></label>
  <span class="switch"><input type="checkbox" role="switch" id="devdbg-${key}" data-debug="${key}" ${on ? 'checked' : ''}><span></span></span></div>`;

function mapTab() {
  const m = api.mapApi;
  if (!m) return '<p class="devcon-empty">The map has not loaded yet.</p>';
  const d = m.debug;
  const c = m.map.getCenter();
  const counts = Object.entries(api.mapCounts()).sort();
  const layers = api.store.get().layers;
  const radar = m.radar?.state;
  return `<section class="devcon-section"><h3>Debug views</h3>
      ${toggle('tiles', d.tiles, 'Tile boundaries', 'Outlines every map tile with its z/x/y.')}
      ${toggle('collisions', d.collisions, 'Label collision boxes', 'Shows why a label was hidden.')}
      ${toggle('padding', d.padding, 'Camera padding', 'Shows the space kept clear for the panel.')}</section>
    <section class="devcon-section"><h3>Camera</h3>
      <p><code>${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</code> at zoom <code>${m.map.getZoom().toFixed(2)}</code></p>
      <div class="detail-actions"><button class="btn btn-small" type="button" data-map-copy>Copy position</button></div></section>
    <section class="devcon-section"><h3>Overlay data</h3>
      <div class="devgrid">${counts.map(([id, n]) => `<span><code>${esc(id)}</code></span><span>${n}</span>`).join('')}</div></section>
    <section class="devcon-section"><h3>Layer groups</h3>
      <div class="devgrid">${Object.entries(GROUPS).map(([g, ids]) => `<span><code>${esc(g)}</code></span><span>${layers[g] ? 'on' : 'off'}, ${ids.length} layers</span>`).join('')}</div></section>
    <section class="devcon-section"><h3>Radar loop</h3>
      <p>${radar ? `${radar.frames.length} frames, showing ${radar.index + 1}${radar.playing ? ', playing' : ', paused'}${radar.frames[radar.index] ? `, ${new Date(radar.frames[radar.index].time).toLocaleTimeString()}` : ''}` : 'Not ready'}</p></section>`;
}

function toolsTab() {
  const views = api.everyone();
  const sims = api.simulations();
  const now = Date.now();
  return `<section class="devcon-section"><h3>Simulate a tornado warning</h3>
      <p class="devcon-dim">Runs a fake warning through the real alarm, path and status code. It is labeled Simulated everywhere and ends on reload.</p>
      ${
        views.length
          ? `<div class="devform">
        <label class="field"><span class="field-label">Place</span><span class="select"><select class="input" data-sim-field="place">${views.map((v) => `<option value="${esc(v.place.id)}">${esc(v.place.name)}</option>`).join('')}</select>${icon('chevron')}</span></label>
        <div class="row-2">
          <label class="field"><span class="field-label">Storm comes from</span><span class="select"><select class="input" data-sim-field="dir">${DIRECTIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>${icon('chevron')}</span></label>
          <label class="field"><span class="field-label">Speed</span><span class="select"><select class="input" data-sim-field="mph">${[25, 35, 45, 60].map((v) => `<option value="${v}" ${v === 35 ? 'selected' : ''}>${v} mph</option>`).join('')}</select>${icon('chevron')}</span></label>
        </div>
        <label class="field"><span class="field-label">Lasts</span><span class="select"><select class="input" data-sim-field="minutes">${[15, 30, 45].map((v) => `<option value="${v}" ${v === 30 ? 'selected' : ''}>${v} minutes</option>`).join('')}</select>${icon('chevron')}</span></label>
        <div><button class="btn btn-primary" type="button" data-sim-start>Start simulation</button></div>
      </div>`
          : '<p class="devcon-empty">Add a place in the People tab first.</p>'
      }
      ${
        sims.length
          ? `<div class="devcon-list">${sims
              .map((s) => `<div class="devsim"><span><strong>${esc(s.placeName)}</strong><br><span class="devcon-dim">${esc(duration(Math.max(0, s.alert.expires - now)))} left</span></span>
              <button class="btn btn-small" type="button" data-sim-end="${esc(s.alert.id)}">End</button></div>`)
              .join('')}${sims.length > 1 ? '<div><button class="btn btn-small btn-ghost" type="button" data-sim-end="">End all</button></div>' : ''}</div>`
          : ''
      }</section>
    <section class="devcon-section"><h3>Alarms</h3>
      <div class="detail-actions"><button class="btn btn-small" type="button" data-test-alarm>${icon('sound')}Test the alarm</button>
      <button class="btn btn-small" type="button" data-reset-memory>Reset alarm memory</button></div>
      <p class="devcon-dim">Alarm memory stops a warning from sounding twice. Resetting it makes warnings already in effect sound again.</p></section>
    <section class="devcon-section"><h3>App</h3>
      <div class="detail-actions"><button class="btn btn-small" type="button" data-state-copy>Copy app state</button>
      <button class="btn btn-small" type="button" data-state-download>Download app state</button>
      <button class="btn btn-small" type="button" data-reload>${icon('refresh')}Reload</button>
      <button class="btn btn-small btn-danger" type="button" data-clear-offline>Clear offline files</button></div>
      <p class="devcon-dim">App state includes your settings and saved places, so share it only with people you trust.</p></section>
    <section class="devcon-section"><h3>Developer mode</h3>
      <p class="devcon-dim">Turning it off hides this console and its Settings entry. Open <code>#dev</code> to turn it back on.</p>
      <div><button class="btn btn-small" type="button" data-dev-off>Turn off developer mode</button></div></section>`;
}

// ---------- Actions ----------

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    api.toast({ title: `Copied ${what}`, tone: 'ok' });
  } catch {
    api.devlog.push({ level: 'result', source: 'console', message: text });
    api.toast({ title: 'Copying is blocked here', text: 'It was sent to the log instead.', tone: 'warning' });
  }
}

async function onClick(e) {
  const t = e.target;
  const hit = (sel) => t.closest(sel);
  let el;
  if (hit('[data-dev-close]')) return closeConsole();
  if ((el = hit('[data-tab]'))) {
    tab = el.dataset.tab;
    return render();
  }
  if ((el = hit('[data-log-level]'))) {
    ui.logLevel = el.dataset.logLevel;
    return render();
  }
  if (hit('[data-log-clear]')) {
    api.devlog.clear();
    return render();
  }
  if (hit('[data-log-copy]')) return copy(api.devlog.list().map((x) => `${time(x.time)} ${x.level} ${x.source}: ${x.message}`).join('\n'), 'the log');
  if (hit('[data-refresh-all]')) {
    for (const f of Object.values(api.feeds)) f.refresh();
    return render();
  }
  if ((el = hit('[data-refresh]'))) {
    api.feeds[el.dataset.refresh]?.refresh();
    return render();
  }
  if ((el = hit('[data-alert-toggle]'))) {
    ui.openAlert = ui.openAlert === el.dataset.alertToggle ? null : el.dataset.alertToggle;
    renderAlertList();
    body.querySelector(`[data-alert-toggle="${CSS.escape(el.dataset.alertToggle)}"]`)?.focus({ preventScroll: true });
    return;
  }
  if ((el = hit('[data-alert-show]'))) return api.selectAlert(el.dataset.alertShow);
  if ((el = hit('[data-alert-copy]'))) {
    const a = api.derived.byId.get(el.dataset.alertCopy);
    return a && copy(JSON.stringify(a, null, 2), 'the alert as JSON');
  }
  if ((el = hit('[data-alert-log]'))) {
    const a = api.derived.byId.get(el.dataset.alertLog);
    if (a) api.devlog.push({ level: 'result', source: 'alerts', message: inspect(a, { depth: 2, maxItems: 12 }) });
    tab = 'log';
    return render();
  }
  if ((el = hit('[data-place-show]'))) return api.showPlace(el.dataset.placeShow);
  if ((el = hit('[data-sim-place]'))) return startSim(el.dataset.simPlace, {});
  if (hit('[data-sim-start]')) {
    const field = (k) => body.querySelector(`[data-sim-field="${k}"]`)?.value;
    return startSim(field('place'), { dirFrom: Number(field('dir')), speedKt: Number(field('mph')) * MPH_TO_KT, minutes: Number(field('minutes')) });
  }
  if ((el = hit('[data-sim-end]'))) {
    api.endSimulations(el.dataset.simEnd || null);
    return render();
  }
  if (hit('[data-test-alarm]')) return api.testAlarm();
  if (hit('[data-reset-memory]')) {
    const ok = await api.confirm({ title: 'Reset alarm memory?', text: 'Warnings already covering your places will sound their alarms again.', confirmLabel: 'Reset memory' });
    if (ok) {
      api.resetAlarmMemory();
      api.toast({ title: 'Alarm memory reset', tone: 'ok' });
      render();
    }
    return;
  }
  if (hit('[data-state-copy]')) return copy(JSON.stringify(api.exportState(), null, 2), 'the app state');
  if (hit('[data-state-download]')) {
    const blob = new Blob([JSON.stringify(api.exportState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hook-echo-state-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }
  if (hit('[data-reload]')) return location.reload();
  if (hit('[data-clear-offline]')) {
    const ok = await api.confirm({ title: 'Clear offline files?', text: 'Hook Echo will delete its saved copy of the app and reload from the network. Your places and settings stay.', confirmLabel: 'Clear and reload', danger: true });
    if (ok) await api.clearOfflineFiles();
    return;
  }
  if (hit('[data-dev-off]')) {
    api.disable();
    closeConsole();
    return;
  }
  if (hit('[data-map-copy]')) {
    const c = api.mapApi.map.getCenter();
    return copy(`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} @ z${api.mapApi.map.getZoom().toFixed(2)}`, 'the map position');
  }
}

function startSim(placeId, opts) {
  try {
    const alert = api.simulate(placeId, opts);
    api.toast({ title: 'Simulation started', text: `A test tornado warning now covers ${alert.areaDesc.replace(/ \(simulated\)$/, '')}.`, tone: 'warning' });
    render();
  } catch (err) {
    api.devlog.push({ level: 'error', source: 'sim', message: inspect(err) });
  }
}

function onInput(e) {
  if (e.target.matches('[data-log-text]')) {
    ui.logText = e.target.value;
    renderLogList();
    scrollLogToEnd();
  }
  if (e.target.matches('[data-alert-text]')) {
    ui.alertText = e.target.value;
    renderAlertList();
  }
}

function onChange(e) {
  const d = e.target.closest('[data-debug]');
  if (d && api.mapApi) api.mapApi.debug = { ...api.mapApi.debug, [d.dataset.debug]: d.checked };
}

// ---------- Command line ----------

/** Runs typed JavaScript in the page, with top-level await, and logs the result. */
async function runCommand(code) {
  api.devlog.push({ level: 'input', source: 'console', message: code });
  if (tab !== 'log') {
    tab = 'log';
    render();
  }
  const evaluate = (src) => (0, eval)(src);
  try {
    let value;
    try {
      value = evaluate(code);
    } catch (err) {
      if (!(err instanceof SyntaxError) || !/\bawait\b/.test(code)) throw err;
      try {
        value = evaluate(`(async () => (${code}))()`);
      } catch {
        value = evaluate(`(async () => { ${code} })()`);
      }
    }
    if (value && typeof value.then === 'function') value = await value;
    api.devlog.push({ level: 'result', source: 'console', message: inspect(value, { depth: 3, maxItems: 40 }) });
  } catch (err) {
    api.devlog.push({ level: 'error', source: 'console', message: inspect(err) });
  }
}
