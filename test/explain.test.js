import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainFeature, explainPlace, rankHits, tapAction } from '../site/js/lib/explain.js';
import { NOW, MIN, makeAlert } from './helpers.js';

// NOW is 8:03 PM on Saturday 21 November in Chicago.
const ctx = (extra = {}) => ({ now: NOW, timeZone: 'America/Chicago', ...extra });
const at = (min) => NOW.getTime() + min * MIN;
const openAlert = (id) => [{ kind: 'open-alert', id, label: 'Open the warning' }];

test('trail: where the storm has been, since when, with a way to open its warning', () => {
  const alert = makeAlert();
  const e = explainFeature('trail-to', { id: 't', phenomena: 'TO', event: 'Tornado Warning', alertId: alert.id, since: at(-42), last: at(-2), count: 5 }, ctx({ alert }));
  assert.equal(e.title, 'Storm trail');
  assert.match(e.text, /tornado-warned storm has been since 7:21 PM/);
  assert.equal(e.meta, '5 positions, latest 8:01 PM');
  assert.deepEqual(e.actions, openAlert(alert.id));
});

test('trail: a severe thunderstorm trail, with no action once its warning has ended', () => {
  const e = explainFeature('trail-sv', { phenomena: 'SV', event: 'Severe Thunderstorm Warning', alertId: 'gone', since: at(-30), last: at(-10), count: 3 }, ctx());
  assert.match(e.text, /severe thunderstorm has been since 7:33 PM/);
  assert.deepEqual(e.actions, []);
});

test('trail dot: one position and its time', () => {
  const e = explainFeature('trail-dots', { phenomena: 'TO', event: 'Tornado Warning', time: at(-12), alertId: 'x' }, ctx());
  assert.equal(e.title, 'Storm position at 7:51 PM');
  assert.match(e.text, /fade/);
});

test('projected path, cone, ticks and arrow explain the forecast honestly', () => {
  const alert = makeAlert();
  const props = { id: alert.id, event: 'Tornado Warning', until: at(25), dirFrom: 225, speedKt: 26, motionTime: at(-4) };
  const path = explainFeature('path-line', props, ctx({ alert }));
  assert.equal(path.title, 'Projected path');
  assert.match(path.text, /NE at 30 mph/);
  assert.match(path.text, /8:28 PM/);
  assert.match(path.text, /storms can turn/i);
  const cone = explainFeature('cone-fill', props, ctx({ alert }));
  assert.equal(cone.title, 'Possible path area');
  assert.match(cone.text, /15°/);
  const tick = explainFeature('tick-dot', { ...props, time: at(17) }, ctx({ alert }));
  assert.equal(tick.title, 'Around 8:20 PM');
  assert.match(tick.text, /10 minutes apart/);
  const end = explainFeature('path-arrow', props, ctx({ alert }));
  assert.equal(end.title, 'Direction of travel');
  for (const e of [path, cone, tick, end]) assert.deepEqual(e.actions, openAlert(alert.id));
});

test('storm now: an estimate moved forward from the last NWS position', () => {
  const e = explainFeature('storm-now', { id: 'a', event: 'Tornado Warning', until: at(25), dirFrom: 225, speedKt: 26, motionTime: at(-4) }, ctx());
  assert.equal(e.title, 'Storm now');
  assert.match(e.text, /7:59 PM/);
});

test('warnings and watches: what they mean, until when, from which office', () => {
  const tor = makeAlert({ senderName: 'NWS Norman OK', expires: new Date(at(30)) });
  const e = explainFeature('warn-fill', { id: tor.id, event: tor.event }, ctx({ alert: tor }));
  assert.equal(e.title, 'Tornado Warning');
  assert.match(e.text, /take shelter now/i);
  assert.equal(e.meta, 'Until 8:33 PM, NWS Norman OK');
  const watch = makeAlert({ event: 'Tornado Watch', senderName: 'NWS Storm Prediction Center Norman OK', expires: new Date(at(180)) });
  assert.match(explainFeature('watch-fill', { id: watch.id, event: watch.event }, ctx({ alert: watch })).text, /not a warning/);
  const emergency = makeAlert({ tags: [{ kind: 'emergency', label: 'Tornado emergency' }] });
  assert.match(explainFeature('warn-fill', { id: emergency.id, event: emergency.event }, ctx({ alert: emergency })).text, /^Tornado emergency/);
  const winter = explainFeature('zones-fill', { id: 'w', event: 'Winter Storm Warning' }, ctx());
  assert.equal(winter.title, 'Winter Storm Warning');
  assert.ok(winter.text.length > 20);
});

