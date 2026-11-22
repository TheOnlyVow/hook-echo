import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedEvents, mostSevere, actionFor, instructionExcerpt, notificationFor } from '../site/js/lib/alarmText.js';
import { makeAlert } from './helpers.js';

const tor = makeAlert({ rank: 90, instruction: 'TAKE COVER NOW! Move to a basement or an interior room on the lowest floor of a sturdy building. Avoid windows. If you are outdoors, in a mobile home, or in a vehicle, move to the closest substantial shelter.' });
const svr = makeAlert({ event: 'Severe Thunderstorm Warning', level: 'chime', rank: 78 });
const home = { id: 'h', name: 'Home', kind: 'home' };
const ev = (kind, alert, extra = {}) => ({ placeId: 'h', place: home, alert, kind, ...extra });

test('allowedEvents: alarms always; chimes and heads-ups follow the settings', () => {
  const events = [ev('alarm', tor), ev('chime', svr), ev('headsup', tor, { headsUp: { minutes: 9 } })];
  assert.deepEqual(allowedEvents(events, { chimes: true, headsUp: true }).map((e) => e.kind), ['alarm', 'chime', 'headsup']);
  assert.deepEqual(allowedEvents(events, { chimes: false, headsUp: false }).map((e) => e.kind), ['alarm']);
});

test('mostSevere: an alarm beats a heads-up beats a chime, then by rank', () => {
  const emergency = makeAlert({ rank: 100 });
  assert.equal(mostSevere([ev('chime', svr), ev('alarm', tor), ev('alarm', emergency), ev('headsup', tor)]).alert, emergency);
  assert.equal(mostSevere([ev('chime', svr), ev('headsup', tor)]).kind, 'headsup');
  assert.equal(mostSevere([]), null);
});

test('actionFor: what to do, by hazard', () => {
  assert.equal(actionFor(tor), 'Take shelter now');
  assert.equal(actionFor(makeAlert({ event: 'Flash Flood Warning', tags: [{ kind: 'emergency', label: 'Flash flood emergency' }] })), 'Move to higher ground now');
  assert.equal(actionFor(makeAlert({ event: 'Severe Thunderstorm Warning', tags: [{ kind: 'destructive', label: 'Destructive' }] })), 'Get inside, away from windows');
  assert.equal(actionFor(makeAlert({ event: 'Extreme Wind Warning' })), 'Take shelter now');
  assert.equal(actionFor(svr), 'Stay alert');
});

test('instructionExcerpt: the first sentences, kept short, in sentence case', () => {
  assert.equal(instructionExcerpt(tor.instruction), 'Take cover now! Move to a basement or an interior room on the lowest floor of a sturdy building.');
  assert.equal(instructionExcerpt(''), '');
  assert.ok(instructionExcerpt('A'.repeat(500)).length <= 241);
});

test('notificationFor: title names the hazard and the place; one tag per event', () => {
  const n = notificationFor(ev('alarm', tor));
  assert.equal(n.title, 'Tornado Warning: Home');
  assert.equal(n.body.startsWith('Take shelter now.'), true);
  assert.equal(n.tag, `hook-echo:${tor.vtec.key}`);
  assert.equal(n.requireInteraction, true);
  const hu = notificationFor(ev('headsup', tor, { headsUp: { minutes: 12, eta: new Date() } }));
  assert.equal(hu.title, 'A tornado could reach Home in about 12 min');
  assert.equal(hu.requireInteraction, false);
});

test('alsoApproaching: heads-ups only for places not already told to take shelter', async () => {
  const { alsoApproaching } = await import('../site/js/lib/alarmText.js');
  const tor = { id: 'a', event: 'Tornado Warning', vtec: { key: 'K.TO.W.1.2026' }, rank: 90 };
  const home = { id: 'home', name: 'Home' };
  const school = { id: 'school', name: 'School' };
  const events = [
    { kind: 'alarm', placeId: 'home', place: home, alert: tor },
    { kind: 'headsup', placeId: 'home', place: home, alert: tor, headsUp: { minutes: 10 } },
    { kind: 'headsup', placeId: 'school', place: school, alert: tor, headsUp: { minutes: 18 } },
  ];
  assert.deepEqual(alsoApproaching(events).map((e) => e.placeId), ['school']);
  assert.deepEqual(alsoApproaching([]), []);
});
