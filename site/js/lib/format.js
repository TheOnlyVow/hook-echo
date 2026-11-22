// Display formatting in US units: clock times, relative times, durations,
// miles, compass points and storm motion.

const KT_TO_MPH = 1.150779;
const KM_TO_MI = 0.621371;
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const POINT_NAMES = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

const clockFormats = new Map();

/**
 * "8:32 PM" in the viewer's time zone (or `opts.timeZone`).
 * @param {Date} d
 * @param {{timeZone?: string}} [opts]
 */
export function clock(d, opts = {}) {
  const key = opts.timeZone ?? '';
  let fmt = clockFormats.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) });
    clockFormats.set(key, fmt);
  }
  // Newer ICU data puts a narrow no-break space before AM/PM.
  return fmt.format(d).replace(/[  ]/g, ' ');
}

/** "23 min", "1 h 5 min", "2 h", "under 1 min". */
export function duration(ms) {
  if (ms < 60_000) return 'under 1 min';
  const total = Math.round(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "just now", "3 min ago", "in 18 min", "2 h ago", "3 days ago". */
export function relative(d, now) {
  const diff = d - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff <= 0 ? 'just now' : 'in under 1 min';
  let text;
  if (abs >= 864e5) {
    const days = Math.round(abs / 864e5);
    text = days === 1 ? '1 day' : `${days} days`;
  } else text = duration(abs);
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

/** Kilometres to a short miles string. */
export function miles(km) {
  const mi = km * KM_TO_MI;
  if (mi < 1) return 'under 1 mi';
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

const pointIndex = (deg) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;

/** Eight-point compass abbreviation for a bearing. */
export function compass(deg) {
  return POINTS[pointIndex(deg)];
}

/** Knots to "35 mph". */
export function mph(kt) {
  return `${Math.round(kt * KT_TO_MPH)} mph`;
}

/** "→ NE at 35 mph" (the direction the storm is heading toward). */
export function motionText(m) {
  if (!m || m.speedKt < 1) return 'Nearly stationary';
  return `→ ${compass(m.dirFrom + 180)} at ${mph(m.speedKt)}`;
}

const AREA_RE = /^(.+), ([A-Z]{2})$/;

/**
 * "Cleveland, OK; McClain, OK; Grady, OK" -> "Cleveland, McClain and Grady, OK".
 * Descriptions that are not county lists come back unchanged.
 */
export function areaSummary(desc, max = 4) {
  const parts = String(desc ?? '').split(';').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  const groups = new Map();
  for (const part of parts) {
    const m = AREA_RE.exec(part);
    if (!m) return parts.join('; ');
    if (!groups.has(m[2])) groups.set(m[2], []);
    groups.get(m[2]).push(m[1]);
  }
  return [...groups]
    .map(([state, names]) => {
      let list;
      if (names.length > max) list = `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
      else list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      return `${list}, ${state}`;
    })
    .join('; ');
}

/** State codes named in an area description, first appearance first. */
export function statesIn(desc) {
  const out = [];
  for (const part of String(desc ?? '').split(';')) {
    const m = AREA_RE.exec(part.trim());
    if (m && !out.includes(m[2])) out.push(m[2]);
  }
  return out;
}

/** "NE at 35 mph" without the arrow, for places that draw their own. */
export function motionShort(m) {
  if (!m || m.speedKt < 1) return 'Nearly stationary';
  return `${compass(m.dirFrom + 180)} at ${mph(m.speedKt)}`;
}

/** Spoken form of motionText, for screen readers. */
export function motionLabel(m) {
  if (!m || m.speedKt < 1) return 'Nearly stationary';
  return `Moving ${POINT_NAMES[pointIndex(m.dirFrom + 180)]} at ${mph(m.speedKt)}`;
}
