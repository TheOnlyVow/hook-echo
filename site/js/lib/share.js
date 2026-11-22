// Share links carry a places list after the "#", so it is never sent to any
// server. The payload is compact JSON in base64url; everything is validated
// on the way in because a link can be edited by anyone.

export const MAX_PLACES = 25;
export const MAX_NAME = 60;
const KINDS = new Set(['home', 'family', 'friend', 'trip']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @typedef {{id: string, kind: 'home'|'family'|'friend'|'trip', name: string, lat: number, lon: number, from?: string, to?: string}} Place */

const invalid = () => {
  throw new Error('invalid share link');
};

const round4 = (n) => Math.round(n * 1e4) / 1e4;

export function newPlaceId() {
  return globalThis.crypto?.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function toBase64Url(text) {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** @param {Place[]} places */
export function encodePlaces(places) {
  if (places.length > MAX_PLACES) throw new Error('too many places');
  const p = places.map((pl) => {
    const row = [pl.kind, pl.name, round4(pl.lat), round4(pl.lon)];
    if (pl.from) row.push(pl.from, pl.to ?? pl.from);
    return row;
  });
  return toBase64Url(JSON.stringify({ v: 1, p }));
}

/**
 * @param {string} s
 * @returns {Place[]} new ids are assigned, so imports never collide
 */
export function decodePlaces(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) invalid();
  let data;
  try {
    data = JSON.parse(fromBase64Url(s));
  } catch {
    invalid();
  }
  if (!data || data.v !== 1 || !Array.isArray(data.p) || data.p.length < 1 || data.p.length > MAX_PLACES) invalid();

  return data.p.map((row) => {
    if (!Array.isArray(row) || row.length < 4 || row.length > 6) invalid();
    const [kind, name, lat, lon, from, to] = row;
    if (!KINDS.has(kind) || typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) invalid();
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) invalid();
    if (from !== undefined && (typeof from !== 'string' || !DATE_RE.test(from) || (to !== undefined && (typeof to !== 'string' || !DATE_RE.test(to))))) invalid();
    /** @type {Place} */
    const place = { id: newPlaceId(), kind, name: name.trim(), lat, lon };
    if (from) {
      place.from = from;
      place.to = to ?? from;
    }
    return place;
  });
}
