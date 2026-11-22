// Parses the NWS "TIME...MOT...LOC" storm motion line that storm-based
// warnings carry in parameters.eventMotionDescription, e.g.
//   2026-11-22T01:40:00-00:00...storm...221DEG...16KT...27.6,-80.49
// The direction is where the storm is moving FROM, in degrees true.

/** @typedef {import('./geo.js').LatLon} LatLon */
/** @typedef {{time: Date, dirFrom: number, speedKt: number, points: LatLon[]}} Motion */

const MOTION_RE = /^(\S+)\.\.\.([a-z ]+?)\.\.\.(\d{1,3})DEG\.\.\.(\d{1,3})KT\.\.\.(.+)$/i;
const MAX_SPEED_KT = 150;

/**
 * @param {string | undefined | null} text
 * @returns {Motion | null} null for anything malformed or out of range
 */
export function parseMotion(text) {
  if (typeof text !== 'string') return null;
  const m = MOTION_RE.exec(text.trim());
  if (!m) return null;

  const time = new Date(m[1]);
  if (Number.isNaN(time.getTime())) return null;

  const dirFrom = Number(m[3]);
  const speedKt = Number(m[4]);
  if (dirFrom > 360 || speedKt > MAX_SPEED_KT) return null;

  const points = [];
  for (const pair of m[5].trim().split(/\s+/)) {
    const [lat, lon] = pair.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    points.push({ lat, lon });
  }
  if (!points.length) return null;

  return { time, dirFrom: dirFrom % 360, speedKt, points };
}
