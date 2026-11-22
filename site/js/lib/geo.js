// Spherical geometry helpers. Points are {lat, lon} in degrees; GeoJSON
// coordinates are [lon, lat]. Distances are kilometres.

/** @typedef {{lat: number, lon: number}} LatLon */

export const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Great-circle distance (haversine). */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point reached by travelling `km` from `p` on initial bearing `bearingDeg`. */
export function destination(p, bearingDeg, km) {
  const d = km / EARTH_RADIUS_KM;
  const th = bearingDeg * RAD;
  const p1 = p.lat * RAD;
  const l1 = p.lon * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / RAD, lon: normalizeLon(l2 / RAD) };
}

/** Initial bearing from a to b, degrees in [0, 360). */
export function bearingDeg(a, b) {
  const p1 = a.lat * RAD;
  const p2 = b.lat * RAD;
  const dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

function normalizeLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Even-odd ray cast against one ring of [lon, lat] pairs. */
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon, lat, rings) {
  if (!rings?.length || !inRing(lon, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(lon, lat, rings[k])) return false;
  return true;
}

/** True when p lies inside a Polygon, MultiPolygon or GeometryCollection (holes excluded). */
export function pointInGeometry(p, g) {
  if (!g) return false;
  switch (g.type) {
    case 'Polygon':
      return inPolygon(p.lon, p.lat, g.coordinates);
    case 'MultiPolygon':
      return g.coordinates.some((rings) => inPolygon(p.lon, p.lat, rings));
    case 'GeometryCollection':
      return g.geometries.some((child) => pointInGeometry(p, child));
    default:
      return false;
  }
}

/** [west, south, east, north] of any GeoJSON geometry, or null. */
export function geometryBounds(g) {
  if (!g) return null;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < b[0]) b[0] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] > b[3]) b[3] = c[1];
    } else for (const child of c) visit(child);
  };
  if (g.type === 'GeometryCollection') {
    for (const child of g.geometries) {
      const cb = geometryBounds(child);
      if (cb) visit([[cb[0], cb[1]], [cb[2], cb[3]]]);
    }
  } else visit(g.coordinates);
  return Number.isFinite(b[0]) ? b : null;
}

/** Arithmetic mean of points (fine for the small spreads of a storm line). */
export function centroid(points) {
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / points.length, lon: lon / points.length };
}
