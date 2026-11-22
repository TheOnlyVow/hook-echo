// County and zone shapes for alerts that the NWS alerts API sends without a
// polygon (watches, winter storms, floods...). NOAA's watch/warning/advisory
// map service has one feature per zone; zones of one alert are merged.

import { fetchJSON } from './http.js';
import { WWA_SHAPES, MARINE_ONLY } from '../config.js';

const idFromUrl = (url) => (typeof url === 'string' ? url.split('/alerts/').pop() : '');

function polygonsOf(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

/** @returns {Map<string, {geometry: object, event: string, expires: Date | null}>} */
export function normalizeShapes(fc) {
  const parts = new Map();
  for (const f of fc?.features ?? []) {
    const id = idFromUrl(f.properties?.url);
    const polys = polygonsOf(f.geometry);
    if (!id || !polys.length) continue;
    let entry = parts.get(id);
    if (!entry) {
      const expires = f.properties?.expiration ? new Date(f.properties.expiration) : null;
      parts.set(id, (entry = { polys: [], event: f.properties?.prod_type ?? '', expires: expires && !Number.isNaN(expires.getTime()) ? expires : null }));
    }
    entry.polys.push(...polys);
  }
  const out = new Map();
  for (const [id, { polys, event, expires }] of parts) {
    const geometry = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    out.set(id, { geometry, event, expires });
  }
  return out;
}

export async function loadShapes(signal) {
  const where = `prod_type NOT IN (${MARINE_ONLY.map((p) => `'${p}'`).join(',')})`;
  const base = `${WWA_SHAPES}?where=${encodeURIComponent(where)}&outFields=prod_type,url,expiration&returnGeometry=true&maxAllowableOffset=0.01&geometryPrecision=3&f=geojson`;
  const features = [];
  for (let page = 0; page < 5; page++) {
    const fc = await fetchJSON(`${base}&resultOffset=${features.length}`, { signal, timeoutMs: 45_000 });
    features.push(...(fc.features ?? []));
    if (!(fc.exceededTransferLimit || fc.properties?.exceededTransferLimit) || !fc.features?.length) break;
  }
  return normalizeShapes({ features });
}
