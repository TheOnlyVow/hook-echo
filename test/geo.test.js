import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, destination, bearingDeg, pointInGeometry, geometryBounds, centroid } from '../site/js/lib/geo.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected}±${tol}, got ${actual}`);

const OKC = { lat: 35.4676, lon: -97.5164 };
const TULSA = { lat: 36.154, lon: -95.993 };

const square = [[-98, 34], [-96, 34], [-96, 36], [-98, 36], [-98, 34]];
const hole = [[-97.5, 34.5], [-96.5, 34.5], [-96.5, 35.5], [-97.5, 35.5], [-97.5, 34.5]];
const polygonWithHole = { type: 'Polygon', coordinates: [square, hole] };

test('distanceKm: Oklahoma City to Tulsa is about 158 km', () => {
  near(distanceKm(OKC, TULSA), 158, 2);
});

test('destination: 100 km due east of 35N 97W', () => {
  const p = destination({ lat: 35, lon: -97 }, 90, 100);
  near(p.lat, 34.99, 0.02, 'lat');
  near(p.lon, -95.9, 0.02, 'lon');
});

test('bearingDeg: back to the destination is due east', () => {
  const p = destination({ lat: 35, lon: -97 }, 90, 100);
  near(bearingDeg({ lat: 35, lon: -97 }, p), 90, 0.6);
});

test('bearingDeg: always in 0..360', () => {
  const b = bearingDeg({ lat: 35, lon: -97 }, { lat: 34, lon: -98 });
  assert.ok(b >= 0 && b < 360, `got ${b}`);
  near(b, 219.5, 1.5, 'southwest');
});

test('pointInGeometry: inside the polygon but outside its hole', () => {
  assert.equal(pointInGeometry({ lat: 34.2, lon: -97.8 }, polygonWithHole), true);
});

test('pointInGeometry: inside the hole is outside', () => {
  assert.equal(pointInGeometry({ lat: 35, lon: -97 }, polygonWithHole), false);
});

test('pointInGeometry: outside the polygon', () => {
  assert.equal(pointInGeometry({ lat: 37, lon: -97 }, polygonWithHole), false);
});

test('pointInGeometry: second part of a MultiPolygon', () => {
  const g = { type: 'MultiPolygon', coordinates: [[square], [[[-90, 30], [-89, 30], [-89, 31], [-90, 31], [-90, 30]]]] };
  assert.equal(pointInGeometry({ lat: 30.5, lon: -89.5 }, g), true);
});

test('pointInGeometry: GeometryCollection and null', () => {
  const gc = { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: [square] }] };
  assert.equal(pointInGeometry({ lat: 35, lon: -97 }, gc), true);
  assert.equal(pointInGeometry({ lat: 35, lon: -97 }, null), false);
});

test('geometryBounds: polygon and null', () => {
  assert.deepEqual(geometryBounds(polygonWithHole), [-98, 34, -96, 36]);
  assert.equal(geometryBounds(null), null);
});

test('centroid: mean of two points', () => {
  assert.deepEqual(centroid([{ lat: 35, lon: -97 }, { lat: 36, lon: -95 }]), { lat: 35.5, lon: -96 });
});
