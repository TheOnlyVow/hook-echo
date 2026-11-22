// The layers menu: one switch per map layer, a small legend key for each,
// what each layer's feed is doing right now, and the forecast choices (which
// day's storm risk, which storms get projected paths).

import { esc } from './dom.js';
import { feedNote } from './sources.js';
import { outlookLegend, emptyOutlookNote } from '../lib/outlook.js';

const KEY = {
  radar: '<i style="width:20px;height:8px;background:linear-gradient(90deg,#02fd02,#fdf802,#fd0000,#f800fd)"></i>',
  warnings: '<i style="width:16px;height:16px;border:2.5px solid #ff0000;background:rgb(255 0 0 / .25)"></i>',
  watches: '<i style="width:16px;height:16px;border:2px dashed #ffd400;background:rgb(255 255 0 / .12)"></i>',
  discussions: '<i style="width:16px;height:16px;border:2px dashed var(--mcd);background:color-mix(in srgb, var(--mcd) 14%, transparent)"></i>',
  others: '<i style="width:16px;height:16px;border:1px solid #7b68ee;background:rgb(123 104 238 / .3)"></i>',
  paths: '<i style="width:20px;height:0;border-top:2.5px dashed var(--path-line)"></i>',
  trails: '<i style="width:20px;height:4px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--st-shelter))"></i>',
  surveys: '<i style="width:20px;height:5px;border-radius:3px;background:linear-gradient(90deg,var(--ef0),var(--ef3),var(--ef5))"></i>',
  reports: '<svg viewBox="0 0 12 12" width="16" height="16"><path d="M1.5 2.5h9L6 10.5z" fill="var(--rp-tornado)"/></svg>',
  outlook: '<i style="width:16px;height:16px;background:linear-gradient(135deg,#66a366 0 33%,#ffe066 33% 66%,#ffa366 66%)"></i>',
  tropical: '<i style="width:14px;height:14px;border-radius:50%;background:#ff8f20;box-shadow:0 0 0 2px #161b22"></i>',
  development: '<svg viewBox="0 0 16 16" width="18" height="18"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="rgb(255 165 0 / .16)" stroke="#ffa500" stroke-width="1.6" stroke-dasharray="2.4 1.6"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ffa500" stroke-width="1.8" stroke-linecap="round"/></svg>',
  places: `<svg class="icon icon-sm" aria-hidden="true"><use href="#i-home"/></svg>`,
};

const ROWS = [
  { group: 'Weather', items: [
    { key: 'radar', label: 'Radar', feed: 'radar' },
    { key: 'outlook', label: 'Storm risk forecast', feed: 'outlook' },
    { key: 'tropical', label: 'Tropical storms', feed: 'tropical' },
    { key: 'development', label: 'Where tropical storms could form', feed: 'development' },
  ] },
  { group: 'Alerts', items: [
    { key: 'warnings', label: 'Warnings', feed: 'storm' },
    { key: 'watches', label: 'Watches', feed: 'storm' },
    { key: 'discussions', label: 'Areas forecasters are watching', feed: 'discussions' },
    { key: 'others', label: 'Winter, flood, heat and wind alerts', feed: 'shapes' },
  ] },
  { group: 'Storm paths', items: [
    { key: 'paths', label: 'Where storms are heading', note: 'From each warning’s storm motion' },
    { key: 'trails', label: 'Where storms have been', feed: 'recent' },
    { key: 'surveys', label: 'Surveyed damage paths', feed: 'surveys' },
    { key: 'reports', label: 'Storm reports, 24 hours', feed: 'reports' },
  ] },
  { group: 'You', items: [{ key: 'places', label: 'My places' }] },
];

const seg = (label, buttons) =>
  `<div class="layer-sub segmented" role="radiogroup" aria-label="${esc(label)}">${buttons
    .map((b) => `<button type="button" role="radio" ${b.attr} aria-checked="${b.on}">${esc(b.text)}</button>`)
    .join('')}</div>`;

/**
 * @param {{menu: HTMLElement, button: HTMLElement, getLayers: () => object, setLayer: (key: string, value: any) => void,
 *   getFeed: (id: string) => object, extraNote?: (key: string) => string | null,
 *   outlookInfo: () => {day: number, kind: string, outlook: object | null, feedId: string, days: {day: number, label: string}[]}}} opts
 */
