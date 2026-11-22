import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMotion } from '../site/js/lib/motion.js';

test('parseMotion: one storm position', () => {
  const m = parseMotion('2026-11-22T01:40:00-00:00...storm...221DEG...16KT...27.6,-80.49');
  assert.equal(m.time.toISOString(), '2026-11-22T01:40:00.000Z');
  assert.equal(m.dirFrom, 221);
  assert.equal(m.speedKt, 16);
  assert.deepEqual(m.points, [{ lat: 27.6, lon: -80.49 }]);
});

test('parseMotion: line of storms gives every position', () => {
  const m = parseMotion('2026-11-22T01:40:00-00:00...storms...250DEG...30KT...35.12,-97.45 35.30,-97.20');
  assert.equal(m.points.length, 2);
  assert.deepEqual(m.points[1], { lat: 35.3, lon: -97.2 });
});

test('parseMotion: stationary storm keeps zero speed', () => {
  const m = parseMotion('2026-11-22T01:40:00-00:00...storm...000DEG...0KT...35.12,-97.45');
  assert.equal(m.speedKt, 0);
  assert.equal(m.dirFrom, 0);
});

test('garbage motion is null', () => {
  for (const bad of ['abc', '', undefined, null, '2026-11-22T01:40:00-00:00...storm...221DEG...16KT...']) {
    assert.equal(parseMotion(bad), null, String(bad));
  }
});

test('parseMotion: out-of-range values are null', () => {
  assert.equal(parseMotion('2026-11-22T01:40:00-00:00...storm...400DEG...16KT...27.6,-80.49'), null);
  assert.equal(parseMotion('2026-11-22T01:40:00-00:00...storm...221DEG...16KT...127.6,-80.49'), null);
  assert.equal(parseMotion('not-a-time...storm...221DEG...16KT...27.6,-80.49'), null);
});
