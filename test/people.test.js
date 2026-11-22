import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortBySeverity, coversByAlert, worstLevel, headlineFor } from '../site/js/lib/people.js';
import { NOW, MIN, makeAlert } from './helpers.js';

const st = (level, alerts = [], headsUp = null) => ({ level, alerts, top: alerts[0] ?? null, headsUp, stale: false });
const person = (id, name, status, kind = 'family') => ({ place: { id, name, kind }, status });

test('sortBySeverity: most serious first, then by name', () => {
  const people = [person('a', 'Zed', st('clear')), person('b', 'Amy', st('watch')), person('c', 'Bob', st('shelter')), person('d', 'Cal', st('watch')), person('e', 'Dee', st('unknown'))];
  assert.deepEqual(sortBySeverity(people).map((p) => p.place.name), ['Bob', 'Amy', 'Cal', 'Dee', 'Zed']);
});

test('coversByAlert: each alert lists the places inside it', () => {
  const tor = makeAlert();
  const watch = makeAlert({ event: 'Tornado Watch' });
  const covers = coversByAlert([person('a', 'Home', st('shelter', [tor, watch]), 'home'), person('b', 'Mom', st('watch', [watch]))]);
  assert.deepEqual(covers.get(tor.id), [{ name: 'Home', icon: 'home' }]);
  assert.deepEqual(covers.get(watch.id).map((c) => c.name), ['Home', 'Mom']);
});

test('worstLevel: the badge shows the worst level and how many places are at warning or worse', () => {
  assert.deepEqual(worstLevel([st('watch'), st('shelter'), st('warning'), st('clear')]), { level: 'shelter', count: 2 });
  assert.deepEqual(worstLevel([st('watch'), st('clear')]), { level: 'watch', count: 0 });
  assert.deepEqual(worstLevel([]), { level: null, count: 0 });
});

test('headlineFor: a place under a tornado warning comes first', () => {
  const tor = makeAlert({ expires: new Date(NOW.getTime() + 23 * MIN) });
  const h = headlineFor({ people: [person('a', 'Mom', st('shelter', [tor])), person('b', 'Home', st('shelter', [tor]))], tornadoes: [tor], lastTornado: null, now: NOW });
  assert.equal(h.tone, 'shelter');
  assert.equal(h.title, 'Take shelter: Mom and 1 more');
  assert.equal(h.text, 'Tornado Warning, 23 min left');
  assert.equal(h.alertId, tor.id);
});

test('headlineFor: a heads-up beats a plain warning, soonest first', () => {
  const tor = makeAlert();
  const svr = makeAlert({ event: 'Severe Thunderstorm Warning', placeLevel: 'warning' });
  const people = [
    person('a', 'Work', st('clear', [], { alertId: tor.id, minutes: 25, eta: NOW, distanceKm: 3 })),
    person('b', 'Mom', st('clear', [], { alertId: tor.id, minutes: 12, eta: NOW, distanceKm: 2 })),
    person('c', 'Home', st('warning', [svr])),
  ];
  const h = headlineFor({ people, tornadoes: [tor], lastTornado: null, now: NOW });
  assert.equal(h.tone, 'headsup');
  assert.equal(h.title, 'A tornado could reach Mom in about 12 min');
  assert.equal(h.alertId, tor.id);
});

test('headlineFor: warnings, then tornado watches, for your places', () => {
  const svr = makeAlert({ event: 'Severe Thunderstorm Warning', placeLevel: 'warning', expires: new Date(NOW.getTime() + 40 * MIN) });
  const h = headlineFor({ people: [person('a', 'Home', st('warning', [svr]))], tornadoes: [], lastTornado: null, now: NOW });
  assert.deepEqual([h.tone, h.title, h.text], ['warning', 'Severe Thunderstorm Warning for Home', '40 min left']);
  const watch = makeAlert({ event: 'Tornado Watch', placeLevel: 'watch' });
  const w = headlineFor({ people: [person('a', 'Home', st('watch', [watch]))], tornadoes: [], lastTornado: null, now: NOW });
  assert.equal(w.tone, 'watch');
  assert.equal(w.title, 'Tornado Watch for Home');
});

test('headlineFor: national tornado warnings when your places are quiet, then all clear', () => {
  const tors = [makeAlert({ areaDesc: 'Cleveland, OK' }), makeAlert({ areaDesc: 'Cooke, TX', rank: 96 })];
  const n = headlineFor({ people: [person('a', 'Home', st('clear'))], tornadoes: tors, lastTornado: null, now: NOW });
  assert.equal(n.tone, 'national');
  assert.equal(n.title, '2 tornado warnings right now');
  assert.equal(n.alertId, tors[1].id, 'the most serious one');
  const q = headlineFor({ people: [], tornadoes: [], lastTornado: { ended: new Date(NOW.getTime() - 2 * 60 * MIN), area: 'X, FL' }, now: NOW });
  assert.equal(q.tone, 'quiet');
  assert.equal(q.text, 'The last one ended 2 h ago.');
});