export function createLayersMenu({ menu, button, getLayers, setLayer, getFeed, extraNote = () => null, outlookInfo }) {
  let open = false;

  function outlookControls(layers) {
    const info = outlookInfo();
    const days = info.days;
    const later = info.day >= 4;
    let html = seg(
      'Storm risk day',
      [...days.slice(0, 3).map((d) => ({ attr: `data-outlook-day="${d.day}"`, on: info.day === d.day, text: d.label })), { attr: `data-outlook-day="${later ? info.day : 4}"`, on: later, text: 'Days 4–8' }],
    );
    if (later) html += seg('Day', days.slice(3).map((d) => ({ attr: `data-outlook-day="${d.day}"`, on: info.day === d.day, text: d.label })));
    if (info.day <= 2) {
      html += seg('Storm risk map', [
        { attr: 'data-outlook="cat"', on: layers.outlookKind !== 'torn', text: 'All severe storms' },
        { attr: 'data-outlook="torn"', on: layers.outlookKind === 'torn', text: 'Tornadoes' },
      ]);
    }
    const feed = getFeed(info.feedId);
    if (info.outlook) {
      const legend = outlookLegend(info.outlook);
      html += legend.length
        ? `<ul class="layer-legend" aria-label="Legend">${legend.map((l) => `<li><i class="${l.sig ? 'is-hatched' : ''}" style="${l.color ? `background:${esc(l.color)}` : ''}"></i>${esc(l.label)}</li>`).join('')}</ul>`
        : `<p class="layer-legend-note">${esc(emptyOutlookNote(info.outlook))}</p>`;
    } else if (feed?.status === 'error') html += '<p class="layer-legend-note is-error">This forecast is unavailable right now. Retrying.</p>';
    else html += '<p class="layer-legend-note">Loading the forecast</p>';
    return html;
  }

  function render() {
    const layers = getLayers();
    menu.innerHTML = `<h2>Map layers</h2>${ROWS.map(
      (g) => `<div class="layer-group-title">${esc(g.group)}</div>${g.items
        .map((it) => {
          const feedId = it.feed === 'outlook' ? outlookInfo().feedId : it.feed;
          const feed = feedId ? getFeed(feedId) : null;
          const special = extraNote(it.key);
          const note = special ?? (feed ? feedNote(feed) : it.note ?? '');
          const failing = feed && feed.status === 'error';
          const id = `layer-${it.key}`;
          let sub = '';
          if (it.key === 'outlook' && layers.outlook) sub = outlookControls(layers);
          if (it.key === 'paths' && layers.paths) {
            sub = seg('Which storms', [
              { attr: 'data-paths="tor"', on: layers.pathsKind === 'tor', text: 'Tornado warnings' },
              { attr: 'data-paths="all"', on: layers.pathsKind !== 'tor', text: 'All warned storms' },
            ]);
          }
          return `<label class="layer-row" for="${id}">
            <span class="layer-key" aria-hidden="true">${KEY[it.key] ?? ''}</span>
            <span><span class="layer-name">${esc(it.label)}</span><span class="layer-note${failing ? ' is-error' : ''}">${esc(note)}</span></span>
            <span class="switch"><input type="checkbox" role="switch" id="${id}" data-layer="${it.key}" ${layers[it.key] ? 'checked' : ''}><span></span></span>
          </label>${sub ? `<div class="layer-subs">${sub}</div>` : ''}`;
        })
        .join('')}`,
    ).join('')}`;
  }

  function setOpen(next) {
    open = next;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      render();
      menu.querySelector('input')?.focus();
    }
  }

  /** Re-renders, keeping keyboard focus on the same control. */
  function rerender() {
    const active = document.activeElement;
    const key = active && menu.contains(active) ? ['data-layer', 'data-outlook-day', 'data-outlook', 'data-paths'].map((a) => (active.hasAttribute(a) ? `[${a}="${active.getAttribute(a)}"]` : '')).join('') : '';
    render();
    if (key) menu.querySelector(key)?.focus();
  }

  button.addEventListener('click', () => setOpen(!open));
  menu.addEventListener('change', (e) => {
    const input = e.target.closest('[data-layer]');
    if (input) setLayer(input.dataset.layer, input.checked);
  });
  menu.addEventListener('click', (e) => {
    const kind = e.target.closest('[data-outlook]');
    if (kind) setLayer('outlookKind', kind.dataset.outlook);
    const day = e.target.closest('[data-outlook-day]');
    if (day) setLayer('outlookDay', Number(day.dataset.outlookDay));
    const paths = e.target.closest('[data-paths]');
    if (paths) setLayer('pathsKind', paths.dataset.paths);
  });
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (open && !menu.contains(e.target) && !button.contains(e.target)) setOpen(false);
  });

  return {
    refresh() {
      if (open) rerender();
    },
    close: () => setOpen(false),
  };
}
