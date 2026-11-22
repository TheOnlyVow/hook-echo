// Logic for the places you watch: ordering by danger, which alerts cover
// which places, the badge on the People tab, and the single headline that
// tops the panel.

import { duration, relative, statesIn } from './format.js';

/** Place levels, most serious first. */
export const SEVERITY = ['shelter', 'warning', 'watch', 'advisory', 'unknown', 'checking', 'clear'];
const severity = (level) => {
  const i = SEVERITY.indexOf(level);
  return i < 0 ? SEVERITY.length : i;
};

export const KIND_ICON = { home: 'home', family: 'family', friend: 'friend', trip: 'trip', me: 'locate' };

/** @typedef {{place: {id: string, name: string, kind: string}, status: import('./status.js').PlaceStatus}} Person */

/** @param {Person[]} people */
export function sortBySeverity(people) {
  return [...people].sort((a, b) => severity(a.status.level) - severity(b.status.level) || a.place.name.localeCompare(b.place.name));
}

/** @returns {Map<string, {name: string, icon: string}[]>} alert id -> places it covers */
export function coversByAlert(people) {
  const out = new Map();
  for (const { place, status } of people) {
    for (const a of status.alerts ?? []) {
      if (!out.has(a.id)) out.set(a.id, []);
      out.get(a.id).push({ name: place.name, icon: KIND_ICON[place.kind] ?? 'trip' });
    }
  }
  return out;
}

/** Worst level across statuses, and how many are at warning or worse. */
export function worstLevel(statuses) {
  if (!statuses.length) return { level: null, count: 0 };
  const level = statuses.map((s) => s.level).sort((a, b) => severity(a) - severity(b))[0];
  return { level, count: statuses.filter((s) => s.level === 'shelter' || s.level === 'warning').length };
}

const endOf = (a) => new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0));
const names = (list) => (list.length === 1 ? list[0] : `${list[0]} and ${list.length - 1} more`);
const topAlert = (people) => people.map((p) => p.status.top).filter(Boolean).sort((a, b) => b.rank - a.rank)[0];

/**
 * The one line that matters most right now, in this order: a place under a
 * tornado warning; a tornado projected to reach a place; a warning for a
 * place; a tornado or severe watch for a place; tornado warnings anywhere;
 * all quiet.
 * @param {{people: Person[], tornadoes: object[], lastTornado: {ended: Date, area: string} | null, now: Date}} ctx
 */
export function headlineFor({ people, tornadoes, lastTornado, now }) {
  const shelter = people.filter((p) => p.status.level === 'shelter');
  if (shelter.length) {
    const top = topAlert(shelter);
    return { tone: 'shelter', icon: 'alert', title: `Take shelter: ${names(shelter.map((p) => p.place.name))}`, text: `${top.event}, ${duration(endOf(top) - now)} left`, alertId: top.id };
  }

  const heads = people.filter((p) => p.status.headsUp).sort((a, b) => a.status.headsUp.minutes - b.status.headsUp.minutes);
  if (heads.length) {
    const first = heads[0];
    return {
      tone: 'headsup',
      icon: 'tornado',
      title: `A tornado could reach ${first.place.name} in about ${first.status.headsUp.minutes} min`,
      text: 'Projected from the storm’s motion. Be ready to take shelter.',
      alertId: first.status.headsUp.alertId,
    };
  }

  const warned = people.filter((p) => p.status.level === 'warning');
  if (warned.length) {
    const top = topAlert(warned);
    const covered = warned.filter((p) => p.status.alerts.some((a) => a.id === top.id)).map((p) => p.place.name);
    return { tone: 'warning', icon: 'alert', title: `${top.event} for ${names(covered)}`, text: `${duration(endOf(top) - now)} left`, alertId: top.id };
  }

  const watched = people.filter((p) => p.status.level === 'watch' && /^(Tornado|Severe Thunderstorm) Watch$/.test(p.status.top?.event ?? ''));
  if (watched.length) {
    const top = topAlert(watched);
    const covered = watched.filter((p) => p.status.alerts.some((a) => a.id === top.id)).map((p) => p.place.name);
    const text = top.event === 'Tornado Watch' ? 'Conditions favor tornadoes. Know where you would take shelter.' : 'Conditions favor severe storms. Stay alert.';
    return { tone: 'watch', icon: 'info', title: `${top.event} for ${names(covered)}`, text, alertId: top.id };
  }

  if (tornadoes.length) {
    const most = [...tornadoes].sort((a, b) => b.rank - a.rank)[0];
    const states = [...new Set(tornadoes.flatMap((a) => statesIn(a.areaDesc)))];
    const n = tornadoes.length;
    return {
      tone: 'national',
      icon: 'tornado',
      title: `${n} tornado warning${n > 1 ? 's' : ''} right now`,
      text: states.length ? `In ${states.join(', ')}. Tap to see the most serious.` : 'Tap to see the most serious.',
      alertId: most.id,
    };
  }

  return {
    tone: 'quiet',
    icon: 'check',
    title: 'No tornado warnings right now',
    text: lastTornado ? `The last one ended ${relative(lastTornado.ended, now)}.` : 'Hook Echo is watching the whole country.',
  };
}
