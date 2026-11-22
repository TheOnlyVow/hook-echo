import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulatedTornadoWarning, isSimulated } from '../site/js/lib/sim.js';
import { statusReasons } from '../site/js/lib/why.js';
import { createLog, formatArgs } from '../site/js/lib/logbuf.js';
import { inspect } from '../site/js/lib/inspect.js';
import { pointInGeometry } from '../site/js/lib/geo.js';
import { projectMotion, headsUp } from '../site/js/lib/paths.js';
import { placeStatus } from '../site/js/lib/status.js';
import { decideAlarms } from '../site/js/lib/alarmRules.js';
import { buildTrails } from '../site/js/lib/trails.js';
import { NOW, MIN, PLACE, makeAlert, squareAround } from './helpers.js';

const HOME = { id: 'home', kind: 'home', name: 'Home', ...PLACE };

test('simulatedTornadoWarning: covers the place, labeled as a test everywhere it shows', () => {
  const { alert } = simulatedTornadoWarning(HOME, { now: NOW, seq: 3 });
  assert.ok(pointInGeometry(HOME, alert.geometry), 'the polygon covers the place');
  assert.equal(alert.event, 'Tornado Warning');
  assert.equal(alert.simulated, true);
  assert.ok(isSimulated(alert));
  assert.ok(!isSimulated(makeAlert()));
  assert.match(alert.headline, /^Simulated Tornado Warning for Home/);
  assert.match(alert.description, /No real warning is in effect/);
  assert.deepEqual(alert.tags, [{ kind: 'simulated', label: 'Simulated' }]);
  assert.equal(alert.senderName, 'Hook Echo developer test');
  assert.equal(alert.expires.getTime() - NOW.getTime(), 30 * MIN);
  assert.match(alert.id, /^sim:/);
  assert.match(alert.vtec.key, /^XSIM\.TO\.W\.0003\.2026$/);
});

test('simulatedTornadoWarning: a storm upwind heading for the place, so paths, heads-ups and alarms all run', () => {
  const { alert } = simulatedTornadoWarning(HOME, { now: NOW, seq: 1, dirFrom: 240, speedKt: 35, minutes: 30 });
  const proj = projectMotion(alert.motion, NOW, alert.expires);
  const hu = headsUp(HOME, proj, NOW);
  assert.ok(hu && hu.minutes >= 6 && hu.minutes <= 14, `arrives in about 10 min, got ${hu?.minutes}`);
  const status = placeStatus(HOME, { alerts: [alert], shapes: new Map(), projections: new Map([[alert.id, proj]]), now: NOW, stale: false });
  assert.equal(status.level, 'shelter');
  const { events } = decideAlarms({}, { home: status }, [alert]);
  assert.ok(events.some((e) => e.kind === 'alarm' && e.alert.id === alert.id));
});

test('simulatedTornadoWarning: two earlier positions make a trail behind the storm', () => {
  const { alert, history } = simulatedTornadoWarning(HOME, { now: NOW, seq: 2 });
  assert.equal(history.length, 2);
  assert.ok(history.every((h) => h.vtec.key === alert.vtec.key && h.motion.time < alert.motion.time));
  const trails = buildTrails([...history, alert], NOW);
  assert.equal(trails.length, 1);
  assert.equal(trails[0].points.length, 3);
  assert.equal(trails[0].latestAlertId, alert.id);
  const again = simulatedTornadoWarning(HOME, { now: NOW, seq: 4 }).alert;
  assert.notEqual(again.id, alert.id);
});

test('statusReasons: which alerts cover a place and how', () => {
  const tor = makeAlert({ geometry: squareAround(PLACE, 0.3) });
  const watch = makeAlert({ event: 'Tornado Watch', geometry: null, rank: 50, placeLevel: 'watch' });
  const advisory = makeAlert({ event: 'Wind Advisory', geometry: null, rank: 20, placeLevel: 'advisory' });
  const shapes = new Map([[watch.id, { geometry: squareAround(PLACE, 2) }]]);
  const ctx = { alerts: [tor, watch, advisory], shapes, pointHits: new Set([advisory.id, watch.id]), projections: new Map(), now: NOW, stale: false, feedAgeMs: 30_000 };
  const r = statusReasons(PLACE, ctx);
  assert.equal(r.level, 'shelter');
  assert.deepEqual(r.covering.map((c) => [c.event, c.via]), [
    ['Tornado Warning', ['storm polygon']],
    ['Tornado Watch', ['zone shape', 'NWS point check']],
    ['Wind Advisory', ['NWS point check']],
  ]);
  assert.match(r.lines[0], /^Take shelter, because a Tornado Warning covers it/);
});

