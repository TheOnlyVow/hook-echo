import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAlarms } from '../site/js/lib/alarmRules.js';
import { makeAlert } from './helpers.js';

const status = (alerts, headsUp = null) => ({ level: 'shelter', alerts, top: alerts[0] ?? null, headsUp, stale: false });

test('a first tornado warning sounds the alarm', () => {
  const tor = makeAlert();
  const { events } = decideAlarms({}, { home: status([tor]) });
  assert.deepEqual(events.map((e) => [e.placeId, e.kind, e.alert.id]), [['home', 'alarm', tor.id]]);
});

test('no repeat alarm on update', () => {
  const tor = makeAlert();
  const first = decideAlarms({}, { home: status([tor]) });
  const update = makeAlert({ vtec: tor.vtec, rank: tor.rank }); // a CON message: new id, same event
  const { events } = decideAlarms(first.memory, { home: status([update]) });
  assert.equal(events.length, 0);
});

test('upgrade alarms again, a downgrade does not', () => {
  const tor = makeAlert({ rank: 93 });
  const m1 = decideAlarms({}, { home: status([tor]) }).memory;
  const emergency = makeAlert({ vtec: tor.vtec, rank: 100 });
  const up = decideAlarms(m1, { home: status([emergency]) });
  assert.deepEqual(up.events.map((e) => e.kind), ['alarm']);
  const down = decideAlarms(up.memory, { home: status([makeAlert({ vtec: tor.vtec, rank: 93 })]) });
  assert.equal(down.events.length, 0);
});

test('severe thunderstorm warnings chime and watches below tornado stay silent', () => {
  const svr = makeAlert({ event: 'Severe Thunderstorm Warning', level: 'chime', rank: 78, vtec: { key: 'KOUN.SV.W.0100.2026' } });
  const svrWatch = makeAlert({ event: 'Severe Thunderstorm Watch', level: 'silent', rank: 46, vtec: { key: 'KOUN.SV.A.0600.2026' } });
  const { events } = decideAlarms({}, { home: status([svr, svrWatch]) });
  assert.deepEqual(events.map((e) => e.kind), ['chime']);
});

test('a heads-up fires once', () => {
  const tor = makeAlert({ geometry: null });
  const hu = { alertId: tor.id, eta: new Date(), distanceKm: 2, minutes: 12 };
  const first = decideAlarms({}, { mom: { level: 'clear', alerts: [], top: null, headsUp: hu, stale: false } }, [tor]);
  assert.deepEqual(first.events.map((e) => [e.placeId, e.kind]), [['mom', 'headsup']]);
  const again = decideAlarms(first.memory, { mom: { level: 'clear', alerts: [], top: null, headsUp: hu, stale: false } }, [tor]);
  assert.equal(again.events.length, 0);
});

test('memory forgets alerts that are gone, so a new one alarms', () => {
  const tor = makeAlert();
  const m1 = decideAlarms({}, { home: status([tor]) }).memory;
  const cleared = decideAlarms(m1, { home: status([]) }).memory;
  assert.deepEqual(cleared.home, {});
  const again = decideAlarms(cleared, { home: status([tor]) });
  assert.equal(again.events.length, 1);
});

test('places that disappear are dropped from memory', () => {
  const m1 = decideAlarms({}, { home: status([makeAlert()]) }).memory;
  assert.deepEqual(decideAlarms(m1, {}).memory, {});
});
