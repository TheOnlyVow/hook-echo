import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeOutlook, outlookPercent, loadDays48 } from '../site/js/data/spc.js';
import { normalizeDiscussions, activeDiscussions, discussionSummary, discussionUrl } from '../site/js/data/mcd.js';
import { outlookLayerIds, normalizeDevelopment } from '../site/js/data/tropical.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

function stubFetch(t, respond) {
  const real = globalThis.fetch;
  const seen = [];
  t.after(() => (globalThis.fetch = real));
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    const body = respond(String(url));
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('not found', { status: 404 });
  };
  return seen;
}

test('normalizeOutlook: the "nothing expected" placeholder is not an area', () => {
  const torn = normalizeOutlook(fixture('spc-day2-torn.json'), 2, 'torn');
  assert.deepEqual(torn.features, []);
  assert.equal(torn.note, "Less Than 2% All Areas", "the reason SPC gives is kept as a note");
  assert.equal(torn.valid.toISOString(), '2026-11-22T12:00:00.000Z');
  assert.equal(torn.expire.toISOString(), '2026-11-23T12:00:00.000Z');
  const day4 = normalizeOutlook(fixture('spc-day4-prob.json'), 4, 'prob');
  assert.deepEqual(day4.features, []);
  assert.equal(day4.kind, 'prob');
  assert.equal(day4.note, 'Potential Too Low');
  assert.equal(normalizeOutlook(fixture('spc-day2-cat.json'), 2, 'cat').note, '');
  assert.equal(day4.valid.toISOString(), '2026-11-24T12:00:00.000Z');
});

test('outlookPercent: probability labels, with the DN value as a fallback', () => {
  assert.equal(outlookPercent({ label: '0.15', dn: 15 }), 15);
  assert.equal(outlookPercent({ label: '0.02', dn: 2 }), 2);
  assert.equal(outlookPercent({ label: '30', dn: 30 }), 30);
  assert.equal(outlookPercent({ label: '30% Any Severe Risk', dn: 30 }), 30);
  assert.equal(outlookPercent({ label: 'SIGN', dn: 0 }), null);
  assert.equal(outlookPercent({ label: '', dn: 15 }), 15);
});

test('loadDays48: one probability outlook per day, an unreachable day left out', async (t) => {
  const seen = stubFetch(t, (url) => (url.includes('day6prob') ? null : fixture('spc-day4-prob.json')));
  const out = await loadDays48();
  assert.deepEqual(Object.keys(out), ['day4', 'day5', 'day6', 'day7', 'day8']);
  assert.equal(out.day4.day, 4);
  assert.equal(out.day8.kind, 'prob');
  assert.equal(out.day6, null);
  assert.ok(seen.some((u) => u.includes('/exper/day4-8/day5prob.nolyr.geojson')), seen.join('\n'));
});

test('normalizeDiscussions: recorded SPC mesoscale discussions', () => {
  const list = normalizeDiscussions(fixture('spc-mcd.json'));
  assert.equal(list.length, 5);
  assert.equal(new Set(list.map((d) => d.id)).size, 5);
  const d = list.find((x) => x.num === 2462);
  assert.equal(d.year, 2026);
  assert.equal(d.watchChance, 5);
  assert.equal(d.expire.toISOString(), '2026-11-22T02:45:00.000Z');
  assert.equal(d.geometry.type, 'Polygon');
  assert.equal(list.find((x) => x.num === 2461).watchChance, null, 'no chance given when it discusses a watch already out');
});

test('activeDiscussions: only those still in effect, newest first', () => {
  const list = normalizeDiscussions(fixture('spc-mcd.json'));
  const active = activeDiscussions(list, new Date('2026-11-22T01:30:00Z'));
  assert.deepEqual(active.map((d) => d.num), [2462, 2461]);
  assert.deepEqual(activeDiscussions(list, new Date('2026-11-23T00:00:00Z')), []);
});

test('discussionSummary: what it is about, in plain words, and how likely a watch is', () => {
  assert.deepEqual(discussionSummary({ concerning: 'SEVERE POTENTIAL...WATCH UNLIKELY', watchChance: 20 }), { topic: 'Severe storms possible', watch: 'unlikely', watchType: null, existing: null });
  assert.deepEqual(discussionSummary({ concerning: 'SEVERE POTENTIAL...TORNADO WATCH LIKELY', watchChance: 80 }), { topic: 'Severe storms possible', watch: 'likely', watchType: 'Tornado Watch', existing: null });
  assert.deepEqual(discussionSummary({ concerning: 'SEVERE POTENTIAL...WATCH POSSIBLE', watchChance: 40 }), { topic: 'Severe storms possible', watch: 'possible', watchType: null, existing: null });
  assert.deepEqual(discussionSummary({ concerning: 'TORNADO WATCH 706', watchChance: null }), { topic: 'Update on Tornado Watch 706', watch: null, watchType: null, existing: 'Tornado Watch 706' });
  assert.deepEqual(discussionSummary({ concerning: 'HEAVY RAINFALL', watchChance: null }), { topic: 'Heavy rain', watch: null, watchType: null, existing: null });
  assert.equal(discussionSummary({ concerning: 'SEVERE POTENTIAL', watchChance: 95 }).watch, 'likely', 'the number decides when the words do not');
  assert.equal(discussionSummary({ concerning: 'SOMETHING NEW', watchChance: null }).topic, 'Something new');
});

test('discussionUrl: the SPC page for a discussion', () => {
  assert.equal(discussionUrl({ year: 2026, num: 61 }), 'https://www.spc.noaa.gov/products/md/2026/md0061.html');
  assert.equal(discussionUrl({ year: 2026, num: 2462 }), 'https://www.spc.noaa.gov/products/md/2026/md2462.html');
});

test('outlookLayerIds: the NHC seven-day outlook layers, found by name', () => {
  assert.deepEqual(outlookLayerIds(fixture('tropical-service.json')), { areas: 3, points: 2 });
  assert.deepEqual(outlookLayerIds({ layers: [] }), { areas: null, points: null });
});

test('normalizeDevelopment: recorded NHC development areas and disturbance points', () => {
  const t = fixture('tropical-outlook.json');
  const dev = normalizeDevelopment({ areas: t.areas7, points: t.points7 });
  assert.equal(dev.areas.length, 1);
  const a = dev.areas[0];
  assert.equal(a.basin, 'Atlantic');
  assert.equal(a.prob2, 0);
  assert.equal(a.prob7, 0);
  assert.equal(a.risk7, 'low');
  assert.ok(['Polygon', 'MultiPolygon'].includes(a.geometry.type));
  assert.equal(dev.points.length, 1);
  assert.ok(Number.isFinite(dev.points[0].lat) && Number.isFinite(dev.points[0].lon));
  const sample = normalizeDevelopment({
    areas: { features: [{ geometry: a.geometry, properties: { objectid: 7, basin: 'Eastern Pacific', prob2day: '30%', risk2day: 'low', prob7day: '>90%', risk7day: 'high' } }] },
    points: null,
  });
  assert.deepEqual([sample.areas[0].prob2, sample.areas[0].prob7, sample.areas[0].risk2, sample.areas[0].risk7], [30, 90, 'low', 'high']);
  assert.deepEqual(sample.points, []);
});
