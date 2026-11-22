// Keeps a log for the developer console from the moment the app starts:
// console output, uncaught errors and rejected promises, plus whatever the
// app logs itself (feed updates, simulations). It is small and always runs;
// the console itself loads only when someone opens it.

import { createLog, formatArgs } from '../lib/logbuf.js';

export const devlog = createLog({ limit: 600 });

const METHODS = { error: 'error', warn: 'warn', info: 'info', log: 'info', debug: 'debug' };
for (const [method, level] of Object.entries(METHODS)) {
  const original = console[method];
  if (typeof original !== 'function') continue;
  console[method] = function capture(...args) {
    try {
      devlog.push({ level, source: 'console', message: formatArgs(args) });
    } catch {
      // Logging must never break the page.
    }
    return original.apply(this, args);
  };
}

addEventListener('error', (e) => {
  devlog.push({ level: 'error', source: 'page', message: e.error ? formatArgs([e.error]) : `${e.message} (${e.filename || 'page'}:${e.lineno || 0})` });
});
addEventListener('unhandledrejection', (e) => {
  devlog.push({ level: 'error', source: 'promise', message: `Unhandled rejection: ${formatArgs([e.reason])}` });
});
