// What is this? The hover tooltip (a computer) and the tap card (a phone, or
// a click) that explain whatever is on the map, using lib/explain.js.

import { esc, icon, prefersReducedMotion } from './dom.js';
import { shapeIcon } from './reports.js';

const SHAPES = {
  trail: '<path d="M2 12.5 7 9.2" stroke="currentColor" stroke-opacity=".35" stroke-width="2.6" stroke-linecap="round"/><path d="M7 9.2 14 4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  dot: '<circle cx="8" cy="8" r="4.2" fill="currentColor" stroke="var(--casing)" stroke-width="1.6"/>',
  dash: '<path d="M2 8h12" stroke="currentColor" stroke-width="2.2" stroke-dasharray="2.6 2" stroke-linecap="round"/>',
  cone: '<path d="M2 8 14 3v10Z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-opacity=".7" stroke-dasharray="1.6 1.4" stroke-linejoin="round"/>',
  arrow: '<path d="M2.5 8h9M8 4.2 11.8 8 8 11.8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  area: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.6" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="1.6"/>',
  'dash-area': '<rect x="2.5" y="2.5" width="11" height="11" rx="2.6" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.4 1.6"/>',
  line: '<path d="M2 11.5 14 4.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  ring: '<circle cx="8" cy="8" r="5.2" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.4"/>',
  pin: '<circle cx="8" cy="8" r="5.4" fill="var(--glass-solid)" stroke="currentColor" stroke-width="2.4"/>',
};

function swatch(s) {
  if (!s) return '';
  if (s.shape === 'report') return `<span class="mt-swatch" aria-hidden="true">${shapeIcon(s.type)}</span>`;
  return `<span class="mt-swatch" aria-hidden="true" style="color:${esc(s.color ?? 'var(--ink-2)')}"><svg viewBox="0 0 16 16" fill="none">${SHAPES[s.shape] ?? SHAPES.dot}</svg></span>`;
}

const head = (e, tag = 'span') => `<div class="mt-head">${swatch(e.swatch)}<${tag} class="mt-title">${esc(e.title)}</${tag}></div>`;

