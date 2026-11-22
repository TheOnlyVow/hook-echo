import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVtec, pickVtec } from '../site/js/lib/vtec.js';

test('parseVtec: new severe thunderstorm warning', () => {
  const v = parseVtec('/O.NEW.KMLB.SV.W.0123.261122T0139Z-261122T0215Z/');
  assert.equal(v.action, 'NEW');
  assert.equal(v.office, 'KMLB');
  assert.equal(v.phenomena, 'SV');
  assert.equal(v.significance, 'W');
  assert.equal(v.etn, 123);
  assert.equal(v.start.toISOString(), '2026-11-22T01:39:00.000Z');
  assert.equal(v.end.toISOString(), '2026-11-22T02:15:00.000Z');
  assert.equal(v.key, 'KMLB.SV.W.0123.2026');
});

test('parseVtec: zero start time is null and the key year comes from the end', () => {
  const v = parseVtec('/O.CON.KOUN.TO.A.0612.000000T0000Z-261122T0600Z/');
  assert.equal(v.start, null);
  assert.equal(v.key, 'KOUN.TO.A.0612.2026');
});

test('parseVtec: garbage is null', () => {
  for (const bad of ['', undefined, null, '/O.NEW.KMLB/', 'O.NEW.KMLB.SV.W.0123.261122T0139Z-261122T0215Z']) {
    assert.equal(parseVtec(bad), null, String(bad));
  }
});

test('pickVtec: prefers the string that is not a cancellation', () => {
  const v = pickVtec(['/O.CAN.KOUN.SV.A.0610.000000T0000Z-261122T0300Z/', '/O.NEW.KOUN.TO.A.0612.261122T0100Z-261122T0600Z/']);
  assert.equal(v.phenomena, 'TO');
  assert.equal(pickVtec(undefined), null);
});
