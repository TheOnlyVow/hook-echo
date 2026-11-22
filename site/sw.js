// Hook Echo service worker. The app's own files are served network-first
// (updates arrive at once; the cached copy covers a dropped connection), and
// fonts, icons and the map library cache-first. Weather feeds, tiles and
// anything else from another host always go to the network: stale weather
// must never look current.

const VERSION = '5670a872391b';
const CACHE = `hook-echo-${VERSION}`;
// The minimum to start; precache.json (written by tools/precache.mjs) lists everything.
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'js/main.js',
  'vendor/maplibre-gl/maplibre-gl.js',
  'vendor/maplibre-gl/maplibre-gl.css',
  'fonts/barlow-latin-400-normal.woff2',
  'fonts/barlow-latin-500-normal.woff2',
  'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-500-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let files = PRECACHE;
      try {
        const list = await (await fetch('precache.json', { cache: 'no-store' })).json();
        if (Array.isArray(list.files)) files = ['./', ...list.files];
      } catch {
        // Fall back to the minimum list; runtime caching fills in the rest.
      }
      await cache.addAll(files);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = (await cache.match(request, { ignoreSearch: true })) ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    if (hit) return hit;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const immutable = /\/(fonts|vendor|icons)\//.test(url.pathname);
  event.respondWith(immutable ? cacheFirst(request) : networkFirst(request));
});

// Tapping an alarm notification opens Hook Echo on that warning.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alertId = event.notification.data?.alertId ?? null;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if (alertId) client.postMessage({ type: 'select-alert', id: alertId });
          return;
        }
      }
      await self.clients.openWindow('./');
    })(),
  );
});
