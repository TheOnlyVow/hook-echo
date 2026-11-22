// Parses P-VTEC strings such as /O.NEW.KMLB.SV.W.0123.261122T0139Z-261122T0215Z/.
// The key (office.phenomena.significance.etn.year) identifies one warning
// event across all of its updates.

/**
 * @typedef {{action: string, office: string, phenomena: string, significance: string,
 *   etn: number, start: Date | null, end: Date | null, key: string}} Vtec
 */

const VTEC_RE = /^\/([OTEX])\.([A-Z]{3})\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.(\d{4})\.(\d{6}T\d{4}Z)-(\d{6}T\d{4}Z)\/$/;

function parseStamp(s) {
  if (s.startsWith('000000')) return null;
  const n = (i, len) => Number(s.slice(i, i + len));
  return new Date(Date.UTC(2000 + n(0, 2), n(2, 2) - 1, n(4, 2), n(7, 2), n(9, 2)));
}

/**
 * @param {string | undefined | null} text
 * @returns {Vtec | null}
 */
export function parseVtec(text) {
  if (typeof text !== 'string') return null;
  const m = VTEC_RE.exec(text.trim());
  if (!m) return null;
  const [, , action, office, phenomena, significance, etnText, startText, endText] = m;
  const start = parseStamp(startText);
  const end = parseStamp(endText);
  const year = (start ?? end)?.getUTCFullYear() ?? 0;
  return {
    action,
    office,
    phenomena,
    significance,
    etn: Number(etnText),
    start,
    end,
    key: `${office}.${phenomena}.${significance}.${etnText}.${year}`,
  };
}

/**
 * Alerts can carry several VTEC strings (for example a cancelled watch plus
 * the new warning that replaced it). Prefer the one that is still in effect.
 * @param {string[] | string | undefined} list
 * @returns {Vtec | null}
 */
export function pickVtec(list) {
  if (typeof list === 'string') return parseVtec(list);
  if (!Array.isArray(list)) return null;
  const parsed = list.map(parseVtec).filter(Boolean);
  return parsed.find((v) => v.action !== 'CAN' && v.action !== 'EXP') ?? parsed[0] ?? null;
}
