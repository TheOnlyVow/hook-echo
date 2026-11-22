import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripDays, splitTrips, formatTripDates, localDate } from '../site/js/lib/trips.js';
import { squareAround } from './helpers.js';

const STOP = { id: 's', kind: 'trip', name: 'Lincoln High', lat: 35, lon: -97, from: '2026-11-23', to: '2026-11-23' };
const outlook = (day, expire, label) => ({ day, kind: 'cat', expire: new Date(expire), features: label ? [{ label, dn: 4, geometry: squareAround({ lat: 35, lon: -97 }, 1), fill: '#ffe066', stroke: '#dda' }] : [] });
const OUTLOOKS = [outlook(1, '2026-11-23T12:00:00Z', 'MRGL'), outlook(2, '2026-11-24T12:00:00Z', 'SLGT'), outlook(3, '2026-11-25T12:00:00Z', null)];

test('tripDays: within 3 days the SPC outlook gives the risk', () => {
  const [day] = tripDays(STOP, { outlooks: OUTLOOKS, forecast: null, today: '2026-11-22' });
  assert.equal(day.date, '2026-11-23');
  assert.equal(day.source, 'spc');
  assert.equal(day.level, 2);
  assert.equal(day.text, 'Slight risk of severe storms (2 of 5)');
});

test('tripDays: an outlook with no storms says so', () => {
  const [day] = tripDays({ ...STOP, from: '2026-11-24', to: '2026-11-24' }, { outlooks: OUTLOOKS, forecast: null, today: '2026-11-22' });
  assert.equal(day.source, 'spc');
  assert.equal(day.text, 'No thunderstorms expected');
});

test('tripDays: days 4 to 7 use the forecast wording', () => {
  const forecast = { periods: [{ startTime: '2026-11-27T06:00:00-06:00', isDaytime: true, temperature: 70, shortForecast: 'Chance Showers And Thunderstorms', detailedForecast: 'A chance of storms.' }] };
  const [day] = tripDays({ ...STOP, from: '2026-11-27', to: '2026-11-27' }, { outlooks: OUTLOOKS, forecast, today: '2026-11-22' });
  assert.equal(day.source, 'forecast');
  assert.equal(day.text, 'Thunderstorms possible: Chance Showers And Thunderstorms');
});

test('tripDays: more than a week out is too far to tell', () => {
  const [day] = tripDays({ ...STOP, from: '2026-12-02', to: '2026-12-02' }, { outlooks: OUTLOOKS, forecast: null, today: '2026-11-22' });
  assert.deepEqual([day.source, day.text], ['none', 'Too far out to tell']);
});

test('tripDays: one entry per day of a multi-day stop, past days skipped', () => {
  const days = tripDays({ ...STOP, from: '2026-11-21', to: '2026-11-24' }, { outlooks: OUTLOOKS, forecast: null, today: '2026-11-22' });
  assert.deepEqual(days.map((d) => d.date), ['2026-11-22', '2026-11-23', '2026-11-24']);
});

test('splitTrips: upcoming by arrival date, past ones apart', () => {
  const a = { ...STOP, id: 'a', from: '2026-11-25', to: '2026-11-26' };
  const b = { ...STOP, id: 'b', from: '2026-11-22', to: '2026-11-22' };
  const old = { ...STOP, id: 'c', from: '2026-11-10', to: '2026-11-12' };
  const home = { ...STOP, id: 'h', kind: 'home', from: undefined, to: undefined };
  const { upcoming, past } = splitTrips([a, old, home, b], '2026-11-22');
  assert.deepEqual(upcoming.map((t) => t.id), ['b', 'a']);
  assert.deepEqual(past.map((t) => t.id), ['c']);
});

test('formatTripDates and localDate', () => {
  assert.equal(formatTripDates('2026-11-24', '2026-11-25'), 'Tue, Nov 24 to Wed, Nov 25');
  assert.equal(formatTripDates('2026-11-24', '2026-11-24'), 'Tue, Nov 24');
  assert.equal(localDate(new Date(2026, 10, 22, 23, 30)), '2026-11-22');
});
