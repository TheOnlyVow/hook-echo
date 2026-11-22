import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);

const VENDORED = [
  'site/vendor/maplibre-gl/maplibre-gl.js',
  'site/vendor/maplibre-gl/maplibre-gl.css',
  'site/vendor/maplibre-gl/LICENSE.txt',
  'site/fonts/barlow-latin-400-normal.woff2',
  'site/fonts/barlow-latin-500-normal.woff2',
  'site/fonts/barlow-latin-600-normal.woff2',
  'site/fonts/barlow-condensed-latin-500-normal.woff2',
  'site/fonts/barlow-condensed-latin-600-normal.woff2',
  'site/fonts/barlow-condensed-latin-700-normal.woff2',
  'site/fonts/jetbrains-mono-latin-400-normal.woff2',
  'site/fonts/jetbrains-mono-latin-600-normal.woff2',
  'site/fonts/LICENSE-fonts.txt',
];

test('vendored map library and fonts are present and non-empty', () => {
  for (const rel of VENDORED) {
    const url = new URL(rel, root);
    assert.ok(existsSync(url), `missing ${rel}`);
    assert.ok(statSync(url).size > 500, `suspiciously small ${rel}`);
  }
});
