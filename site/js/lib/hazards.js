// What each NWS alert means for the person looking at it: its map color,
// the tags worth showing, whether it sounds an alarm, the status word it
// gives a place, and how it ranks against everything else.

/** @typedef {{kind: 'emergency'|'pds'|'observed'|'radar'|'possible'|'destructive'|'considerable'|'hail'|'wind', label: string}} Tag */

// Colors from the NWS hazard map legend (weather.gov/help-map).
const COLORS = {
  'Tsunami Warning': '#FD6347',
  'Tornado Warning': '#FF0000',
  'Extreme Wind Warning': '#FF8C00',
  'Severe Thunderstorm Warning': '#FFA500',
  'Flash Flood Warning': '#8B0000',
  'Flash Flood Statement': '#8B0000',
  'Severe Weather Statement': '#00FFFF',
  'Shelter In Place Warning': '#FA8072',
  'Evacuation Immediate': '#7FFF00',
  'Civil Danger Warning': '#FFB6C1',
  'Nuclear Power Plant Warning': '#4B0082',
  'Radiological Hazard Warning': '#4B0082',
  'Hazardous Materials Warning': '#4B0082',
  'Fire Warning': '#A0522D',
  'Civil Emergency Message': '#FFB6C1',
  'Law Enforcement Warning': '#C0C0C0',
  'Storm Surge Warning': '#B524F7',
  'Hurricane Force Wind Warning': '#CD5C5C',
  'Hurricane Warning': '#DC143C',
  'Typhoon Warning': '#DC143C',
  'Special Marine Warning': '#FFA500',
  'Blizzard Warning': '#FF4500',
  'Snow Squall Warning': '#C71585',
  'Ice Storm Warning': '#8B008B',
  'Heavy Freezing Spray Warning': '#00BFFF',
  'Winter Storm Warning': '#FF69B4',
  'Lake Effect Snow Warning': '#008B8B',
  'Dust Storm Warning': '#FFE4C4',
  'Blowing Dust Warning': '#FFE4C4',
  'High Wind Warning': '#DAA520',
  'Tropical Storm Warning': '#B22222',
  'Storm Warning': '#9400D3',
  'Tsunami Advisory': '#D2691E',
  'Avalanche Warning': '#1E90FF',
  'Earthquake Warning': '#8B4513',
  'Volcano Warning': '#2F4F4F',
  'Ashfall Warning': '#A9A9A9',
  'Flood Warning': '#00FF00',
  'Coastal Flood Warning': '#228B22',
  'Lakeshore Flood Warning': '#228B22',
  'High Surf Warning': '#228B22',
  'Extreme Heat Warning': '#C71585',
  'Excessive Heat Warning': '#C71585',
  'Tornado Watch': '#FFFF00',
  'Severe Thunderstorm Watch': '#DB7093',
  'Flash Flood Watch': '#2E8B57',
  'Gale Warning': '#DDA0DD',
  'Flood Statement': '#00FF00',
  'Extreme Cold Warning': '#0000FF',
  'Wind Chill Warning': '#B0C4DE',
  'Freeze Warning': '#483D8B',
  'Red Flag Warning': '#FF1493',
  'Storm Surge Watch': '#DB7FF7',
  'Hurricane Watch': '#FF00FF',
  'Hurricane Force Wind Watch': '#9932CC',
  'Typhoon Watch': '#FF00FF',
  'Tropical Storm Watch': '#F08080',
  'Storm Watch': '#FFE4B5',
  'Hurricane Local Statement': '#FFE4B5',
  'Typhoon Local Statement': '#FFE4B5',
  'Tropical Storm Local Statement': '#FFE4B5',
  'Tropical Depression Local Statement': '#FFE4B5',
  'Avalanche Advisory': '#CD853F',
  'Winter Weather Advisory': '#7B68EE',
  'Cold Weather Advisory': '#AFEEEE',
  'Wind Chill Advisory': '#AFEEEE',
  'Heat Advisory': '#FF7F50',
  'Urban and Small Stream Flood Advisory': '#00FF7F',
  'Small Stream Flood Advisory': '#00FF7F',
  'Arroyo and Small Stream Flood Advisory': '#00FF7F',
  'Flood Advisory': '#00FF7F',
  'Hydrologic Advisory': '#00FF7F',
  'Lakeshore Flood Advisory': '#7CFC00',
  'Coastal Flood Advisory': '#7CFC00',
  'High Surf Advisory': '#BA55D3',
  'Heavy Freezing Spray Watch': '#BC8F8F',
  'Dense Fog Advisory': '#708090',
  'Dense Smoke Advisory': '#F0E68C',
  'Small Craft Advisory': '#D8BFD8',
  'Brisk Wind Advisory': '#D8BFD8',
  'Hazardous Seas Warning': '#D8BFD8',
  'Dust Advisory': '#BDB76B',
  'Blowing Dust Advisory': '#BDB76B',
  'Lake Wind Advisory': '#D2B48C',
  'Wind Advisory': '#D2B48C',
  'Frost Advisory': '#6495ED',
  'Ashfall Advisory': '#696969',
  'Freezing Fog Advisory': '#008080',
  'Freezing Spray Advisory': '#00BFFF',
  'Low Water Advisory': '#A52A2A',
  'Local Area Emergency': '#C0C0C0',
  'Avalanche Watch': '#F4A460',
  'Blizzard Watch': '#ADFF2F',
  'Rip Current Statement': '#40E0D0',
  'Beach Hazards Statement': '#40E0D0',
  'Gale Watch': '#FFC0CB',
  'Winter Storm Watch': '#4682B4',
  'Hazardous Seas Watch': '#483D8B',
  'Coastal Flood Watch': '#66CDAA',
  'Lakeshore Flood Watch': '#66CDAA',
  'Flood Watch': '#2E8B57',
  'High Wind Watch': '#B8860B',
  'Extreme Heat Watch': '#800000',
  'Excessive Heat Watch': '#800000',
  'Extreme Cold Watch': '#5F9EA0',
  'Wind Chill Watch': '#5F9EA0',
  'Freeze Watch': '#00FFFF',
  'Fire Weather Watch': '#FFDEAD',
  'Extreme Fire Danger': '#E9967A',
  '911 Telephone Outage': '#C0C0C0',
  'Coastal Flood Statement': '#6B8E23',
  'Lakeshore Flood Statement': '#6B8E23',
  'Special Weather Statement': '#FFE4B5',
  'Marine Weather Statement': '#FFDAB9',
  'Air Quality Alert': '#808080',
  'Air Stagnation Advisory': '#808080',
  'Hazardous Weather Outlook': '#EEE8AA',
  'Hydrologic Outlook': '#90EE90',
  'Short Term Forecast': '#98FB98',
  'Administrative Message': '#C0C0C0',
  'Child Abduction Emergency': '#FFFFFF',
  'Blue Alert': '#FFFFFF',
};

