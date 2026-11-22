import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectMotion, closestApproach, headsUp, nearestStorm } from '../site/js/lib/paths.js';
import { destination, pointInGeometry } from '../site/js/lib/geo.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected}±${tol}, got ${actual}`);

const NOW = new Date('2026-11-22T02:03:00Z');
const UNTIL = new Date('2026-11-22T02:48:00Z');
const MIN = 60_000;
// 30 kt toward the east (moving FROM 270), reported 6 minutes ago.
const motion = { time: new Date(NOW.getTime() - 6 * MIN), dirFrom: 270, speedKt: 30, points: [{ lat: 35, lon: -97 }] };
const asPolygon = (ring) => ({ type: 'Polygon', coordinates: [ring.map((p) => [p.lon, p.lat])] });

test('projectMotion: moves the storm forward to now', () => {
  const proj = projectMotion(motion, NOW, UNTIL);
  near(proj.tracks[0].now.lon, -96.939, 0.003, 'now lon');
  near(proj.tracks[0].now.lat, 35, 0.01, 'now lat');
});

test('projectMotion: ticks fall on whole 10-minute clock times between now and until', () => {
  const { ticks } = projectMotion(motion, NOW, UNTIL).tracks[0];
  assert.deepEqual(ticks.map((t) => t.time.toISOString().slice(11, 16)), ['02:10', '02:20', '02:30', '02:40']);
  for (const t of ticks) assert.ok(t.time > NOW && t.time < UNTIL);
});

test('projectMotion: the cone covers the path ahead, not the sides', () => {
  const track = projectMotion(motion, NOW, UNTIL).tracks[0];
  const cone = asPolygon(track.cone);
  assert.equal(pointInGeometry(destination(track.now, 90, 20), cone), true, '20 km ahead');
  assert.equal(pointInGeometry(destination(track.now, 0, 20), cone), false, '20 km to the side');
});

test('projectMotion: nothing to project', () => {
  assert.equal(projectMotion(motion, NOW, new Date(NOW.getTime() - MIN)), null, 'until already passed');
  assert.equal(projectMotion({ ...motion, speedKt: 0 }, NOW, UNTIL), null, 'stationary');
  assert.equal(projectMotion(null, NOW, UNTIL), null, 'no motion');
});

test('projectMotion: a line of storms projects every position', () => {
  const proj = projectMotion({ ...motion, points: [{ lat: 35, lon: -97 }, { lat: 35.3, lon: -97.1 }] }, NOW, UNTIL);
  assert.equal(proj.tracks.length, 2);
});

test('closestApproach: a place just off the path', () => {
  const proj = projectMotion(motion, NOW, UNTIL);
  const place = destination(destination(proj.tracks[0].now, 90, 20), 0, 1);
  const ca = closestApproach(place, proj);
  near(ca.distanceKm, 1, 0.2, 'distance');
  near((ca.eta - NOW) / MIN, 21.6, 0.5, 'eta minutes');
  assert.equal(ca.insideCone, true);
});

test('headsUp: a place ahead of the storm gets minutes until arrival', () => {
  const proj = projectMotion(motion, NOW, UNTIL);
  const hu = headsUp(destination(proj.tracks[0].now, 90, 20), proj, NOW);
  assert.ok(hu);
  assert.equal(hu.minutes, 22);
});

test('headsUp: a place behind the storm gets none', () => {
  const proj = projectMotion(motion, NOW, UNTIL);
  assert.equal(headsUp(destination(proj.tracks[0].now, 270, 10), proj, NOW), null, '10 km behind');
  assert.equal(headsUp(destination(proj.tracks[0].now, 270, 5), proj, NOW), null, 'already passed, 5 km behind');
});

test('nearestStorm: toward or away', () => {
  const proj = projectMotion(motion, NOW, UNTIL);
  const projections = new Map([['a1', proj]]);
  const ahead = nearestStorm(destination(proj.tracks[0].now, 90, 30), projections);
  assert.equal(ahead.alertId, 'a1');
  assert.equal(ahead.toward, true);
  near(ahead.distanceKm, 30, 0.5, 'distance');
  assert.equal(nearestStorm(destination(proj.tracks[0].now, 270, 30), projections).toward, false);
  assert.equal(nearestStorm({ lat: 35, lon: -97 }, new Map()), null);
});
