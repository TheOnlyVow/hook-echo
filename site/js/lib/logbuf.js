// The developer console's log: a capped ring of entries (newest last) that
// the console renders and filters, plus the helper that turns console.log
// style arguments into one line.

import { inspect } from './inspect.js';

export const LEVELS = Object.freeze(['error', 'warn', 'info', 'debug', 'input', 'result']);

/**
 * @typedef {{id: number, time: number, level: string, source: string, message: string, data?: unknown}} LogEntry
 * @param {{limit?: number, now?: () => number}} [opts]
 */
export function createLog({ limit = 500, now = () => Date.now() } = {}) {
  /** @type {LogEntry[]} */
  let entries = [];
  let seq = 0;
  const listeners = new Set();

  return {
    /** @param {{level?: string, source?: string, message: string, data?: unknown}} e */
    push({ level = 'info', source = 'app', message = '', data } = {}) {
      const entry = { id: ++seq, time: now(), level: LEVELS.includes(level) ? level : 'info', source, message: String(message), data };
      entries.push(entry);
      if (entries.length > limit) entries = entries.slice(entries.length - limit);
      for (const fn of [...listeners]) {
        try {
          fn(entry);
        } catch {
          // A broken listener must never break logging.
        }
      }
      return entry;
    },
    /** @param {{level?: string, source?: string, text?: string}} [filter] */
    list({ level, source, text } = {}) {
      const needle = text?.trim().toLowerCase();
      return entries.filter((e) => (!level || e.level === level) && (!source || e.source === source) && (!needle || `${e.source} ${e.message}`.toLowerCase().includes(needle)));
    },
    counts() {
      const out = Object.fromEntries(LEVELS.map((l) => [l, 0]));
      for (const e of entries) out[e.level] += 1;
      return out;
    },
    clear() {
      entries = [];
    },
    /** @param {(e: LogEntry) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** console.log arguments as one readable line: strings as they are, everything else inspected. */
export function formatArgs(args) {
  return args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 2, maxItems: 20, maxString: 500 }))).join(' ');
}
