// The status of one place: which alerts cover it right now, the word to
// show (Take shelter / Warning / Watch / Advisory / Clear / Unknown), and a
// heads-up when a tornado-warned storm is projected to pass close by.

import { pointInGeometry } from './geo.js';
import { headsUp as projectHeadsUp } from './paths.js';

/** @typedef {'shelter'|'warning'|'watch'|'advisory'|'clear'|'unknown'} PlaceLevel */
/**
 * @typedef {{level: PlaceLevel, alerts: object[], top: object | null,
 *   headsUp: {alertId: string, eta: Date, distanceKm: number, minutes: number} | null, stale: boolean}} PlaceStatus
 */

const LEVEL_ORDER = ['shelter', 'warning', 'watch', 'advisory'];

/** In effect until the later of the message expiry and the event end, unless cancelled. */
export function isInEffect(alert, now) {
  if (alert.cancelled) return false;
  const end = Math.max(alert.expires?.getTime() ?? 0, alert.ends?.getTime() ?? 0);
  return end > now.getTime();
}

/**
 * Alerts covering a place, most serious first. An alert covers the place
 * when its own polygon, its zone shape, or the NWS point check says so.
 * @param {{lat: number, lon: number}} p
 * @param {object[]} alerts
 * @param {Map<string, {geometry: object}>} shapes
 * @param {Set<string> | undefined} pointHits alert ids from the NWS point check
 * @param {Date} now
 */
export function coveringAlerts(p, alerts, shapes, pointHits, now) {
  const out = [];
  for (const a of alerts) {
    if (!isInEffect(a, now)) continue;
    const shape = shapes?.get(a.id)?.geometry;
    if ((a.geometry && pointInGeometry(p, a.geometry)) || (shape && pointInGeometry(p, shape)) || pointHits?.has(a.id)) out.push(a);
  }
  return out.sort((x, y) => y.rank - x.rank);
}

/**
 * @param {{lat: number, lon: number}} p
 * @param {{alerts: object[], shapes: Map<string, {geometry: object}>, pointHits?: Set<string>,
 *   projections: Map<string, import('./paths.js').Projection>, now: Date, stale: boolean}} ctx
 * @returns {PlaceStatus}
 */
export function placeStatus(p, { alerts, shapes, pointHits, projections, now, stale }) {
  const covering = coveringAlerts(p, alerts, shapes, pointHits, now);
  let level = stale ? 'unknown' : 'clear';
  for (const candidate of LEVEL_ORDER) {
    if (covering.some((a) => a.placeLevel === candidate)) {
      level = candidate;
      break;
    }
  }

  let headsUp = null;
  for (const a of alerts) {
    if (a.event !== 'Tornado Warning' || !isInEffect(a, now)) continue;
    const proj = projections?.get(a.id);
    if (!proj) continue;
    const hu = projectHeadsUp(p, proj, now);
    if (hu && (!headsUp || hu.eta < headsUp.eta)) headsUp = { alertId: a.id, ...hu };
  }

  return { level, alerts: covering, top: covering[0] ?? null, headsUp, stale: Boolean(stale) };
}
