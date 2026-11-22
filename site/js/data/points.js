// NWS point forecasts: the points lookup gives the forecast office grid and
// time zone, then the 7-day forecast in 12-hour periods.

import { fetchJSON } from './http.js';
import { NWS, roundCoord } from '../config.js';

/** @returns {Promise<{periods: object[], timeZone: string, city: string, state: string}>} */
export async function loadForecast(p, signal) {
  const meta = await fetchJSON(`${NWS}/points/${roundCoord(p.lat)},${roundCoord(p.lon)}`, { signal });
  const props = meta?.properties;
  if (!props?.forecast) throw new Error('No NWS forecast for this spot');
  const forecast = await fetchJSON(props.forecast, { signal });
  const where = props.relativeLocation?.properties ?? {};
  return { periods: forecast?.properties?.periods ?? [], timeZone: props.timeZone ?? '', city: where.city ?? '', state: where.state ?? '' };
}