export const FALLBACK_COLOR = '#8A94A6';

/** @param {string} event */
export function hazardColor(event) {
  return COLORS[event] ?? FALLBACK_COLOR;
}

const first = (params, key) => {
  const v = params?.[key];
  return (Array.isArray(v) ? v[0] : v)?.toString().trim().toUpperCase() ?? '';
};

/**
 * Tags worth showing on a warning card, most important first.
 * @param {string} event
 * @param {Record<string, string[]>} params NWS `parameters`
 * @param {string} text headline + description, for wording the parameters miss
 * @returns {Tag[]}
 */
export function alertTags(event, params, text) {
  /** @type {Tag[]} */
  const tags = [];
  const tornadoThreat = first(params, 'tornadoDamageThreat');
  const stormThreat = first(params, 'thunderstormDamageThreat');
  const floodThreat = first(params, 'flashFloodDamageThreat');
  const detection = first(params, 'tornadoDetection');
  const upperText = (text ?? '').toUpperCase();

  if (event === 'Tornado Warning') {
    if (tornadoThreat === 'CATASTROPHIC' || upperText.includes('TORNADO EMERGENCY')) tags.push({ kind: 'emergency', label: 'Tornado emergency' });
    else if (tornadoThreat === 'CONSIDERABLE' || upperText.includes('PARTICULARLY DANGEROUS SITUATION')) tags.push({ kind: 'pds', label: 'PDS' });
  }
  if (event === 'Flash Flood Warning') {
    if (floodThreat === 'CATASTROPHIC' || upperText.includes('FLASH FLOOD EMERGENCY')) tags.push({ kind: 'emergency', label: 'Flash flood emergency' });
    else if (floodThreat === 'CONSIDERABLE') tags.push({ kind: 'considerable', label: 'Considerable damage' });
  }
  if (stormThreat === 'DESTRUCTIVE') tags.push({ kind: 'destructive', label: 'Destructive' });
  else if (stormThreat === 'CONSIDERABLE') tags.push({ kind: 'considerable', label: 'Considerable damage' });

  if (detection === 'OBSERVED') tags.push({ kind: 'observed', label: 'Observed' });
  else if (detection === 'RADAR INDICATED') tags.push({ kind: 'radar', label: 'Radar indicated' });
  else if (detection === 'POSSIBLE') tags.push({ kind: 'possible', label: 'Tornado possible' });

  const hail = Number.parseFloat(first(params, 'maxHailSize'));
  if (hail > 0) tags.push({ kind: 'hail', label: `${hail.toFixed(2).replace(/\.?0+$/, '') || '0'} in hail` });

  const wind = /^(\d+)\s*MPH/.exec(first(params, 'maxWindGust'));
  if (wind) tags.push({ kind: 'wind', label: `${Number(wind[1])} mph wind` });

  return tags;
}

