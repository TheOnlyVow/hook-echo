import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastForDate } from '../site/js/lib/forecast.js';

const period = (startTime, isDaytime, shortForecast, detailedForecast = shortForecast, temperature = 70) => ({
  startTime,
  endTime: startTime,
  isDaytime,
  name: isDaytime ? 'Day' : 'Night',
  temperature,
  temperatureUnit: 'F',
  shortForecast,
  detailedForecast,
});

const PERIODS = [
  period('2026-11-23T06:00:00-06:00', true, 'Chance Showers And Thunderstorms', 'A chance of showers and thunderstorms. High near 72.', 72),
  period('2026-11-23T18:00:00-06:00', false, 'Showers And Thunderstorms Likely', 'Showers and thunderstorms likely. Some storms could be severe, with damaging winds.', 55),
  period('2026-11-24T06:00:00-06:00', true, 'Sunny', 'Sunny, with a high near 60.', 60),
];

test('forecastForDate: thunder from the short forecast', () => {
  const f = forecastForDate(PERIODS.slice(0, 1), '2026-11-23');
  assert.equal(f.summary, 'Chance Showers And Thunderstorms');
  assert.equal(f.thunder, true);
  assert.equal(f.severe, false);
});

test('forecastForDate: severe wording anywhere in the day', () => {
  const f = forecastForDate(PERIODS, '2026-11-23');
  assert.equal(f.severe, true);
  assert.equal(f.high, 72);
  assert.equal(f.low, 55);
});

test('forecastForDate: a quiet day and a missing day', () => {
  const f = forecastForDate(PERIODS, '2026-11-24');
  assert.deepEqual([f.summary, f.thunder, f.severe], ['Sunny', false, false]);
  assert.equal(forecastForDate(PERIODS, '2026-12-01'), null);
  assert.equal(forecastForDate(undefined, '2026-11-23'), null);
});
