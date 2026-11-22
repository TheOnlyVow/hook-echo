// The Reports tab: storm reports from the last 24 hours (filterable by
// type) and NWS damage surveys from the last 14 days. Also the map popups
// for reports, surveys and tropical storms.

import { esc, icon } from './dom.js';
import { relative, clock } from '../lib/format.js';

export const REPORT_TYPES = [
  { key: 'tornado', label: 'Tornado' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'hail', label: 'Hail' },
  { key: 'wind', label: 'Wind' },
  { key: 'flood', label: 'Flood' },
  { key: 'other', label: 'Other' },
];

const SHAPES = {
  tornado: '<path d="M1.5 2.5h9L6 10.5z" fill="var(--rp-tornado)"/>',
  funnel: '<path d="M2 3h8L6 10z" fill="none" stroke="var(--rp-funnel)" stroke-width="1.8" stroke-linejoin="round"/>',
  hail: '<circle cx="6" cy="6" r="4.3" fill="var(--rp-hail)"/>',
  wind: '<rect x="2" y="2" width="8" height="8" rx="1" fill="var(--rp-wind)"/>',
  flood: '<path d="M6 1.4 10.6 6 6 10.6 1.4 6z" fill="var(--rp-flood)"/>',
  other: '<circle cx="6" cy="6" r="2.6" fill="var(--rp-other)"/>',
};

export const shapeIcon = (type) => `<span class="rp-shape" aria-hidden="true"><svg viewBox="0 0 12 12">${SHAPES[type] ?? SHAPES.other}</svg></span>`;

const EF_VAR = { EF0: '--ef0', EF1: '--ef1', EF2: '--ef2', EF3: '--ef3', EF4: '--ef4', EF5: '--ef5' };
export const efBadge = (ef) => `<span class="ef" style="--efc: var(${EF_VAR[ef] ?? '--efu'})">${esc(ef === 'EFU' ? 'EF?' : ef)}</span>`;

const OFFICES = {
  OUN: 'Norman',
  TSA: 'Tulsa',
  FWD: 'Fort Worth',
  IND: 'Indianapolis',
  MLB: 'Melbourne',
  MFL: 'Miami',
  TBW: 'Tampa Bay',
  JAN: 'Jackson',
  BMX: 'Birmingham',
  HUN: 'Huntsville',
  LZK: 'Little Rock',
  SHV: 'Shreveport',
  LCH: 'Lake Charles',
  LIX: 'New Orleans',
  MEG: 'Memphis',
  OHX: 'Nashville',
  DMX: 'Des Moines',
  DVN: 'Quad Cities',
  ICT: 'Wichita',
  TOP: 'Topeka',
  EAX: 'Kansas City',
  SGF: 'Springfield',
  LSX: 'St. Louis',
  ILX: 'Lincoln',
  LOT: 'Chicago',
  IWX: 'Northern Indiana',
  ILN: 'Wilmington',
  PAH: 'Paducah',
  HNX: 'Hanford',
  MTR: 'San Francisco',
};
const office = (wfo) => (OFFICES[wfo] ? `NWS ${OFFICES[wfo]}` : wfo ? `NWS office ${wfo}` : 'NWS');

function where(r) {
  const parts = [r.city, r.county ? `${r.county} County` : '', r.state].filter(Boolean);
  return parts.join(', ');
}

export function reportPopup(r, now = new Date()) {
  return `<div class="tip-title">${esc(r.label)}${r.magnitudeText ? `, ${esc(r.magnitudeText)}` : ''}</div>
    <div class="tip-text">${esc(where(r))}</div>
    <div class="tip-text">${esc(clock(r.time))}, ${esc(relative(r.time, now))}</div>
    ${r.remark ? `<div class="tip-text">${esc(r.remark)}</div>` : ''}
    ${r.source ? `<div class="tip-text">Reported by ${esc(r.source.toLowerCase())}</div>` : ''}`;
}

export function surveyPopup(s) {
  const size = [s.lengthMi ? `${s.lengthMi.toFixed(1)} mi long` : '', s.widthYd ? `up to ${Math.round(s.widthYd)} yd wide` : ''].filter(Boolean).join(', ');
  const harm = [s.injuries ? `${s.injuries} injured` : '', s.fatalities ? `${s.fatalities} killed` : ''].filter(Boolean).join(', ');
  return `<div class="tip-title">${efBadge(s.ef)} Tornado</div>
    <div class="tip-text">${esc(s.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}, ${esc(clock(s.start))}</div>
    ${size ? `<div class="tip-text">${esc(size)}</div>` : ''}
    ${s.maxWindMph ? `<div class="tip-text">Peak wind about ${Math.round(s.maxWindMph)} mph</div>` : ''}
    ${harm ? `<div class="tip-text">${esc(harm)}</div>` : ''}
    <div class="tip-text">Surveyed by ${esc(office(s.wfo))}</div>`;
}