const has = (tags, kind) => tags.some((t) => t.kind === kind);

/**
 * @param {string} event
 * @param {Tag[]} tags
 * @returns {'alarm'|'chime'|'silent'}
 */
export function alertLevel(event, tags) {
  switch (event) {
    case 'Tornado Warning':
    case 'Extreme Wind Warning':
      return 'alarm';
    case 'Flash Flood Warning':
      return has(tags, 'emergency') ? 'alarm' : 'chime';
    case 'Severe Thunderstorm Warning':
      return has(tags, 'destructive') ? 'alarm' : 'chime';
    case 'Tornado Watch':
      return 'chime';
    default:
      return 'silent';
  }
}

/**
 * @param {string} event
 * @returns {'shelter'|'warning'|'watch'|'advisory'}
 */
export function placeLevel(event) {
  if (event === 'Tornado Warning') return 'shelter';
  if (/(Warning|Emergency|Evacuation Immediate)$/.test(event)) return 'warning';
  if (/Watch$/.test(event)) return 'watch';
  return 'advisory';
}

/**
 * Higher is more serious. Used for sorting and for picking a place's top alert.
 * @param {string} event
 * @param {Tag[]} tags
 */
export function alertRank(event, tags) {
  switch (event) {
    case 'Tornado Warning':
      if (has(tags, 'emergency')) return 100;
      if (has(tags, 'pds')) return 96;
      if (has(tags, 'observed')) return 93;
      return 90;
    case 'Extreme Wind Warning':
      return 88;
    case 'Flash Flood Warning':
      if (has(tags, 'emergency')) return 86;
      return has(tags, 'considerable') ? 73 : 72;
    case 'Severe Thunderstorm Warning':
      if (has(tags, 'destructive')) return 84;
      if (has(tags, 'considerable')) return 80;
      return has(tags, 'possible') ? 79 : 78;
    case 'Tsunami Warning':
      return 76;
    case 'Hurricane Warning':
    case 'Typhoon Warning':
    case 'Storm Surge Warning':
      return 75;
    case 'Tornado Watch':
      return 50;
    case 'Severe Thunderstorm Watch':
      return 46;
    default:
      break;
  }
  if (/(Warning|Emergency|Evacuation Immediate)$/.test(event)) return 60;
  if (/Watch$/.test(event)) return 40;
  if (/(Advisory|Alert)$/.test(event)) return 20;
  if (/Statement$/.test(event)) return 10;
  return 5;
}
