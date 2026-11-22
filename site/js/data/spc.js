// Storm Prediction Center convective outlooks (Day 1 categorical and
// tornado probability, Days 2 and 3 categorical).

import { fetchJSON } from './http.js';
import { SPC } from '../config.js';

const date = (s) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * SPC days run 12Z to 12Z. The 06Z Day 1 outlook starts the next day, so
 * before 06Z "Day 1" is still the day that ends at 12Z this morning.
 */
export function defaultExpire(day, now = new Date()) {
  const twelve = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
  const day1 = now.getUTCHours() < 6 ? twelve : twelve + 864e5;
  return new Date(day1 + (day - 1) * 864e5);
}

/** @returns {import('../lib/outlook.js').Outlook} */
export function normalizeOutlook(fc, day, kind, now = new Date()) {
  const features = [];
  let props = null;
  for (const f of fc?.features ?? []) {
    const p = f.properties ?? {};
    props ??= p;
    if (!f.geometry || !p.LABEL) continue;
    features.push({ label: String(p.LABEL), label2: p.LABEL2 ?? '', dn: Number(p.DN) || 0, geometry: f.geometry, fill: p.fill ?? '#888888', stroke: p.stroke ?? '#666666' });
  }
  features.sort((a, b) => a.dn - b.dn);
  return {
    day,
    kind,
    issue: date(props?.ISSUE_ISO),
    valid: date(props?.VALID_ISO),
    expire: date(props?.EXPIRE_ISO) ?? defaultExpire(day, now),
    features,
  };
}

/** SPC sometimes resets connections for one file name; the layered variant has the same areas. */
async function loadOutlook(day, kind, signal) {
  const base = `${SPC}/day${day}otlk_${kind}`;
  try {
    return normalizeOutlook(await fetchJSON(`${base}.nolyr.geojson`, { signal }), day, kind);
  } catch (e) {
    if (e?.code === 'aborted') throw e;
    return normalizeOutlook(await fetchJSON(`${base}.lyr.geojson`, { signal }), day, kind);
  }
}

export async function loadDay1(signal) {
  const [cat, torn] = await Promise.all([loadOutlook(1, 'cat', signal), loadOutlook(1, 'torn', signal).catch(() => null)]);
  return { cat, torn };
}

export async function loadDays23(signal) {
  const [day2, day3] = await Promise.allSettled([loadOutlook(2, 'cat', signal), loadOutlook(3, 'cat', signal)]);
  if (day2.status === 'rejected' && day3.status === 'rejected') throw day2.reason;
  return { day2: day2.status === 'fulfilled' ? day2.value : null, day3: day3.status === 'fulfilled' ? day3.value : null };
}
