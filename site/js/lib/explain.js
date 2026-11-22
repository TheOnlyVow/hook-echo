// Plain-language explanations for everything drawn on the map, shown when
// someone hovers over it (a computer) or taps it (a phone). Pure: the caller
// passes in the alert, report, survey, storm or discussion a feature belongs
// to, so every sentence here can be tested.

import { clock, relative, compass, mph, dayHour, weekdayName, dayNumber, reportWhere } from './format.js';
import { PATH_DEFAULTS } from './paths.js';
import { office } from './offices.js';
import { placeLevel } from './hazards.js';
import { discussionSummary, discussionUrl } from '../data/mcd.js';

/**
 * @typedef {{kind: 'open-alert', id: string, label: string} | {kind: 'link', href: string, label: string}} ExplainAction
 * @typedef {{shape: string, color?: string, type?: string}} Swatch
 * @typedef {{kind: string, title: string, text: string, meta: string, details: string[], actions: ExplainAction[], swatch: Swatch | null}} Explanation
 * @typedef {{now: Date, timeZone?: string, alert?: object, report?: object, survey?: object, storm?: object,
 *   point?: object, discussion?: object}} ExplainContext
 */

/** Map layers with something to explain: what they show, and how specific they are (higher wins). */
export const LAYER_KINDS = Object.freeze({
  reports: ['report', 100],
  'trop-points': ['trop-point', 98],
  'storm-now': ['storm-now', 96],
  'storm-now-ring': ['storm-now', 96],
  'dev-points': ['dev-point', 94],
  'tick-dot': ['tick', 92],
  'tick-label': ['tick', 92],
  'trail-dots': ['trail-dot', 90],
  'path-arrow': ['path-end', 88],
  'path-line': ['path', 80],
  'path-casing': ['path', 80],
  'trail-to': ['trail', 78],
  'trail-sv': ['trail', 78],
  'survey-line': ['survey', 76],
  'survey-casing': ['survey', 76],
  'trop-track': ['trop-track', 70],
  'trop-past': ['trop-past', 68],
  'warn-fill': ['alert', 60],
  'cone-fill': ['cone', 55],
  'cone-line': ['cone', 55],
  'mcd-fill': ['mcd', 50],
  'mcd-line': ['mcd', 50],
  'mcd-label': ['mcd', 50],
  'watch-fill': ['alert', 45],
  'zones-fill': ['alert', 40],
  'trop-cone': ['trop-cone', 35],
  'trop-cone-line': ['trop-cone', 35],
  'dev-fill': ['dev-area', 30],
  'dev-line': ['dev-area', 30],
  'me-acc-fill': ['me-acc', 25],
  'spc-fill': ['spc', 10],
  'spc-line': ['spc', 10],
});

/** Every layer worth asking the map about. */
export const EXPLAINED_LAYERS = Object.freeze(Object.keys(LAYER_KINDS));

/**
 * Orders what is under the pointer from most to least specific, one entry per thing.
 * @param {{layer: string, props: object}[]} hits topmost first, as the map returns them
 * @returns {{layer: string, kind: string, rank: number, props: object}[]}
 */
