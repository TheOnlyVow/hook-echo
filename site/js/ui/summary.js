// The summary strip (counts that double as list filters) and the headline,
// the one line that matters most right now.

import { esc, icon } from './dom.js';

export const COUNTS = [
  { key: 'tornado', label: 'Tornado warnings', short: 'Tornado', color: '#FF0000', match: (a) => a.event === 'Tornado Warning' },
  { key: 'severe', label: 'Severe thunderstorm', short: 'Severe', color: '#FFA500', match: (a) => a.event === 'Severe Thunderstorm Warning' },
  { key: 'flood', label: 'Flash flood', short: 'Flash flood', color: '#8B0000', match: (a) => a.event === 'Flash Flood Warning' },
  { key: 'watches', label: 'Tornado and severe watches', short: 'Watches', color: '#FFFF00', match: (a) => a.event === 'Tornado Watch' || a.event === 'Severe Thunderstorm Watch' },
];

/**
 * Counts per summary category. Watches are numbered nationally and issued
 * once per forecast office they touch, so they count by watch number.
 */
export function countAlerts(alerts) {
  const out = {};
  for (const c of COUNTS) {
    const matched = alerts.filter(c.match);
    out[c.key] = c.key === 'watches' ? new Set(matched.map((a) => (a.vtec ? `${a.vtec.phenomena}.${a.vtec.etn}` : a.id))).size : matched.length;
  }
  return out;
}

/**
 * @param {HTMLElement} el
 * @param {{counts: Record<string, number> | null, filter: string | null}} s counts is null while loading
 * @param {(key: string | null) => void} onFilter
 */
export function renderSummary(el, { counts, filter }, onFilter) {
  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.count');
      if (!btn || btn.disabled) return;
      onFilter(btn.getAttribute('aria-pressed') === 'true' ? null : btn.dataset.key);
    });
  }
  el.innerHTML = COUNTS.map((c) => {
    const n = counts?.[c.key];
    const loading = counts == null;
    const pressed = filter === c.key;
    const label = loading ? `${c.label}: loading` : `${n} ${c.label.toLowerCase()}${pressed ? ', showing only these' : ''}`;
    return `<button class="count${loading ? ' is-loading' : ''}${n === 0 ? ' is-zero' : ''}" type="button" data-key="${c.key}" style="--hz:${c.color}" aria-pressed="${pressed}" aria-label="${esc(label)}" ${loading ? 'disabled' : ''}>
      <span class="count-swatch" aria-hidden="true"></span><span class="count-n">${loading ? '0' : n}</span><span class="count-label">${esc(c.label)}</span>
    </button>`;
  }).join('');
}

/**
 * @param {HTMLElement} el
 * @param {{tone: 'shelter'|'headsup'|'warning'|'national'|'quiet', title: string, text: string, icon: string, action?: string} | null} h
 * @param {() => void} onClick
 */
export function renderHeadline(el, h, onClick) {
  if (!h) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<button class="headline-card is-${esc(h.tone)}" type="button">
    ${icon(h.icon)}
    <span><span class="headline-title">${esc(h.title)}</span><span class="headline-text">${esc(h.text)}</span></span>
    ${h.action ? `<span class="fine">${esc(h.action)}</span>` : icon('chevron', 'icon-sm')}
  </button>`;
  el.firstElementChild.addEventListener('click', onClick);
}
