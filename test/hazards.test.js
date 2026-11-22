import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hazardColor, alertTags, alertLevel, placeLevel, alertRank } from '../site/js/lib/hazards.js';

const tag = (tags, kind) => tags.find((t) => t.kind === kind);

test('hazardColor: official NWS map colors', () => {
  assert.equal(hazardColor('Tornado Warning'), '#FF0000');
  assert.equal(hazardColor('Severe Thunderstorm Warning'), '#FFA500');
  assert.equal(hazardColor('Flash Flood Warning'), '#8B0000');
  assert.equal(hazardColor('Tornado Watch'), '#FFFF00');
  assert.equal(hazardColor('Severe Thunderstorm Watch'), '#DB7093');
  assert.equal(hazardColor('Made Up Event'), '#8A94A6');
});

test('alertTags: tornado damage threat', () => {
  assert.deepEqual(tag(alertTags('Tornado Warning', { tornadoDamageThreat: ['CATASTROPHIC'] }, ''), 'emergency'), { kind: 'emergency', label: 'Tornado emergency' });
  assert.deepEqual(tag(alertTags('Tornado Warning', { tornadoDamageThreat: ['CONSIDERABLE'] }, ''), 'pds'), { kind: 'pds', label: 'PDS' });
});

test('alertTags: tornado emergency named only in the text', () => {
  const tags = alertTags('Tornado Warning', {}, '...TORNADO EMERGENCY FOR MOORE...');
  assert.ok(tag(tags, 'emergency'));
});

test('alertTags: how the tornado was detected', () => {
  assert.deepEqual(tag(alertTags('Tornado Warning', { tornadoDetection: ['OBSERVED'] }, ''), 'observed'), { kind: 'observed', label: 'Observed' });
  assert.deepEqual(tag(alertTags('Tornado Warning', { tornadoDetection: ['RADAR INDICATED'] }, ''), 'radar'), { kind: 'radar', label: 'Radar indicated' });
  assert.deepEqual(tag(alertTags('Severe Thunderstorm Warning', { tornadoDetection: ['POSSIBLE'] }, ''), 'possible'), { kind: 'possible', label: 'Tornado possible' });
});

test('alertTags: hail size and wind gust', () => {
  const tags = alertTags('Severe Thunderstorm Warning', { maxHailSize: ['2.75'], maxWindGust: ['80 MPH'] }, '');
  assert.deepEqual(tag(tags, 'hail'), { kind: 'hail', label: '2.75 in hail' });
  assert.deepEqual(tag(tags, 'wind'), { kind: 'wind', label: '80 mph wind' });
  assert.equal(tag(alertTags('Special Weather Statement', { maxHailSize: ['0.00'] }, ''), 'hail'), undefined);
});

test('alertTags: severe thunderstorm damage threat', () => {
  assert.deepEqual(tag(alertTags('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['DESTRUCTIVE'] }, ''), 'destructive'), { kind: 'destructive', label: 'Destructive' });
  assert.deepEqual(tag(alertTags('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['CONSIDERABLE'] }, ''), 'considerable'), { kind: 'considerable', label: 'Considerable damage' });
});

test('alertTags: flash flood emergency', () => {
  assert.deepEqual(tag(alertTags('Flash Flood Warning', { flashFloodDamageThreat: ['CATASTROPHIC'] }, ''), 'emergency'), { kind: 'emergency', label: 'Flash flood emergency' });
});

test('alertLevel: what sounds the alarm, what chimes, what stays silent', () => {
  const lvl = (event, params = {}) => alertLevel(event, alertTags(event, params, ''));
  assert.equal(lvl('Tornado Warning'), 'alarm');
  assert.equal(lvl('Extreme Wind Warning'), 'alarm');
  assert.equal(lvl('Flash Flood Warning', { flashFloodDamageThreat: ['CATASTROPHIC'] }), 'alarm');
  assert.equal(lvl('Severe Thunderstorm Warning', { thunderstormDamageThreat: ['DESTRUCTIVE'] }), 'alarm');
  assert.equal(lvl('Severe Thunderstorm Warning'), 'chime');
  assert.equal(lvl('Flash Flood Warning'), 'chime');
  assert.equal(lvl('Tornado Watch'), 'chime');
  assert.equal(lvl('Severe Thunderstorm Watch'), 'silent');
  assert.equal(lvl('Winter Storm Warning'), 'silent');
  assert.equal(lvl('Small Craft Advisory'), 'silent');
});

test('placeLevel: status words for a place', () => {
  assert.equal(placeLevel('Tornado Warning'), 'shelter');
  assert.equal(placeLevel('Winter Storm Warning'), 'warning');
  assert.equal(placeLevel('Tornado Watch'), 'watch');
  assert.equal(placeLevel('Wind Advisory'), 'advisory');
  assert.equal(placeLevel('Special Weather Statement'), 'advisory');
});

test('alertRank: strictly decreasing seriousness', () => {
  const ordered = [
    ['Tornado Warning', { tornadoDamageThreat: ['CATASTROPHIC'] }],
    ['Tornado Warning', { tornadoDamageThreat: ['CONSIDERABLE'] }],
    ['Tornado Warning', { tornadoDetection: ['OBSERVED'] }],
    ['Tornado Warning', { tornadoDetection: ['RADAR INDICATED'] }],
    ['Extreme Wind Warning', {}],
    ['Flash Flood Warning', { flashFloodDamageThreat: ['CATASTROPHIC'] }],
    ['Severe Thunderstorm Warning', { thunderstormDamageThreat: ['DESTRUCTIVE'] }],
    ['Severe Thunderstorm Warning', {}],
    ['Flash Flood Warning', {}],
    ['Winter Storm Warning', {}],
    ['Tornado Watch', {}],
    ['Severe Thunderstorm Watch', {}],
    ['Winter Storm Watch', {}],
    ['Wind Advisory', {}],
    ['Special Weather Statement', {}],
  ];
  const ranks = ordered.map(([event, params]) => alertRank(event, alertTags(event, params, '')));
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(ranks[i - 1] > ranks[i], `${ordered[i - 1][0]} (${ranks[i - 1]}) should outrank ${ordered[i][0]} (${ranks[i]})`);
  }
});
