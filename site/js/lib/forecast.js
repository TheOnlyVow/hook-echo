// Reads an NWS 7-day forecast for one calendar date: the summary words,
// whether thunder or severe storms are mentioned, and the high and low.

const THUNDER = /thunder|t-storm|tstorm/i;
const SEVERE = /severe|damaging wind|large hail|tornado/i;

/**
 * @param {{startTime: string, isDaytime: boolean, temperature: number, shortForecast: string, detailedForecast: string}[] | undefined} periods
 * @param {string} date YYYY-MM-DD in the forecast point's own time zone
 * @returns {{summary: string, thunder: boolean, severe: boolean, high: number | null, low: number | null} | null}
 */
export function forecastForDate(periods, date) {
  const day = (periods ?? []).filter((p) => p.startTime?.slice(0, 10) === date);
  if (!day.length) return null;
  const text = day.map((p) => `${p.shortForecast} ${p.detailedForecast}`).join(' ');
  const daytime = day.filter((p) => p.isDaytime);
  const night = day.filter((p) => !p.isDaytime);
  return {
    summary: (daytime[0] ?? day[0]).shortForecast,
    thunder: THUNDER.test(text),
    severe: SEVERE.test(text),
    high: daytime.length ? Math.max(...daytime.map((p) => p.temperature)) : null,
    low: night.length ? Math.min(...night.map((p) => p.temperature)) : null,
  };
}
