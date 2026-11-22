import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';

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
  'site/fonts/LICENSE-fonts.txt',
];

const pngSize = (url) => {
  const b = readFileSync(url);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${url.pathname} is not a PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

test('web app manifest is installable: name, start URL, standalone, real icons at their stated sizes', () => {
  const manifest = JSON.parse(readFileSync(new URL('site/manifest.webmanifest', root), 'utf8'));
  assert.equal(manifest.name, 'Hook Echo');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  const pngs = manifest.icons.filter((i) => i.type === 'image/png');
  assert.ok(pngs.some((i) => i.sizes === '192x192') && pngs.some((i) => i.sizes === '512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of pngs) assert.equal(pngSize(new URL(`site/${icon.src}`, root)), icon.sizes, icon.src);
  assert.equal(pngSize(new URL('site/icons/apple-touch-icon.png', root)), '180x180');
  assert.ok(existsSync(new URL('site/icons/icon.svg', root)));
});

test('service worker exists and never caches cross-origin feeds', () => {
  const sw = readFileSync(new URL('site/sw.js', root), 'utf8');
  assert.match(sw, /self\.addEventListener\('fetch'/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
});

test('precache list covers every app file and matches the service worker version', async () => {
  const { readdirSync } = await import('node:fs');
  const list = JSON.parse(readFileSync(new URL('site/precache.json', root), 'utf8'));
  const walk = (dir) => readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}${d.name}/`) : [`${dir}${d.name}`]));
  const jsFiles = walk('site/js/').map((p) => p.replace('site/', ''));
  for (const f of jsFiles) assert.ok(list.files.includes(f), `precache.json is missing ${f}; run npm run precache`);
  assert.ok(list.files.includes('index.html') && !list.files.includes('sw.js'));
  const sw = readFileSync(new URL('site/sw.js', root), 'utf8');
  assert.match(sw, new RegExp(`const VERSION = '${list.version}'`), 'sw.js VERSION is out of date; run npm run precache');
});

test('vendored map library and fonts are present and non-empty', () => {
  for (const rel of VENDORED) {
    const url = new URL(rel, root);
    assert.ok(existsSync(url), `missing ${rel}`);
    assert.ok(statSync(url).size > 500, `suspiciously small ${rel}`);
  }
});
