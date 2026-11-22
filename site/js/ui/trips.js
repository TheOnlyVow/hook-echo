// The Trips tab: upcoming stops with the storm risk for each day you'll be
// there, and past stops tucked away.

import { esc, icon, statusChip } from './dom.js';
import { clock } from '../lib/format.js';
import { tripDays, formatTripDates } from '../lib/trips.js';

const endOf = (a) => new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0));

function dayLabel(d) {
  if (d.ahead === 0) return 'Today';
  if (d.ahead === 1) return 'Tomorrow';
  return new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function dayLine(d) {
  const lead =
    d.source === 'spc'
      ? `<span class="risk" style="--risk:${esc(d.color ?? 'transparent')}"><i aria-hidden="true"></i></span>`
      : icon(d.source === 'forecast' ? 'calendar' : 'info');
  const cls = d.level >= 2 || d.severe ? ' is-headsup' : '';
  return `<p class="place-line${cls}">${lead}<span><strong>${esc(dayLabel(d))}:</strong> ${esc(d.text)}</span></p>`;
}

function tripCard(stop, view, ctx) {
  const status = view?.status ?? { level: 'checking', alerts: [], top: null };
  const days = tripDays(stop, ctx);
  const now = status.top ? `<p class="place-line">${icon('alert')}<span><strong>${esc(status.top.event)}</strong> there now, until ${esc(clock(endOf(status.top)))}</span></p>` : '';
  return `<article class="place" data-level="${esc(status.level)}" data-place="${esc(stop.id)}" tabindex="-1">
    <div class="place-head">
      <span class="place-icon">${icon('trip')}</span>
      <div style="min-width:0"><h3 class="place-name">${esc(stop.name)}</h3><p class="trip-date">${esc(formatTripDates(stop.from, stop.to))}</p></div>
      ${statusChip(status.level)}
    </div>
    <div class="place-lines">${now}${days.map(dayLine).join('')}</div>
    <div class="place-actions">
      <button class="btn btn-small" type="button" data-show="${esc(stop.id)}">${icon('target')}Show on map</button>
      <button class="btn btn-small btn-ghost" type="button" data-edit="${esc(stop.id)}">${icon('edit')}Edit</button>
    </div>
  </article>`;
}

export function createTrips({ el, onAdd, onEdit, onShow }) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add !== undefined) onAdd();
    else if (b.dataset.edit) onEdit(b.dataset.edit);
    else if (b.dataset.show) onShow(b.dataset.show);
  });

  /**
   * @param {{upcoming: object[], past: object[], views: Map<string, object>, outlooks: object[], forecasts: Map, today: string, full: boolean}} ctx
   */
  function render(ctx) {
    const pastOpen = el.querySelector('.trip-past')?.open ?? false;
    let html = `<div class="toolbar"><button class="btn btn-primary" type="button" data-add ${ctx.full ? 'disabled' : ''}>${icon('plus')}Add a trip stop</button></div>`;
    if (!ctx.upcoming.length) {
      html += `<div class="empty"><span class="empty-icon">${icon('calendar')}</span>
        <p class="empty-title">Plan ahead for the road</p>
        <p class="empty-text">Add the towns you'll visit, with your dates. Hook Echo shows the storm risk for each day you'll be there and watches every stop like your other places.</p></div>`;
    } else {
      html += `<div class="stack">${ctx.upcoming.map((s) => tripCard(s, ctx.views.get(s.id), { ...ctx, forecast: ctx.forecasts.get(s.id) })).join('')}</div>`;
    }
    if (ctx.past.length) {
      html += `<details class="trip-past"${pastOpen ? ' open' : ''}><summary>${icon('chevron')}Past trips (${ctx.past.length})</summary>
        <div class="stack" style="padding: 0">${ctx.past
          .map(
            (s) => `<div class="place"><div class="place-head"><span class="place-icon">${icon('trip')}</span><div style="min-width:0"><h3 class="place-name">${esc(s.name)}</h3><p class="trip-date">${esc(formatTripDates(s.from, s.to))}</p></div>
              <button class="btn btn-small btn-ghost" type="button" data-edit="${esc(s.id)}">${icon('edit')}Edit</button></div></div>`,
          )
          .join('')}</div></details>`;
    }
    el.innerHTML = html;
  }

  return { render };
}
