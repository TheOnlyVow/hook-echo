// Draws the Hook Echo app icon (a hook-shaped radar echo over radar range
// rings) and renders every size the manifest and iOS need. Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'icons');
mkdirSync(out, { recursive: true });

const HOOK = 'M5 24.5C4.3 14.6 11.3 6.3 19.6 7.1c6.3.6 9 7.3 5.3 11.4-2.6 2.9-7.2 2.6-8.6-.4-1-2.2.4-4.4 2.6-4.5';

/**
 * @param {{rounded: boolean, scale: number}} o rounded corners for "any" icons;
 *   maskable icons are full-bleed with the mark inside the 80% safe zone.
 */
function iconSvg({ rounded, scale }) {
  // The mark's bounding box center in its 32-unit space.
  const cx = 15.15;
  const cy = 15.4;
  const tx = 256 - cx * scale;
  const ty = 256 - cy * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="hook" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#2fd27a"/>
      <stop offset="0.45" stop-color="#ffd43b"/>
      <stop offset="0.75" stop-color="#ff4b3e"/>
      <stop offset="1" stop-color="#e040fb"/>
    </linearGradient>
    <radialGradient id="ground" cx="0.5" cy="0.38" r="0.75">
      <stop offset="0" stop-color="#18232f"/>
      <stop offset="1" stop-color="#0b1016"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#ground)"/>
  <g fill="none" stroke="#9cc2ff" stroke-opacity="0.13" stroke-width="3">
    <circle cx="256" cy="256" r="${rounded ? 196 : 168}"/>
    <circle cx="256" cy="256" r="${rounded ? 130 : 112}"/>
    <path d="M256 ${rounded ? 52 : 82}V${rounded ? 460 : 430}M${rounded ? 52 : 82} 256H${rounded ? 460 : 430}" stroke-opacity="0.08"/>
  </g>
  <path transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})" d="${HOOK}" fill="none" stroke="url(#hook)" stroke-width="3.6" stroke-linecap="round"/>
</svg>`;
}

const any = iconSvg({ rounded: true, scale: 13 });
const maskable = iconSvg({ rounded: false, scale: 10.5 });
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

writeFileSync(join(out, 'icon.svg'), any);
writeFileSync(join(out, 'icon-192.png'), png(any, 192));
writeFileSync(join(out, 'icon-512.png'), png(any, 512));
writeFileSync(join(out, 'maskable-512.png'), png(maskable, 512));
writeFileSync(join(out, 'apple-touch-icon.png'), png(maskable, 180));
console.log('icons: icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png');
