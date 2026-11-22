import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAlert, normalizeAlerts, loadPointAlerts } from '../site/js/data/alerts.js';
import { normalizeShapes } from '../site/js/data/shapes.js';
import { normalizeReports, reportType } from '../site/js/data/reports.js';
import { normalizeSurveys } from '../site/js/data/surveys.js';
import { radarFrames } from '../site/js/data/radar.js';
import { normalizeOutlook } from '../site/js/data/spc.js';
import { stormLayerIds, normalizeStorm } from '../site/js/data/tropical.js';
import { searchPlaces } from '../site/js/data/geocode.js';
import { loadForecast } from '../site/js/data/points.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

function stubFetch(t, routes) {
  const real = globalThis.fetch;
  const seen = [];
  t.after(() => (globalThis.fetch = real));
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    for (const [match, body] of routes) {
      if (String(url).includes(match)) {
        if (body instanceof Error) throw body;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response('not found', { status: 404 });
  };
  return seen;
}

test('normalizeAlert: a recorded tornado warning', () => {
  const raw = fixture('tornado-warnings-recent.json').features.find((f) => f.properties.parameters.VTEC?.[0]?.includes('.NEW.'));
  const a = normalizeAlert(raw);
  assert.match(a.vtec.key, /^[A-Z]{4}\.TO\.W\.\d{4}\.\d{4}$/);
  assert.ok(a.expires instanceof Date && !Number.isNaN(a.expires.getTime()));
  assert.ok(a.rank >= 90);
  assert.equal(a.level, 'alarm');
  assert.equal(a.placeLevel, 'shelter');
  assert.equal(a.color, '#FF0000');
  assert.ok(a.motion && a.motion.points.length >= 1);
  assert.ok(a.geometry?.type === 'Polygon' || a.geometry?.type === 'MultiPolygon');
  assert.equal(a.cancelled, false);
  assert.ok(a.id.startsWith('urn:oid:'));
});

test('normalizeAlert: an expiration message is marked cancelled', () => {
  const raw = fixture('tornado-warnings-recent.json').features.find((f) => f.properties.parameters.VTEC?.[0]?.includes('.EXP.'));
  assert.equal(normalizeAlert(raw).cancelled, true);
});

test('normalizeAlerts: every recorded alert normalizes, with unique ids', () => {
  for (const name of ['storm-alerts.json', 'land-alerts.json', 'tornado-warnings-recent.json']) {
    const list = normalizeAlerts(fixture(name));
    assert.ok(list.length > 0, name);
    assert.equal(new Set(list.map((a) => a.id)).size, list.length, `${name} ids unique`);
    for (const a of list) {
      assert.ok(a.event && a.sent instanceof Date, `${name}: ${a.id}`);
      assert.ok(Array.isArray(a.tags) && typeof a.rank === 'number');
    }
  }
});

test('loadPointAlerts: ids from the NWS point check, with rounded coordinates', async (t) => {
  const seen = stubFetch(t, [['/alerts/active', { features: [{ properties: { id: 'urn:oid:a' } }, { properties: { id: 'urn:oid:b' } }] }]]);
  const ids = await loadPointAlerts({ lat: 36.153987, lon: -95.992781 });
  assert.deepEqual([...ids], ['urn:oid:a', 'urn:oid:b']);
  assert.ok(seen[0].includes('point=36.154,-95.993'), seen[0]);
});

test('normalizeShapes: keyed by alert id, zones of one alert merged', () => {
  const shapes = normalizeShapes(fixture('shapes.json'));
  const [id, shape] = [...shapes.entries()][0];
  assert.ok(id.startsWith('urn:oid:'));
  assert.ok(['Polygon', 'MultiPolygon'].includes(shape.geometry.type));
  const square = (x) => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] });
  const merged = normalizeShapes({
    features: [
      { properties: { url: 'https://api.weather.gov/alerts/urn:oid:z', prod_type: 'Winter Storm Warning', expiration: '2026-11-22T06:00:00-06:00' }, geometry: square(0) },
      { properties: { url: 'https://api.weather.gov/alerts/urn:oid:z', prod_type: 'Winter Storm Warning', expiration: '2026-11-22T06:00:00-06:00' }, geometry: square(5) },
    ],
  });
  assert.equal(merged.get('urn:oid:z').geometry.type, 'MultiPolygon');
  assert.equal(merged.get('urn:oid:z').geometry.coordinates.length, 2);
  assert.equal(merged.get('urn:oid:z').event, 'Winter Storm Warning');
});

