import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskAt, tornadoProbAt, outlookForDate } from '../site/js/lib/outlook.js';
import { squareAround } from './helpers.js';

const P = { lat: 35, lon: -97 };
const feature = (label, dn, geometry, fill = '#ffe066') => ({ label, dn, geometry, fill, stroke: '#ddaa00' });

const day1 = {
  day: 1,
  kind: 'cat',
  issue: new Date('2026-11-22T01:00:00Z'),
  valid: new Date('2026-11-22T01:00:00Z'),
  expire: new Date('2026-11-22T12:00:00Z'),
  features: [feature('TSTM', 2, squareAround(P, 5)), feature('MRGL', 3, squareAround(P, 2)), feature('SLGT', 4, squareAround(P, 0.5))],
};

test('riskAt: the highest nested category wins', () => {
  assert.deepEqual(riskAt(P, day1), { code: 'SLGT', level: 2, name: 'Slight', color: '#ffe066' });
});

test('riskAt: outside every area, or no outlook, is null', () => {
  assert.equal(riskAt({ lat: 50, lon: -80 }, day1), null);
  assert.equal(riskAt(P, null), null);
});

test('tornadoProbAt: percent and significant hatching', () => {
  const torn = {
    day: 1,
    kind: 'torn',
    features: [feature('0.02', 2, squareAround(P, 3)), feature('0.10', 10, squareAround(P, 1)), feature('SIGN', 0, squareAround(P, 0.5))],
  };
  assert.deepEqual(tornadoProbAt(P, torn), { percent: 10, significant: true });
  assert.deepEqual(tornadoProbAt({ lat: 35, lon: -99.5 }, torn), { percent: 2, significant: false });
  assert.equal(tornadoProbAt({ lat: 50, lon: -80 }, torn), null);
});

test('outlookForDate: matches the day an outlook covers', () => {
  const d1 = { day: 1, kind: 'cat', expire: new Date('2026-11-23T12:00:00Z'), features: [] };
  const d2 = { day: 2, kind: 'cat', expire: new Date('2026-11-24T12:00:00Z'), features: [] };
  assert.equal(outlookForDate('2026-11-23', [d1, d2]), d2);
  assert.equal(outlookForDate('2026-11-22', [d1, d2]), d1);
  assert.equal(outlookForDate('2026-11-30', [d1, d2]), null);
});
