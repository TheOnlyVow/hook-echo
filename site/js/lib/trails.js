// Reconstructs where warned storms have been. Every warning update carries a
// fresh storm position, so the positions of one VTEC event form a trail.
// When a storm outlives its warning, the follow-on warning is linked in if it
// starts near where the old storm was projected to be, soon after it ended.

import { centroid, destination, distanceKm } from './geo.js';

/** @typedef {import('./geo.js').LatLon} LatLon */
/** @typedef {{id: string, phenomena: string, keys: string[], points: {pos: LatLon, time: Date}[], latestAlertId: string, end: Date}} Trail */

export const TRAIL_DEFAULTS = Object.freeze({ linkKm: 15, linkMinutes: 20, keepHours: 4 });

const byTime = (a, b) => a.time - b.time;

function dedupe(points) {
  const out = [];
  for (const p of points) if (!out.length || out[out.length - 1].time.getTime() !== p.time.getTime()) out.push(p);
  return out;
}

/**
 * @param {object[]} alerts warning messages (any status) with motion and VTEC
 * @param {Date} now
 * @param {Partial<typeof TRAIL_DEFAULTS>} [opts]
 * @returns {Trail[]}
 */
export function buildTrails(alerts, now, opts = {}) {
  const { linkKm, linkMinutes, keepHours } = { ...TRAIL_DEFAULTS, ...opts };

  const groups = new Map();
  for (const a of alerts) {
    if (!a?.motion || !a?.vtec?.key) continue;
    let g = groups.get(a.vtec.key);
    if (!g) groups.set(a.vtec.key, (g = { key: a.vtec.key, phenomena: a.vtec.phenomena, points: [], end: 0 }));
    g.points.push({ pos: centroid(a.motion.points), time: a.motion.time, motion: a.motion, alertId: a.id });
    g.end = Math.max(g.end, (a.vtec.end ?? a.ends ?? a.expires)?.getTime() ?? 0);
  }

  const ordered = [...groups.values()]
    .map((g) => ({ ...g, points: dedupe(g.points.sort(byTime)) }))
    .sort((x, y) => x.points[0].time - y.points[0].time);

  const trails = [];
  for (const g of ordered) {
    const first = g.points[0];
    let host = null;
    let bestKm = Infinity;
    for (const t of trails) {
      if (first.time.getTime() - t.end > linkMinutes * 60_000) continue;
      const prior = t.points.findLast((p) => p.time <= first.time);
      if (!prior) continue;
      const hours = (first.time - prior.time) / 3.6e6;
      const projected = destination(prior.pos, (prior.motion.dirFrom + 180) % 360, prior.motion.speedKt * 1.852 * hours);
      const km = distanceKm(projected, first.pos);
      if (km <= linkKm && km < bestKm) {
        bestKm = km;
        host = t;
      }
    }
    if (host) {
      host.points = dedupe([...host.points, ...g.points].sort(byTime));
      host.end = Math.max(host.end, g.end);
      host.keys.push(g.key);
      if (g.phenomena === 'TO') host.phenomena = 'TO';
    } else {
      trails.push({ id: g.key, phenomena: g.phenomena, keys: [g.key], points: g.points, end: g.end });
    }
  }

  const cutoff = now.getTime() - keepHours * 3.6e6;
  return trails
    .map((t) => {
      const kept = t.points.filter((p) => p.time.getTime() >= cutoff);
      if (!kept.length) return null;
      return {
        id: t.id,
        phenomena: t.phenomena,
        keys: t.keys,
        points: kept.map(({ pos, time }) => ({ pos, time })),
        latestAlertId: kept[kept.length - 1].alertId,
        end: new Date(t.end),
      };
    })
    .filter(Boolean);
}
