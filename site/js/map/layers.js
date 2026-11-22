// Every overlay on the map, in stacking order, with one setter per source.
// Colors come from the CSS tokens so the map follows the theme.

import { labelLayers, FONT_BOLD } from './basemap.js';

const EMPTY = Object.freeze({ type: 'FeatureCollection', features: [] });

/** Layer ids per toggle in the layers menu. */
export const GROUPS = {
  outlook: ['spc-fill', 'spc-hatch', 'spc-line', 'spc-sig-line'],
  development: ['dev-fill', 'dev-casing', 'dev-line', 'dev-points'],
  others: ['zones-fill', 'zones-line'],
  watches: ['watch-fill', 'watch-line'],
  discussions: ['mcd-fill', 'mcd-casing', 'mcd-line', 'mcd-label'],
  surveys: ['survey-casing', 'survey-line'],
  trails: ['trail-sv', 'trail-to', 'trail-dots'],
  warnings: ['warn-fill', 'warn-hatch', 'warn-casing', 'warn-line', 'tor-casing', 'tor-line'],
  paths: ['cone-fill', 'cone-line', 'path-casing', 'path-line', 'path-arrow', 'tick-dot', 'tick-label', 'storm-now-ring', 'storm-now'],
  reports: ['reports'],
  tropical: ['trop-cone', 'trop-cone-line', 'trop-past', 'trop-track', 'trop-points'],
};

export const ALERT_LAYERS = ['warn-fill', 'watch-fill', 'zones-fill'];
export const RADAR_SLOT = 'slot-radar';

export const SOURCES = ['spc', 'dev-areas', 'dev-points', 'alerts', 'mcd', 'surveys', 'trails', 'trail-dots', 'cones', 'paths', 'path-ends', 'ticks', 'storms-now', 'reports', 'trop-cones', 'trop-past', 'trop-tracks', 'trop-points', 'me-acc'];

/** Resolves CSS custom properties into colors MapLibre can parse. */
export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const ctx = document.createElement('canvas').getContext('2d');
  const color = (name) => {
    ctx.fillStyle = '#000';
    ctx.fillStyle = cs.getPropertyValue(name).trim() || '#000';
    return ctx.fillStyle;
  };
  const names = ['--ground', '--ink', '--ink-2', '--casing', '--path-line', '--path-cone', '--path-cone-edge', '--me', '--mcd', '--ef0', '--ef1', '--ef2', '--ef3', '--ef4', '--ef5', '--efu', '--rp-tornado', '--rp-funnel', '--rp-hail', '--rp-wind', '--rp-flood', '--rp-other', '--st-shelter', '--st-warning'];
  const out = {};
  for (const n of names) out[n.slice(2)] = color(n);
  out.dark = document.documentElement.dataset.effectiveTheme !== 'light';
  return out;
}

const isTor = ['==', ['get', 'event'], 'Tornado Warning'];
const isSig = ['==', ['get', 'sig'], true];
const kind = (k) => ['==', ['get', 'kind'], k];
const hover = (on, off) => ['case', ['boolean', ['feature-state', 'hover'], false], on, off];
/** Severe thunderstorm paths draw lighter than tornado paths, so the tornadoes stand out. */
const torOr = (tor, other) => ['case', isTor, tor, other];

function efColor(c) {
  return ['match', ['get', 'ef'], 'EF0', c.ef0, 'EF1', c.ef1, 'EF2', c.ef2, 'EF3', c.ef3, 'EF4', c.ef4, 'EF5', c.ef5, c.efu];
}

function trailGradient(color) {
  return ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(0,0,0,0)', 0.35, color.replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},0.45)`), 1, color];
}

/** The GeoJSON source definition for one overlay source. */
export function sourceSpec(id) {
  return { type: 'geojson', data: EMPTY, promoteId: 'id', lineMetrics: id === 'trails', buffer: 64, tolerance: 0.3 };
}

export function installLayers(map, c) {
  for (const id of SOURCES) map.addSource(id, sourceSpec(id));
  for (const layer of overlayLayers(c)) map.addLayer(layer);
}

