// Projects a warned storm forward from its NWS motion vector, the way a
// forecaster would draw it by hand: a center line, arrival ticks, and a
// cone that widens with distance because real storms wobble and turn.

import { destination, distanceKm, bearingDeg, pointInGeometry, EARTH_RADIUS_KM } from './geo.js';

/** @typedef {import('./geo.js').LatLon} LatLon */
/** @typedef {import('./motion.js').Motion} Motion */
/** @typedef {{now: LatLon, end: LatLon, line: LatLon[], ticks: {pos: LatLon, time: Date}[], cone: LatLon[]}} Track */
/** @typedef {{tracks: Track[], from: Date, until: Date, heading: number, motion: Motion}} Projection */

const KM_PER_DEG = (Math.PI * EARTH_RADIUS_KM) / 180;
const KT_TO_KMH = 1.852;

export const PATH_DEFAULTS = Object.freeze({ coneDeg: 15, speedSpread: 0.2, tickMinutes: 10, baseHalfWidthKm: 1.5, arcSteps: 8 });

/**
 * @param {Motion | null} m
 * @param {Date} now
 * @param {Date} until usually the warning's expiration
 * @param {Partial<typeof PATH_DEFAULTS>} [opts]
 * @returns {Projection | null} null when there is nothing meaningful to draw
 */
export function projectMotion(m, now, until, opts = {}) {
  const { coneDeg, speedSpread, tickMinutes, baseHalfWidthKm, arcSteps } = { ...PATH_DEFAULTS, ...opts };
  if (!m || !(m.speedKt >= 1) || !(until > now)) return null;

  const heading = (m.dirFrom + 180) % 360;
  const kmh = m.speedKt * KT_TO_KMH;
  const sinceHours = Math.max(0, (now - m.time) / 3.6e6);
  const aheadHours = (until - now) / 3.6e6;

  const step = tickMinutes * 60_000;
  const tickTimes = [];
  for (let t = Math.floor(now.getTime() / step) * step + step; t < until.getTime(); t += step) tickTimes.push(t);

  const tracks = m.points.map((origin) => {
    const start = destination(origin, heading, kmh * sinceHours);
    const end = destination(start, heading, kmh * aheadHours);
    const ticks = tickTimes.map((t) => ({ time: new Date(t), pos: destination(start, heading, (kmh * (t - now.getTime())) / 3.6e6) }));
    const reach = kmh * aheadHours * (1 + speedSpread);
    const cone = [destination(start, heading - 90, baseHalfWidthKm)];
    for (let i = 0; i <= arcSteps; i++) cone.push(destination(start, heading - coneDeg + (2 * coneDeg * i) / arcSteps, reach));
    cone.push(destination(start, heading + 90, baseHalfWidthKm), cone[0]);
    return { now: start, end, line: [start, end], ticks, cone };
  });

  return { tracks, from: now, until, heading, motion: m };
}

/** GeoJSON polygon for a track's cone. */
export function coneGeometry(track) {
  return { type: 'Polygon', coordinates: [track.cone.map((q) => [q.lon, q.lat])] };
}

/**
 * Where and when the projected storm center passes closest to a place.
 * @param {LatLon} p
 * @param {Projection | null} proj
 * @returns {{distanceKm: number, eta: Date, insideCone: boolean} | null}
 */
export function closestApproach(p, proj) {
  if (!proj?.tracks.length) return null;
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const toXY = (q) => ({ x: (q.lon - p.lon) * cosLat * KM_PER_DEG, y: (q.lat - p.lat) * KM_PER_DEG });
  const spanMs = proj.until - proj.from;
  let best = null;
  let insideCone = false;
  for (const track of proj.tracks) {
    if (pointInGeometry(p, coneGeometry(track))) insideCone = true;
    const a = toXY(track.now);
    const b = toXY(track.end);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / len2)) : 0;
    const d = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (!best || d < best.distanceKm) best = { distanceKm: d, eta: new Date(proj.from.getTime() + t * spanMs) };
  }
  return { ...best, insideCone };
}

/**
 * A heads-up when the storm is still approaching and will pass within
 * `radiusKm` of the place (or the place sits inside the cone).
 * @returns {{eta: Date, distanceKm: number, minutes: number} | null}
 */
export function headsUp(p, proj, now, radiusKm = 8.05) {
  const ca = closestApproach(p, proj);
  if (!ca || ca.eta <= now) return null;
  if (ca.distanceKm > radiusKm && !ca.insideCone) return null;
  return { eta: ca.eta, distanceKm: ca.distanceKm, minutes: Math.max(1, Math.round((ca.eta - now) / 60_000)) };
}

/**
 * The closest warned storm right now, and whether it is heading toward the place.
 * @param {LatLon} p
 * @param {Map<string, Projection>} projections keyed by alert id
 */
export function nearestStorm(p, projections) {
  let best = null;
  for (const [alertId, proj] of projections) {
    for (const track of proj?.tracks ?? []) {
      const d = distanceKm(p, track.now);
      if (best && d >= best.distanceKm) continue;
      const toPlace = bearingDeg(track.now, p);
      const diff = Math.abs(((proj.heading - toPlace + 540) % 360) - 180);
      best = { alertId, distanceKm: d, bearingFromPlace: bearingDeg(p, track.now), toward: diff < 90 };
    }
  }
  return best;
}
