// Records a real severe-weather event into site/demo/event.json for the
// #demo replay: every tornado and severe thunderstorm warning message in the
// window, plus the storm reports. Run once while the NWS still serves the event:
//   node tools/record-demo.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT = {
  label: 'South Florida tornado warnings, November 21, 2026',
  area: 'FL',
  start: '2026-11-21T22:30:00Z',
  end: '2026-11-22T00:30:00Z',
  // Replay starts here: two minutes before a new tornado warning is issued.
  anchor: '2026-11-21T23:40:00Z',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'HookEcho/1.0 (demo recorder)';
const get = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/geo+json' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
};

const events = ['Tornado Warning', 'Severe Thunderstorm Warning'].map(encodeURIComponent).join(',');
const alerts = await get(`https://api.weather.gov/alerts?status=actual&area=${EVENT.area}&event=${events}&start=${EVENT.start}&end=${EVENT.end}&limit=500`);
const iem = (t) => t.slice(0, 16) + 'Z';
const lsr = await get(`https://mesonet.agron.iastate.edu/geojson/lsr.geojson?sts=${iem(EVENT.start)}&ets=${iem(EVENT.end)}`);

const keep = (f) => ({ type: 'Feature', geometry: f.geometry, properties: f.properties });
const trimAlert = (f) => {
  const p = f.properties;
  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      id: p.id,
      areaDesc: p.areaDesc,
      geocode: p.geocode,
      sent: p.sent,
      effective: p.effective,
      onset: p.onset,
      expires: p.expires,
      ends: p.ends,
      status: p.status,
      messageType: p.messageType,
      severity: p.severity,
      certainty: p.certainty,
      urgency: p.urgency,
      event: p.event,
      senderName: p.senderName,
      headline: p.headline,
      description: p.description,
      instruction: p.instruction,
      parameters: p.parameters,
    },
  };
};

const out = {
  ...EVENT,
  recorded: new Date().toISOString(),
  alerts: (alerts.features ?? []).map(trimAlert),
  reports: (lsr.features ?? []).filter((f) => f.properties?.st === EVENT.area).map(keep),
};
mkdirSync(join(root, 'site', 'demo'), { recursive: true });
writeFileSync(join(root, 'site', 'demo', 'event.json'), JSON.stringify(out));
console.log(`demo: ${out.alerts.length} alert messages, ${out.reports.length} reports -> site/demo/event.json (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
const byKey = {};
for (const f of out.alerts) {
  const v = f.properties.parameters.VTEC?.[0] ?? '';
  byKey[v.slice(3, 25)] = (byKey[v.slice(3, 25)] ?? 0) + 1;
}
console.log(byKey);
