// Place search: Photon (OpenStreetMap; towns, addresses, schools, venues),
// with Open-Meteo's town search as the backup. US results only, since the
// warnings come from the National Weather Service.

import { fetchJSON } from './http.js';
import { PHOTON, OPEN_METEO_GEOCODE } from '../config.js';

/** @typedef {{name: string, detail: string, lat: number, lon: number}} PlaceResult */

function photonResult(f) {
  const p = f.properties ?? {};
  const [lon, lat] = f.geometry?.coordinates ?? [];
  const name = p.name ?? [p.housenumber, p.street].filter(Boolean).join(' ');
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const detail = [...new Set([p.city ?? p.county, p.state].filter((part) => part && part !== name))].join(', ');
  return { name, detail, lat, lon };
}

const dedupe = (list) => {
  const seen = new Set();
  return list.filter((r) => {
    const key = `${r.name}|${r.lat.toFixed(2)}|${r.lon.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * @param {string} q
 * @param {AbortSignal} [signal]
 * @returns {Promise<PlaceResult[]>}
 */
export async function searchPlaces(q, signal) {
  const query = q.trim();
  if (query.length < 2) return [];
  try {
    const fc = await fetchJSON(`${PHOTON}?q=${encodeURIComponent(query)}&limit=10&lang=en&lat=38.5&lon=-96`, { signal, timeoutMs: 10_000 });
    const us = (fc.features ?? []).filter((f) => String(f.properties?.countrycode ?? '').toUpperCase() === 'US');
    return dedupe(us.map(photonResult).filter(Boolean)).slice(0, 6);
  } catch (e) {
    if (e?.code === 'aborted') throw e;
    const j = await fetchJSON(`${OPEN_METEO_GEOCODE}?name=${encodeURIComponent(query)}&count=10&language=en&format=json&countryCode=US`, { signal, timeoutMs: 10_000 });
    return dedupe(
      (j.results ?? [])
        .filter((r) => String(r.country_code ?? '').toUpperCase() === 'US')
        .map((r) => ({ name: r.name, detail: r.admin1 ?? '', lat: r.latitude, lon: r.longitude })),
    ).slice(0, 6);
  }
}
