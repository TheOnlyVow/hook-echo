// Shared test builders. Alerts use the exact field names normalizeAlert emits.
export const NOW = new Date('2026-11-22T02:03:00Z');
export const MIN = 60_000;

export const PLACE = { lat: 35, lon: -97 };

export const squareAround = (p, d = 0.2) => ({
  type: 'Polygon',
  coordinates: [[[p.lon - d, p.lat - d], [p.lon + d, p.lat - d], [p.lon + d, p.lat + d], [p.lon - d, p.lat + d], [p.lon - d, p.lat - d]]],
});

let seq = 0;
export function makeAlert(over = {}) {
  seq += 1;
  return {
    id: `urn:test:${seq}`,
    event: 'Tornado Warning',
    headline: 'Tornado Warning',
    areaDesc: 'Test County, OK',
    sent: new Date(NOW.getTime() - 5 * MIN),
    effective: new Date(NOW.getTime() - 5 * MIN),
    onset: null,
    expires: new Date(NOW.getTime() + 30 * MIN),
    ends: null,
    geometry: squareAround(PLACE),
    ugc: ['OKC109'],
    same: ['040109'],
    vtec: { action: 'NEW', office: 'KOUN', phenomena: 'TO', significance: 'W', etn: 42, start: null, end: null, key: 'KOUN.TO.W.0042.2026' },
    motion: null,
    tags: [],
    rank: 90,
    level: 'alarm',
    placeLevel: 'shelter',
    cancelled: false,
    messageType: 'Alert',
    ...over,
  };
}
