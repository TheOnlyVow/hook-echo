// Copies the pinned map library and font files from node_modules into site/,
// so the published app never depends on a CDN. Run after `npm install`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const site = (...p) => join(root, 'site', ...p);

function copy(from, to) {
  if (!existsSync(from)) throw new Error(`vendor: missing ${from} (run npm install)`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`vendor: ${to.slice(root.length + 1)}`);
}

// Map library (UMD build exposes the global `maplibregl`).
for (const f of ['maplibre-gl.js', 'maplibre-gl.css']) copy(nm('maplibre-gl', 'dist', f), site('vendor', 'maplibre-gl', f));
copy(nm('maplibre-gl', 'LICENSE.txt'), site('vendor', 'maplibre-gl', 'LICENSE.txt'));

// Fonts: latin subset only, the weights the design uses.
const FONTS = {
  barlow: [400, 500, 600],
  'barlow-condensed': [500, 600, 700],
  'jetbrains-mono': [400, 600],
};
const licenses = [];
for (const [family, weights] of Object.entries(FONTS)) {
  for (const w of weights) {
    const file = `${family}-latin-${w}-normal.woff2`;
    copy(nm('@fontsource', family, 'files', file), site('fonts', file));
  }
  const lic = nm('@fontsource', family, 'LICENSE');
  if (existsSync(lic)) licenses.push(`==== ${family} ====\n${readFileSync(lic, 'utf8').trim()}\n`);
}
writeFileSync(site('fonts', 'LICENSE-fonts.txt'), `Fonts are licensed under the SIL Open Font License 1.1.\n\n${licenses.join('\n')}`);
console.log('vendor: site/fonts/LICENSE-fonts.txt');
