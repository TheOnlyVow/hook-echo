// Turns app data into the GeoJSON each map source draws. Pure functions.

import { destination } from '../lib/geo.js';
import { isInEffect } from '../lib/status.js';

const fc = (features) => ({ type: 'FeatureCollection', features });
const pt = (p) => ({ type: 'Point', coordinates: [p.lon, p.lat] });
const line = (pts) => ({ type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) });

/**
 * Alert shapes: storm-based polygons, then county/zone shapes for alerts that
 * have none of their own. Sorted by rank so the most serious draws on top.
 */
export function alertFeatures(alerts, shapes, now) {
  const out = [];
  for (const a of alerts) {
    if (!isInEffect(a, now)) continue;
    const geometry = a.geometry ?? shapes?.get(a.id)?.geometry;
    if (!geometry) continue;
    const kind = /Watch$/.test(a.event) ? 'watch' : a.geometry ? 'sbw' : 'zone';
    const life = a.tags.some((t) => t.kind === 'emergency' || t.kind === 'pds');
    out.push({ type: 'Feature', geometry, properties: { id: a.id, event: a.event, color: a.color, rank: a.rank, level: a.level, kind, life } });
  }
  return fc(out.sort((x, y) => x.properties.rank - y.properties.rank));
}

/** Projected paths: cone, center line, arrowhead, 10-minute ticks and each storm's position now. */
export function pathFeatures(projections, alertsById) {
  const cones = [];
  const paths = [];
  const ends = [];
  const ticks = [];
  const storms = [];
  for (const [id, proj] of projections) {
    if (!proj) continue;
    const alert = alertsById.get(id);
    const event = alert?.event ?? '';
    proj.tracks.forEach((track, k) => {
      const props = { id, event, track: k };
      cones.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [track.cone.map((q) => [q.lon, q.lat])] }, properties: props });
      paths.push({ type: 'Feature', geometry: line([track.now, track.end]), properties: props });
      ends.push({ type: 'Feature', geometry: pt(track.end), properties: { ...props, bearing: proj.heading } });
      for (const tick of track.ticks) ticks.push({ type: 'Feature', geometry: pt(tick.pos), properties: { ...props, time: tick.time.getTime() } });
      storms.push({ type: 'Feature', geometry: pt(track.now), properties: { ...props, color: alert?.color ?? '#ff0000' } });
    });
  }
  return { cones: fc(cones), paths: fc(paths), ends: fc(ends), ticks: fc(ticks), storms: fc(storms) };
}

const TRAIL_HOURS = 4;

/** Storm trails as gradient lines (two or more positions) plus a dot per position, fading with age. */
export function trailFeatures(trails, now) {
  const lines = [];
  const dots = [];
  for (const t of trails) {
    if (t.points.length >= 2) lines.push({ type: 'Feature', geometry: line(t.points.map((p) => p.pos)), properties: { id: t.id, phenomena: t.phenomena } });
    for (const p of t.points) {
      const age = Math.min(1, Math.max(0, (now - p.time) / (TRAIL_HOURS * 3.6e6)));
      dots.push({ type: 'Feature', geometry: pt(p.pos), properties: { id: `${t.id}@${p.time.getTime()}`, trail: t.id, phenomena: t.phenomena, time: p.time.getTime(), opacity: Math.round((1 - 0.75 * age) * 100) / 100 } });
    }
  }
  return { lines: fc(lines), dots: fc(dots) };
}

const REPORT_SORT = { tornado: 6, funnel: 5, hail: 4, wind: 3, flood: 2, other: 1 };

/** Storm reports of the enabled types, with their age in hours. */
export function reportFeatures(reports, now, enabled) {
  return fc(
    reports
      .filter((r) => enabled.has(r.type))
      .map((r) => ({
        type: 'Feature',
        geometry: pt(r),
        properties: { id: r.id, type: r.type, label: r.label, ageH: Math.round(((now - r.time) / 3.6e6) * 10) / 10, sort: REPORT_SORT[r.type] ?? 0 },
      })),
  );
}

/** Survey damage paths. */
export function surveyFeatures(surveys) {
  return fc(surveys.map((s) => ({ type: 'Feature', geometry: s.geometry, properties: { id: s.id, ef: s.ef } })));
}

/** SPC outlook areas, lowest category first so higher ones draw on top. */
export function outlookFeatures(outlook) {
  return fc((outlook?.features ?? []).map((f, i) => ({ type: 'Feature', geometry: f.geometry, properties: { id: `${f.label}-${i}`, label: f.label, fill: f.fill, stroke: f.stroke } })));
}

/** A circle of radius km around a point, as a polygon. */
export function circlePolygon(center, radiusKm, steps = 48) {
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const p = destination(center, (360 * i) / steps, radiusKm);
    ring.push([p.lon, p.lat]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Saffir-Simpson colors by sustained wind in mph. */
export function categoryColor(windMph) {
  const w = Number(windMph) || 0;
  if (w >= 157) return '#ff6060';
  if (w >= 130) return '#ff8f20';
  if (w >= 111) return '#ffc140';
  if (w >= 96) return '#ffe775';
  if (w >= 74) return '#ffffcc';
  if (w >= 39) return '#00faf4';
  return '#5ebaff';
}

/** Tropical storms: forecast cones, past and forecast tracks, and forecast points. */
export function tropicalFeatures(storms) {
  const cones = [];
  const past = [];
  const tracks = [];
  const points = [];
  for (const s of storms) {
    if (s.cone) cones.push({ type: 'Feature', geometry: s.cone, properties: { id: s.id } });
    if (s.past) past.push({ type: 'Feature', geometry: s.past, properties: { id: s.id } });
    if (s.track) tracks.push({ type: 'Feature', geometry: s.track, properties: { id: s.id } });
    for (const p of s.points) {
      points.push({ type: 'Feature', geometry: pt(p), properties: { id: `${s.id}-${p.tau}`, storm: s.id, name: s.name, tau: p.tau, when: p.when, windMph: p.windMph, color: categoryColor(p.windMph) } });
    }
  }
  return { cones: fc(cones), past: fc(past), tracks: fc(tracks), points: fc(points) };
}