export function rankHits(hits) {
  const seen = new Set();
  const out = [];
  (hits ?? []).forEach((h, order) => {
    const info = LAYER_KINDS[h.layer];
    if (!info) return;
    const p = h.props ?? {};
    const key = `${info[0]}:${p.id ?? ''}:${p.time ?? ''}:${p.track ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ layer: h.layer, kind: info[0], rank: info[1], props: p, order });
  });
  out.sort((a, b) => b.rank - a.rank || (b.props.rank ?? 0) - (a.props.rank ?? 0) || a.order - b.order);
  return out.map(({ order, ...rest }) => rest);
}

/**
 * What a tap or click does: warnings open straight away (their detail view
 * explains them in full); everything else shows its explanation.
 * @returns {{type: 'select', id: string} | {type: 'explain', hits: object[]} | null}
 */
export function tapAction(ranked) {
  const top = ranked?.[0];
  if (!top) return null;
  if (top.kind === 'alert' || top.kind === 'storm-now') return { type: 'select', id: String(top.props.id) };
  return { type: 'explain', hits: ranked };
}

// ---------- Words ----------

const endOf = (a) => new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0));
const motionWords = (dirFrom, speedKt) => (speedKt >= 1 ? `${compass(Number(dirFrom) + 180)} at ${mph(speedKt)}` : 'nearly stationary');
const stormNoun = (p) => (p.phenomena === 'SV' || p.event === 'Severe Thunderstorm Warning' ? 'severe thunderstorm' : 'tornado-warned storm');
const trailColor = (p) => (p.phenomena === 'SV' || p.event === 'Severe Thunderstorm Warning' ? 'var(--st-warning)' : 'var(--st-shelter)');

const EVENT_TEXT = {
  'Tornado Warning': 'A tornado is happening or about to happen inside this outline. If you are in it, take shelter now.',
  'Severe Thunderstorm Warning': 'A storm with damaging wind of 58 mph or more, or hail an inch or larger, is inside this outline.',
  'Flash Flood Warning': 'Flash flooding is happening or about to. Never drive into a flooded road.',
  'Extreme Wind Warning': 'Extreme winds of 115 mph or more, usually from a major hurricane’s eyewall. Take shelter now.',
  'Special Marine Warning': 'Storm winds of 40 mph or more, hail or waterspouts over this water.',
  'Snow Squall Warning': 'A short, intense burst of snow and wind. Visibility can drop to near zero within seconds.',
  'Dust Storm Warning': 'Blowing dust is dropping visibility to near zero. If you are driving, pull off the road.',
  'Tornado Watch': 'Conditions are right for tornadoes. A watch is not a warning: know where you would take shelter.',
  'Severe Thunderstorm Watch': 'Conditions are right for storms with damaging wind or large hail. Stay alert for warnings.',
  'Flash Flood Watch': 'Heavy rain could cause flash flooding here.',
  'Flood Watch': 'Heavy rain or snowmelt could cause flooding here.',
  'Flood Warning': 'Flooding is happening or about to, usually along rivers and low ground.',
  'Flood Advisory': 'Minor flooding of low spots, streets and streams.',
  'Special Weather Statement': 'A heads-up from the NWS, often about a strong storm just below warning level.',
  'Winter Storm Warning': 'Heavy snow, sleet or ice is expected. Travel could become very difficult or impossible.',
  'Winter Storm Watch': 'A significant winter storm could bring heavy snow, sleet or ice here.',
  'Winter Weather Advisory': 'Snow, sleet or ice could make roads slick and travel slow.',
  'Blizzard Warning': 'Strong wind with falling or blowing snow. Whiteouts make travel dangerous.',
  'Ice Storm Warning': 'Enough freezing rain to coat trees and power lines and bring them down.',
  'Lake Effect Snow Warning': 'Intense snow bands off the lakes, with heavy totals in narrow areas.',
  'Wind Advisory': 'Gusty wind strong enough to blow around loose objects and make driving harder.',
  'High Wind Warning': 'Damaging wind of 58 mph or more, or steady wind of 40 mph or more.',
  'Extreme Cold Warning': 'Dangerously cold air or wind chills that can cause frostbite quickly.',
  'Cold Weather Advisory': 'Cold air or wind chills that call for extra layers and care.',
  'Freeze Warning': 'Temperatures at or below freezing that can kill crops and plants.',
  'Frost Advisory': 'Frost could form and harm tender plants.',
  'Heat Advisory': 'Heat and humidity that can make people sick, especially outdoors.',
  'Extreme Heat Warning': 'Dangerous heat. Stay cool, drink water and check on others.',
  'Dense Fog Advisory': 'Fog thick enough to cut visibility to a quarter mile or less.',
  'Red Flag Warning': 'Hot, dry and windy: a fire could start and spread fast.',
  'Hurricane Warning': 'Hurricane conditions are expected. Finish storm preparations now.',
  'Hurricane Watch': 'Hurricane conditions are possible in the next couple of days.',
  'Tropical Storm Warning': 'Tropical storm winds of 39 to 73 mph are expected.',
  'Tropical Storm Watch': 'Tropical storm winds of 39 to 73 mph are possible.',
  'Storm Surge Warning': 'Life-threatening flooding from rising sea water is expected.',
  'Storm Surge Watch': 'Life-threatening flooding from rising sea water is possible.',
  'Coastal Flood Advisory': 'Minor flooding near the coast at high tide.',
  'Rip Current Statement': 'Dangerous rip currents at the beach. Swim near a lifeguard.',
  'Beach Hazards Statement': 'Rip currents or high surf make the water dangerous.',
  'Small Craft Advisory': 'Wind or waves hazardous for small boats.',
  'Gale Warning': 'Gale-force winds over the water.',
  'Air Quality Alert': 'Unhealthy air. Limit time outdoors if you are sensitive.',
};

const GENERIC = {
  shelter: 'A tornado warning: take shelter if you are in this area.',
  warning: 'An NWS warning: this hazard is happening or about to, in this area.',
  watch: 'An NWS watch: conditions could turn dangerous here. Stay alert for warnings.',
  advisory: 'An NWS advisory or statement: weather that is a nuisance or could become hazardous here.',
};

function tagLead(alert) {
  const tags = alert?.tags ?? [];
  const has = (k) => tags.some((t) => t.kind === k);
  if (has('emergency')) return alert.event === 'Flash Flood Warning' ? 'Flash flood emergency: severe, life-threatening flooding is happening.' : 'Tornado emergency: a confirmed, dangerous tornado is hitting a populated area.';
  if (has('pds')) return 'Particularly dangerous situation: a strong tornado is likely.';
  if (has('destructive')) return 'Destructive storm: wind of 80 mph or more, or hail 2.75 inches or larger.';
  return '';
}

const REPORT_TEXT = {
  tornado: 'Someone reported a tornado here. NWS damage surveys confirm and rate tornadoes later.',
  funnel: 'A funnel cloud was seen here: rotation that had not reached the ground.',
  hail: 'Hail this size fell here.',
  wind: 'Damaging wind or a strong measured gust was reported here.',
  flood: 'Flooding was reported here.',
  other: 'A weather report sent to the NWS, such as heavy rain or snow.',
};
const REPORT_SHAPE = {
  tornado: 'Triangles are tornado reports',
  funnel: 'Outlined triangles are funnel clouds',
  hail: 'Circles are hail reports',
  wind: 'Squares are wind reports',
  flood: 'Diamonds are flood reports',
  other: 'Small dots are other reports',
};

const SOURCES = {
  'TRAINED SPOTTER': 'a trained spotter',
  'STORM CHASER': 'a storm chaser',
  'EMERGENCY MNGR': 'an emergency manager',
  'EMERGENCY MANAGER': 'an emergency manager',
  'LAW ENFORCEMENT': 'law enforcement',
  PUBLIC: 'the public',
  'BROADCAST MEDIA': 'broadcast media',
  'SOCIAL MEDIA': 'social media',
  'NWS EMPLOYEE': 'an NWS employee',
  'NWS STORM SURVEY': 'an NWS storm survey',
  ASOS: 'an airport weather station',
  AWOS: 'an airport weather station',
  MESONET: 'a weather station network',
  'AMATEUR RADIO': 'amateur radio',
  'CO-OP OBSERVER': 'a co-op weather observer',
  'FIRE DEPT/RESCUE': 'fire and rescue',
  '911 CALL CENTER': 'a 911 call center',
  'DEPT OF HIGHWAYS': 'the highway department',
};
const sourceName = (s) => SOURCES[String(s).trim().toUpperCase()] ?? String(s).trim().toLowerCase();

const EF_RANGE = { EF0: '65 to 85 mph', EF1: '86 to 110 mph', EF2: '111 to 135 mph', EF3: '136 to 165 mph', EF4: '166 to 200 mph', EF5: 'over 200 mph' };

const CATEGORY = {
  TSTM: ['Thunderstorms possible', 'General thunderstorms. They are not expected to be severe.'],
  MRGL: ['Marginal risk (1 of 5)', 'Isolated severe storms possible, limited in how long they last, how many there are, or how strong they get.'],
  SLGT: ['Slight risk (2 of 5)', 'Scattered severe storms possible. Most are short-lived and not widespread; a few could be intense.'],
  ENH: ['Enhanced risk (3 of 5)', 'Numerous severe storms possible. More widespread and longer-lasting, and a few could be intense.'],
  MDT: ['Moderate risk (4 of 5)', 'Widespread severe storms likely, including long-lived and intense ones.'],
  HIGH: ['High risk (5 of 5)', 'A severe weather outbreak is expected: widespread, long-lived and very intense storms.'],
};

/** Saffir-Simpson strength in words, from sustained wind in mph. */
function strengthOf(windMph) {
  const w = Number(windMph);
  if (!Number.isFinite(w) || w <= 0) return 'tropical cyclone';
  if (w < 39) return 'tropical depression';
  if (w < 74) return 'tropical storm';
  if (w < 96) return 'Category 1 hurricane';
  if (w < 111) return 'Category 2 hurricane';
  if (w < 130) return 'Category 3 hurricane';
  if (w < 157) return 'Category 4 hurricane';
  return 'Category 5 hurricane';
}
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// ---------- Explanations ----------

const make = (kind, title, text, { meta = '', details = [], actions = [], swatch = null } = {}) => ({ kind, title, text, meta, details: details.filter(Boolean), actions, swatch });

/**
 * @param {string} layer map layer id
 * @param {object} props the feature's properties
 * @param {ExplainContext} ctx
 * @returns {Explanation | null}
 */
export function explainFeature(layer, props = {}, ctx = { now: new Date() }) {
  const kind = LAYER_KINDS[layer]?.[0];
  if (!kind) return null;
  const tz = { timeZone: ctx.timeZone };
  const T = (ms) => clock(new Date(ms), tz);
  const openAlert = ctx.alert ? [{ kind: 'open-alert', id: ctx.alert.id, label: 'Open the warning' }] : [];
  const motion = motionWords(props.dirFrom, props.speedKt);
  const pathSwatch = (shape) => ({ shape, color: 'var(--path-line)' });

  switch (kind) {
    case 'trail':
      return make('trail', 'Storm trail', `Where this ${stormNoun(props)} has been since ${T(props.since)}, traced from the storm position in each NWS warning update. The line brightens toward its latest position.`, {
        meta: `${props.count} positions, latest ${T(props.last)}`,
        actions: openAlert,
        swatch: { shape: 'trail', color: trailColor(props) },
      });
    case 'trail-dot':
      return make('trail-dot', `Storm position at ${T(props.time)}`, `Where an NWS warning update placed this ${stormNoun(props)}. Older positions fade.`, {
        actions: openAlert,
        swatch: { shape: 'dot', color: trailColor(props) },
      });
    case 'path':
      return make('path', 'Projected path', `Where this storm goes if it keeps moving ${motion}, through ${T(props.until)} when the warning ends. Hook Echo projects it from the NWS storm motion; storms can turn.`, {
        actions: openAlert,
        swatch: pathSwatch('dash'),
      });
    case 'cone':
      return make('cone', 'Possible path area', `If the storm keeps roughly to its track, it passes somewhere inside this cone before ${T(props.until)}. The cone allows for turns of up to ${PATH_DEFAULTS.coneDeg}° and speed changes of ${Math.round(PATH_DEFAULTS.speedSpread * 100)}%.`, {
        actions: openAlert,
        swatch: pathSwatch('cone'),
      });
    case 'tick':
      return make('tick', `Around ${T(props.time)}`, `Where the storm should be at ${T(props.time)} if it holds its speed and direction (${motion}). Marks are ${PATH_DEFAULTS.tickMinutes} minutes apart.`, {
        actions: openAlert,
        swatch: pathSwatch('dot'),
      });
    case 'path-end':
      return make('path-end', 'Direction of travel', `Moving ${motion}. The projection stops at ${T(props.until)}, when the warning ends.`, { actions: openAlert, swatch: pathSwatch('arrow') });
    case 'storm-now':
      return make('storm-now', 'Storm now', `Its estimated position right now, moved forward from where the NWS placed it at ${T(props.motionTime)}, at the reported ${props.speedKt >= 1 ? mph(props.speedKt) : 'speed'}.`, {
        swatch: { shape: 'dot', color: props.color ?? '#ff0000' },
      });
    case 'alert':
      return explainAlert(layer, props, ctx, T);
    case 'report':
      return explainReport(props, ctx, T);
    case 'survey':
      return explainSurvey(props, ctx, T, tz);
    case 'spc':
      return explainOutlook(props, ctx, tz);
    case 'mcd':
      return explainDiscussion(props, ctx, T);
    case 'dev-area':
      return make(
        'dev-area',
        'Where a tropical storm could form',
        props.prob7 > 0
          ? `NHC gives the disturbance here a ${props.prob7}% chance of becoming a tropical depression or storm within 7 days (${props.prob2}% within 2 days).`
          : 'NHC is watching a disturbance here, but its chance of becoming a tropical depression or storm is near 0%.',
        { meta: `National Hurricane Center, ${props.basin}, ${props.risk7} chance`, swatch: { shape: 'dash-area', color: props.color ?? '#ffff00' } },
      );
    case 'dev-point':
      return make('dev-point', 'Disturbance NHC is watching', `The disturbance is here now. Chance it becomes a tropical depression or storm: ${props.prob2}% in 2 days, ${props.prob7}% in 7 days.`, {
        meta: `National Hurricane Center, ${props.basin}`,
        swatch: { shape: 'x', color: props.color ?? '#ffff00' },
      });
    case 'trop-cone':
    case 'trop-track':
    case 'trop-past':
    case 'trop-point':
      return explainTropical(kind, props, ctx);
    case 'me-acc':
      return make('me-acc', 'Where you are', 'Your device puts you somewhere inside this circle. A smaller circle means a more precise location.', { swatch: { shape: 'ring', color: 'var(--me)' } });
    default:
      return null;
  }
}

function explainAlert(layer, props, ctx, T) {
  const a = ctx.alert ?? null;
  const event = a?.event ?? props.event ?? 'Alert';
  const base = EVENT_TEXT[event] ?? GENERIC[a?.placeLevel ?? placeLevel(event)] ?? GENERIC.advisory;
  const lead = tagLead(a);
  const meta = [a ? `Until ${T(endOf(a))}` : '', a?.senderName ?? ''].filter(Boolean).join(', ');
  return make('alert', event, lead ? `${lead} ${base}` : base, {
    meta,
    actions: a ? [{ kind: 'open-alert', id: a.id, label: 'Open the warning' }] : [],
    swatch: { shape: layer === 'watch-fill' ? 'dash-area' : 'area', color: a?.color ?? props.color ?? '#8a94a6' },
  });
}

function explainReport(props, ctx, T) {
  const r = ctx.report ?? { type: props.type, label: props.label, magnitudeText: '' };
  const type = REPORT_TEXT[r.type] ? r.type : 'other';
  return make('report', `${r.label ?? 'Storm report'}${r.magnitudeText ? `, ${r.magnitudeText}` : ''}`, `${REPORT_TEXT[type]} ${REPORT_SHAPE[type]}; they fade over 24 hours.`, {
    meta: r.time ? `${T(r.time)}, ${relative(r.time, ctx.now)}` : '',
    details: [reportWhere(r), r.remark, r.source ? `Reported by ${sourceName(r.source)}` : ''],
    swatch: { shape: 'report', type },
  });
}

function explainSurvey(props, ctx, T, tz) {
  const s = ctx.survey ?? { ef: props.ef };
  const ef = EF_RANGE[s.ef] ? s.ef : 'EFU';
  const size = [s.lengthMi ? `${s.lengthMi.toFixed(1)} mi long` : '', s.widthYd ? `up to ${Math.round(s.widthYd)} yd wide` : ''].filter(Boolean).join(', ');
  const harm = [s.injuries ? `${s.injuries} injured` : '', s.fatalities ? `${s.fatalities} killed` : ''].filter(Boolean).join(', ');
  return make(
    'survey',
    `Surveyed tornado path, ${ef === 'EFU' ? 'not rated' : ef}`,
    ef === 'EFU'
      ? 'An NWS survey team mapped this tornado’s damage path but could not rate it, often because it crossed open land.'
      : `An NWS survey team mapped this tornado’s damage path and rated it ${ef}: winds of about ${EF_RANGE[ef]}.`,
    {
      details: [
        s.start ? `${s.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(tz.timeZone ? { timeZone: tz.timeZone } : {}) })}, ${T(s.start)}` : '',
        size,
        s.maxWindMph ? `Peak wind about ${Math.round(s.maxWindMph)} mph` : '',
        harm,
        s.wfo ? `Surveyed by ${office(s.wfo)}` : '',
      ],
      swatch: { shape: 'line', color: ef === 'EFU' ? 'var(--efu)' : `var(--ef${ef.slice(2)})` },
    },
  );
}

/** "today", "tomorrow", "on Monday", or "until 6:00 AM" for a Day 1 outlook still running after midnight. */
function dayWord(valid, expire, now, tz) {
  const diff = dayNumber(new Date(valid), tz) - dayNumber(now, tz);
  if (diff < 0) return `until ${clock(new Date(expire), tz)}`;
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `on ${weekdayName(new Date(valid), tz)}`;
}

function explainOutlook(props, ctx, tz) {
  const when = dayWord(props.valid, props.expire, ctx.now, tz);
  const meta = props.valid && props.expire ? `Storm Prediction Center, ${dayHour(new Date(props.valid), tz)} to ${dayHour(new Date(props.expire), tz)}` : 'Storm Prediction Center';
  const swatch = { shape: 'area', color: props.fill ?? '#888888' };
  const far = props.day >= 4 ? ' Forecasts this far ahead change, so check back as the day gets closer.' : '';
  if (props.kind === 'cat') {
    const [title, text] = CATEGORY[props.label] ?? [`${props.label} risk`, 'An SPC risk area for severe storms.'];
    return make('spc', `${title} ${when}`, text, { meta, swatch });
  }
  if (props.sig) {
    const what = props.kind === 'torn' ? 'Strong tornadoes possible' : 'Significant severe storms possible';
    const text = props.kind === 'torn' ? 'In the hatched area, tornadoes rated EF2 or stronger are possible.' : 'In the hatched area, the strongest storms could bring very large hail or destructive wind.';
    return make('spc', `${what} ${when}`, text + far, { meta, swatch });
  }
  const pct = props.pct >= 0 ? props.pct : 0;
  if (props.kind === 'torn') return make('spc', `${pct}% tornado chance ${when}`, `A ${pct}% chance of a tornado within 25 miles of any spot in this area.`, { meta, swatch });
  return make('spc', `${pct}% severe storm chance ${when}`, `A ${pct}% chance of severe storms within 25 miles of any spot in this area.${far}`, { meta, swatch });
}

function explainDiscussion(props, ctx, T) {
  const d = ctx.discussion ?? {
    num: props.num,
    year: props.year,
    watchChance: props.chance >= 0 ? props.chance : null,
    concerning: props.concerning ?? '',
    expire: props.expire ? new Date(props.expire) : null,
  };
  const s = discussionSummary(d);
  let text;
  if (s.existing) text = `SPC forecasters posted an update on ${s.existing}, which is already in effect.`;
  else {
    text = `SPC forecasters are watching this area closely for ${s.topic === 'Severe storms possible' ? 'severe storms' : s.topic.toLowerCase()}.`;
    const pct = d.watchChance != null ? ` (${d.watchChance}% chance)` : '';
    if (s.watch === 'likely') text += ` A ${s.watchType ?? 'watch'} is likely soon${pct}.`;
    else if (s.watch === 'possible') text += ` A ${s.watchType ?? 'watch'} is possible${pct}.`;
    else if (s.watch === 'unlikely') text += ` A watch is unlikely${pct}.`;
  }
  return make('mcd', `Mesoscale discussion ${d.num ?? ''}`.trim(), text, {
    meta: d.expire ? `Until ${T(d.expire)}` : '',
    actions: d.num ? [{ kind: 'link', href: discussionUrl(d), label: 'Read the discussion' }] : [],
    swatch: { shape: 'dash-area', color: 'var(--mcd)' },
  });
}

function explainTropical(kind, props, ctx) {
  const storm = ctx.storm ?? { name: props.name ?? 'This storm', label: props.label ?? '' };
  const name = storm.name;
  if (kind === 'trop-cone') {
    return make('trop-cone', `${name}: forecast cone`, `NHC expects the center of ${name} to stay inside this cone about two-thirds of the time. Wind, rain and storm surge often reach far outside it.`, {
      meta: storm.advisory ? `NHC advisory ${storm.advisory}` : 'National Hurricane Center',
      swatch: { shape: 'area', color: 'var(--path-line)' },
    });
  }
  if (kind === 'trop-track') {
    return make('trop-track', `${name}: forecast track`, `NHC’s forecast path for the center of ${name}. The dots show where it should be and how strong.`, { swatch: { shape: 'dash', color: 'var(--path-line)' } });
  }
  if (kind === 'trop-past') return make('trop-past', `${name}: past track`, `Where the center of ${name} has been.`, { swatch: { shape: 'line', color: 'var(--ink-2)' } });
  const p = ctx.point ?? { tau: props.tau, when: props.when, windMph: props.windMph };
  const swatch = { shape: 'dot', color: props.color ?? '#ffffcc' };
  if (p.tau > 0) {
    const strength = strengthOf(p.windMph);
    return make('trop-point', `${name}, ${p.when}`, `Forecast for ${p.when}: ${article(strength)} ${strength}${p.windMph ? ` with ${p.windMph} mph winds` : ''}. Colors show strength on the hurricane scale.`, { swatch });
  }
  const wind = storm.maxWindMph ?? p.windMph;
  return make('trop-point', `${name} now`, `${name} is here now: ${storm.label || strengthOf(wind)}${wind ? ` with ${wind} mph winds` : ''}.`, {
    details: [storm.movement ? `Moving ${compass(storm.movement.bearing)} at ${storm.movement.mph} mph` : '', storm.advisory ? `NHC advisory ${storm.advisory}${storm.advisoryTime ? `, ${storm.advisoryTime}` : ''}` : ''],
    swatch,
  });
}

const PLACE_COLOR = { shelter: 'var(--st-shelter)', warning: 'var(--st-warning)', watch: 'var(--st-watch)', advisory: 'var(--st-advisory)', clear: 'var(--st-clear)' };

/**
 * A saved place, a trip stop or Where I am, for its pin on the map.
 * @param {{place: object, status: {level: string, top: object | null, headsUp?: object | null}}} view
 */
export function explainPlace({ place, status }) {
  const top = status?.top;
  const level = status?.level ?? 'unknown';
  const TEXT = {
    shelter: `Take shelter: a ${top?.event ?? 'Tornado Warning'} covers this place.`,
    warning: `A ${top?.event ?? 'warning'} covers this place.`,
    watch: `A ${top?.event ?? 'watch'} covers this place. Be ready to act if a warning follows.`,
    advisory: `A ${top?.event ?? 'weather advisory'} covers this place.`,
    clear: 'No warnings here right now. Hook Echo alarms if one is issued.',
    unknown: 'Warning data is out of date, so this place can’t be marked clear right now.',
    checking: 'Checking the latest warnings.',
  };
  const meta = place.kind === 'me' ? 'Your location' : place.kind === 'trip' ? 'A trip stop you watch' : 'A place you watch';
  const hu = status?.headsUp;
  return make('place', place.name, TEXT[level] ?? TEXT.unknown, {
    meta,
    details: [hu ? `A tornado-warned storm could pass within about 5 miles in ${hu.minutes} min` : ''],
    swatch: { shape: 'pin', color: PLACE_COLOR[level] ?? 'var(--st-unknown)' },
  });
}