function summary(e, { details = false } = {}) {
  return `${head(e)}<p class="mt-text">${esc(e.text)}</p>${e.meta ? `<p class="mt-meta">${esc(e.meta)}</p>` : ''}${
    details && e.details.length ? `<ul class="mt-details">${e.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''
  }`;
}

const fine = () => globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;

/**
 * @param {{host: HTMLElement, mapApi: object, onOpenAlert: (id: string) => void}} opts
 *   host: the element the tooltip is positioned in (covers the map)
 */
export function createMapTips({ host, mapApi, onOpenAlert }) {
  const tip = document.createElement('div');
  tip.className = 'maptip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  host.append(tip);
  let overMarker = false;
  let card = null;

  function place(x, y, { above = false } = {}) {
    const bounds = host.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const gap = 16;
    let left = above ? x - w / 2 : x + gap;
    let top = above ? y - h - 12 : y + gap;
    if (left + w > bounds.width - 8) left = above ? bounds.width - w - 8 : x - w - gap;
    if (top + h > bounds.height - 8) top = y - h - gap;
    tip.style.left = `${Math.round(Math.max(8, left))}px`;
    tip.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  function show(html, x, y, opts) {
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.hidden = false;
    place(x, y, opts);
    tip.classList.add('is-on');
  }

  function hide() {
    tip.classList.remove('is-on');
    tip.hidden = true;
  }

  /** The tooltip for what is under the mouse: the top thing in full, up to two more by name. */
  function hover(point, explanations, hint = '') {
    if (overMarker) return;
    if (!point || !explanations?.length) return hide();
    const [main, ...more] = explanations;
    const also = more.slice(0, 2);
    const html = `${summary(main)}${
      also.length ? `<div class="mt-also"><p class="mt-also-label">Also here</p>${also.map((e) => `<div class="mt-also-row">${swatch(e.swatch)}<span>${esc(e.title)}</span></div>`).join('')}</div>` : ''
    }${hint ? `<p class="mt-hint">${esc(hint)}</p>` : ''}`;
    show(html, point.x, point.y);
  }

  /** A tooltip for an HTML marker (a saved place, Where I am), shown above it on hover or keyboard focus. */
  function attach(el, explain) {
    const open = () => {
      const e = explain();
      if (!e) return;
      overMarker = true;
      const host$ = host.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      show(summary(e), r.left + r.width / 2 - host$.left, r.top - host$.top, { above: true });
    };
    const close = () => {
      overMarker = false;
      hide();
    };
    el.addEventListener('mouseenter', () => fine() && open());
    el.addEventListener('mouseleave', close);
    el.addEventListener('focus', () => el.matches(':focus-visible') && open());
    el.addEventListener('blur', close);
  }

  function closeCard() {
    if (!card) return;
    card.el.remove();
    card.ring.remove();
    mapApi.map.off('move', card.follow);
    card = null;
  }

  /** The part of the map not covered by the panel, the map buttons or the radar bar, in host pixels. */
  function openArea() {
    const h = host.getBoundingClientRect();
    const rel = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left - h.left, right: r.right - h.left, top: r.top - h.top, bottom: r.bottom - h.top };
    };
    const area = { left: 12, top: 12, right: h.width - 12, bottom: h.height - 12 };
    const panel = rel('#panel');
    if (panel && panel.right < h.width * 0.6 && panel.top < h.height / 2) area.left = Math.max(area.left, panel.right + 12);
    const controls = rel('#map-controls');
    if (controls) area.right = Math.min(area.right, controls.left - 10);
    const radar = rel('#timeline');
    if (radar && !document.querySelector('#timeline')?.classList.contains('is-hidden')) area.bottom = Math.min(area.bottom, radar.top - 10);
    return area;
  }

  /** Phones dock the card across the top of the map; wider screens set it beside the spot. */
  const docked = () => !fine() || host.clientWidth < 720;

  function placeCard() {
    if (!card) return;
    const p = mapApi.map.project(card.lngLat);
    card.ring.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    const area = openArea();
    card.ring.hidden = p.x < 0 || p.y < 0 || p.x > host.clientWidth || p.y > host.clientHeight;
    if (card.docked) return;
    const w = card.el.offsetWidth;
    const h = card.el.offsetHeight;
    let x = p.x + 18;
    if (x + w > area.right) x = p.x - 18 - w;
    x = Math.min(Math.max(x, area.left), Math.max(area.left, area.right - w));
    const y = Math.min(Math.max(p.y - 28, area.top), Math.max(area.top, area.bottom - h));
    card.el.style.left = `${Math.round(x)}px`;
    card.el.style.top = `${Math.round(y)}px`;
  }

  function renderCard(el, explanations, index) {
    const main = explanations[index];
    const others = explanations.filter((_, i) => i !== index);
    const actions = main.actions
      .map((a) =>
        a.kind === 'open-alert'
          ? `<button class="btn btn-small btn-primary" type="button" data-open-alert="${esc(a.id)}">${esc(a.label)}</button>`
          : `<a class="btn btn-small" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">${esc(a.label)}${icon('external')}</a>`,
      )
      .join('');
    el.setAttribute('aria-label', main.title);
    el.innerHTML = `<button class="icon-btn mt-close" type="button" data-close aria-label="Close">${icon('close')}</button>
      ${summary(main, { details: true })}
      ${actions ? `<div class="mt-actions">${actions}</div>` : ''}
      ${
        others.length
          ? `<div class="mt-also"><p class="mt-also-label">Also here</p>${others
              .map((e) => `<button class="mt-also-row" type="button" data-show="${explanations.indexOf(e)}">${swatch(e.swatch)}<span class="mt-also-title">${esc(e.title)}</span>${e.meta ? `<span class="mt-also-meta">${esc(e.meta)}</span>` : ''}</button>`)
              .join('')}</div>`
          : ''
      }`;
  }

  /** A card explaining what is at the spot that was tapped or clicked, with a ring marking the spot. */
  function showCard(lngLat, explanations) {
    closeCard();
    hide();
    if (!explanations?.length) return;
    const ll = Array.isArray(lngLat) ? { lng: lngLat[0], lat: lngLat[1] } : { lng: lngLat.lng, lat: lngLat.lat };
    const el = document.createElement('div');
    el.className = 'mt-card';
    el.setAttribute('role', 'dialog');
    const ring = document.createElement('div');
    ring.className = 'mt-ring';
    ring.setAttribute('aria-hidden', 'true');
    renderCard(el, explanations, 0);
    el.addEventListener('click', (e) => {
      const open = e.target.closest('[data-open-alert]');
      if (open) {
        closeCard();
        return onOpenAlert(open.dataset.openAlert);
      }
      if (e.target.closest('[data-close]')) return closeCard();
      const row = e.target.closest('[data-show]');
      if (row) {
        renderCard(el, explanations, Number(row.dataset.show));
        placeCard();
        el.querySelector('.mt-close')?.focus({ preventScroll: true });
      }
    });
    card = { el, ring, lngLat: ll, docked: docked(), follow: () => placeCard() };
    el.classList.toggle('is-docked', card.docked);
    host.append(ring, el);
    mapApi.map.on('move', card.follow);
    placeCard();
    if (card.docked) {
      // Keep the tapped spot in view below the docked card.
      const p = mapApi.map.project(ll);
      const below = el.offsetTop + el.offsetHeight + 28;
      if (p.y < below) mapApi.map.panBy([0, -(below - p.y)], { duration: prefersReducedMotion() ? 0 : 320 });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && card) closeCard();
  });

  return {
    hover,
    hide,
    attach,
    showCard,
    closeCard,
    get cardOpen() {
      return Boolean(card);
    },
  };
}
