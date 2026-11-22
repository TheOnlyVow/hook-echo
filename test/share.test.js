import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePlaces, decodePlaces, MAX_PLACES } from '../site/js/lib/share.js';

const PLACES = [
  { id: 'a', kind: 'home', name: 'Home', lat: 36.154, lon: -95.993 },
  { id: 'b', kind: 'family', name: 'Mom — Wichita Falls', lat: 33.9137, lon: -98.4934 },
  { id: 'c', kind: 'trip', name: 'Lincoln High School', lat: 35.2226, lon: -97.4395, from: '2026-11-24', to: '2026-11-25' },
];
const withoutIds = (list) => list.map(({ id, ...rest }) => rest);
const craft = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');

test('encode and decode round trip, with fresh ids', () => {
  const decoded = decodePlaces(encodePlaces(PLACES));
  assert.deepEqual(withoutIds(decoded), withoutIds(PLACES));
  assert.ok(decoded.every((p) => typeof p.id === 'string' && p.id.length > 0 && !['a', 'b', 'c'].includes(p.id)));
});

test('a tampered link is rejected', () => {
  const s = encodePlaces(PLACES);
  assert.throws(() => decodePlaces(s.slice(0, -6) + '!!!!!!'), /invalid share link/);
  assert.throws(() => decodePlaces(s.slice(0, 20)), /invalid share link/);
  assert.throws(() => decodePlaces(''), /invalid share link/);
});

test('more than 25 places is rejected both ways', () => {
  const many = Array.from({ length: MAX_PLACES + 1 }, (_, i) => ({ id: String(i), kind: 'friend', name: `Friend ${i}`, lat: 35, lon: -97 }));
  assert.throws(() => encodePlaces(many), /too many places/);
  assert.throws(() => decodePlaces(craft({ v: 1, p: many.map((p) => [p.kind, p.name, p.lat, p.lon]) })), /invalid share link/);
});

test('sanitizePlaces: keeps valid stored places, drops broken ones, caps at 25', async () => {
  const { sanitizePlaces } = await import('../site/js/lib/share.js');
  const good = { id: 'a', kind: 'home', name: 'Home', lat: 36.15, lon: -95.99, detail: 'Tulsa, Oklahoma' };
  const trip = { id: 'b', kind: 'trip', name: 'Stop', lat: 35, lon: -97, from: '2026-11-24', to: '2026-11-25' };
  const bad = [null, 'x', { id: 'c', kind: 'boss', name: 'X', lat: 1, lon: 1 }, { id: 'd', kind: 'home', name: '', lat: 1, lon: 1 }, { id: 'e', kind: 'home', name: 'Y', lat: 'north', lon: 1 }, { id: 'f', kind: 'trip', name: 'Z', lat: 1, lon: 1, from: 'soon' }];
  assert.deepEqual(sanitizePlaces([good, ...bad, trip]), [good, trip]);
  const many = Array.from({ length: 30 }, (_, i) => ({ ...good, id: String(i) }));
  assert.equal(sanitizePlaces(many).length, MAX_PLACES);
  assert.deepEqual(sanitizePlaces(undefined), []);
});

test('out-of-range coordinates and long names are rejected', () => {
  assert.throws(() => decodePlaces(craft({ v: 1, p: [['home', 'Home', 95, -97]] })), /invalid share link/);
  assert.throws(() => decodePlaces(craft({ v: 1, p: [['home', 'x'.repeat(61), 35, -97]] })), /invalid share link/);
  assert.throws(() => decodePlaces(craft({ v: 1, p: [['boss', 'Home', 35, -97]] })), /invalid share link/);
  assert.throws(() => decodePlaces(craft({ v: 1, p: [['trip', 'Stop', 35, -97, '24-11-2026']] })), /invalid share link/);
});
