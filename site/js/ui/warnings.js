// The Now tab: every active alert grouped by seriousness, and the detail
// view for one alert (full NWS text, timing, motion, projected path).

import { esc, icon, headingArrow } from './dom.js';
import { clock, duration, relative, motionShort, motionLabel, areaSummary } from '../lib/format.js';

const GROUPS = [
  { key: 'warnings', title: 'Warnings', test: (a) => a.placeLevel === 'shelter' || a.placeLevel === 'warning' },
  { key: 'watches', title: 'Watches', test: (a) => a.placeLevel === 'watch' },
  { key: 'other', title: 'Advisories and statements', test: (a) => a.placeLevel === 'advisory', collapsible: true },
];

const endOf = (a) => new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0));

function tagChips(tags) {
  if (!tags.length) return '';
  return `<span class="chips">${tags.map((t) => `<span class="chip is-${esc(t.kind)}">${esc(t.label)}</span>`).join('')}</span>`;
}

function row(a, { selectedId, covers, now }) {
  const end = endOf(a);
  const left = end - now;
  const life = a.level === 'alarm';
  const coverList = covers.get(a.id) ?? [];
  const label = `${a.event}, ${left > 0 ? `${duration(left)} left` : 'ending'}. ${areaSummary(a.areaDesc)}.${a.motion ? ` ${motionLabel(a.motion)}.` : ''}${coverList.length ? ` Covers ${coverList.map((c) => c.name).join(', ')}.` : ''}`;
  return `<button class="alert-row${life ? ' is-life' : ''}${a.id === selectedId ? ' is-selected' : ''}" type="button" data-id="${esc(a.id)}" aria-label="${esc(label)}">
    <span class="alert-swatch" style="--hz:${esc(a.color)}" aria-hidden="true"></span>
    <span class="alert-main" aria-hidden="true">
      <span class="alert-top"><span class="alert-event">${esc(a.event)}</span><span class="alert-ends" data-countdown="${end.getTime()}">${left > 0 ? `${duration(left)} left` : 'Ended'}</span></span>
      ${tagChips(a.tags)}
      <span class="alert-area">${esc(areaSummary(a.areaDesc))}</span>
      ${a.motion ? `<span class="alert-motion">${headingArrow(a.motion.dirFrom)}<span>${esc(motionShort(a.motion))}</span></span>` : ''}
      ${coverList.length ? `<span class="alert-covers">${coverList.map((c) => `<span class="chip">${icon(c.icon)}${esc(c.name)}</span>`).join('')}</span>` : ''}
    </span>
  </button>`;
}

