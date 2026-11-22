// NEXRAD base reflectivity mosaic from the Iowa Environmental Mesonet. The
// newest frame comes from the live layer; older frames use time-stamped
// layers, whose URLs never change, so browsers cache them across the loop.

import { fetchJSON } from './http.js';
import { IEM, RADAR_FRAMES, RADAR_STEP_MS } from '../config.js';

const p2 = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
const tileUrl = (layer) => `${IEM}/cache/tile.py/1.0.0/${layer}/{z}/{x}/{y}.png`;

/**
 * @param {string} validIso time of the newest mosaic
 * @returns {{time: Date, tiles: string}[]} oldest first
 */
export function radarFrames(validIso, count = RADAR_FRAMES) {
  const valid = new Date(validIso);
  const frames = [];
  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(valid.getTime() - i * RADAR_STEP_MS);
    const tiles = i === 0 ? `${tileUrl('nexrad-n0q-900913')}?v=${stamp(time)}` : tileUrl(`ridge::USCOMP-N0Q-${stamp(time)}`);
    frames.push({ time, tiles });
  }
  return frames;
}

/** @returns {Promise<{valid: Date, frames: {time: Date, tiles: string}[]}>} */
export async function loadRadar(signal) {
  const meta = await fetchJSON(`${IEM}/data/gis/images/4326/USCOMP/n0q_0.json`, { signal, timeoutMs: 15_000 });
  const valid = meta?.meta?.valid;
  if (!valid || Number.isNaN(new Date(valid).getTime())) throw new Error('Radar time missing from the mosaic metadata');
  return { valid: new Date(valid), frames: radarFrames(valid) };
}
