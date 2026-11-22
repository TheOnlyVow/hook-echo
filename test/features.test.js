import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertFeatures, pathFeatures, trailFeatures, reportFeatures, circlePolygon, tropicalFeatures } from '../site/js/map/features.js';
import { projectMotion } from '../site/js/lib/paths.js';
import { distanceKm } from '../site/js/lib/geo.js';
import { NOW, MIN, PLACE, makeAlert, squareAround } from './helpers.js';

test('alertFeatures: kinds, rank order, and alerts without any shape left off the map', () => {
  const tor = makeAlert({ rank: 90 });
  const svr = makeAlert({ event: 'Severe Thunderstorm Warning', rank: 78, color: '#FFA500' });
  const watch = makeAlert({ event: 'Tornado Watch', geometry: null, rank: 50 });
  const winter = makeAlert({ event: 'Winter Storm Warning', geometry: null, rank: 60 });
  const orphan = makeAlert({ event: 'Wind Advisory', geometry: null, rank: 20 });
  const shapes = new Map([[watch.id, { geometry: squareAround(PLACE, 1) }], [winter.id, { geometry: squareAround(PLACE, 2) }]]);
  const fc = alertFeatures([tor, svr, watch, winter, orphan], shapes, NOW);
  assert.deepEqual(
    fc.features.map((f) => [f.properties.event, f.properties.kind]),
    [['Tornado Watch', 'watch'], ['Winter Storm Warning', 'zone'], ['Severe Thunderstorm Warning', 'sbw'], ['Tornado Warning', 'sbw']],
  );
  assert.equal(fc.features[3].properties.id, tor.id);
  assert.equal(fc.features[3].properties.life, false);
});

test('alertFeatures: emergencies and PDS are marked life-threatening; expired alerts dropped', () => {
  const emergency = makeAlert({ tags: [{ kind: 'emergency', label: 'Tornado emergency' }], rank: 100 });
  const expired = makeAlert({ expires: new Date(NOW.getTime() - MIN) });
  const fc = alertFeatures([emergency, expired], new Map(), NOW);
  assert.equal(fc.features.length, 1);
  assert.equal(fc.features[0].properties.life, true);
});

test('pathFeatures: cone, center line, arrow pointing the way, ticks with clock labels', () => {
  const motion = { time: NOW, dirFrom: 270, speedKt: 30, points: [{ lat: 35, lon: -97 }] };
  const alert = makeAlert({ motion, color: '#FF0000' });
  const proj = projectMotion(motion, NOW, new Date(NOW.getTime() + 40 * MIN));
  const f = pathFeatures(new Map([[alert.id, proj]]), new Map([[alert.id, alert]]));
  assert.equal(f.paths.features.length, 1);
  assert.equal(f.paths.features[0].geometry.type, 'LineString');
  assert.equal(f.cones.features[0].geometry.type, 'Polygon');
  assert.ok(Math.abs(f.ends.features[0].properties.bearing - 90) < 1);
  assert.equal(f.ticks.features.length, proj.tracks[0].ticks.length);
  assert.ok(f.ticks.features[0].properties.time > NOW.getTime());
  assert.equal(f.storms.features[0].properties.color, '#FF0000');
  assert.equal(f.storms.features[0].properties.id, alert.id);
});

test('trailFeatures: lines need two points; older dots fade', () => {
  const trails = [
    { id: 'a', phenomena: 'TO', points: [{ pos: { lat: 35, lon: -97.5 }, time: new Date(NOW.getTime() - 60 * MIN) }, { pos: { lat: 35, lon: -97 }, time: NOW }], latestAlertId: 'x' },
    { id: 'b', phenomena: 'SV', points: [{ pos: { lat: 36, lon: -97 }, time: NOW }], latestAlertId: 'y' },
  ];
  const f = trailFeatures(trails, NOW);
  assert.equal(f.lines.features.length, 1);
  assert.equal(f.dots.features.length, 3);
  const [old, fresh] = f.dots.features;
  assert.ok(old.properties.opacity < fresh.properties.opacity);
});

test('reportFeatures: only enabled types, with age and a sort key that puts tornadoes on top', () => {
  const r = (type, minutesAgo) => ({ id: `${type}${minutesAgo}`, type, label: type, time: new Date(NOW.getTime() - minutesAgo * MIN), lat: 35, lon: -97, magnitudeText: '' });
  const fc = reportFeatures([r('hail', 30), r('tornado', 120), r('other', 10)], NOW, new Set(['hail', 'tornado']));
  assert.equal(fc.features.length, 2);
  const tor = fc.features.find((f) => f.properties.type === 'tornado');
  const hail = fc.features.find((f) => f.properties.type === 'hail');
  assert.equal(tor.properties.ageH, 2);
  assert.ok(tor.properties.sort > hail.properties.sort);
});

test('circlePolygon: every vertex sits at the radius', () => {
  const ring = circlePolygon(PLACE, 5).coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  for (const [lon, lat] of ring) assert.ok(Math.abs(distanceKm(PLACE, { lat, lon }) - 5) < 0.01);
});

test('tropicalFeatures: cone, past and forecast track, colored points', () => {
  const storm = {
    id: 'AT1',
    name: 'Kirk',
    label: 'Category 4 hurricane',
    points: [{ lat: 20, lon: -45, tau: 0, windMph: 132, ss: 4, when: '11 PM Thu' }, { lat: 21, lon: -46, tau: 12, windMph: 121, ss: 3, when: '8 PM Fri' }],
    cone: squareAround({ lat: 22, lon: -47 }, 3),
    track: { type: 'LineString', coordinates: [[-45, 20], [-46, 21]] },
    past: null,
  };
  const f = tropicalFeatures([storm]);
  assert.equal(f.cones.features.length, 1);
  assert.equal(f.tracks.features.length, 1);
  assert.equal(f.past.features.length, 0);
  assert.equal(f.points.features.length, 2);
  assert.notEqual(f.points.features[0].properties.color, f.points.features[1].properties.color);
});