/** Every overlay layer spec in stacking order. Pure, so tests can validate the whole style. */
export function overlayLayers(c) {
  const layers = [];
  const none = { visibility: 'none' };
  const add = (layer) => layers.push(layer);

  // SPC outlook (off by default); significant areas are hatched, as SPC draws them
  add({ id: 'spc-fill', type: 'fill', source: 'spc', layout: none, filter: ['!', isSig], paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.3 } });
  add({ id: 'spc-hatch', type: 'fill', source: 'spc', layout: none, filter: isSig, paint: { 'fill-pattern': 'hatch-sig', 'fill-opacity': 0.75 } });
  add({ id: 'spc-line', type: 'line', source: 'spc', layout: none, filter: ['!', isSig], paint: { 'line-color': ['get', 'stroke'], 'line-width': 1.3 } });
  add({ id: 'spc-sig-line', type: 'line', source: 'spc', layout: none, filter: isSig, paint: { 'line-color': c.ink, 'line-width': 1.3, 'line-dasharray': [2, 1.5] } });

  // Where tropical storms could form (NHC seven-day outlook), colored by chance
  add({ id: 'dev-fill', type: 'fill', source: 'dev-areas', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 } });
  add({ id: 'dev-casing', type: 'line', source: 'dev-areas', paint: { 'line-color': c.casing, 'line-width': 3.6 } });
  add({ id: 'dev-line', type: 'line', source: 'dev-areas', paint: { 'line-color': ['get', 'color'], 'line-width': 1.8, 'line-dasharray': [2.2, 1.4] } });

  // County and zone alerts, then watches
  add({ id: 'zones-fill', type: 'fill', source: 'alerts', filter: kind('zone'), paint: { 'fill-color': ['get', 'color'], 'fill-opacity': hover(0.34, 0.17) } });
  add({ id: 'zones-line', type: 'line', source: 'alerts', filter: kind('zone'), paint: { 'line-color': ['get', 'color'], 'line-width': 0.8, 'line-opacity': 0.6 } });
  add({ id: 'watch-fill', type: 'fill', source: 'alerts', filter: kind('watch'), paint: { 'fill-color': ['get', 'color'], 'fill-opacity': hover(0.3, 0.13) } });
  add({ id: 'watch-line', type: 'line', source: 'alerts', filter: kind('watch'), paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-dasharray': [2.4, 1.6], 'line-opacity': 0.85 } });

  // SPC mesoscale discussions: a faint tint under the radar
  add({ id: 'mcd-fill', type: 'fill', source: 'mcd', paint: { 'fill-color': c.mcd, 'fill-opacity': hover(0.16, 0.07) } });

  // Radar frames are inserted before this marker.
  add({ id: RADAR_SLOT, type: 'background', layout: none, paint: { 'background-opacity': 0 } });

  // Mesoscale discussion outlines stay readable over the radar
  add({ id: 'mcd-casing', type: 'line', source: 'mcd', paint: { 'line-color': c.casing, 'line-width': 4 } });
  add({ id: 'mcd-line', type: 'line', source: 'mcd', paint: { 'line-color': c.mcd, 'line-width': 2, 'line-dasharray': [3, 1.6] } });

  // Surveyed damage paths
  add({ id: 'survey-casing', type: 'line', source: 'surveys', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.casing, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 10, 8] } });
  add({ id: 'survey-line', type: 'line', source: 'surveys', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': efColor(c), 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.8, 10, 5] } });

  // Storm-based warnings: fill, emergency hatch, casing, outline; tornadoes on top
  add({ id: 'warn-fill', type: 'fill', source: 'alerts', filter: kind('sbw'), paint: { 'fill-color': ['get', 'color'], 'fill-opacity': hover(['case', isTor, 0.36, 0.28], ['case', isTor, 0.24, 0.15]) } });
  add({ id: 'warn-hatch', type: 'fill', source: 'alerts', filter: ['all', kind('sbw'), ['==', ['get', 'life'], true]], paint: { 'fill-pattern': 'hatch-life', 'fill-opacity': 0.85 } });
  add({ id: 'warn-casing', type: 'line', source: 'alerts', filter: ['all', kind('sbw'), ['!', isTor]], paint: { 'line-color': c.casing, 'line-width': 4.4 } });
  add({ id: 'warn-line', type: 'line', source: 'alerts', filter: ['all', kind('sbw'), ['!', isTor]], paint: { 'line-color': ['get', 'color'], 'line-width': 2.2 } });

  // Storm trails (where it has been)
  add({ id: 'trail-sv', type: 'line', source: 'trails', filter: ['==', ['get', 'phenomena'], 'SV'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 3, 'line-gradient': trailGradient(c['st-warning']) } });
  add({ id: 'trail-to', type: 'line', source: 'trails', filter: ['==', ['get', 'phenomena'], 'TO'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 3.6, 'line-gradient': trailGradient(c['st-shelter']) } });
  add({ id: 'trail-dots', type: 'circle', source: 'trail-dots', paint: { 'circle-radius': 2.6, 'circle-color': ['case', ['==', ['get', 'phenomena'], 'TO'], c['st-shelter'], c['st-warning']], 'circle-opacity': ['get', 'opacity'], 'circle-stroke-color': c.casing, 'circle-stroke-width': 1, 'circle-stroke-opacity': ['get', 'opacity'] } });

  add({ id: 'tor-casing', type: 'line', source: 'alerts', filter: ['all', kind('sbw'), isTor], paint: { 'line-color': c.casing, 'line-width': 6 } });
  add({ id: 'tor-line', type: 'line', source: 'alerts', filter: ['all', kind('sbw'), isTor], paint: { 'line-color': ['get', 'color'], 'line-width': 3.4 } });

  // Projected paths: tornado-warned storms bold, severe thunderstorms lighter
  add({ id: 'cone-fill', type: 'fill', source: 'cones', paint: { 'fill-color': c['path-cone'], 'fill-opacity': torOr(1, 0.7) } });
  add({ id: 'cone-line', type: 'line', source: 'cones', paint: { 'line-color': c['path-cone-edge'], 'line-width': 1, 'line-dasharray': [2, 2], 'line-opacity': torOr(1, 0.6) } });
  add({ id: 'path-casing', type: 'line', source: 'paths', layout: { 'line-cap': 'round' }, paint: { 'line-color': c.casing, 'line-width': torOr(5, 3.8) } });
  add({ id: 'path-line', type: 'line', source: 'paths', paint: { 'line-color': c['path-line'], 'line-width': torOr(2.2, 1.6), 'line-opacity': torOr(1, 0.8), 'line-dasharray': [1.5, 1.1] } });
  add({ id: 'path-arrow', type: 'symbol', source: 'path-ends', layout: { 'icon-image': 'path-arrow', 'icon-size': torOr(1, 0.8), 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  add({ id: 'tick-dot', type: 'circle', source: 'ticks', paint: { 'circle-radius': torOr(3.6, 2.8), 'circle-color': c['path-line'], 'circle-stroke-color': c.casing, 'circle-stroke-width': 1.6 } });
  add({ id: 'storm-now-ring', type: 'circle', source: 'storms-now', paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.7 } });
  add({ id: 'storm-now', type: 'circle', source: 'storms-now', paint: { 'circle-radius': torOr(6, 5), 'circle-color': ['get', 'color'], 'circle-stroke-color': c.casing, 'circle-stroke-width': 2 } });

  // Place names above the weather, then path times and discussion labels above the place names
  for (const layer of labelLayers(c.dark ? 'dark' : 'light')) add(layer);
  add({
    id: 'tick-label',
    type: 'symbol',
    source: 'ticks',
    minzoom: 5.6,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT_BOLD, 'text-size': 11.5, 'text-anchor': 'left', 'text-offset': [0.75, 0], 'text-optional': true },
    // Severe thunderstorm times appear once zoomed in, so a busy night stays readable.
    paint: { 'text-color': c.ink, 'text-halo-color': c.casing, 'text-halo-width': 1.8, 'text-opacity': ['step', ['zoom'], torOr(1, 0), 7.5, 1] },
  });
  add({
    id: 'mcd-label',
    type: 'symbol',
    source: 'mcd',
    minzoom: 4.5,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT_BOLD, 'text-size': 12, 'text-line-height': 1.15, 'text-max-width': 12, 'text-padding': 6 },
    paint: { 'text-color': c.mcd, 'text-halo-color': c.casing, 'text-halo-width': 2 },
  });

  // Selected alert outline, readable over everything
  add({ id: 'sel-casing', type: 'line', source: 'alerts', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.casing, 'line-width': 7 } });
  add({ id: 'sel-line', type: 'line', source: 'alerts', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': c.ink, 'line-width': 3 } });

  // Storm reports
  add({
    id: 'reports',
    type: 'symbol',
    source: 'reports',
    layout: { 'icon-image': ['concat', 'rp-', ['get', 'type']], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.72, 9, 1.08], 'symbol-sort-key': ['get', 'sort'] },
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['get', 'ageH'], 0, 1, 24, 0.42] },
  });

  // Tropical storms, and the disturbances NHC is watching
  add({ id: 'trop-cone', type: 'fill', source: 'trop-cones', paint: { 'fill-color': c['path-line'], 'fill-opacity': 0.1 } });
  add({ id: 'trop-cone-line', type: 'line', source: 'trop-cones', paint: { 'line-color': c['path-line'], 'line-width': 1.2, 'line-opacity': 0.6 } });
  add({ id: 'trop-past', type: 'line', source: 'trop-past', paint: { 'line-color': c['ink-2'], 'line-width': 2, 'line-opacity': 0.75 } });
  add({ id: 'trop-track', type: 'line', source: 'trop-tracks', paint: { 'line-color': c['path-line'], 'line-width': 2, 'line-dasharray': [1.4, 1.2] } });
  add({ id: 'trop-points', type: 'circle', source: 'trop-points', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4.5, 8, 8], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#161b22', 'circle-stroke-width': 2 } });
  add({ id: 'dev-points', type: 'symbol', source: 'dev-points', layout: { 'icon-image': ['concat', 'dev-x-', ['get', 'risk2']], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 7, 1.1] } });

  // Where I am: accuracy circle (the dot is an HTML marker)
  add({ id: 'me-acc-fill', type: 'fill', source: 'me-acc', paint: { 'fill-color': c.me, 'fill-opacity': 0.12 } });
  add({ id: 'me-acc-line', type: 'line', source: 'me-acc', paint: { 'line-color': c.me, 'line-width': 1, 'line-opacity': 0.5 } });
  return layers;
}

