import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { baseLayers, OMT_SOURCE, GLYPHS } from '../site/js/map/basemap.js';
import { overlayLayers, SOURCES, sourceSpec } from '../site/js/map/layers.js';

// Every color token the layers read, as the canvas normalizes them.
const COLORS = {
  ground: '#0d1217',
  ink: '#e7edf4',
  'ink-2': '#a5b2c0',
  casing: 'rgba(5, 9, 13, 0.85)',
  'path-line': '#f4f7fb',
  'path-cone': 'rgba(244, 247, 251, 0.09)',
  'path-cone-edge': 'rgba(244, 247, 251, 0.45)',
  me: '#4da3ff',
  mcd: '#6fb6ff',
  ef0: '#ffc5c9',
  ef1: '#fca0a4',
  ef2: '#f47a7d',
  ef3: '#eb5154',
  ef4: '#d72630',
  ef5: '#bc0012',
  efu: '#8d99a8',
  'st-shelter': '#ff4b4b',
  'st-warning': '#ff9f1c',
};

for (const theme of ['dark', 'light']) {
  test(`every map layer is valid MapLibre style (${theme})`, () => {
    const sources = { omt: OMT_SOURCE };
    for (const id of SOURCES) sources[id] = sourceSpec(id);
    const style = { version: 8, glyphs: GLYPHS, sources, layers: [...baseLayers(theme), ...overlayLayers({ ...COLORS, dark: theme === 'dark' })] };
    const errors = validateStyleMin(style).map((e) => e.message);
    assert.deepEqual(errors, []);
  });
}

test('overlay layer ids are unique and include the city labels', () => {
  const ids = overlayLayers({ ...COLORS, dark: true }).map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('label-city'));
});
