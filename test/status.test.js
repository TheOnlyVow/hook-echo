import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coveringAlerts, placeStatus } from '../site/js/lib/status.js';
import { projectMotion } from '../site/js/lib/paths.js';
import { NOW, MIN, PLACE, makeAlert, squareAround } from './helpers.js';

const ctx = (over = {}) => ({ alerts: [], shapes: new Map(), pointHits: undefined, projections: new Map(), now: NOW, stale: false, ...over });

test('stale feeds never report clear', () => {
  assert.equal(placeStatus(PLACE, ctx({ stale: true })).level, 'unknown');
  const warned = placeStatus(PLACE, ctx({ stale: true, alerts: [makeAlert()] }));
  assert.equal(warned.level, 'shelter');
  assert.equal(warned.stale, true);
  assert.equal(placeStatus(PLACE, ctx()).level, 'clear');
});

test('point check covers shapeless alert', () => {
  const shapeless = makeAlert({ event: 'Winter Storm Warning', geometry: null, placeLevel: 'warning', level: 'silent', rank: 60 });
  assert.deepEqual(coveringAlerts(PLACE, [shapeless], new Map(), new Set([shapeless.id]), NOW), [shapeless]);
  assert.deepEqual(coveringAlerts(PLACE, [shapeless], new Map(), undefined, NOW), []);
  assert.deepEqual(coveringAlerts(PLACE, [shapeless], new Map(), new Set(), NOW), []);
});

test('a zone shape covering the place counts', () => {
  const zone = makeAlert({ event: 'Tornado Watch', geometry: null, placeLevel: 'watch', level: 'chime', rank: 50 });
  const shapes = new Map([[zone.id, { geometry: squareAround(PLACE, 1) }]]);
  assert.equal(placeStatus(PLACE, ctx({ alerts: [zone], shapes })).level, 'watch');
});

test('expired and cancelled alerts do not count', () => {
  const expired = makeAlert({ expires: new Date(NOW.getTime() - MIN) });
  const cancelled = makeAlert({ cancelled: true });
  assert.equal(placeStatus(PLACE, ctx({ alerts: [expired, cancelled] })).level, 'clear');
});

test('an alert that ends after its message expires is still in effect', () => {
  const longEvent = makeAlert({ expires: new Date(NOW.getTime() - MIN), ends: new Date(NOW.getTime() + 60 * MIN) });
  assert.equal(placeStatus(PLACE, ctx({ alerts: [longEvent] })).level, 'shelter');
});

test('the most serious covering alert is on top', () => {
  const watch = makeAlert({ event: 'Tornado Watch', placeLevel: 'watch', level: 'chime', rank: 50 });
  const warning = makeAlert({ rank: 93 });
  const s = placeStatus(PLACE, ctx({ alerts: [watch, warning] }));
  assert.equal(s.top, warning);
  assert.deepEqual(s.alerts, [warning, watch]);
});

test('a place outside every alert is clear', () => {
  const far = makeAlert({ geometry: squareAround({ lat: 40, lon: -90 }) });
  assert.equal(placeStatus(PLACE, ctx({ alerts: [far] })).level, 'clear');
});

test('heads-up comes from tornado warnings heading toward the place', () => {
  const motion = { time: NOW, dirFrom: 270, speedKt: 30, points: [{ lat: 35, lon: -97.25 }] };
  const tor = makeAlert({ geometry: squareAround({ lat: 35, lon: -97.25 }, 0.05), motion });
  const svr = makeAlert({ event: 'Severe Thunderstorm Warning', geometry: squareAround({ lat: 35, lon: -97.25 }, 0.05), motion, placeLevel: 'warning', level: 'chime', rank: 78 });
  const until = new Date(NOW.getTime() + 45 * MIN);
  const withTor = placeStatus(PLACE, ctx({ alerts: [tor], projections: new Map([[tor.id, projectMotion(motion, NOW, until)]]) }));
  assert.equal(withTor.headsUp.alertId, tor.id);
  assert.ok(withTor.headsUp.minutes > 0);
  const withSvr = placeStatus(PLACE, ctx({ alerts: [svr], projections: new Map([[svr.id, projectMotion(motion, NOW, until)]]) }));
  assert.equal(withSvr.headsUp, null);
});
