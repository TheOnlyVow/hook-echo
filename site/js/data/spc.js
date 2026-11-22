// Storm Prediction Center convective outlooks: Day 1 and Day 2 categorical
// and tornado probability, Day 3 categorical, and the Day 4 to 8 chance of
// severe storms.

import { fetchJSON } from './http.js';
import { SPC, SPC_DAYS48 } from '../config.js';

export { outlookPercent } from '../lib/outlook.js';

const date = (s) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/** True when a geometry has at least one coordinate; SPC marks "nothing expected" with an empty one. */
function hasCoordinates(g) {
  if (!g) return false;
  if (g.type === 'GeometryCollection') return (g.geometries ?? []).some(hasCoordinates);
  return Array.isArray(g.coordinates) && g.coordinates.flat(Infinity).length > 0;
}

/**
 * SPC days run 12Z to 12Z. The 06Z Day 1 outlook starts the next day, so
 * before 06Z "Day 1" is still the day that ends at 12Z this morning.
 */
export function defaultExpire(day, now = new Date()) {
  const twelve = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  const day1 = now.getUTCHours() < 6 ? twelve : twelve + 864e5;
  return new Date(day1 + (day - 1) * 864e5);
}

/**
 * @param {object} fc SPC GeoJSON
 * @param {number} day 1 to 8
 * @param {'cat'|'torn'|'prob'} kind
 * @returns {import('../lib/outlook.js').Outlook}
 */
export function normalizeOutlook(fc, day, kind, now = new Date()) {
  const features = [];
  let props = null;
  let note = '';
  for (const f of fc?.features ?? []) {
    const p = f.properties ?? {};
    props ??= p;
    if (!p.LABEL) continue;
    // The placeholder's label says why there is nothing: "Potential Too Low", "Less Than 2% All Areas".
    if (!hasCoordinates(f.geometry)) {
      note ||= String(p.LABEL);
      continue;
    }
    features.push({ label: String(p.LABEL), label2: p.LABEL2 ?? '', dn: Number(p.DN) || 0, geometry: f.geometry, fill: p.fill || '#888888', stroke: p.stroke || '#666666' });
  }
  features.sort((a, b) => a.dn - b.dn);
  const expire = date(props?.EXPIRE_ISO) ?? defaultExpire(day, now);
  return {
    day,
    kind,
    issue: date(props?.ISSUE_ISO),
    valid: date(props?.VALID_ISO) ?? new Date(expire.getTime() - 864e5),
    expire,
    features,
    note: features.length ? '' : note,
  };
}

/** SPC sometimes resets connections for one file name; the layered variant has the same areas. */
async function loadFile(base, day, kind, signal) {
  try {
    return normalizeOutlook(await fetchJSON(`${base}.nolyr.geojson`, { signal }), day, kind);
  } catch (e) {
    if (e?.code === 'aborted') throw e;
    return normalizeOutlook(await fetchJSON(`${base}.lyr.geojson`, { signal }), day, kind);
  }
}

const loadOutlook = (day, kind, signal) => loadFile(`${SPC}/day${day}otlk_${kind}`, day, kind, signal);

export async function loadDay1(signal) {
  const [cat, torn] = await Promise.all([loadOutlook(1, 'cat', signal), loadOutlook(1, 'torn', signal).catch(() => null)]);
  return { cat, torn };
}

export async function loadDays23(signal) {
  const [day2, day2torn, day3] = await Promise.allSettled([loadOutlook(2, 'cat', signal), loadOutlook(2, 'torn', signal), loadOutlook(3, 'cat', signal)]);
  if (day2.status === 'rejected' && day3.status === 'rejected') throw day2.reason;
  const value = (r) => (r.status === 'fulfilled' ? r.value : null);
  return { day2: value(day2), day2torn: value(day2torn), day3: value(day3) };
}

/** Days 4 to 8: the chance of severe storms within 25 miles of a point. */
export async function loadDays48(signal) {
  const days = [4, 5, 6, 7, 8];
  const results = await Promise.allSettled(days.map((d) => loadFile(`${SPC_DAYS48}/day${d}prob`, d, 'prob', signal)));
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  return Object.fromEntries(days.map((d, i) => [`day${d}`, results[i].status === 'fulfilled' ? results[i].value : null]));
}