export function createWarnings({ el, onSelect, onRetry, onClearFilter }) {
  const expanded = new Set();
  let last = null;

  el.addEventListener('click', (e) => {
    const rowEl = e.target.closest('.alert-row');
    if (rowEl) return onSelect(rowEl.dataset.id);
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const key = toggle.dataset.toggle;
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      if (last) render(last);
      return;
    }
    if (e.target.closest('[data-retry]')) onRetry();
    if (e.target.closest('[data-clear-filter]')) onClearFilter();
  });

  /**
   * @param {{alerts: object[], feed: object, filter: {key: string, label: string, match: Function} | null,
   *   selectedId: string | null, covers: Map<string, {name: string, icon: string}[]>, lastTornado: {area: string, ended: Date} | null, now: Date}} ctx
   */
  function render(ctx) {
    last = ctx;
    const { alerts, feed, filter, now } = ctx;
    if (feed.status === 'idle' && !alerts.length) {
      el.innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>').join('') + '<p class="sr-only">Loading warnings</p>';
      return;
    }
    let html = '';
    if (feed.status === 'error' && !feed.data) {
      html += `<div class="feed-error" role="alert">${icon('alert')}<span>Can't reach the National Weather Service. Warnings below may be missing.</span><button class="btn btn-small" type="button" data-retry>Retry now</button></div>`;
    }
    const shown = filter ? alerts.filter(filter.match) : alerts;
    if (filter) {
      html += `<div class="group-head"><span class="group-title">Showing ${esc(filter.label.toLowerCase())}</span><button class="group-toggle" type="button" data-clear-filter>Show everything</button></div>`;
    }
    const sorted = [...shown].sort((a, b) => b.rank - a.rank || endOf(a) - endOf(b));
    let any = false;
    for (const g of GROUPS) {
      const list = sorted.filter(g.test);
      if (!list.length) continue;
      any = true;
      const open = !g.collapsible || filter || expanded.has(g.key);
      html += `<div class="group-head"><h3 class="group-title">${esc(g.title)} <span class="group-count">${list.length}</span></h3>${
        g.collapsible && !filter ? `<button class="group-toggle" type="button" data-toggle="${g.key}" aria-expanded="${open}">${open ? 'Hide' : 'Show'}${icon('chevron')}</button>` : ''
      }</div>`;
      if (open) html += list.map((a) => row(a, ctx)).join('');
    }
    if (!any) {
      const quiet = !filter;
      const lastTor = ctx.lastTornado;
      html += `<div class="empty${quiet ? ' is-quiet' : ''}">
        <span class="empty-icon">${icon(quiet ? 'check' : 'info')}</span>
        <p class="empty-title">${quiet ? 'No active alerts' : `No ${esc(filter.label.toLowerCase())} right now`}</p>
        <p class="empty-text">${
          lastTor ? `The last tornado warning ended ${esc(relative(lastTor.ended, now))} near ${esc(areaSummary(lastTor.area, 2))}.` : 'Alerts appear here the moment the National Weather Service issues them.'
        }</p>
      </div>`;
    }
    el.innerHTML = html;
  }

  /** Detail view markup for one alert. */
  function detailHtml(a, { projection, headsUps = [], covers = [], now }) {
    const end = endOf(a);
    const motion = a.motion;
    const pathText = projection
      ? `<div class="path-summary">
          <p><strong>Moving ${esc(motionShort(motion))}.</strong> At that pace the storm reaches the far edge of this warning around ${esc(clock(projection.until))}.</p>
          ${
            headsUps.length
              ? `<ul class="eta-list">${headsUps.map((h) => `<li><span>${esc(h.name)}</span><span>around ${esc(clock(h.eta))} (in ${esc(duration(h.eta - now))})</span></li>`).join('')}</ul>`
              : ''
          }
          <p class="fine">Projected from the NWS storm motion. Storms can turn.</p>
        </div>`
      : '';
    return `<div class="detail">
      <button class="detail-back" type="button" data-back>${icon('back')}All warnings</button>
      <div class="detail-title">
        <span class="alert-swatch" style="--hz:${esc(a.color)}" aria-hidden="true"></span>
        <div><h2 id="detail-heading">${esc(a.event)}</h2><p class="detail-sub">${esc(a.senderName)}</p></div>
      </div>
      ${tagChips(a.tags)}
      <div class="facts">
        <div class="fact"><div class="fact-label">Ends</div><div class="fact-value">${esc(clock(end))}</div><div class="fact-note" data-countdown="${end.getTime()}">${esc(end > now ? `${duration(end - now)} left` : 'Ended')}</div></div>
        <div class="fact"><div class="fact-label">Issued</div><div class="fact-value">${esc(clock(a.sent))}</div><div class="fact-note" data-ago="${a.sent.getTime()}">${esc(relative(a.sent, now))}</div></div>
        <div class="fact"><div class="fact-label">Moving</div><div class="fact-value">${motion ? esc(motionShort(motion)) : 'Not given'}</div><div class="fact-note">${motion ? `Reported ${esc(clock(motion.time))}` : 'No storm motion in this alert'}</div></div>
        <div class="fact"><div class="fact-label">Your places</div><div class="fact-value">${covers.length || 'None'}</div><div class="fact-note">${covers.length ? esc(covers.map((c) => c.name).join(', ')) : 'inside this alert'}</div></div>
      </div>
      ${pathText}
      ${a.instruction ? `<section class="detail-section"><h3>What to do</h3><p class="detail-prose is-instruction">${esc(a.instruction)}</p></section>` : ''}
      <section class="detail-section"><h3>Full statement</h3><p class="detail-prose">${esc(a.nwsHeadline ? `${a.nwsHeadline}\n\n${a.description}` : a.description || a.headline)}</p></section>
      <section class="detail-section"><h3>Area</h3><p class="detail-prose">${esc(a.areaDesc)}</p></section>
      <div class="detail-actions"><button class="btn btn-primary" type="button" data-show-on-map>${icon('target')}Show on map</button></div>
      <p class="fine">${esc(a.headline)}</p>
    </div>`;
  }

  return { render, detailHtml };
}

export { endOf };
