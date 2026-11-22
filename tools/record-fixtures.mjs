// Records real feed samples into test/fixtures/ so normalizers are tested
// against what the servers actually send. Public weather data only; large
// collections are trimmed to keep the repo small. Run: npm run fixtures
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test', 'fixtures');
mkdirSync(out, { recursive: true });
const UA = 'HookEcho/1.0 (storm tracker fixtures)';

async function getJSON(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json, application/json' }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    // Some servers (SPC) reset Node's connections but answer curl.
    console.warn(`fetch failed for ${url} (${e.message}); retrying with curl`);
    return JSON.parse(execFileSync('curl', ['-sSL', '--max-time', '60', '-A', UA, url], { encoding: 'utf8', maxBuffer: 64 << 20 }));
  }
}

const trim = (fc, n) => ({ ...fc, features: (fc.features ?? []).slice(0, n) });
const save = (name, data) => {
  writeFileSync(join(out, name), JSON.stringify(data, null, 1));
  console.log(`fixture: test/fixtures/${name} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`);
};

const NWS = 'https://api.weather.gov';
const since = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 19) + 'Z';

const jobs = {
  'storm-alerts.json': async () => trim(await getJSON(`${NWS}/alerts/active?status=actual&event=Tornado%20Warning,Severe%20Thunderstorm%20Warning,Flash%20Flood%20Warning,Special%20Marine%20Warning,Tornado%20Watch,Severe%20Thunderstorm%20Watch,Special%20Weather%20Statement`), 25),
  'land-alerts.json': async () => trim(await getJSON(`${NWS}/alerts/active?status=actual&region_type=land`), 25),
  'tornado-warnings-recent.json': async () => await getJSON(`${NWS}/alerts?status=actual&event=Tornado%20Warning&start=${since(4)}&limit=80`),
  'shapes.json': async () =>
    trim(
      await getJSON(
        'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer/1/query?where=1%3D1&outFields=prod_type,url,expiration,phenom,sig&returnGeometry=true&maxAllowableOffset=0.01&geometryPrecision=3&f=geojson',
      ),
      40,
    ),
  'lsr.json': async () => trim(await getJSON('https://mesonet.agron.iastate.edu/geojson/lsr.geojson?hours=72'), 60),
  'dat-lines.json': async () => {
    const where = encodeURIComponent(`stormdate >= TIMESTAMP '${new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19).replace('T', ' ')}'`);
    return trim(await getJSON(`https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1/query?where=${where}&outFields=*&f=geojson&maxAllowableOffset=0.0005`), 15);
  },
  'spc-day1-cat.json': async () => await getJSON('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson'),
  'spc-day1-torn.json': async () => await getJSON('https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson'),
  'spc-day2-cat.json': async () => await getJSON('https://www.spc.noaa.gov/products/outlook/day2otlk_cat.nolyr.geojson'),
  'tropical-service.json': async () => {
    const j = await getJSON('https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer?f=pjson');
    return { layers: j.layers.map(({ id, name, parentLayerId }) => ({ id, name, parentLayerId })) };
  },
  'tropical-fields.json': async () => {
    const base = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
    const pick = async (id) => (await getJSON(`${base}/${id}?f=pjson`)).fields?.map((f) => ({ name: f.name, type: f.type, alias: f.alias })) ?? [];
    return { points: await pick(6), track: await pick(7), cone: await pick(8), pastPoints: await pick(11) };
  },
  'nws-points.json': async () => await getJSON(`${NWS}/points/36.154,-95.993`),
};

const results = await Promise.allSettled(
  Object.entries(jobs).map(async ([name, job]) => {
    save(name, await job());
  }),
);
for (const [i, r] of results.entries()) if (r.status === 'rejected') console.error(`FAILED ${Object.keys(jobs)[i]}: ${r.reason?.message}`);

// The forecast URL comes from the points lookup.
try {
  const points = await getJSON(`${NWS}/points/36.154,-95.993`);
  const forecast = await getJSON(points.properties.forecast);
  save('nws-forecast.json', { properties: { periods: forecast.properties.periods } });
} catch (e) {
  console.error(`FAILED nws-forecast.json: ${e.message}`);
}
