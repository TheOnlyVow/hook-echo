// The basemap, drawn from OpenFreeMap's OpenMapTiles vector tiles in our
// own style: a quiet slate ground with county lines (warnings follow county
// shapes), state lines and interstates, and place names drawn above the
// weather so towns stay readable under heavy radar returns.

export const OMT_SOURCE = {
  type: 'vector',
  url: 'https://tiles.openfreemap.org/planet',
  attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
};
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const FONT = ['Noto Sans Regular'];
export const FONT_BOLD = ['Noto Sans Bold'];

const PALETTE = {
  dark: {
    land: '#10171e',
    water: '#090f15',
    urban: '#15202a',
    country: '#6a7b8d',
    state: '#46566a',
    county: '#232f3c',
    road: '#2b3947',
    roadMinor: '#1e2934',
    text: '#d3dce6',
    textSoft: '#94a4b6',
    textFaint: '#6c7d90',
    halo: '#0b1015',
  },
  light: {
    land: '#eef2f6',
    water: '#c9d7e6',
    urban: '#e2e8ef',
    country: '#7c8b9b',
    state: '#9eacbb',
    county: '#d3dbe4',
    road: '#ffffff',
    roadMinor: '#f6f8fa',
    text: '#1d2a37',
    textSoft: '#3f4f61',
    textFaint: '#66768a',
    halo: '#f8fafc',
  },
};

const name = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];
const admin = (level) => ['all', ['==', ['get', 'admin_level'], level], ['!=', ['get', 'maritime'], 1]];

/** Layers drawn under every weather overlay. */
export function baseLayers(theme) {
  const p = PALETTE[theme];
  return [
    { id: 'bg', type: 'background', paint: { 'background-color': p.land } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'urban', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 6, filter: ['match', ['get', 'class'], ['residential', 'commercial', 'industrial', 'retail'], true, false], paint: { 'fill-color': p.urban } },
    { id: 'county-line', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 5.5, filter: admin(6), paint: { 'line-color': p.county, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 1] } },
    { id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 5, filter: ['match', ['get', 'class'], ['trunk', 'primary'], true, false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 2.2] } },
    { id: 'road-motorway', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 4, filter: ['==', ['get', 'class'], 'motorway'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.4, 12, 3.2] } },
    { id: 'state-line', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: admin(4), paint: { 'line-color': p.state, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 1.4] } },
    { id: 'country-line', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: admin(2), paint: { 'line-color': p.country, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.9, 8, 1.8] } },
  ];
}

/** Place and road names, drawn above the weather. */
export function labelLayers(theme) {
  const p = PALETTE[theme];
  const halo = { 'text-halo-color': p.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.4 };
  return [
    {
      id: 'label-road',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 7,
      filter: ['all', ['==', ['get', 'class'], 'motorway'], ['has', 'ref']],
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'ref'], 'text-font': FONT_BOLD, 'text-size': 10, 'symbol-spacing': 400, 'text-rotation-alignment': 'viewport', 'text-pitch-alignment': 'viewport' },
      paint: { 'text-color': p.textFaint, ...halo },
    },
    {
      id: 'label-state',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 3.2,
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'state'],
      layout: { 'text-field': name, 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13], 'text-transform': 'uppercase', 'text-letter-spacing': 0.14, 'text-max-width': 8 },
      paint: { 'text-color': p.textFaint, ...halo },
    },
    {
      id: 'label-town',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 7,
      filter: ['match', ['get', 'class'], ['town', 'village'], true, false],
      layout: { 'text-field': name, 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10.5, 12, 13], 'symbol-sort-key': ['get', 'rank'], 'text-max-width': 8 },
      paint: { 'text-color': p.textSoft, ...halo },
    },
    {
      id: 'label-city',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 3.6,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': name,
        'text-font': ['step', ['zoom'], ['literal', FONT], 6, ['literal', FONT_BOLD]],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, ['step', ['get', 'rank'], 12, 3, 11, 6, 10], 10, ['step', ['get', 'rank'], 16, 3, 15, 6, 13]],
        'symbol-sort-key': ['get', 'rank'],
        'text-max-width': 8,
      },
      paint: { 'text-color': p.text, ...halo },
    },
    {
      id: 'label-country',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      maxzoom: 5,
      filter: ['==', ['get', 'class'], 'country'],
      layout: { 'text-field': name, 'text-font': FONT_BOLD, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.18 },
      paint: { 'text-color': p.textFaint, ...halo },
    },
  ];
}

/** Paint values to re-apply when the theme changes. */
export function themePaint(theme) {
  const p = PALETTE[theme];
  return [
    ['bg', 'background-color', p.land],
    ['water', 'fill-color', p.water],
    ['urban', 'fill-color', p.urban],
    ['county-line', 'line-color', p.county],
    ['road-major', 'line-color', p.roadMinor],
    ['road-motorway', 'line-color', p.road],
    ['state-line', 'line-color', p.state],
    ['country-line', 'line-color', p.country],
    ['label-road', 'text-color', p.textFaint],
    ['label-state', 'text-color', p.textFaint],
    ['label-town', 'text-color', p.textSoft],
    ['label-city', 'text-color', p.text],
    ['label-country', 'text-color', p.textFaint],
    ...['label-road', 'label-state', 'label-town', 'label-city', 'label-country'].map((id) => [id, 'text-halo-color', p.halo]),
  ];
}
