import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock, relative, duration, miles, compass, mph, motionText, motionLabel, areaSummary, statesIn } from '../site/js/lib/format.js';

test('areaSummary: counties grouped by state, long lists shortened', () => {
  assert.equal(areaSummary('Cleveland, OK; McClain, OK; Grady, OK'), 'Cleveland, McClain and Grady, OK');
  assert.equal(areaSummary('Cleveland, OK; Cooke, TX'), 'Cleveland, OK; Cooke, TX');
  assert.equal(areaSummary('A, KS; B, KS; C, KS; D, KS; E, KS; F, KS'), 'A, B, C, D and 2 more, KS');
  assert.equal(areaSummary('Coastal waters from Sebastian Inlet to Jupiter Inlet FL out 20 nm'), 'Coastal waters from Sebastian Inlet to Jupiter Inlet FL out 20 nm');
  assert.equal(areaSummary(''), '');
});

test('motionShort: direction and speed without the arrow', async () => {
  const { motionShort } = await import('../site/js/lib/format.js');
  assert.equal(motionShort({ dirFrom: 221, speedKt: 30 }), 'NE at 35 mph');
  assert.equal(motionShort({ dirFrom: 90, speedKt: 0.4 }), 'Nearly stationary');
});

test('statesIn: state codes named in an area description, in order', () => {
  assert.deepEqual(statesIn('Cleveland, OK; Cooke, TX; Love, OK'), ['OK', 'TX']);
  assert.deepEqual(statesIn('Northern Oklahoma'), []);
});

const NOW = new Date('2026-11-22T02:03:00Z');
const plus = (ms) => new Date(NOW.getTime() + ms);
const MIN = 60_000;

test('clock: local clock time with a plain space', () => {
  assert.equal(clock(new Date('2026-11-22T02:32:00Z'), { timeZone: 'America/Chicago' }), '8:32 PM');
});

test('relative: past and future', () => {
  assert.equal(relative(plus(-20_000), NOW), 'just now');
  assert.equal(relative(plus(-3 * MIN), NOW), '3 min ago');
  assert.equal(relative(plus(18 * MIN), NOW), 'in 18 min');
  assert.equal(relative(plus(-2 * 60 * MIN), NOW), '2 h ago');
  assert.equal(relative(plus(-3 * 24 * 60 * MIN), NOW), '3 days ago');
});

test('duration: minutes and hours', () => {
  assert.equal(duration(65 * MIN), '1 h 5 min');
  assert.equal(duration(23 * MIN), '23 min');
  assert.equal(duration(120 * MIN), '2 h');
  assert.equal(duration(30_000), 'under 1 min');
});

test('miles: from kilometres', () => {
  assert.equal(miles(0.5), 'under 1 mi');
  assert.equal(miles(6.76), '4.2 mi');
  assert.equal(miles(61), '38 mi');
});

test('compass: eight points', () => {
  assert.equal(compass(41), 'NE');
  assert.equal(compass(359), 'N');
  assert.equal(compass(180), 'S');
  assert.equal(compass(292), 'W');
});

test('mph: from knots', () => {
  assert.equal(mph(30), '35 mph');
});

test('motionText and motionLabel: where the storm is heading', () => {
  assert.equal(motionText({ dirFrom: 221, speedKt: 30 }), '→ NE at 35 mph');
  assert.equal(motionLabel({ dirFrom: 221, speedKt: 30 }), 'Moving northeast at 35 mph');
  assert.equal(motionText({ dirFrom: 0, speedKt: 0 }), 'Nearly stationary');
});
