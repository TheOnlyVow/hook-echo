import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrails } from '../site/js/lib/trails.js';
import { destination } from '../site/js/lib/geo.js';
import { NOW, MIN, makeAlert } from './helpers.js';

const KMH = 30 * 1.852;
const START = { lat: 35, lon: -97.5 };
const T0 = new Date(NOW.getTime() - 60 * MIN);
const at = (minutes) => new Date(T0.getTime() + minutes * MIN);
const posAt = (minutes) => destination(START, 90, (KMH * minutes) / 60);

function message(key, minutes, pos, endMinutes, phenomena = 'TO') {
  return makeAlert({
    sent: at(minutes),
    vtec: { key, phenomena, end: at(endMinutes) },
    motion: { time: at(minutes), dirFrom: 270, speedKt: 30, points: [pos] },
  });
}

test('updates of one warning make one time-ordered trail', () => {
  const a = [message('A', 30, posAt(30), 40), message('A', 0, posAt(0), 40), message('A', 15, posAt(15), 40)];
  const trails = buildTrails(a, NOW);
  assert.equal(trails.length, 1);
  assert.deepEqual(trails[0].points.map((p) => p.time.getTime()), [at(0), at(15), at(30)].map((d) => d.getTime()));
  assert.equal(trails[0].phenomena, 'TO');
  assert.equal(trails[0].latestAlertId, a[0].id);
});

test('a follow-on warning near the projected spot joins the same trail', () => {
  const first = [message('A', 0, posAt(0), 40), message('A', 15, posAt(15), 40)];
  const next = message('B', 45, destination(posAt(45), 0, 5), 90);
  const trails = buildTrails([...first, next], NOW);
  assert.equal(trails.length, 1);
  assert.equal(trails[0].points.length, 3);
  assert.equal(trails[0].latestAlertId, next.id);
});

test('a warning far from the projected spot starts its own trail', () => {
  const first = [message('A', 0, posAt(0), 40), message('A', 15, posAt(15), 40)];
  const other = message('B', 45, destination(posAt(45), 0, 50), 90);
  assert.equal(buildTrails([...first, other], NOW).length, 2);
});

test('a severe storm that becomes tornadic is one trail marked TO', () => {
  const svr = message('S', 0, posAt(0), 30, 'SV');
  const tor = message('T', 20, posAt(20), 60, 'TO');
  const trails = buildTrails([svr, tor], NOW);
  assert.equal(trails.length, 1);
  assert.equal(trails[0].phenomena, 'TO');
});

test('points older than 4 hours are dropped', () => {
  const old = new Date(NOW.getTime() - 5 * 60 * MIN);
  const a = makeAlert({ vtec: { key: 'OLD', phenomena: 'TO', end: new Date(NOW.getTime() - 170 * MIN) }, motion: { time: old, dirFrom: 270, speedKt: 30, points: [START] } });
  const b = makeAlert({ vtec: { key: 'OLD', phenomena: 'TO', end: new Date(NOW.getTime() - 170 * MIN) }, motion: { time: new Date(NOW.getTime() - 180 * MIN), dirFrom: 270, speedKt: 30, points: [START] } });
  const trails = buildTrails([a, b], NOW);
  assert.equal(trails.length, 1);
  assert.equal(trails[0].points.length, 1);
});

test('a duplicate time point is kept once', () => {
  const a = [message('A', 0, posAt(0), 40), message('A', 0, posAt(0), 40), message('A', 10, posAt(10), 40)];
  assert.equal(buildTrails(a, NOW)[0].points.length, 2);
});

test('alerts without motion or VTEC are ignored', () => {
  assert.deepEqual(buildTrails([makeAlert({ motion: null }), makeAlert({ vtec: null, motion: { time: NOW, dirFrom: 270, speedKt: 30, points: [START] } })], NOW), []);
});