/** Re-applies theme-dependent colors after a theme change. */
export function applyColors(map, c) {
  const set = (id, prop, v) => map.getLayer(id) && map.setPaintProperty(id, prop, v);
  for (const id of ['survey-casing', 'warn-casing', 'tor-casing', 'path-casing', 'sel-casing', 'dev-casing', 'mcd-casing']) set(id, 'line-color', c.casing);
  for (const id of ['tick-dot', 'trail-dots', 'storm-now']) set(id, 'circle-stroke-color', c.casing);
  set('survey-line', 'line-color', efColor(c));
  set('trail-sv', 'line-gradient', trailGradient(c['st-warning']));
  set('trail-to', 'line-gradient', trailGradient(c['st-shelter']));
  set('trail-dots', 'circle-color', ['case', ['==', ['get', 'phenomena'], 'TO'], c['st-shelter'], c['st-warning']]);
  set('cone-fill', 'fill-color', c['path-cone']);
  set('cone-line', 'line-color', c['path-cone-edge']);
  set('path-line', 'line-color', c['path-line']);
  set('tick-dot', 'circle-color', c['path-line']);
  set('sel-line', 'line-color', c.ink);
  set('spc-sig-line', 'line-color', c.ink);
  for (const id of ['tick-label', 'mcd-label']) set(id, 'text-halo-color', c.casing);
  set('tick-label', 'text-color', c.ink);
  set('mcd-label', 'text-color', c.mcd);
  set('mcd-fill', 'fill-color', c.mcd);
  set('mcd-line', 'line-color', c.mcd);
  set('trop-cone', 'fill-color', c['path-line']);
  set('trop-cone-line', 'line-color', c['path-line']);
  set('trop-past', 'line-color', c['ink-2']);
  set('trop-track', 'line-color', c['path-line']);
  set('me-acc-fill', 'fill-color', c.me);
  set('me-acc-line', 'line-color', c.me);
}

export function setData(map, sourceId, fc) {
  map.getSource(sourceId)?.setData(fc ?? EMPTY);
}

export function setGroupVisible(map, group, on) {
  for (const id of GROUPS[group] ?? []) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
}

export function setSelected(map, id) {
  const f = ['==', ['get', 'id'], id ?? ''];
  map.setFilter('sel-casing', f);
  map.setFilter('sel-line', f);
}

export { EMPTY };
