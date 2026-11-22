// The layers menu: one switch per map layer, a small legend key for each,
// and what each layer's feed is doing right now.

import { esc, icon } from './dom.js';
import { feedNote } from './sources.js';

const KEY = {
  radar: '<i style="width:20px;height:8px;background:linear-gradient(90deg,#02fd02,#fdf802,#fd0000,#f800fd)"></i>',
  warnings: '<i style="width:16px;height:16px;border:2.5px solid #ff0000;background:rgb(255 0 0 / .25)"></i>',
  watches: '<i style="width:16px;height:16px;border:2px dashed #ffd400;background:rgb(255 255 0 / .12)"></i>',
  others: '<i style="width:16px;height:16px;border:1px solid #7b68ee;background:rgb(123 104 238 / .3)"></i>',
  paths: '<i style="width:20px;height:0;border-top:2.5px dashed var(--path-line)"></i>',
  trails: '<i style="width:20px;height:4px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--st-shelter))"></i>',
  surveys: '<i style="width:20px;height:5px;border-radius:3px;background:linear-gradient(90deg,var(--ef0),var(--ef3),var(--ef5))"></i>',
  reports: '<svg viewBox="0 0 12 12" width="16" height="16"><path d="M1.5 2.5h9L6 10.5z" fill="var(--rp-tornado)"/></svg>',
  outlook: '<i style="width:16px;height:16px;background:linear-gradient(135deg,#66a366 0 33%,#ffe066 33% 66%,#ffa366 66%)"></i>',
  tropical: '<i style="width:14px;height:14px;border-radius:50%;background:#ff8f20;box-shadow:0 0 0 2px #161b22"></i>',
  places: `<svg class="icon icon-sm" aria-hidden="true"><use href="#i-home"/></svg>`,
};

const ROWS = [
  { group: 'Weather', items: [
    { key: 'radar', label: 'Radar', feed: 'radar' },
    { key: 'outlook', label: 'Storm risk today', feed: 'spc1' },
    { key: 'tropical', label: 'Tropical storms', feed: 'tropical' },
  ] },
  { group: 'Alerts', items: [
    { key: 'warnings', label: 'Warnings', feed: 'storm' },
    { key: 'watches', label: 'Watches', feed: 'storm' },
    { key: 'others', label: 'Winter, flood, heat and wind alerts', feed: 'shapes' },
  ] },
  { group: 'Tornado paths', items: [
    { key: 'paths', label: 'Where storms are heading', note: 'From each warning’s storm motion' },
    { key: 'trails', label: 'Where storms have been', feed: 'recent' },
    { key: 'surveys', label: 'Surveyed damage paths', feed: 'surveys' },
    { key: 'reports', label: 'Storm reports, 24 hours', feed: 'reports' },
  ] },
  { group: 'You', items: [{ key: 'places', label: 'My places' }] },
];

export function createLayersMenu({ menu, button, getLayers, setLayer, getFeed, extraNote = () => null }) {
  let open = false;

  function render() {
    const layers = getLayers();
    menu.innerHTML = `<h2>Map layers</h2>${ROWS.map(
      (g) => `<div class="layer-group-title">${esc(g.group)}</div>${g.items
        .map((it) => {
          const feed = it.feed ? getFeed(it.feed) : null;
          const special = extraNote(it.key);
          const note = special ?? (feed ? feedNote(feed) : it.note ?? '');
          const failing = feed && feed.status === 'error';
          const id = `layer-${it.key}`;
          return `<label class="layer-row" for="${id}">
            <span class="layer-key" aria-hidden="true">${KEY[it.key] ?? ''}</span>
            <span><span class="layer-name">${esc(it.label)}</span><span class="layer-note${failing ? ' is-error' : ''}">${esc(note)}</span></span>
            <span class="switch"><input type="checkbox" role="switch" id="${id}" data-layer="${it.key}" ${layers[it.key] ? 'checked' : ''}><span></span></span>
          </label>${
            it.key === 'outlook' && layers.outlook
              ? `<div class="layer-sub segmented" role="radiogroup" aria-label="Storm risk map">
                  <button type="button" role="radio" data-outlook="cat" aria-checked="${layers.outlookKind !== 'torn'}">All severe storms</button>
                  <button type="button" role="radio" data-outlook="torn" aria-checked="${layers.outlookKind === 'torn'}">Tornadoes</button>
                </div>`
              : ''
          }`;
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

  button.addEventListener('click', () => setOpen(!open));
  menu.addEventListener('change', (e) => {
    const input = e.target.closest('[data-layer]');
    if (input) setLayer(input.dataset.layer, input.checked);
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-outlook]');
    if (b) setLayer('outlookKind', b.dataset.outlook);
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
      if (open) render();
    },
    close: () => setOpen(false),
  };
}
