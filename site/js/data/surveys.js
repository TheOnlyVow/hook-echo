// Surveyed tornado damage paths from the NWS Damage Assessment Toolkit.

import { fetchJSON } from './http.js';
import { DAT_LINES } from '../config.js';

const ms = (v) => {
  const d = new Date(typeof v === 'number' ? v : String(v ?? ''));
  return Number.isNaN(d.getTime()) ? null : d;
};
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** @returns {{id: string, ef: string, efnum: number | null, start: Date, end: Date | null, lengthMi: number, widthYd: number | null, maxWindMph: number | null, injuries: number, fatalities: number, wfo: string, comments: string, geometry: object}[]} */
export function normalizeSurveys(fc) {
  const out = [];
  for (const f of fc?.features ?? []) {
    const p = f.properties ?? {};
    const start = ms(p.starttime ?? p.stormdate);
    if (!start || !f.geometry || !['LineString', 'MultiLineString'].includes(f.geometry.type)) continue;
    const ef = /^EF[0-5U]$/.test(String(p.efscale ?? '').toUpperCase()) ? String(p.efscale).toUpperCase() : 'EFU';
    out.push({
      id: String(p.globalid ?? p.objectid ?? `${p.event_id}-${start.getTime()}`),
      ef,
      efnum: Number.isInteger(p.efnum) && p.efnum >= 0 ? p.efnum : null,
      start,
      end: ms(p.endtime),
      lengthMi: num(p.length) ?? 0,
      widthYd: num(p.width),
      maxWindMph: num(p.maxwind),
      injuries: num(p.injuries) ?? 0,
      fatalities: num(p.fatalities) ?? 0,
      wfo: p.wfo ?? '',
      comments: (p.comments ?? '').trim(),
      geometry: f.geometry,
    });
  }
  return out.sort((a, b) => b.start - a.start);
}

export async function loadSurveys(signal, now = new Date(), days = 14) {
  const since = new Date(now.getTime() - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const where = encodeURIComponent(`stormdate >= TIMESTAMP '${since}'`);
  const fields = 'objectid,globalid,wfo,event_id,stormdate,starttime,endtime,length,width,injuries,fatalities,efscale,efnum,maxwind,comments';
  return normalizeSurveys(await fetchJSON(`${DAT_LINES}?where=${where}&outFields=${fields}&maxAllowableOffset=0.0005&geometryPrecision=5&f=geojson`, { signal, timeoutMs: 45_000 }));
}
