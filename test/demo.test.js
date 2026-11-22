import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayAt, shiftAlert, demoRadar } from '../site/js/data/demo.js';
import { normalizeAlerts } from '../site/js/data/alerts.js';
import { radarFrames } from '../site/js/data/radar.js';

const event = JSON.parse(readFileSync(new URL('../site/demo/event.json', import.meta.url), 'utf8'));
const alerts = normalizeAlerts({ features: event.alerts });
const torKeys = (list) => list.filter((a) => a.event === 'Tornado Warning').map((a) => a.vtec.key.split('.').slice(0, 4).join('.')).sort();

test('replayAt: the warnings in effect at 6:40 PM EST', () => {
  const { active } = replayAt(alerts, new Date('2026-11-21T23:40:00Z'));
  assert.deepEqual(torKeys(active), ['KMFL.TO.W.0004', 'KMLB.TO.W.0005']);
});

test('replayAt: five minutes later one expired and a new one was issued', () => {
  const { active, recent } = replayAt(alerts, new Date('2026-11-21T23:45:00Z'));
  assert.deepEqual(torKeys(active), ['KMFL.TO.W.0004', 'KMLB.TO.W.0006']);
  assert.ok(recent.every((a) => a.sent <= new Date('2026-11-21T23:45:00Z')));
  assert.ok(recent.length > active.length, 'recent keeps earlier messages for trails');
});

test('shiftAlert: every time moves together and the original is untouched', () => {
  const a = alerts.find((x) => x.motion && x.vtec?.end);
  const hour = 3.6e6;
  const s = shiftAlert(a, hour);
  for (const k of ['sent', 'expires']) assert.equal(s[k] - a[k], hour, k);
  assert.equal(s.motion.time - a.motion.time, hour);
  assert.equal(s.vtec.end - a.vtec.end, hour);
  assert.notEqual(s, a);
  assert.equal(a.sent.toISOString(), alerts.find((x) => x.id === a.id).sent.toISOString());
});

test('radarFrames: archived frames only, when asked', () => {
  const frames = radarFrames('2026-11-21T23:40:00Z', 11, { live: false });
  assert.ok(frames.every((f) => f.tiles.includes('ridge::USCOMP-N0Q-')));
  assert.ok(frames[10].tiles.includes('202611212340'));
});

test('demoRadar: archived frames at replay time, labeled with shifted clock times', () => {
  const shift = 5 * 3.6e6;
  const { frames } = demoRadar(new Date('2026-11-21T23:43:00Z'), shift);
  assert.ok(frames[10].tiles.includes('202611212340'), 'rounded down to the 5-minute mosaic');
  assert.equal(frames[10].time.toISOString(), new Date(Date.parse('2026-11-21T23:40:00Z') + shift).toISOString());
});