test('reportType: storm report categories', () => {
  assert.equal(reportType('TORNADO'), 'tornado');
  assert.equal(reportType('WATERSPOUT'), 'tornado');
  assert.equal(reportType('FUNNEL CLOUD'), 'funnel');
  assert.equal(reportType('HAIL'), 'hail');
  assert.equal(reportType('TSTM WND DMG'), 'wind');
  assert.equal(reportType('TSTM WND GST'), 'wind');
  assert.equal(reportType('FLASH FLOOD'), 'flood');
  assert.equal(reportType('SNOW'), 'other');
});

test('normalizeReports: recorded storm reports', () => {
  const reports = normalizeReports(fixture('lsr.json'));
  assert.ok(reports.length > 0);
  for (const r of reports) {
    assert.ok(r.time instanceof Date && !Number.isNaN(r.time.getTime()));
    assert.ok(Number.isFinite(r.lat) && Number.isFinite(r.lon));
    assert.ok(r.label.length > 0 && r.id.length > 0);
  }
  const hail = normalizeReports({ features: [{ properties: { typetext: 'HAIL', magnitude: 1.75, unit: 'INCH', valid: '2026-11-21T22:00:00Z', city: 'Moore', st: 'OK', county: 'Cleveland', remark: '', source: 'Trained Spotter', lat: 35.3, lon: -97.5, wfo: 'OUN', type: 'H' } }] })[0];
  assert.equal(hail.magnitudeText, '1.75 in');
  assert.equal(hail.label, 'Hail');
});

test('normalizeSurveys: recorded damage paths', () => {
  const surveys = normalizeSurveys(fixture('dat-lines.json'));
  assert.ok(surveys.length > 0);
  for (const s of surveys) {
    assert.match(s.ef, /^EF[0-5U]$/);
    assert.ok(s.start instanceof Date);
    assert.ok(['LineString', 'MultiLineString'].includes(s.geometry.type));
    assert.ok(typeof s.lengthMi === 'number');
  }
});

test('radarFrames: 11 frames, 5 minutes apart, newest from the live layer', () => {
  const frames = radarFrames('2026-11-22T01:45:00Z');
  assert.equal(frames.length, 11);
  assert.ok(frames[0].tiles.includes('ridge::USCOMP-N0Q-202611220055'), frames[0].tiles);
  assert.ok(frames[10].tiles.includes('nexrad-n0q-900913'), frames[10].tiles);
  for (let i = 1; i < frames.length; i++) assert.equal(frames[i].time - frames[i - 1].time, 5 * 60_000);
  assert.equal(frames[10].time.toISOString(), '2026-11-22T01:45:00.000Z');
});

test('normalizeOutlook: recorded Day 2 outlook, and an empty one', () => {
  const o = normalizeOutlook(fixture('spc-day2-cat.json'), 2, 'cat');
  assert.equal(o.day, 2);
  assert.ok(o.expire instanceof Date);
  assert.ok(o.features.length > 0 && o.features.every((f) => f.label && f.geometry && f.fill));
  const empty = normalizeOutlook({ type: 'FeatureCollection', features: [] }, 3, 'cat', new Date('2026-11-22T02:00:00Z'));
  assert.deepEqual(empty.features, []);
  // At 02Z the Day 1 outlook still covers the SPC day ending 12Z today, so Day 3 ends 12Z two days later.
  assert.equal(empty.expire.toISOString(), '2026-11-24T12:00:00.000Z');
  const afterRollover = normalizeOutlook({ type: 'FeatureCollection', features: [] }, 1, 'cat', new Date('2026-11-22T07:00:00Z'));
  assert.equal(afterRollover.expire.toISOString(), '2026-11-23T12:00:00.000Z');
});

