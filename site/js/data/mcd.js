// SPC mesoscale discussions: short notes on an area Storm Prediction Center
// forecasters are watching closely, usually with the chance that a watch
// follows within the next hour or two. Read through the Iowa Environmental
// Mesonet's copy of the SPC feed, which browsers are allowed to load.

import { fetchJSON } from './http.js';
import { IEM, SPC_MD_PAGE } from '../config.js';

const date = (s) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * @typedef {{id: string, num: number, year: number, issue: Date, expire: Date, watchChance: number | null,
 *   concerning: string, geometry: object}} Discussion
 */

/** @returns {Discussion[]} */
export function normalizeDiscussions(fc) {
  const out = [];
  const seen = new Set();
  for (const f of fc?.features ?? []) {
    const p = f.properties ?? {};
    const issue = date(p.issue);
    const expire = date(p.expire);
    const num = Number(p.num);
    if (!f.geometry || !issue || !expire || !Number.isFinite(num)) continue;
    const id = String(p.product_id ?? `${p.year}-${num}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const chance = p.watch_confidence == null || p.watch_confidence === '' ? null : Number(p.watch_confidence);
    out.push({
      id,
      num,
      year: Number(p.year) || issue.getUTCFullYear(),
      issue,
      expire,
      watchChance: Number.isFinite(chance) ? chance : null,
      concerning: String(p.concerning ?? '').trim(),
      geometry: f.geometry,
    });
  }
  return out;
}

/** Discussions still in effect, newest first. */
export function activeDiscussions(list, now) {
  return list.filter((d) => d.expire > now).sort((a, b) => b.issue - a.issue);
}

const TOPICS = [
  [/HEAVY RAIN/, 'Heavy rain'],
  [/HEAVY SNOW/, 'Heavy snow'],
  [/BLIZZARD/, 'Blizzard conditions'],
  [/FREEZING RAIN/, 'Freezing rain'],
  [/SNOW SQUALL/, 'Snow squalls'],
  [/WINTER MIXED/, 'A wintry mix'],
  [/SEVERE POTENTIAL|SEVERE THUNDERSTORM POTENTIAL/, 'Severe storms possible'],
];

const titleWatch = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * What a discussion is about in plain words, and how likely a watch is.
 * @param {{concerning: string, watchChance: number | null}} d
 * @returns {{topic: string, watch: 'likely'|'possible'|'unlikely'|null, watchType: string | null, existing: string | null}}
 */
export function discussionSummary(d) {
  const c = String(d.concerning ?? '').toUpperCase();
  const existingMatch = /^(TORNADO WATCH|SEVERE THUNDERSTORM WATCH)\s+(\d+(?:\.{3}\d+)*)/.exec(c);
  if (existingMatch) {
    const existing = `${titleWatch(existingMatch[1])} ${existingMatch[2].replace(/\.{3}/g, ', ')}`;
    return { topic: `Update on ${existing}`, watch: null, watchType: null, existing };
  }
  const topic = TOPICS.find(([re]) => re.test(c))?.[1] ?? (c ? c.charAt(0) + c.slice(1).toLowerCase().replace(/\.{3}/g, ', ') : 'Storms');
  let watch = null;
  if (/WATCH LIKELY/.test(c)) watch = 'likely';
  else if (/WATCH POSSIBLE/.test(c)) watch = 'possible';
  else if (/WATCH UNLIKELY/.test(c)) watch = 'unlikely';
  else if (d.watchChance != null) watch = d.watchChance >= 60 ? 'likely' : d.watchChance >= 40 ? 'possible' : 'unlikely';
  const typeMatch = /(TORNADO|SEVERE THUNDERSTORM) WATCH (LIKELY|POSSIBLE)/.exec(c);
  return { topic, watch, watchType: typeMatch ? `${titleWatch(typeMatch[1])} Watch` : null, existing: null };
}

/** The discussion's page on the SPC site. */
export const discussionUrl = (d) => `${SPC_MD_PAGE}/${d.year}/md${String(d.num).padStart(4, '0')}.html`;

/** Discussions in effect right now. */
export async function loadDiscussions(signal, now = new Date()) {
  const fc = await fetchJSON(`${IEM}/api/1/nws/spc_mcd.geojson`, { signal, timeoutMs: 25_000 });
  return activeDiscussions(normalizeDiscussions(fc), now);
}
