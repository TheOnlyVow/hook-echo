import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertFeatures, pathFeatures, trailFeatures, reportFeatures, circlePolygon, tropicalFeatures, outlookFeatures, discussionFeatures, developmentFeatures } from '../site/js/map/features.js';
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

test('pathFeatures: every piece carries what its explanation needs', () => {
  const motion = { time: new Date(NOW.getTime() - 4 * MIN), dirFrom: 225, speedKt: 26, points: [{ lat: 35, lon: -97 }] };
  const alert = makeAlert({ event: 'Severe Thunderstorm Warning', motion, color: '#FFA500' });
  const until = new Date(NOW.getTime() + 25 * MIN);
  const f = pathFeatures(new Map([[alert.id, projectMotion(motion, NOW, until)]]), new Map([[alert.id, alert]]));
  for (const fc of [f.cones, f.paths, f.ends, f.ticks, f.storms]) {
    const p = fc.features[0].properties;
    assert.equal(p.event, 'Severe Thunderstorm Warning');
    assert.equal(p.until, until.getTime());
    assert.equal(p.dirFrom, 225);
    assert.equal(p.speedKt, 26);
    assert.equal(p.motionTime, motion.time.getTime());
  }
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

test('trailFeatures: lines and dots say which warning they belong to and when', () => {
  const trails = [{ id: 'a', phenomena: 'TO', points: [{ pos: { lat: 35, lon: -97.5 }, time: new Date(NOW.getTime() - 40 * MIN) }, { pos: { lat: 35, lon: -97 }, time: NOW }], latestAlertId: 'x' }];
  const f = trailFeatures(trails, NOW);
  assert.deepEqual(
    { ...f.lines.features[0].properties },
    { id: 'a', phenomena: 'TO', event: 'Tornado Warning', alertId: 'x', since: NOW.getTime() - 40 * MIN, last: NOW.getTime(), count: 2 },
  );
  assert.equal(f.dots.features[0].properties.alertId, 'x');
  assert.equal(f.dots.features[0].properties.event, 'Tornado Warning');
  assert.equal(trailFeatures([{ ...trails[0], phenomena: 'SV' }], NOW).lines.features[0].properties.event, 'Severe Thunderstorm Warning');
});

test('outlookFeatures: each area knows its day, kind, window and percent', () => {
  const outlook = {
    day: 2,
    kind: 'torn',
    valid: new Date('2026-11-22T12:00:00Z'),
    expire: new Date('2026-11-23T12:00:00Z'),
    features: [
      { label: '0.05', label2: '5% Tornado Risk', dn: 5, geometry: squareAround(PLACE, 2), fill: '#8b4726', stroke: '#000' },
      { label: 'SIGN', label2: 'Significant Tornado Risk', dn: 0, geometry: squareAround(PLACE, 1), fill: '#000', stroke: '#000' },
    ],
  };
  const [five, sign] = outlookFeatures(outlook).features.map((f) => f.properties);
  assert.equal(five.day, 2);
  assert.equal(five.kind, 'torn');
  assert.equal(five.pct, 5);
  assert.equal(five.valid, outlook.valid.getTime());
  assert.equal(five.expire, outlook.expire.getTime());
  assert.equal(sign.pct, -1, 'significant areas have no percent');
  assert.equal(sign.sig, true);
  assert.equal(outlookFeatures(null).features.length, 0);
});

test('discussionFeatures: outline and label text for each discussion', () => {
  const d = { id: 'md1', num: 2462, year: 2026, issue: new Date(NOW.getTime() - 20 * MIN), expire: new Date(NOW.getTime() + 60 * MIN), watchChance: 80, concerning: 'SEVERE POTENTIAL...TORNADO WATCH LIKELY', geometry: squareAround(PLACE, 1) };
  const p = discussionFeatures([d, { ...d, id: 'md2', num: 7, watchChance: null }]).features.map((f) => f.properties);
  assert.equal(p[0].num, 2462);
  assert.equal(p[0].chance, 80);
  assert.equal(p[0].label, 'MD 2462\n80% watch chance');
  assert.equal(p[1].chance, -1);
  assert.equal(p[1].label, 'MD 7');
  assert.equal(p[0].expire, d.expire.getTime());
});

test('developmentFeatures: areas and disturbance marks, colored by NHC risk', () => {
  const dev = {
    areas: [{ id: 'a', basin: 'Atlantic', prob2: 10, prob7: 50, risk2: 'low', risk7: 'medium', geometry: squareAround(PLACE, 3) }],
    points: [{ id: 'p', basin: 'Atlantic', prob2: 70, prob7: 90, risk2: 'high', risk7: 'high', lat: 25, lon: -70 }],
  };
  const f = developmentFeatures(dev);
  assert.equal(f.areas.features[0].properties.color, '#ffa500');
  assert.equal(f.areas.features[0].properties.prob7, 50);
  assert.equal(f.points.features[0].properties.color, '#ff0000');
  assert.deepEqual(f.points.features[0].geometry.coordinates, [-70, 25]);
  assert.equal(developmentFeatures(null).areas.features.length, 0);
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
