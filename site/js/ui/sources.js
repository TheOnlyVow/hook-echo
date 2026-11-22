// The data sources dialog: every feed with its health, age and next update.

import { esc, icon } from './dom.js';
import { relative, duration } from '../lib/format.js';

export const FEED_INFO = {
  storm: { name: 'Storm warnings and watches', by: 'National Weather Service' },
  land: { name: 'All alerts', by: 'National Weather Service' },
  shapes: { name: 'Alert areas', by: 'NOAA map services' },
  recent: { name: 'Storm trails', by: 'National Weather Service' },
  radar: { name: 'Radar', by: 'Iowa Environmental Mesonet, NWS NEXRAD' },
  reports: { name: 'Storm reports', by: 'Iowa Environmental Mesonet, NWS' },
  surveys: { name: 'Damage surveys', by: 'NWS Damage Assessment Toolkit' },
  spc1: { name: 'Storm risk today', by: 'Storm Prediction Center' },
  spc23: { name: 'Storm risk, days 2 and 3', by: 'Storm Prediction Center' },
  tropical: { name: 'Tropical storms', by: 'National Hurricane Center' },
};

/** "live" | "stale" | "error" | "loading" for a feed snapshot. */
export function feedState(s) {
  if (s.status === 'idle') return 'loading';
  if (s.status === 'error' && !s.data) return 'error';
  if (s.stale || s.status === 'error') return 'stale';
  return 'live';
}

export function feedNote(s, now = Date.now()) {
  if (s.status === 'idle') return 'Loading';
  const age = s.updatedAt ? `Updated ${relative(new Date(s.updatedAt), new Date(now))}` : 'Not loaded yet';
  if (s.status === 'error') {
    const retry = s.nextAt ? `, retrying in ${duration(Math.max(0, s.nextAt - now))}` : '';
    return `${s.data ? age : "Can't connect"}${retry}`;
  }
  return age;
}

export function createSources({ dialog, feeds }) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    if (e.target.closest('[data-refresh]')) {
      for (const f of Object.values(feeds)) f.refresh();
      render();
    }
  });
  let timer = 0;
  dialog.addEventListener('close', () => clearInterval(timer));

  function render() {
    const rows = Object.entries(feeds)
      .map(([id, feed]) => {
        const s = feed.snapshot;
        const info = FEED_INFO[id] ?? { name: id, by: '' };
        return `<div class="source-row"><span class="live-dot" data-state="${feedState(s)}" aria-hidden="true"></span>
          <span><span class="source-name">${esc(info.name)}</span><br><span class="source-note">${esc(info.by)}</span></span>
          <span class="source-note">${esc(feedNote(s))}</span></div>`;
      })
      .join('');
    dialog.innerHTML = `<div class="dialog-head"><h2 id="sources-title">Data sources</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon('close')}</button></div>
      <div class="dialog-body"><p class="dialog-text">Hook Echo reads these public feeds directly. Nothing about you or your places is stored on a server.</p><div>${rows}</div></div>
      <div class="dialog-foot"><button class="btn" type="button" data-refresh>${icon('refresh')}Refresh everything</button><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
  }

  return {
    open() {
      render();
      dialog.showModal();
      clearInterval(timer);
      timer = setInterval(() => dialog.open && render(), 5000);
    },
  };
}
