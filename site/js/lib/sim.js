// A simulated tornado warning for testing alarms and map drawing from the
// developer console. It has the same shape as a normalized NWS alert, so it
// runs through every real code path, and it says "Simulated" everywhere it
// can be seen. Simulations live only in memory: a reload ends them.

import { destination } from './geo.js';

const KT_TO_KMH = 1.852;

/** True for warnings made by the developer console. */
export const isSimulated = (alert) => Boolean(alert?.simulated);

/**
 * @param {{id: string, name: string, lat: number, lon: number}} place
 * @param {{now?: Date, minutes?: number, dirFrom?: number, speedKt?: number, arriveMinutes?: number, seq?: number}} [opts]
 * @returns {{alert: object, history: object[]}} the warning, plus two earlier updates that draw its trail
 */
export function simulatedTornadoWarning(place, { now = new Date(), minutes = 30, dirFrom = 240, speedKt = 35, arriveMinutes = 10, seq = 1 } = {}) {
  const heading = (dirFrom + 180) % 360;
  const kmh = speedKt * KT_TO_KMH;
  const km = (mins) => (kmh * mins) / 60;
  // The storm starts upwind and reaches the place about `arriveMinutes` in.
  const start = destination(place, dirFrom, km(arriveMinutes));
  const back = destination(start, dirFrom, km(4));
  const ahead = destination(start, heading, km(minutes) + 2);
  const polygon = [
    destination(back, heading - 90, 5),
    destination(ahead, heading - 90, 9),
    destination(ahead, heading + 90, 9),
    destination(back, heading + 90, 5),
  ];
  const ring = [...polygon, polygon[0]].map((p) => [Number(p.lon.toFixed(4)), Number(p.lat.toFixed(4))]);
  const expires = new Date(now.getTime() + minutes * 60_000);
  const etn = String(seq).padStart(4, '0');
  const key = `XSIM.TO.W.${etn}.${now.getUTCFullYear()}`;
  const vtec = { action: 'NEW', office: 'XSIM', phenomena: 'TO', significance: 'W', etn: seq, start: now, end: expires, key };

  const message = (minsAgo, id) => {
    const time = new Date(now.getTime() - minsAgo * 60_000);
    const pos = minsAgo ? destination(start, dirFrom, km(minsAgo)) : start;
    return {
      id,
      event: 'Tornado Warning',
      headline: `Simulated Tornado Warning for ${place.name} (test only)`,
      nwsHeadline: '',
      description: 'This is a simulated warning made in the Hook Echo developer console to test alarms and map drawing. No real warning is in effect.',
      instruction: 'This is a test. No action is needed.',
      areaDesc: `${place.name} (simulated)`,
      senderName: 'Hook Echo developer test',
      sent: time,
      effective: time,
      onset: time,
      expires,
      ends: null,
      severity: 'Extreme',
      certainty: 'Observed',
      urgency: 'Immediate',
      messageType: minsAgo ? 'Update' : 'Alert',
      geometry: { type: 'Polygon', coordinates: [ring] },
      ugc: [],
      same: [],
      vtec: { ...vtec, action: minsAgo ? 'CON' : 'NEW' },
      motion: { time, dirFrom, speedKt, points: [pos] },
      tags: [{ kind: 'simulated', label: 'Simulated' }],
      level: 'alarm',
      placeLevel: 'shelter',
      rank: 90,
      color: '#FF0000',
      cancelled: false,
      references: [],
      web: '',
      simulated: true,
    };
  };

  const id = `sim:${seq}:${now.getTime()}`;
  return { alert: message(0, id), history: [message(20, `${id}:h20`), message(10, `${id}:h10`)] };
}