test('stormLayerIds: every tropical storm slot and its layers', () => {
  const slots = stormLayerIds(fixture('tropical-service.json'));
  const at1 = slots.find((s) => s.slot === 'AT1');
  assert.deepEqual({ points: at1.points, track: at1.track, cone: at1.cone, past: at1.past }, { points: 6, track: 7, cone: 8, past: 12 });
  assert.ok(slots.length >= 10);
});

test('normalizeStorm: forecast points, cone and track', () => {
  const pt = (tau, maxwind, ssnum, tcdvlp, lat, lon) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { stormname: 'Kirk', stormtype: 'HU', basin: 'AL', advisnum: '14', advdate: '1100 PM AST Thu Oct 03 2024', maxwind, gust: maxwind + 20, mslp: 950, ssnum, tcdvlp, tau, datelbl: tau === 0 ? '11:00 PM Thu' : '8:00 PM Fri', tcdir: 315, tcspd: 10 } });
  const storm = normalizeStorm('AT1', {
    points: { features: [pt(12, 105, 3, 'Hurricane', 21, -46), pt(0, 115, 4, 'Hurricane', 20, -45)] },
    cone: { features: [{ geometry: { type: 'Polygon', coordinates: [[[-45, 20], [-50, 25], [-40, 25], [-45, 20]]] }, properties: {} }] },
    track: { features: [{ geometry: { type: 'LineString', coordinates: [[-45, 20], [-46, 21]] }, properties: {} }] },
    past: { features: [] },
  });
  assert.equal(storm.name, 'Kirk');
  assert.equal(storm.id, 'AT1');
  assert.equal(storm.label, 'Category 4 hurricane');
  assert.equal(storm.maxWindMph, 132);
  assert.deepEqual(storm.current, { lat: 20, lon: -45 });
  assert.equal(storm.points[0].tau, 0, 'points sorted by forecast hour');
  assert.equal(storm.cone.type, 'Polygon');
});

test('searchPlaces: Photon results, US first', async (t) => {
  stubFetch(t, [
    ['photon.komoot.io', { features: [
      { geometry: { coordinates: [-95.99, 36.15] }, properties: { name: 'Tulsa', state: 'Oklahoma', country: 'United States', countrycode: 'US', type: 'city' } },
      { geometry: { coordinates: [8.5, 47.3] }, properties: { name: 'Tulsa Street', city: 'Zurich', country: 'Switzerland', countrycode: 'CH', type: 'street' } },
    ] }],
  ]);
  const results = await searchPlaces('Tulsa');
  assert.deepEqual(results[0], { name: 'Tulsa', detail: 'Oklahoma', lat: 36.15, lon: -95.99 });
  assert.equal(results.length, 1, 'non-US results dropped when US ones exist');
});

test('searchPlaces: falls back to Open-Meteo when Photon fails', async (t) => {
  stubFetch(t, [
    ['photon.komoot.io', new TypeError('Failed to fetch')],
    ['geocoding-api.open-meteo.com', { results: [{ name: 'Wichita Falls', admin1: 'Texas', country: 'United States', country_code: 'US', latitude: 33.9137, longitude: -98.4934 }] }],
  ]);
  const results = await searchPlaces('Wichita Falls');
  assert.deepEqual(results, [{ name: 'Wichita Falls', detail: 'Texas', lat: 33.9137, lon: -98.4934 }]);
});

test('loadForecast: points lookup, then the 7-day forecast', async (t) => {
  const points = fixture('nws-points.json');
  const forecast = fixture('nws-forecast.json');
  const seen = stubFetch(t, [['/points/', points], ['/forecast', forecast]]);
  const f = await loadForecast({ lat: 36.15396, lon: -95.99278 });
  assert.ok(seen[0].includes('/points/36.154,-95.993'), seen[0]);
  assert.ok(f.periods.length > 0);
  assert.equal(f.timeZone, points.properties.timeZone);
  assert.ok(f.city.length > 0);
});
