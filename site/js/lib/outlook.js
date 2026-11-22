// Storm Prediction Center outlooks: the risk category at a point, the
// tornado probability at a point, and which day's outlook covers a date.

import { pointInGeometry } from './geo.js';

/**
 * @typedef {{label: string, dn: number, geometry: object, fill: string, stroke: string}} OutlookFeature
 * @typedef {{day: number, kind: 'cat'|'torn', issue?: Date, valid?: Date, expire: Date, features: OutlookFeature[]}} Outlook
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
