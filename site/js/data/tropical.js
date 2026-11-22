// Active Atlantic, East Pacific and Central Pacific tropical cyclones from
// NOAA's National Hurricane Center map service. Each basin has five storm
// slots (AT1..AT5, EP1..EP5, CP1..CP5); an empty slot has no forecast points.

import { fetchJSON } from './http.js';
import { TROPICAL } from '../config.js';
import { distanceKm, bearingDeg } from '../lib/geo.js';

const SLOT_RE = /^(AT|EP|CP)([1-5]) (Forecast Points|Forecast Track|Forecast Cone|Past Track)$/;
const KEYS = { 'Forecast Points': 'points', 'Forecast Track': 'track', 'Forecast Cone': 'cone', 'Past Track': 'past' };
const KT_TO_MPH = 1.150779;

/** @returns {{slot: string, points: number, track?: number, cone?: number, past?: number}[]} */
export function stormLayerIds(serviceJson) {
  const slots = new Map();
  for (const layer of serviceJson?.layers ?? []) {
    const m = SLOT_RE.exec(String(layer.name ?? '').trim());
    if (!m) continue;
    const slot = `${m[1]}${m[2]}`;
    const entry = slots.get(slot) ?? { slot };
    entry[KEYS[m[3]]] = layer.id;
    slots.set(slot, entry);
  }
  return [...slots.values()].filter((s) => s.points != null);
}

function stormLabel(type, ss, dev) {
  const t = String(type ?? '').toUpperCase();
  if ((t === 'HU' || t === 'MH' || /hurricane/i.test(dev ?? '')) && ss >= 1 && ss <= 5) return `Category ${ss} hurricane`;
  if (dev) return dev.charAt(0).toUpperCase() + dev.slice(1).toLowerCase();
  return { TS: 'Tropical storm', TD: 'Tropical depression', STS: 'Subtropical storm', STD: 'Subtropical depression', PTC: 'Potential tropical cyclone', PT: 'Post-tropical cyclone' }[t] ?? 'Tropical cyclone';
}

const firstGeometry = (fc) => fc?.features?.find((f) => f.geometry)?.geometry ?? null;

/**
 * @param {string} slot e.g. AT1
 * @param {{points: object, track?: object, cone?: object, past?: object}} layers GeoJSON per layer
 */
export function normalizeStorm(slot, { points, track, cone, past }) {
  const pts = (points?.features ?? [])
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => {
      const p = f.properties ?? {};
      const [lon, lat] = f.geometry.coordinates;
      const wind = Number(p.maxwind);
      return { lat, lon, tau: Number(p.tau) || 0, when: p.datelbl ?? p.fldatelbl ?? '', windMph: Number.isFinite(wind) ? Math.round(wind * KT_TO_MPH) : null, ss: Number(p.ssnum) || 0, dev: p.tcdvlp ?? '', props: p };
    })
    .sort((a, b) => a.tau - b.tau);
  if (!pts.length) return null;
  const now = pts[0];
  const next = pts.find((p) => p.tau > now.tau);
  let movement = null;
  if (next) {
    const hours = next.tau - now.tau;
    movement = { bearing: bearingDeg(now, next), mph: Math.round((distanceKm(now, next) * 0.621371) / hours) };
  }
  const p = now.props;
  return {
    id: slot,
    name: p.stormname ?? slot,
    type: p.stormtype ?? '',
    basin: p.basin ?? slot.slice(0, 2),
    advisory: p.advisnum ?? '',
    advisoryTime: p.advdate ?? '',
    label: stormLabel(p.stormtype, now.ss, now.dev),
    maxWindMph: now.windMph,
    gustMph: Number.isFinite(Number(p.gust)) ? Math.round(Number(p.gust) * KT_TO_MPH) : null,
    pressureMb: Number(p.mslp) || null,
    current: { lat: now.lat, lon: now.lon },
    movement,
    points: pts.map(({ props, ...rest }) => rest),
    cone: firstGeometry(cone),
    track: firstGeometry(track),
    past: firstGeometry(past),
  };
}

const OUTLOOK_NAMES = { areas: 'Seven-Day: Potential Development Region', points: 'Seven-Day: Current Location' };

/** The layer ids of NHC's seven-day tropical weather outlook, found by name. */
export function outlookLayerIds(serviceJson) {
  const find = (name) => (serviceJson?.layers ?? []).find((l) => String(l.name ?? '').trim() === name)?.id ?? null;
  return { areas: find(OUTLOOK_NAMES.areas), points: find(OUTLOOK_NAMES.points) };
}

const percent = (v) => {
  const n = Number.parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? Math.min(100, n) : 0;
};
/** NHC's categories: low under 40%, medium 40 to 60%, high over 60%. "nearZero" reads as low. */
const risk = (v) => (/high/i.test(v ?? '') ? 'high' : /med/i.test(v ?? '') ? 'medium' : 'low');

function developmentProps(p, i) {
  return {
    id: `${p.basin ?? 'basin'}-${p.objectid ?? i}`,
    basin: String(p.basin ?? ''),
    prob2: percent(p.prob2day),
    prob7: percent(p.prob7day),
    risk2: risk(p.risk2day),
    risk7: risk(p.risk7day),
  };
}

/**
 * Areas where a tropical depression or storm could form in the next seven
 * days, and the current spot of each disturbance NHC is watching.
 * @param {{areas: object | null, points: object | null}} layers GeoJSON per layer
 */
export function normalizeDevelopment({ areas, points }) {
  return {
    areas: (areas?.features ?? []).filter((f) => f.geometry && /Polygon/.test(f.geometry.type)).map((f, i) => ({ ...developmentProps(f.properties ?? {}, i), geometry: f.geometry })),
    points: (points?.features ?? [])
      .filter((f) => f.geometry?.type === 'Point')
      .map((f, i) => ({ ...developmentProps(f.properties ?? {}, i), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })),
  };
}

let serviceCache = null;
/** The service's layer list, fetched once per session. A failed fetch is retried next time. */
function serviceLayers(signal) {
  serviceCache ??= fetchJSON(`${TROPICAL}?f=json`, { signal, timeoutMs: 30_000 }).catch((e) => {
    serviceCache = null;
    throw e;
  });
  return serviceCache;
}

const queryLayer = (id, signal) => fetchJSON(`${TROPICAL}/${id}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson`, { signal, timeoutMs: 30_000 });

/** NHC's seven-day outlook: where storms could form. */
export async function loadDevelopment(signal) {
  const ids = outlookLayerIds(await serviceLayers(signal));
  const [areas, points] = await Promise.all([ids.areas, ids.points].map((id) => (id == null ? null : queryLayer(id, signal))));
  return normalizeDevelopment({ areas, points });
}

let layerCache = null;

/** @returns {Promise<object[]>} active storms */
export async function loadTropical(signal) {
  layerCache ??= stormLayerIds(await serviceLayers(signal));
  const query = (id) => queryLayer(id, signal);
  const pointSets = await Promise.all(layerCache.map((s) => query(s.points).catch(() => null)));
  const active = layerCache.filter((_, i) => pointSets[i]?.features?.length);
  const storms = await Promise.all(
    active.map(async (s) => {
      const i = layerCache.indexOf(s);
      const [track, cone, past] = await Promise.all([s.track, s.cone, s.past].map((id) => (id == null ? null : query(id).catch(() => null))));
      return normalizeStorm(s.slot, { points: pointSets[i], track, cone, past });
    }),
  );
  return storms.filter(Boolean);
}
