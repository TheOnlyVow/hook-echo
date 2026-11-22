// Feed addresses, refresh cadences and thresholds. Values come from the
// design (docs/design.md); change them here, nowhere else.

export const NWS = 'https://api.weather.gov';
export const IEM = 'https://mesonet.agron.iastate.edu';
export const SPC = 'https://www.spc.noaa.gov/products/outlook';
export const SPC_DAYS48 = 'https://www.spc.noaa.gov/products/exper/day4-8';
export const SPC_MD_PAGE = 'https://www.spc.noaa.gov/products/md';
export const WWA_SHAPES = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/MapServer/1/query';
export const TROPICAL = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
export const DAT_LINES = 'https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1/query';
export const PHOTON = 'https://photon.komoot.io/api/';
export const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

/** Storm-based warnings and the watches that matter most, refreshed every minute. */
export const STORM_EVENTS = [
  'Tornado Warning',
  'Severe Thunderstorm Warning',
  'Flash Flood Warning',
  'Extreme Wind Warning',
  'Snow Squall Warning',
  'Dust Storm Warning',
  'Special Marine Warning',
  'Tornado Watch',
  'Severe Thunderstorm Watch',
  'Special Weather Statement',
];

/** Warnings whose updates form storm trails. */
export const TRAIL_EVENTS = ['Tornado Warning', 'Severe Thunderstorm Warning'];

/** Products that only ever cover marine zones; their shapes are never needed. */
export const MARINE_ONLY = [
  'Small Craft Advisory',
  'Gale Warning',
  'Gale Watch',
  'Storm Warning',
  'Storm Watch',
  'Hurricane Force Wind Warning',
  'Hurricane Force Wind Watch',
  'Marine Weather Statement',
  'Hazardous Seas Warning',
  'Hazardous Seas Watch',
  'Heavy Freezing Spray Warning',
  'Heavy Freezing Spray Watch',
  'Brisk Wind Advisory',
  'Freezing Spray Advisory',
  'Low Water Advisory',
];

const MIN = 60_000;

/** Refresh intervals in ms; `saver` values apply with data saver on. */
export const REFRESH = Object.freeze({
  stormAlerts: { normal: 1 * MIN },
  landAlerts: { normal: 3 * MIN, saver: 10 * MIN },
  shapes: { normal: 5 * MIN, saver: 10 * MIN },
  pointChecks: { normal: 5 * MIN },
  recentWarnings: { normal: 2 * MIN },
  radar: { normal: 1 * MIN, saver: 5 * MIN },
  reports: { normal: 5 * MIN },
  surveys: { normal: 30 * MIN },
  spcDay1: { normal: 15 * MIN },
  spcDays23: { normal: 60 * MIN },
  spcDays48: { normal: 3 * 60 * MIN },
  discussions: { normal: 3 * MIN, saver: 10 * MIN },
  tropical: { normal: 15 * MIN },
  development: { normal: 30 * MIN },
  forecasts: { normal: 60 * MIN },
});

/** Warning data older than this makes unwarned places read Unknown. */
export const STALE_MS = 5 * MIN;

/** Radar loop: frames 5 minutes apart. */
export const RADAR_FRAMES = 11;
export const RADAR_STEP_MS = 5 * MIN;

/** Rounds coordinates sent to outside services to about 100 m. */
export const roundCoord = (n) => Number(n.toFixed(3));