test('storm reports: what was reported, when, where, and how to read the shape', () => {
  const report = { id: 'r1', type: 'wind', label: 'Wind damage', magnitudeText: '', time: new Date(at(-25)), city: 'Hialeah', county: 'Miami-Dade', state: 'FL', remark: 'Trees down on cars.', source: 'TRAINED SPOTTER' };
  const e = explainFeature('reports', { id: 'r1', type: 'wind', label: 'Wind damage' }, ctx({ report }));
  assert.equal(e.title, 'Wind damage');
  assert.match(e.text, /Squares are wind reports/);
  assert.equal(e.meta, '7:38 PM, 25 min ago');
  assert.deepEqual(e.details, ['Hialeah, Miami-Dade County, FL', 'Trees down on cars.', 'Reported by a trained spotter']);
  const hail = explainFeature('reports', { id: 'r2', type: 'hail', label: 'Hail' }, ctx({ report: { ...report, type: 'hail', label: 'Hail', magnitudeText: '1.75 in', remark: '', source: '' } }));
  assert.equal(hail.title, 'Hail, 1.75 in');
  assert.match(hail.text, /Circles are hail reports/);
});

test('damage surveys: the EF rating in words', () => {
  const survey = { id: 's', ef: 'EF2', start: new Date('2026-11-20T21:10:00Z'), lengthMi: 6.4, widthYd: 300, maxWindMph: 125, injuries: 0, fatalities: 0, wfo: 'MFL' };
  const e = explainFeature('survey-line', { id: 's', ef: 'EF2' }, ctx({ survey }));
  assert.equal(e.title, 'Surveyed tornado path, EF2');
  assert.match(e.text, /111 to 135 mph/);
  assert.ok(e.details.includes('6.4 mi long, up to 300 yd wide'), e.details.join(' | '));
});

test('storm risk areas: what each category means, for which day and window', () => {
  const v = (day) => Date.parse(`2026-11-${20 + day}T12:00:00Z`);
  const area = (day, kind, label, pct = -1, sig = false) => ({ id: 'x', day, kind, label, pct, sig, valid: v(day), expire: v(day) + 864e5 });
  const enh = explainFeature('spc-fill', area(1, 'cat', 'ENH'), ctx());
  assert.equal(enh.title, 'Enhanced risk (3 of 5) today');
  assert.match(enh.text, /Numerous severe storms/);
  assert.equal(enh.meta, 'Storm Prediction Center, Sat 6 AM to Sun 6 AM');
  assert.equal(explainFeature('spc-fill', area(2, 'cat', 'SLGT'), ctx()).title, 'Slight risk (2 of 5) tomorrow');
  assert.equal(explainFeature('spc-fill', area(3, 'cat', 'MRGL'), ctx()).title, 'Marginal risk (1 of 5) on Monday');
  assert.equal(explainFeature('spc-fill', area(1, 'cat', 'TSTM'), ctx()).title, 'Thunderstorms possible today');
  const torn = explainFeature('spc-fill', area(1, 'torn', '0.10', 10), ctx());
  assert.equal(torn.title, '10% tornado chance today');
  assert.match(torn.text, /within 25 miles/);
  assert.equal(explainFeature('spc-fill', area(1, 'torn', 'SIGN', -1, true), ctx()).title, 'Strong tornadoes possible today');
  assert.equal(explainFeature('spc-fill', area(5, 'prob', '0.15', 15), ctx()).title, '15% severe storm chance on Wednesday');
  // After midnight the Day 1 outlook still runs until 6 AM.
  const late = explainFeature('spc-fill', area(1, 'cat', 'ENH'), ctx({ now: new Date('2026-11-22T07:30:00Z') }));
  assert.equal(late.title, 'Enhanced risk (3 of 5) until 6:00 AM');
});

test('mesoscale discussions: what forecasters are watching and the chance of a watch', () => {
  const d = { id: 'md', num: 2463, year: 2026, issue: new Date(at(-20)), expire: new Date(at(70)), watchChance: 80, concerning: 'SEVERE POTENTIAL...TORNADO WATCH LIKELY' };
  const e = explainFeature('mcd-fill', { id: 'md', num: 2463 }, ctx({ discussion: d }));
  assert.equal(e.title, 'Mesoscale discussion 2463');
  assert.match(e.text, /watching this area closely for severe storms/);
  assert.match(e.text, /A Tornado Watch is likely soon \(80% chance\)/);
  assert.equal(e.meta, 'Until 9:13 PM');
  assert.deepEqual(e.actions, [{ kind: 'link', href: 'https://www.spc.noaa.gov/products/md/2026/md2463.html', label: 'Read the discussion' }]);
  const update = explainFeature('mcd-fill', { id: 'u' }, ctx({ discussion: { ...d, watchChance: null, concerning: 'TORNADO WATCH 706' } }));
  assert.match(update.text, /Tornado Watch 706, which is already in effect/);
  const unlikely = explainFeature('mcd-line', { id: 'n' }, ctx({ discussion: { ...d, watchChance: 20, concerning: 'SEVERE POTENTIAL...WATCH UNLIKELY' } }));
  assert.match(unlikely.text, /A watch is unlikely \(20% chance\)/);
});

