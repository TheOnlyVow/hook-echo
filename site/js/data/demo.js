// Demo mode (#demo): replays a recorded real event as if it were happening
// now. The replay clock runs from the event's anchor time at normal speed;
// every time is shifted by one constant so warnings issue, update and expire
// on screen exactly as they did, and radar shows the archived mosaic.

import { fetchJSON } from './http.js';
import { normalizeAlerts } from './alerts.js';
import { normalizeReports } from './reports.js';
import { radarFrames } from './radar.js';
import { RADAR_STEP_MS } from '../config.js';

const plus = (d, ms) => (d ? new Date(d.getTime() + ms) : d);
const endOf = (a) => Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0);

/**
 * What the feeds would have returned at `replayNow` (event time).
 * @returns {{active: object[], recent: object[]}}
 */
export function replayAt(alerts, replayNow) {
  const recent = alerts.filter((a) => a.sent <= replayNow);
  const latest = new Map();
  for (const a of recent) {
    const key = a.vtec?.key ?? a.id;
    const prev = latest.get(key);
    if (!prev || a.sent >= prev.sent) latest.set(key, a);
  }
  const active = [...latest.values()].filter((a) => !a.cancelled && endOf(a) > replayNow.getTime());
  return { active, recent };
}

/** A copy of an alert with every time moved by `ms`. */
export function shiftAlert(a, ms) {
  return {
    ...a,
    sent: plus(a.sent, ms),
    effective: plus(a.effective, ms),
    onset: plus(a.onset, ms),
    expires: plus(a.expires, ms),
    ends: plus(a.ends, ms),
    motion: a.motion ? { ...a.motion, time: plus(a.motion.time, ms) } : null,
    vtec: a.vtec ? { ...a.vtec, start: plus(a.vtec.start, ms), end: plus(a.vtec.end, ms) } : null,
  };
}

/** Archived radar frames ending at the replay time, labeled with shifted times. */
export function demoRadar(replayNow, shift) {
  const valid = new Date(Math.floor(replayNow.getTime() / RADAR_STEP_MS) * RADAR_STEP_MS);
  const frames = radarFrames(valid.toISOString(), undefined, { live: false }).map((f) => ({ ...f, time: new Date(f.time.getTime() + shift) }));
  return { valid: new Date(valid.getTime() + shift), frames };
}

const START_KEY = 'hook-echo:demo-start';

/** Loaders that stand in for the live feeds while the demo runs. */
export function createDemo(session = globalThis.sessionStorage) {
  let event = null;
  let alerts = null;
  let reports = null;
  let start = 0;
  try {
    start = Number(session?.getItem(START_KEY)) || 0;
    if (!start) {
      start = Date.now();
      session?.setItem(START_KEY, String(start));
    }
  } catch {
    start = Date.now();
  }

  async function load(signal) {
    if (!event) {
      event = await fetchJSON('demo/event.json', { signal });
      alerts = normalizeAlerts({ features: event.alerts });
      reports = normalizeReports({ features: event.reports });
    }
    const anchor = Date.parse(event.anchor);
    const shift = start - anchor;
    return { shift, replayNow: new Date(Date.now() - shift) };
  }

  return {
    async storm(signal) {
      const { shift, replayNow } = await load(signal);
      return replayAt(alerts, replayNow).active.map((a) => shiftAlert(a, shift));
    },
    async recent(signal) {
      const { shift, replayNow } = await load(signal);
      return replayAt(alerts, replayNow).recent.map((a) => shiftAlert(a, shift));
    },
    async reports(signal) {
      const { shift, replayNow } = await load(signal);
      return reports.filter((r) => r.time <= replayNow).map((r) => ({ ...r, time: plus(r.time, shift) }));
    },
    async radar(signal) {
      const { shift, replayNow } = await load(signal);
      return demoRadar(replayNow, shift);
    },
    /** Label and whether the recorded event has run out. */
    async info(signal) {
      const { replayNow } = await load(signal);
      return { label: event.label, finished: replayNow > new Date(event.end), center: event.center ?? null };
    },
    restart() {
      try {
        session?.removeItem(START_KEY);
      } catch {
        // Session storage blocked: the page reload starts a fresh replay anyway.
      }
    },
  };
}
