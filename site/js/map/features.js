// Turns app data into the GeoJSON each map source draws. Pure functions.
// Properties stay flat (numbers, strings, booleans) because the map hands
// them back that way to the hover and tap explanations.

import { destination } from '../lib/geo.js';
import { isInEffect } from '../lib/status.js';
import { outlookPercent } from '../lib/outlook.js';

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
    const m = proj.motion;
    proj.tracks.forEach((track, k) => {
      const props = { id, event, track: k, until: proj.until.getTime(), dirFrom: m.dirFrom, speedKt: m.speedKt, motionTime: m.time.getTime() };
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
const TRAIL_EVENT = { TO: 'Tornado Warning', SV: 'Severe Thunderstorm Warning' };

/** Storm trails as gradient lines (two or more positions) plus a dot per position, fading with age. */
export function trailFeatures(trails, now) {
  const lines = [];
  const dots = [];
  for (const t of trails) {
    const event = TRAIL_EVENT[t.phenomena] ?? '';
    const alertId = t.latestAlertId ?? '';
    if (t.points.length >= 2) {
      const since = t.points[0].time.getTime();
      const last = t.points[t.points.length - 1].time.getTime();
      lines.push({ type: 'Feature', geometry: line(t.points.map((p) => p.pos)), properties: { id: t.id, phenomena: t.phenomena, event, alertId, since, last, count: t.points.length } });
    }
    for (const p of t.points) {
      const age = Math.min(1, Math.max(0, (now - p.time) / (TRAIL_HOURS * 3.6e6)));
      dots.push({ type: 'Feature', geometry: pt(p.pos), properties: { id: `${t.id}@${p.time.getTime()}`, trail: t.id, phenomena: t.phenomena, event, alertId, time: p.time.getTime(), opacity: Math.round((1 - 0.75 * age) * 100) / 100 } });
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
  if (!outlook) return fc([]);
  const base = { day: outlook.day, kind: outlook.kind, valid: outlook.valid?.getTime() ?? 0, expire: outlook.expire?.getTime() ?? 0 };
  return fc(
    outlook.features.map((f, i) => {
      const sig = /^SIGN/i.test(f.label);
      const pct = outlook.kind === 'cat' ? -1 : (outlookPercent(f) ?? -1);
      return { type: 'Feature', geometry: f.geometry, properties: { ...base, id: `d${outlook.day}-${f.label}-${i}`, label: f.label, label2: f.label2 ?? '', fill: f.fill, stroke: f.stroke, pct, sig } };
    }),
  );
}

/** SPC mesoscale discussions, with a short label for the map. */
export function discussionFeatures(list) {
  return fc(
    (list ?? []).map((d) => ({
      type: 'Feature',
      geometry: d.geometry,
      properties: {
        id: d.id,
        num: d.num,
        year: d.year,
        chance: d.watchChance ?? -1,
        concerning: d.concerning,
        issue: d.issue.getTime(),
        expire: d.expire.getTime(),
        label: d.watchChance != null ? `MD ${d.num}\n${d.watchChance}% watch chance` : `MD ${d.num}`,
      },
    })),
  );
}

/** NHC's own colors for low, medium and high chances of development. */
export const RISK_COLORS = Object.freeze({ low: '#ffff00', medium: '#ffa500', high: '#ff0000' });

const devProps = (x, risk) => ({ id: x.id, basin: x.basin, prob2: x.prob2, prob7: x.prob7, risk2: x.risk2, risk7: x.risk7, color: RISK_COLORS[risk] ?? RISK_COLORS.low });

/** Where tropical storms could form: seven-day areas (colored by the 7-day chance) and disturbance marks (by the 2-day chance). */
export function developmentFeatures(dev) {
  return {
    areas: fc((dev?.areas ?? []).map((a) => ({ type: 'Feature', geometry: a.geometry, properties: devProps(a, a.risk7) }))),
    points: fc((dev?.points ?? []).map((p) => ({ type: 'Feature', geometry: pt(p), properties: devProps(p, p.risk2) }))),
  };
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
    const props = { id: s.id, storm: s.id, name: s.name, label: s.label };
    if (s.cone) cones.push({ type: 'Feature', geometry: s.cone, properties: props });
    if (s.past) past.push({ type: 'Feature', geometry: s.past, properties: props });
    if (s.track) tracks.push({ type: 'Feature', geometry: s.track, properties: props });
    for (const p of s.points) {
      points.push({ type: 'Feature', geometry: pt(p), properties: { id: `${s.id}-${p.tau}`, storm: s.id, name: s.name, tau: p.tau, when: p.when, windMph: p.windMph, color: categoryColor(p.windMph) } });
    }
  }
  return { cones: fc(cones), past: fc(past), tracks: fc(tracks), points: fc(points) };
}
