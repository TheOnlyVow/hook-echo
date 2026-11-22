import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Feed, FeedError, fetchJSON } from '../site/js/data/http.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Feed: success sets ok and the data', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const feed = new Feed({ id: 'x', load: async () => ({ n: 1 }), intervalMs: 60_000, staleMs: 300_000 });
  await feed.refresh();
  assert.equal(feed.snapshot.status, 'ok');
  assert.deepEqual(feed.snapshot.data, { n: 1 });
  assert.equal(feed.snapshot.updatedAt, 0);
  assert.equal(feed.snapshot.loading, false);
});

test('Feed: a failure keeps the last data and sets the error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let fail = false;
  const feed = new Feed({ id: 'x', load: async () => { if (fail) throw new FeedError('http', 'HTTP 503', 503); return [1, 2]; }, intervalMs: 60_000 });
  await feed.refresh();
  fail = true;
  await feed.refresh();
  assert.equal(feed.snapshot.status, 'error');
  assert.deepEqual(feed.snapshot.data, [1, 2]);
  assert.equal(feed.snapshot.error.code, 'http');
});

test('Feed: stale after staleMs, and stale when the first load fails', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const feed = new Feed({ id: 'x', load: async () => 1, intervalMs: 60_000, staleMs: 300_000 });
  await feed.refresh();
  assert.equal(feed.snapshot.stale, false);
  t.mock.timers.tick(300_001);
  assert.equal(feed.snapshot.stale, true);
  const broken = new Feed({ id: 'y', load: async () => { throw new Error('offline'); }, intervalMs: 60_000 });
  assert.equal(broken.snapshot.stale, false, 'not stale before the first attempt');
  await broken.refresh();
  assert.equal(broken.snapshot.stale, true);
});

test('Feed: retries back off 15 s, 30 s, 60 s, capped at the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  const feed = new Feed({ id: 'x', load: async () => { calls++; throw new Error('down'); }, intervalMs: 60_000 });
  feed.start();
  await flush();
  assert.equal(calls, 1);
  for (const [wait, expected] of [[14_999, 1], [1, 2], [29_999, 2], [1, 3], [60_000, 4], [60_000, 5]]) {
    t.mock.timers.tick(wait);
    await flush();
    assert.equal(calls, expected, `after +${wait} ms`);
  }
  feed.stop();
});

test('Feed: overlapping refresh calls run load once', async () => {
  let calls = 0;
  let release;
  const feed = new Feed({ id: 'x', load: () => { calls++; return new Promise((r) => (release = r)); }, intervalMs: 60_000 });
  const a = feed.refresh();
  const b = feed.refresh();
  release('done');
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(feed.snapshot.data, 'done');
});

test('Feed: data saver stretches the refresh interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  const feed = new Feed({ id: 'x', load: async () => ++calls, intervalMs: 60_000, saverIntervalMs: 600_000 });
  feed.setDataSaver(true);
  feed.start();
  await flush();
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(calls, 1, 'no refresh at the normal interval');
  t.mock.timers.tick(540_000);
  await flush();
  assert.equal(calls, 2);
  feed.stop();
});

test('Feed: subscribers hear loading and results', async () => {
  const feed = new Feed({ id: 'x', load: async () => 7, intervalMs: 60_000 });
  const seen = [];
  const off = feed.subscribe((s) => seen.push(`${s.status}:${s.loading}`));
  await feed.refresh();
  off();
  assert.deepEqual(seen, ['idle:true', 'ok:false']);
});

test('fetchJSON: http, parse and network errors are FeedErrors', async (t) => {
  const real = globalThis.fetch;
  t.after(() => (globalThis.fetch = real));
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  await assert.rejects(fetchJSON('https://example.test/a'), (e) => e instanceof FeedError && e.code === 'http' && e.status === 503);
  globalThis.fetch = async () => new Response('{bad', { status: 200 });
  await assert.rejects(fetchJSON('https://example.test/b'), (e) => e.code === 'parse');
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchJSON('https://example.test/c'), (e) => e.code === 'network');
  globalThis.fetch = async () => new Response('{"ok":true}', { status: 200 });
  assert.deepEqual(await fetchJSON('https://example.test/d'), { ok: true });
});

test('fetchJSON: times out', async (t) => {
  const real = globalThis.fetch;
  t.after(() => (globalThis.fetch = real));
  globalThis.fetch = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assert.rejects(fetchJSON('https://example.test/slow', { timeoutMs: 20 }), (e) => e.code === 'timeout');
});
