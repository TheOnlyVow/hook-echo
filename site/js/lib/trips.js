// Trip stops: the storm risk for each day you'll be somewhere. SPC outlooks
// cover the next three days; the NWS forecast wording covers days 4 to 7;
// beyond that nobody can say.

import { outlookForDate, riskAt } from './outlook.js';
import { forecastForDate } from './forecast.js';

const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the device's own time zone. */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const noon = (s) => new Date(`${s}T12:00:00`);
const addDays = (s, n) => {
  const d = noon(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
};
const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 864e5);

/**
 * One entry per remaining day of a stop.
 * @param {{lat: number, lon: number, from: string, to?: string}} stop
 * @param {{outlooks: object[], forecast: {periods: object[]} | null, today: string, maxDays?: number}} ctx
 */
export function tripDays(stop, { outlooks, forecast, today, maxDays = 7 }) {
  const out = [];
  const last = stop.to || stop.from;
  for (let date = stop.from; date <= last && out.length < maxDays; date = addDays(date, 1)) {
    const ahead = daysBetween(today, date);
    if (ahead < 0) continue;
    const outlook = outlookForDate(date, (outlooks ?? []).filter(Boolean));
    if (outlook) {
      const risk = riskAt(stop, outlook);
      if (!risk) out.push({ date, ahead, source: 'spc', level: -1, text: 'No thunderstorms expected' });
      else if (risk.level === 0) out.push({ date, ahead, source: 'spc', level: 0, color: risk.color, text: 'Thunderstorms possible, not expected to be severe' });
      else out.push({ date, ahead, source: 'spc', level: risk.level, color: risk.color, text: `${risk.name} risk of severe storms (${risk.level} of 5)` });
      continue;
    }
    if (ahead < 7) {
      const f = forecastForDate(forecast?.periods, date);
      if (f) {
        const text = f.severe ? `Severe storms possible: ${f.summary}` : f.thunder ? `Thunderstorms possible: ${f.summary}` : f.summary;
        out.push({ date, ahead, source: 'forecast', severe: f.severe, thunder: f.thunder, text });
      } else out.push({ date, ahead, source: 'none', text: 'Forecast not available yet' });
      continue;
    }
    out.push({ date, ahead, source: 'none', text: 'Too far out to tell' });
  }
  return out;
}

/** Trip stops split into upcoming (by arrival) and past. */
export function splitTrips(places, today) {
  const trips = places.filter((p) => p.kind === 'trip' && p.from);
  const past = trips.filter((p) => (p.to || p.from) < today).sort((a, b) => b.from.localeCompare(a.from));
  const upcoming = trips.filter((p) => (p.to || p.from) >= today).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
  return { upcoming, past };
}

/** "Tue, Nov 24" or "Tue, Nov 24 to Wed, Nov 25". */
export function formatTripDates(from, to) {
  if (!from) return '';
  const fmt = (s) => noon(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return !to || to === from ? fmt(from) : `${fmt(from)} to ${fmt(to)}`;
}
