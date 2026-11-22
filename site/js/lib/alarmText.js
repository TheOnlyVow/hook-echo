// What an alarm says and which one wins: pure helpers for the alarm screen,
// chimes and phone notifications.

import { clock } from './format.js';

const KIND_WEIGHT = { alarm: 3, headsup: 2, chime: 1 };
const has = (alert, kind) => alert?.tags?.some((t) => t.kind === kind);
const endOf = (a) => new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0));

/** Alarms always sound; chimes and heads-ups follow the settings. */
export function allowedEvents(events, settings) {
  return events.filter((e) => e.kind === 'alarm' || (e.kind === 'chime' && settings.chimes) || (e.kind === 'headsup' && settings.headsUp));
}

/** The event to lead with when several fire together. */
export function mostSevere(events) {
  if (!events.length) return null;
  return [...events].sort((a, b) => (KIND_WEIGHT[b.kind] ?? 0) - (KIND_WEIGHT[a.kind] ?? 0) || (b.alert?.rank ?? 0) - (a.alert?.rank ?? 0))[0];
}

/** The one thing to do, by hazard. */
export function actionFor(alert) {
  switch (alert?.event) {
    case 'Tornado Warning':
    case 'Extreme Wind Warning':
      return 'Take shelter now';
    case 'Flash Flood Warning':
      return has(alert, 'emergency') ? 'Move to higher ground now' : 'Avoid flooded roads';
    case 'Severe Thunderstorm Warning':
      return has(alert, 'destructive') ? 'Get inside, away from windows' : 'Stay alert';
    default:
      return 'Stay alert';
  }
}

const sentenceCase = (s) => (/[a-z]/.test(s) ? s : s.charAt(0) + s.slice(1).toLowerCase());

/** The first two sentences of NWS instructions, readable and short. */
export function instructionExcerpt(text, max = 240) {
  const sentences = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .map(sentenceCase);
  const out = sentences.slice(0, 2).join(' ');
  return out.length > max ? `${out.slice(0, max).trimEnd()}…` : out;
}

const placeName = (place) => (place?.kind === 'me' ? 'your location' : place?.name ?? 'a place you watch');

/** Notification options for an alarm event. */
export function notificationFor(event) {
  const key = event.alert?.vtec?.key ?? event.alert?.id ?? event.placeId;
  if (event.kind === 'headsup') {
    const h = event.headsUp ?? {};
    return {
      title: `A tornado could reach ${event.place?.kind === 'me' ? 'you' : placeName(event.place)} in about ${h.minutes} min`,
      body: `Projected from the storm’s motion${h.eta ? `, around ${clock(h.eta)}` : ''}. Be ready to take shelter.`,
      tag: `hook-echo:hu:${key}`,
      requireInteraction: false,
    };
  }
  const a = event.alert;
  return {
    title: `${a.event}: ${event.place?.kind === 'me' ? 'Your location' : placeName(event.place)}`,
    body: `${actionFor(a)}. Until ${clock(endOf(a))}.`,
    tag: `hook-echo:${key}`,
    requireInteraction: event.kind === 'alarm',
  };
}
