// The panel: tabs (with arrow-key navigation), a detail view that slides in
// over the tab content, and on phones a draggable bottom sheet with three
// heights (peek, half, full).

import { $, $$, isWide } from './dom.js';

const TABS = ['now', 'people', 'trips', 'reports'];
const SHEET_STATES = ['peek', 'half', 'full'];

export function createPanel({ onTabChange = () => {}, onSheetChange = () => {} } = {}) {
  const panel = $('#panel');
  const grip = $('#sheet-grip');
  const head = $('#panel-head');
  const tabsEl = $('.tabs', panel);
  const detail = $('#view-detail');
  const tabButtons = TABS.map((t) => $(`#tab-${t}`));
  let current = 'now';
  let detailBack = null;
  let sheet = 'peek';
  let y = 0;

  // ----- Tabs -----
  function selectTab(name, { focus = false, expand = true } = {}) {
    if (!TABS.includes(name)) return;
    closeDetail({ restoreFocus: false });
    current = name;
    for (const t of TABS) {
      const btn = $(`#tab-${t}`);
      const on = t === name;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      $(`#view-${t}`).hidden = !on;
    }
    if (focus) $(`#tab-${name}`).focus();
    if (expand && !isWide() && sheet === 'peek') setSheet('half');
    onTabChange(name);
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) selectTab(btn.id.replace('tab-', ''));
  });
  tabsEl.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(current);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(TABS[(next + TABS.length) % TABS.length], { focus: true });
  });

  // ----- Detail view -----
  function showDetail(html, { onBack, label = 'Details' } = {}) {
    detail.innerHTML = html;
    detail.setAttribute('aria-label', label);
    for (const t of TABS) $(`#view-${t}`).hidden = true;
    detail.hidden = false;
    detail.scrollTop = 0;
    detailBack = onBack ?? null;
    if (!isWide() && sheet === 'peek') setSheet('half');
    requestAnimationFrame(() => detail.focus({ preventScroll: true }));
  }
  function closeDetail({ restoreFocus = true } = {}) {
    if (detail.hidden) return;
    detail.hidden = true;
    detail.innerHTML = '';
    $(`#view-${current}`).hidden = false;
    const back = detailBack;
    detailBack = null;
    back?.();
    if (restoreFocus) $(`#tab-${current}`).focus({ preventScroll: true });
  }
  const isDetailOpen = () => !detail.hidden;

  // ----- Bottom sheet (phones) -----
  const height = () => panel.getBoundingClientRect().height;
  function peekVisible() {
    // Everything down to and including the tabs shows in the peek state.
    return Math.min(height(), tabsEl.offsetTop + tabsEl.offsetHeight + 2);
  }
  function yFor(state) {
    const h = height();
    if (state === 'full') return 0;
    if (state === 'half') return Math.max(0, h - Math.max(h * 0.52, peekVisible()));
    return Math.max(0, h - peekVisible());
  }
  function apply(nextY) {
    y = nextY;
    panel.style.setProperty('--sheet-y', `${Math.round(y)}px`);
    document.documentElement.style.setProperty('--sheet-visible', `${Math.round(height() - y)}px`);
  }
  function setSheet(state) {
    if (isWide()) return;
    sheet = SHEET_STATES.includes(state) ? state : 'peek';
    panel.dataset.sheet = sheet;
    grip.setAttribute('aria-expanded', String(sheet !== 'peek'));
    $('.sr-only', grip).textContent = sheet === 'full' ? 'Show less of the panel' : 'Show more of the panel';
    apply(yFor(sheet));
    onSheetChange(sheet);
  }

  grip.addEventListener('click', () => {
    if (drag.moved) return;
    setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek');
  });
  grip.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSheet(sheet === 'peek' ? 'half' : 'full');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSheet(sheet === 'full' ? 'half' : 'peek');
    }
  });

  const drag = { active: false, moved: false, startY: 0, startSheetY: 0, lastY: 0, lastT: 0, v: 0, id: null };
  function onDown(e) {
    if (isWide() || e.button > 0) return;
    if (e.target.closest('button, a, input') && e.target.closest('button, a, input') !== grip) return;
    drag.active = true;
    drag.moved = false;
    drag.startY = drag.lastY = e.clientY;
    drag.lastT = performance.now();
    drag.startSheetY = y;
    drag.v = 0;
    drag.id = e.pointerId;
  }
  function onMove(e) {
    if (!drag.active || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      panel.classList.add('is-dragging');
      e.target.setPointerCapture?.(e.pointerId);
    }
    const t = performance.now();
    drag.v = (e.clientY - drag.lastY) / Math.max(1, t - drag.lastT);
    drag.lastY = e.clientY;
    drag.lastT = t;
    apply(Math.min(yFor('peek'), Math.max(0, drag.startSheetY + dy)));
  }
  function onUp(e) {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    panel.classList.remove('is-dragging');
    if (!drag.moved) return;
    // Fling: velocity decides; otherwise snap to the nearest height.
    let target;
    if (drag.v < -0.6) target = sheet === 'peek' ? 'half' : 'full';
    else if (drag.v > 0.6) target = sheet === 'full' ? 'half' : 'peek';
    else target = SHEET_STATES.reduce((best, s) => (Math.abs(yFor(s) - y) < Math.abs(yFor(best) - y) ? s : best), 'peek');
    setSheet(target);
    setTimeout(() => (drag.moved = false), 0);
  }
  for (const el of [grip, head]) el.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function layout() {
    if (isWide()) {
      panel.style.removeProperty('--sheet-y');
      document.documentElement.style.setProperty('--sheet-visible', '0px');
    } else apply(yFor(sheet));
  }
  new ResizeObserver(layout).observe(panel);
  for (const el of [$('#summary'), $('#headline'), $('#banners')]) new ResizeObserver(() => !isWide() && sheet === 'peek' && apply(yFor('peek'))).observe(el);
  window.matchMedia('(min-width: 960px)').addEventListener('change', layout);
  layout();

  return {
    selectTab,
    showDetail,
    closeDetail,
    isDetailOpen,
    setSheet,
    get tab() {
      return current;
    },
    get sheet() {
      return isWide() ? 'wide' : sheet;
    },
    /** Pixels of map hidden by the panel, for fitting map bounds. */
    mapPadding() {
      if (isWide()) return { left: panel.getBoundingClientRect().right + 24, right: 72, top: 72, bottom: 96 };
      return { left: 24, right: 72, top: 80, bottom: height() - y + 24 };
    },
  };
}

export { TABS };
export const tabButtonsFor = () => $$('.tab');
