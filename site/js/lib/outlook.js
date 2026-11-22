// Storm Prediction Center outlooks: the risk category at a point, the
// tornado probability at a point, and which day's outlook covers a date.

import { pointInGeometry } from './geo.js';

/**
 * @typedef {{label: string, dn: number, geometry: object, fill: string, stroke: string}} OutlookFeature
 * @typedef {{day: number, kind: 'cat'|'torn'|'prob', issue?: Date, valid?: Date, expire: Date, features: OutlookFeature[], note?: string}} Outlook
 *   `note` is SPC's reason when there are no areas, such as "Potential Too Low".
 */

export const RISKS = Object.freeze({
  TSTM: { level: 0, name: 'Thunderstorms' },
  MRGL: { level: 1, name: 'Marginal' },
  SLGT: { level: 2, name: 'Slight' },
  ENH: { level: 3, name: 'Enhanced' },
  MDT: { level: 4, name: 'Moderate' },
  HIGH: { level: 5, name: 'High' },
});

/**
 * @param {{lat: number, lon: number}} p
 * @param {Outlook | null} outlook a categorical outlook
 * @returns {{code: string, level: number, name: string, color: string} | null}
 */
export function riskAt(p, outlook) {
  let best = null;
  for (const f of outlook?.features ?? []) {
    const risk = RISKS[f.label];
    if (!risk || (best && risk.level <= best.level) || !pointInGeometry(p, f.geometry)) continue;
    best = { code: f.label, level: risk.level, name: risk.name, color: f.fill };
  }
  return best;
}

/**
 * @param {{lat: number, lon: number}} p
 * @param {Outlook | null} outlook a tornado probability outlook
 * @returns {{percent: number, significant: boolean} | null}
 */
export function tornadoProbAt(p, outlook) {
  let percent = 0;
  let significant = false;
  for (const f of outlook?.features ?? []) {
    if (!pointInGeometry(p, f.geometry)) continue;
    if (f.label === 'SIGN') significant = true;
    else {
      const prob = Number.parseFloat(f.label);
      if (Number.isFinite(prob)) percent = Math.max(percent, Math.round(prob * 100));
    }
  }
  return percent > 0 || significant ? { percent, significant } : null;
}

/**
 * The probability an outlook area stands for, in percent: "0.15" and "30"
 * both work, and the DN value fills in for a label without a number.
 * @param {{label: string, dn: number}} f
 * @returns {number | null} null for hatched "significant" areas
 */
export function outlookPercent(f) {
  if (/^SIGN/i.test(f.label ?? '')) return null;
  const n = Number.parseFloat(f.label);
  if (Number.isFinite(n) && n > 0) return Math.round(n <= 1 ? n * 100 : n);
  return f.dn > 0 ? f.dn : null;
}

const CATEGORY_LEGEND = { TSTM: 'Thunderstorms', MRGL: '1 Marginal', SLGT: '2 Slight', ENH: '3 Enhanced', MDT: '4 Moderate', HIGH: '5 High' };

/**
 * Legend entries for the areas an outlook actually has, lowest first.
 * @param {Outlook | null} outlook
 * @returns {{label: string, color: string | null, sig: boolean}[]}
 */
export function outlookLegend(outlook) {
  const out = [];
  const seen = new Set();
  for (const f of outlook?.features ?? []) {
    const sig = /^SIGN/i.test(f.label);
    const label = sig ? 'Strong possible (hatched)' : outlook.kind === 'cat' ? (CATEGORY_LEGEND[f.label] ?? f.label) : `${outlookPercent(f)}%`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, color: sig ? null : f.fill, sig });
  }
  return out;
}

const EMPTY_NOTES = {
  'potential too low': 'Severe storms unlikely',
  'predictability too low': 'Too uncertain to forecast yet',
  'less than 2% all areas': 'Tornado chance under 2% everywhere',
};

/** What to say when an outlook has no areas, from SPC's own reason when it gives one. */
export function emptyOutlookNote(outlook) {
  const known = EMPTY_NOTES[String(outlook?.note ?? '').trim().toLowerCase()];
  if (known) return known;
  if (outlook?.kind === 'cat') return 'No thunderstorms expected';
  if (outlook?.kind === 'torn') return 'Tornado chance under 2% everywhere';
  return 'No severe storm areas';
}

/**
 * Day N outlooks expire at 12Z on the morning after the day they cover.
 * @param {string} date YYYY-MM-DD
 * @param {Outlook[]} outlooks
 */
export function outlookForDate(date, outlooks) {
  for (const o of outlooks ?? []) {
    if (!o?.expire) continue;
    const covered = new Date(o.expire.getTime() - 864e5).toISOString().slice(0, 10);
    if (covered === date) return o;
  }
  return null;
}