test('statusReasons: clear, stale and heads-up explanations', () => {
  const clear = statusReasons(PLACE, { alerts: [], shapes: new Map(), projections: new Map(), now: NOW, stale: false, feedAgeMs: 40_000 });
  assert.equal(clear.level, 'clear');
  assert.match(clear.lines[0], /^Clear: no alert covers it/);
  const stale = statusReasons(PLACE, { alerts: [], shapes: new Map(), projections: new Map(), now: NOW, stale: true, feedAgeMs: 7 * MIN });
  assert.equal(stale.level, 'unknown');
  assert.match(stale.lines.join(' '), /7 min old/);
  const far = { lat: PLACE.lat - 0.15, lon: PLACE.lon - 0.2 };
  const tor = makeAlert({ geometry: squareAround(far, 0.12), motion: { time: NOW, dirFrom: 225, speedKt: 35, points: [far] } });
  const proj = projectMotion(tor.motion, NOW, tor.expires);
  const hu = statusReasons(PLACE, { alerts: [tor], shapes: new Map(), projections: new Map([[tor.id, proj]]), now: NOW, stale: false, feedAgeMs: 0, timeZone: 'America/Chicago' });
  assert.ok(hu.headsUp, 'heads-up expected');
  assert.ok(hu.lines.some((l) => /^Heads-up: the Tornado Warning storm passes/.test(l)), hu.lines.join(' | '));
});

test('createLog: newest last, capped, filterable, and listeners hear every entry', () => {
  let t = 1000;
  const log = createLog({ limit: 3, now: () => t++ });
  const heard = [];
  log.subscribe((e) => heard.push(e.message));
  log.push({ level: 'info', source: 'feed', message: 'storm ok' });
  log.push({ level: 'error', source: 'app', message: 'boom' });
  log.push({ level: 'warn', source: 'map', message: 'slow tiles' });
  log.push({ level: 'info', source: 'feed', message: 'radar ok' });
  assert.deepEqual(log.list().map((e) => e.message), ['boom', 'slow tiles', 'radar ok']);
  assert.deepEqual(log.list({ level: 'error' }).map((e) => e.message), ['boom']);
  assert.deepEqual(log.list({ text: 'OK' }).map((e) => e.message), ['radar ok']);
  assert.deepEqual(log.counts(), { error: 1, warn: 1, info: 1, debug: 0, input: 0, result: 0 });
  assert.equal(heard.length, 4);
  assert.ok(log.list()[0].time < log.list()[2].time);
  log.clear();
  assert.equal(log.list().length, 0);
});

test('formatArgs: console arguments as one readable line', () => {
  assert.equal(formatArgs(['Map error:', 'tile failed']), 'Map error: tile failed');
  const e = new TypeError('x is undefined');
  assert.match(formatArgs([e]), /^TypeError: x is undefined/);
  assert.equal(formatArgs([{ a: 1 }, 2]), '{ a: 1 } 2');
});

test('inspect: dates, maps, sets, errors, cycles and long values stay readable', () => {
  assert.equal(inspect(new Date('2026-11-22T02:03:00Z')), '2026-11-22T02:03:00.000Z');
  assert.equal(inspect(new Map([['a', 1]])), 'Map(1) { a => 1 }');
  assert.equal(inspect(new Set([1, 2])), 'Set(2) { 1, 2 }');
  assert.equal(inspect({ a: [1, 2], b: 'x' }), "{ a: [ 1, 2 ], b: 'x' }");
  const cyc = { name: 'loop' };
  cyc.self = cyc;
  assert.equal(inspect(cyc), "{ name: 'loop', self: [Circular] }");
  assert.equal(inspect({ a: { b: { c: { d: 1 } } } }, { depth: 2 }), '{ a: { b: { c: [Object] } } }');
  assert.match(inspect(Array.from({ length: 60 }, (_, i) => i), { maxItems: 5 }), /^\[ 0, 1, 2, 3, 4, … 55 more \]$/);
  assert.equal(inspect(undefined), 'undefined');
  assert.equal(inspect(function named() {}), '[Function named]');
  assert.match(inspect(new RangeError('bad')), /^RangeError: bad/);
  const wide = inspect({ list: Array.from({ length: 30 }, (_, i) => `item ${i}`) }, { maxItems: 40 });
  assert.ok(wide.includes('\n'), 'long values wrap onto several lines');
});