test('tropical: development areas, disturbances, the forecast cone, track and points', () => {
  const area = explainFeature('dev-fill', { id: 'a', basin: 'Atlantic', prob2: 20, prob7: 60, risk2: 'low', risk7: 'medium' }, ctx());
  assert.equal(area.title, 'Where a tropical storm could form');
  assert.match(area.text, /60% chance/);
  assert.match(area.text, /20% within 2 days/);
  assert.equal(area.meta, 'National Hurricane Center, Atlantic, medium chance');
  assert.match(explainFeature('dev-fill', { id: 'b', basin: 'Atlantic', prob2: 0, prob7: 0, risk2: 'low', risk7: 'low' }, ctx()).text, /near 0%/);
  assert.equal(explainFeature('dev-points', { id: 'p', basin: 'Atlantic', prob2: 30, prob7: 50, risk2: 'low', risk7: 'medium' }, ctx()).title, 'Disturbance NHC is watching');
  const storm = { id: 'AT1', name: 'Kirk', label: 'Category 4 hurricane', maxWindMph: 132, advisory: '14', advisoryTime: '11:00 PM AST Thu Oct 03 2024', movement: { mph: 12, bearing: 300 } };
  const cone = explainFeature('trop-cone', { id: 'AT1', storm: 'AT1', name: 'Kirk' }, ctx({ storm }));
  assert.equal(cone.title, 'Kirk: forecast cone');
  assert.match(cone.text, /two-thirds of the time/);
  assert.equal(explainFeature('trop-track', { id: 'AT1', name: 'Kirk' }, ctx({ storm })).title, 'Kirk: forecast track');
  assert.equal(explainFeature('trop-past', { id: 'AT1', name: 'Kirk' }, ctx({ storm })).title, 'Kirk: past track');
  const point = explainFeature('trop-points', { id: 'AT1-24', storm: 'AT1', tau: 24, when: '8:00 PM Fri', windMph: 115 }, ctx({ storm, point: { tau: 24, when: '8:00 PM Fri', windMph: 115 } }));
  assert.equal(point.title, 'Kirk, 8:00 PM Fri');
  assert.match(point.text, /Category 3 hurricane/);
  const nowPoint = explainFeature('trop-points', { id: 'AT1-0', storm: 'AT1', tau: 0, windMph: 132 }, ctx({ storm, point: { tau: 0, when: '11:00 PM Thu', windMph: 132 } }));
  assert.equal(nowPoint.title, 'Kirk now');
  assert.ok(nowPoint.details.some((d) => /Moving NW at 12 mph/.test(d)), nowPoint.details.join(' | '));
});

test('your location circle, and layers with nothing to explain', () => {
  assert.equal(explainFeature('me-acc-fill', { id: 'me' }, ctx()).title, 'Where you are');
  assert.equal(explainFeature('label-city', {}, ctx()), null);
});

test('rankHits: the most specific thing first, one entry per thing', () => {
  const hits = [
    { layer: 'spc-fill', props: { id: 's' } },
    { layer: 'warn-fill', props: { id: 'svr', rank: 78, event: 'Severe Thunderstorm Warning' } },
    { layer: 'warn-fill', props: { id: 'tor', rank: 90, event: 'Tornado Warning' } },
    { layer: 'trail-to', props: { id: 't' } },
    { layer: 'path-casing', props: { id: 'tor' } },
    { layer: 'path-line', props: { id: 'tor' } },
    { layer: 'label-city', props: {} },
  ];
  assert.deepEqual(rankHits(hits).map((h) => `${h.kind}:${h.props.id}`), ['path:tor', 'trail:t', 'alert:tor', 'alert:svr', 'spc:s']);
});

test('tapAction: warnings open directly; everything else explains itself', () => {
  assert.deepEqual(tapAction(rankHits([{ layer: 'cone-fill', props: { id: 'a' } }, { layer: 'warn-fill', props: { id: 'a', rank: 90 } }])), { type: 'select', id: 'a' });
  assert.deepEqual(tapAction(rankHits([{ layer: 'storm-now', props: { id: 'a' } }])), { type: 'select', id: 'a' });
  const trail = rankHits([{ layer: 'watch-fill', props: { id: 'w', rank: 50 } }, { layer: 'trail-to', props: { id: 't' } }]);
  assert.deepEqual(tapAction(trail), { type: 'explain', hits: trail });
  assert.equal(tapAction([]), null);
});

test('explainPlace: a pin on the map says whose it is and what covers it', () => {
  const tor = makeAlert();
  const shelter = explainPlace({ place: { id: 'p', kind: 'family', name: 'Grandma' }, status: { level: 'shelter', top: tor } });
  assert.equal(shelter.title, 'Grandma');
  assert.match(shelter.text, /Take shelter: a Tornado Warning covers this place/);
  assert.match(explainPlace({ place: { id: 'p', kind: 'trip', name: 'Tulsa stop' }, status: { level: 'clear', top: null } }).text, /No warnings here right now/);
  assert.match(explainPlace({ place: { id: 'me', kind: 'me', name: 'Where I am' }, status: { level: 'unknown', top: null } }).text, /out of date/);
});
