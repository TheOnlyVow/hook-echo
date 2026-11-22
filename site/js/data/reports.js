// Local Storm Reports (what spotters, police and the public saw) from the
// Iowa Environmental Mesonet, last 24 hours.

import { fetchJSON } from './http.js';
import { IEM } from '../config.js';

/** @typedef {'tornado'|'funnel'|'hail'|'wind'|'flood'|'other'} ReportType */

/** @returns {ReportType} */
export function reportType(typetext) {
  const t = String(typetext ?? '').toUpperCase();
  if (t === 'TORNADO' || t === 'WATERSPOUT') return 'tornado';
  if (t === 'FUNNEL CLOUD' || t === 'WALL CLOUD') return 'funnel';
  if (t === 'HAIL' || t === 'MARINE HAIL') return 'hail';
  if (/WND|WIND|DOWNBURST/.test(t)) return 'wind';
  if (/FLOOD/.test(t)) return 'flood';
  return 'other';
}

const LABELS = {
  'TSTM WND DMG': 'Thunderstorm wind damage',
  'TSTM WND GST': 'Thunderstorm wind gust',
  'NON-TSTM WND DMG': 'Wind damage',
  'NON-TSTM WND GST': 'Wind gust',
  'MARINE TSTM WIND': 'Marine thunderstorm wind',
};

function label(typetext) {
  const t = String(typetext ?? '').toUpperCase().trim();
  if (LABELS[t]) return LABELS[t];
  if (!t) return 'Report';
  return t.charAt(0) + t.slice(1).toLowerCase();
}

function magnitudeText(mag, unit) {
  const m = Number(mag);
  if (!Number.isFinite(m) || m <= 0) return '';
  const u = String(unit ?? '').toUpperCase();
  if (u === 'INCH' || u === 'INCHES') return `${m} in`;
  if (u === 'MPH') return `${Math.round(m)} mph`;
  if (u === 'KNOTS' || u === 'KT') return `${Math.round(m * 1.150779)} mph`;
  return u ? `${m} ${u.toLowerCase()}` : String(m);
}

/** @returns {{id: string, type: ReportType, label: string, magnitude: number | null, magnitudeText: string, time: Date, city: string, county: string, state: string, remark: string, source: string, lat: number, lon: number, wfo: string}[]} */
export function normalizeReports(fc) {
  const out = [];
  for (const f of fc?.features ?? []) {
    const p = f.properties ?? {};
    const lat = Number(p.lat ?? f.geometry?.coordinates?.[1]);
    const lon = Number(p.lon ?? f.geometry?.coordinates?.[0]);
    const time = new Date(p.valid);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(time.getTime())) continue;
    const mag = Number(p.magnitude);
    out.push({
      id: `${p.valid}|${lat.toFixed(3)}|${lon.toFixed(3)}|${p.typetext}`,
      type: reportType(p.typetext),
      label: label(p.typetext),
      magnitude: Number.isFinite(mag) && mag > 0 ? mag : null,
      magnitudeText: magnitudeText(p.magnitude, p.unit),
      time,
      city: p.city ?? '',
      county: p.county ?? '',
      state: p.st ?? p.state ?? '',
      remark: (p.remark ?? '').trim(),
      source: p.source ?? '',
      lat,
      lon,
      wfo: p.wfo ?? '',
    });
  }
  return out.sort((a, b) => b.time - a.time);
}

export async function loadReports(signal) {
  return normalizeReports(await fetchJSON(`${IEM}/geojson/lsr.geojson?hours=24`, { signal, timeoutMs: 30_000 }));
}
