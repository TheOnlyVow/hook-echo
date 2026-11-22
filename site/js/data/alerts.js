// NWS alerts: one normalized shape for every alert, and the loaders for the
// storm-warning feed, the land-alert feed, recent warnings (for trails) and
// the per-place point check.

import { fetchJSON } from './http.js';
import { NWS, STORM_EVENTS, TRAIL_EVENTS, roundCoord } from '../config.js';
import { pickVtec } from '../lib/vtec.js';
import { parseMotion } from '../lib/motion.js';
import { alertTags, alertLevel, placeLevel, alertRank, hazardColor } from '../lib/hazards.js';

const date = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** @param {object} feature an NWS alert GeoJSON feature */
export function normalizeAlert(feature) {
  const p = feature.properties ?? {};
  const params = p.parameters ?? {};
  const event = p.event ?? 'Alert';
  const tags = alertTags(event, params, `${p.headline ?? ''}\n${p.description ?? ''}`);
  const vtec = pickVtec(params.VTEC);
  return {
    id: p.id ?? String(feature.id ?? '').split('/alerts/').pop(),
    event,
    headline: p.headline ?? event,
    nwsHeadline: params.NWSheadline?.[0] ?? '',
    description: p.description ?? '',
    instruction: p.instruction ?? '',
    areaDesc: p.areaDesc ?? '',
    senderName: p.senderName ?? '',
    sent: date(p.sent) ?? new Date(0),
    effective: date(p.effective),
    onset: date(p.onset),
    expires: date(p.expires),
    ends: date(p.ends),
    severity: p.severity ?? '',
    certainty: p.certainty ?? '',
    urgency: p.urgency ?? '',
    messageType: p.messageType ?? '',
    geometry: feature.geometry ?? null,
    ugc: p.geocode?.UGC ?? [],
    same: p.geocode?.SAME ?? [],
    vtec,
    motion: parseMotion(params.eventMotionDescription?.[0]),
    tags,
    level: alertLevel(event, tags),
    placeLevel: placeLevel(event),
    rank: alertRank(event, tags),
    color: hazardColor(event),
    cancelled: p.messageType === 'Cancel' || vtec?.action === 'CAN' || vtec?.action === 'EXP',
    references: (p.references ?? []).map((r) => r.identifier).filter(Boolean),
    web: p.web || '',
  };
}

/** Normalizes a FeatureCollection, dropping duplicate ids. */
export function normalizeAlerts(fc) {
  const seen = new Set();
  const out = [];
  for (const f of fc?.features ?? []) {
    const a = normalizeAlert(f);
    if (!a.id || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

/**
 * One list from both alert feeds. The one-minute storm feed is the only
 * source for storm events while it has data, so a warning that was updated
 * or cancelled never lingers from the slower all-alerts snapshot. When the
 * storm feed has nothing yet (or failed), the all-alerts copies stand in.
 * @param {object[] | null} storm
 * @param {object[] | null} land
 */
export function mergeAlerts(storm, land) {
  const stormEvents = new Set(STORM_EVENTS);
  const merged = new Map();
  for (const a of land ?? []) if (!storm || !stormEvents.has(a.event)) merged.set(a.id, a);
  for (const a of storm ?? []) merged.set(a.id, a);
  return [...merged.values()];
}

const eventsParam = (events) => events.map(encodeURIComponent).join(',');

export async function loadStormAlerts(signal) {
  const fc = await fetchJSON(`${NWS}/alerts/active?status=actual&event=${eventsParam(STORM_EVENTS)}`, { signal });
  return normalizeAlerts(fc).filter((a) => !a.cancelled);
}

export async function loadLandAlerts(signal) {
  const fc = await fetchJSON(`${NWS}/alerts/active?status=actual&region_type=land`, { signal, timeoutMs: 30_000 });
  return normalizeAlerts(fc).filter((a) => !a.cancelled);
}

/** Every tornado and severe thunderstorm warning message of the last hours, expired ones included. */
export async function loadRecentWarnings(signal, now = new Date(), hours = 4) {
  const start = new Date(now.getTime() - hours * 3.6e6).toISOString().slice(0, 19) + 'Z';
  let url = `${NWS}/alerts?status=actual&event=${eventsParam(TRAIL_EVENTS)}&start=${start}&limit=500`;
  const features = [];
  for (let page = 0; url && page < 3; page++) {
    const fc = await fetchJSON(url, { signal, timeoutMs: 30_000 });
    features.push(...(fc.features ?? []));
    url = fc.features?.length === 500 ? fc.pagination?.next : null;
  }
  return normalizeAlerts({ features });
}

/**
 * Alert ids the NWS says cover a point. Coordinates are rounded to ~100 m.
 * @returns {Promise<Set<string>>}
 */
export async function loadPointAlerts(p, signal) {
  const fc = await fetchJSON(`${NWS}/alerts/active?status=actual&point=${roundCoord(p.lat)},${roundCoord(p.lon)}`, { signal });
  return new Set((fc.features ?? []).map((f) => f.properties?.id).filter(Boolean));
}
