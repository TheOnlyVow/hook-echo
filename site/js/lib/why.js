// Why a place has the status it has, in readable lines for the developer
// console: which alerts cover it and how (storm polygon, zone shape or the
// NWS point check), whether old data made it Unknown, and any heads-up.

import { pointInGeometry } from './geo.js';
import { placeStatus } from './status.js';
import { nearestStorm, closestApproach } from './paths.js';
import { clock, duration, miles, compass } from './format.js';

const LEVEL_WORD = { shelter: 'Take shelter', warning: 'Warning', watch: 'Watch', advisory: 'Advisory', clear: 'Clear', unknown: 'Unknown' };
const STALE_LIMIT = '5 min';

/**
 * @param {{lat: number, lon: number}} p
 * @param {{alerts: object[], shapes: Map<string, {geometry: object}>, pointHits?: Set<string>,
 *   projections: Map<string, object>, now: Date, stale: boolean, feedAgeMs: number | null, timeZone?: string}} ctx
 */
export function statusReasons(p, ctx) {
  const status = placeStatus(p, ctx);
  const tz = { timeZone: ctx.timeZone };
  const age = ctx.feedAgeMs == null ? 'of unknown age' : `${duration(Math.max(0, ctx.feedAgeMs))} old`;
  const covering = status.alerts.map((a) => {
    const via = [];
    if (a.geometry && pointInGeometry(p, a.geometry)) via.push('storm polygon');
    const shape = ctx.shapes?.get(a.id)?.geometry;
    if (shape && pointInGeometry(p, shape)) via.push('zone shape');
    if (ctx.pointHits?.has(a.id)) via.push('NWS point check');
    return { id: a.id, event: a.event, via };
  });

  const lines = [];
  const top = covering[0];
  if (top) lines.push(`${LEVEL_WORD[status.level]}, because a ${top.event} covers it (${top.via.join(' and ')}).`);
  else if (status.level === 'unknown') lines.push(`Unknown: no alert covers it, but warning data is ${age} (the limit is ${STALE_LIMIT}), so it can’t be called clear.`);
  else lines.push(`Clear: no alert covers it, and warning data is ${age}.`);
  for (const c of covering.slice(1)) lines.push(`Also ${c.event} (${c.via.join(' and ')}).`);

  let headsUp = null;
  if (status.headsUp) {
    const alert = ctx.alerts.find((a) => a.id === status.headsUp.alertId);
    const ca = closestApproach(p, ctx.projections.get(status.headsUp.alertId));
    headsUp = { ...status.headsUp, insideCone: Boolean(ca?.insideCone) };
    lines.push(
      `Heads-up: the ${alert?.event ?? 'warned'} storm passes ${miles(status.headsUp.distanceKm)} away around ${clock(status.headsUp.eta, tz)}, in ${status.headsUp.minutes} min${headsUp.insideCone ? ', inside its path cone' : ''}.`,
    );
  }
  const near = nearestStorm(p, ctx.projections);
  if (near) lines.push(`Nearest warned storm: ${miles(near.distanceKm)} ${compass(near.bearingFromPlace)} of here, ${near.toward ? 'heading this way' : 'moving away'}.`);

  return { level: status.level, covering, headsUp, lines };
}
