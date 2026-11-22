// Decides which alarms, chimes and heads-ups to fire after a refresh.
// Memory keeps, per place, the highest rank seen for each warning (keyed by
// VTEC event, so routine update messages never re-alarm). A rank above the
// remembered one is an upgrade and fires again; warnings that disappear are
// forgotten, so a genuinely new one always fires.

/**
 * @typedef {Record<string, Record<string, number>>} AlarmMemory placeId -> eventKey -> highest rank seen
 * @typedef {{placeId: string, alert: object | null, kind: 'alarm'|'chime'|'headsup', headsUp?: object}} AlarmEvent
 */

const keyOf = (alert, fallbackId) => alert?.vtec?.key ?? alert?.id ?? fallbackId;

/**
 * @param {AlarmMemory} memory
 * @param {Record<string, import('./status.js').PlaceStatus>} statuses placeId -> status
 * @param {object[]} [alerts] all alerts, to resolve a heads-up's alert
 * @returns {{events: AlarmEvent[], memory: AlarmMemory}}
 */
export function decideAlarms(memory, statuses, alerts = []) {
  /** @type {AlarmEvent[]} */
  const events = [];
  /** @type {AlarmMemory} */
  const next = {};

  for (const [placeId, status] of Object.entries(statuses)) {
    const prev = memory?.[placeId] ?? {};
    const cur = {};

    const loud = (status.alerts ?? []).filter((a) => a.level === 'alarm' || a.level === 'chime').sort((a, b) => b.rank - a.rank);
    for (const alert of loud) {
      const key = keyOf(alert);
      const known = Math.max(prev[key] ?? -Infinity, cur[key] ?? -Infinity);
      if (alert.rank > known) events.push({ placeId, alert, kind: alert.level });
      cur[key] = Math.max(known, alert.rank);
    }

    if (status.headsUp) {
      const alert = alerts.find((a) => a.id === status.headsUp.alertId) ?? (status.alerts ?? []).find((a) => a.id === status.headsUp.alertId) ?? null;
      const key = `hu|${keyOf(alert, status.headsUp.alertId)}`;
      if (prev[key] === undefined) events.push({ placeId, alert, kind: 'headsup', headsUp: status.headsUp });
      cur[key] = 0;
    }

    next[placeId] = cur;
  }

  return { events, memory: next };
}
