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

test('outlookLegend: one entry per area the outlook has, in plain words', async () => {
  const { outlookLegend } = await import('../site/js/lib/outlook.js');
  const cat = { kind: 'cat', features: [feature('TSTM', 2, null, '#c1e9c1'), feature('MRGL', 3, null, '#66a366'), feature('MRGL', 3, null, '#66a366'), feature('ENH', 5, null, '#ffa366')] };
  assert.deepEqual(outlookLegend(cat), [
    { label: 'Thunderstorms', color: '#c1e9c1', sig: false },
    { label: '1 Marginal', color: '#66a366', sig: false },
    { label: '3 Enhanced', color: '#ffa366', sig: false },
  ]);
  const torn = { kind: 'torn', features: [feature('0.02', 2, null, '#008b00'), feature('0.10', 10, null, '#ffc800'), feature('SIGN', 0, null, '#000000')] };
  assert.deepEqual(outlookLegend(torn).map((l) => l.label), ['2%', '10%', 'Strong possible (hatched)']);
  assert.equal(outlookLegend(torn)[2].color, null);
  assert.deepEqual(outlookLegend(null), []);
});

test('emptyOutlookNote: SPC’s reason for an empty outlook, in plain words', async () => {
  const { emptyOutlookNote } = await import('../site/js/lib/outlook.js');
  assert.equal(emptyOutlookNote({ kind: 'prob', note: 'Potential Too Low', features: [] }), 'Severe storms unlikely');
  assert.equal(emptyOutlookNote({ kind: 'prob', note: 'Predictability Too Low', features: [] }), 'Too uncertain to forecast yet');
  assert.equal(emptyOutlookNote({ kind: 'torn', note: 'Less Than 2% All Areas', features: [] }), 'Tornado chance under 2% everywhere');
  assert.equal(emptyOutlookNote({ kind: 'cat', note: '', features: [] }), 'No thunderstorms expected');
  assert.equal(emptyOutlookNote({ kind: 'prob', note: '', features: [] }), 'No severe storm areas');
});