export function tropicalPopup(storm, point) {
  return `<div class="tip-title">${esc(storm.name)}</div>
    <div class="tip-text">${esc(storm.label)}${storm.maxWindMph ? `, ${storm.maxWindMph} mph winds` : ''}</div>
    ${point && point.tau > 0 ? `<div class="tip-text">Forecast for ${esc(point.when)}: ${point.windMph ? `${point.windMph} mph` : 'winds unknown'}</div>` : ''}
    ${storm.movement ? `<div class="tip-text">Moving about ${storm.movement.mph} mph</div>` : ''}
    <div class="tip-text">Advisory ${esc(storm.advisory)}, ${esc(storm.advisoryTime)}</div>`;
}

export function createReports({ el, onShowReport, onShowSurvey, onToggleType, onRetry }) {
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-type]');
    if (f) return onToggleType(f.dataset.type);
    const r = e.target.closest('[data-report]');
    if (r) return onShowReport(r.dataset.report);
    const s = e.target.closest('[data-survey]');
    if (s) return onShowSurvey(s.dataset.survey);
    if (e.target.closest('[data-retry]')) onRetry();
  });

  /** @param {{reports: object[] | null, reportFeed: object, surveys: object[] | null, surveyFeed: object, enabled: Set<string>, now: Date}} ctx */
  function render({ reports, reportFeed, surveys, surveyFeed, enabled, now }) {
    const counts = Object.fromEntries(REPORT_TYPES.map((t) => [t.key, (reports ?? []).filter((r) => r.type === t.key).length]));
    let html = `<div class="filter-row" role="group" aria-label="Report types">${REPORT_TYPES.map(
      (t) => `<button class="filter" type="button" data-type="${t.key}" aria-pressed="${enabled.has(t.key)}">${shapeIcon(t.key)}${t.label} ${counts[t.key]}</button>`,
    ).join('')}</div>`;

    html += `<div class="group-head"><h3 class="group-title">Storm reports, last 24 hours</h3><span class="group-count">${reports ? (reports.filter((r) => enabled.has(r.type)).length) : ''}</span></div>`;
    if (!reports && reportFeed.status === 'idle') {
      html += '<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>'.repeat(3);
    } else if (!reports) {
      html += `<div class="feed-error" role="alert">${icon('alert')}<span>Storm reports are unavailable right now.</span><button class="btn btn-small" type="button" data-retry>Retry now</button></div>`;
    } else {
      const shown = reports.filter((r) => enabled.has(r.type));
      if (!shown.length) {
        html += `<div class="empty"><span class="empty-icon">${icon('info')}</span><p class="empty-title">${reports.length ? 'No reports of these types' : 'No storm reports in the last 24 hours'}</p><p class="empty-text">${
          reports.length ? 'Turn on more report types above to see them.' : 'Reports from spotters, emergency managers and the public appear here as the NWS logs them.'
        }</p></div>`;
      } else {
        html += shown
          .slice(0, 200)
          .map(
            (r) => `<button class="report-row" type="button" data-report="${esc(r.id)}">
              ${shapeIcon(r.type)}
              <span><span class="report-title">${esc(r.label)}${r.magnitudeText ? `, ${esc(r.magnitudeText)}` : ''}</span><br>
              <span class="report-where">${esc(where(r))}</span>${r.remark ? `<span class="report-remark">${esc(r.remark)}</span>` : ''}</span>
              <span class="report-time" data-ago="${r.time.getTime()}">${esc(relative(r.time, now))}</span>
            </button>`,
          )
          .join('');
        if (shown.length > 200) html += `<p class="fine" style="padding: 10px 16px">Showing the newest 200 of ${shown.length}.</p>`;
      }
    }

    html += `<div class="group-head"><h3 class="group-title">Damage surveys, last 14 days</h3><span class="group-count">${surveys?.length ?? ''}</span></div>`;
    if (!surveys && surveyFeed.status === 'idle') html += '<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i></div>';
    else if (!surveys) html += `<div class="feed-error">${icon('alert')}<span>Damage surveys are unavailable right now.</span></div>`;
    else if (!surveys.length) html += `<div class="empty"><span class="empty-icon">${icon('info')}</span><p class="empty-title">No surveyed tornadoes in the last 14 days</p><p class="empty-text">After a tornado, NWS teams map its damage path and rate it on the EF scale. Those paths appear here.</p></div>`;
    else {
      html += surveys
        .map(
          (s) => `<button class="report-row is-survey" type="button" data-survey="${esc(s.id)}">
            ${efBadge(s.ef)}
            <span><span class="report-title">Tornado, ${esc(s.lengthMi ? `${s.lengthMi.toFixed(1)} mi path` : 'path length pending')}</span><br>
            <span class="report-where">${esc(office(s.wfo))}${s.widthYd ? `, up to ${Math.round(s.widthYd)} yd wide` : ''}</span></span>
            <span class="report-time">${esc(s.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>
          </button>`,
        )
        .join('');
    }
    el.innerHTML = html;
  }

  return { render };
}
