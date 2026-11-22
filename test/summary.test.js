import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countAlerts } from '../site/js/ui/summary.js';
import { makeAlert } from './helpers.js';

const watch = (office, etn, event = 'Tornado Watch') =>
  makeAlert({ event, placeLevel: 'watch', vtec: { office, phenomena: event === 'Tornado Watch' ? 'TO' : 'SV', significance: 'A', etn, key: `${office}.TO.A.${etn}.2026` } });

test('countAlerts: one watch issued through several offices counts once', () => {
  const alerts = [watch('KMLB', 612), watch('KMFL', 612), watch('KTBW', 612), watch('KMFL', 613), watch('KOUN', 640, 'Severe Thunderstorm Watch')];
  assert.equal(countAlerts(alerts).watches, 3);
});

test('countAlerts: warnings count per alert', () => {
  const alerts = [makeAlert(), makeAlert({ vtec: { key: 'KOUN.TO.W.0043.2026', phenomena: 'TO', significance: 'W', etn: 43, office: 'KOUN' } }), makeAlert({ event: 'Severe Thunderstorm Warning' })];
  assert.deepEqual(countAlerts(alerts), { tornado: 2, severe: 1, flood: 0, watches: 0 });
});
