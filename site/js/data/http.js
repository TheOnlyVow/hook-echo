// Network plumbing: fetchJSON turns every failure into a typed FeedError, and
// Feed keeps one data source refreshed on a schedule, keeps its last good
// data through failures, backs off while a server is down, and reports how
// old its data is.

export class FeedError extends Error {
  /**
   * @param {'timeout'|'network'|'http'|'parse'|'aborted'} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status) {
    super(message);
    this.name = 'FeedError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {string} url
 * @param {{timeoutMs?: number, signal?: AbortSignal, accept?: string}} [opts]
 */
export async function fetchJSON(url, { timeoutMs = 20_000, signal, accept = 'application/geo+json, application/json;q=0.9, */*;q=0.5' } = {}) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(new FeedError('aborted', 'Request cancelled'));
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctl.abort(new FeedError('timeout', `No answer within ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: accept } });
    if (!res.ok) throw new FeedError('http', `HTTP ${res.status}`, res.status);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new FeedError('parse', 'The server sent something that is not JSON');
    }
  } catch (e) {
    if (e instanceof FeedError) throw e;
    if (ctl.signal.reason instanceof FeedError) throw ctl.signal.reason;
    throw new FeedError('network', e?.message || 'Network error');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const BACKOFF_START_MS = 15_000;

/**
 * @template T
 * @typedef {{status: 'idle'|'ok'|'error', loading: boolean, data: T | null, updatedAt: number | null, error: Error | null, nextAt: number | null, stale: boolean}} FeedSnapshot
 */

/** @template T */
export class Feed {
  #load;
  #intervalMs;
  #saverIntervalMs;
  #staleMs;
  #saver = false;
  #running = false;
  #timer = null;
  #inflight = null;
  #controller = null;
  #failures = 0;
  #listeners = new Set();
  #state = { status: 'idle', loading: false, data: null, updatedAt: null, error: null, nextAt: null };

  /**
   * @param {{id: string, load: (signal: AbortSignal) => Promise<T>, intervalMs: number, saverIntervalMs?: number, staleMs?: number}} opts
   */
  constructor({ id, load, intervalMs, saverIntervalMs, staleMs }) {
    this.id = id;
    this.#load = load;
    this.#intervalMs = intervalMs;
    this.#saverIntervalMs = saverIntervalMs ?? intervalMs;
    this.#staleMs = staleMs ?? intervalMs * 3;
  }

  /** @returns {FeedSnapshot<T>} */
  get snapshot() {
    const s = this.#state;
    const stale = s.updatedAt == null ? s.status === 'error' : Date.now() - s.updatedAt > this.#staleMs;
    return { ...s, stale };
  }

  get intervalMs() {
    return this.#saver ? this.#saverIntervalMs : this.#intervalMs;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.refresh();
  }

  stop() {
    this.#running = false;
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#controller?.abort();
    this.#update({ nextAt: null });
  }

  setDataSaver(on) {
    if (this.#saver === Boolean(on)) return;
    this.#saver = Boolean(on);
    if (this.#running && !this.#inflight && this.#state.status === 'ok') {
      const since = Date.now() - (this.#state.updatedAt ?? Date.now());
      this.#schedule(Math.max(0, this.intervalMs - since));
    }
  }

  /** @param {(s: FeedSnapshot<T>) => void} fn */
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Loads now. Concurrent calls share one request. */
  refresh() {
    if (this.#inflight) return this.#inflight;
    clearTimeout(this.#timer);
    const controller = new AbortController();
    this.#controller = controller;
    let pending;
    try {
      pending = Promise.resolve(this.#load(controller.signal));
    } catch (e) {
      pending = Promise.reject(e);
    }
    this.#update({ loading: true });
    this.#inflight = pending
      .then(
        (data) => {
          this.#failures = 0;
          this.#state = { ...this.#state, status: 'ok', data, updatedAt: Date.now(), error: null };
          this.#schedule(this.intervalMs);
        },
        (error) => {
          if (controller.signal.aborted && !this.#running) return;
          this.#failures += 1;
          this.#state = { ...this.#state, status: 'error', error };
          this.#schedule(Math.min(this.intervalMs, BACKOFF_START_MS * 2 ** (this.#failures - 1)));
        },
      )
      .finally(() => {
        this.#inflight = null;
        this.#update({ loading: false });
      });
    return this.#inflight;
  }

  #schedule(ms) {
    clearTimeout(this.#timer);
    if (!this.#running) {
      this.#state = { ...this.#state, nextAt: null };
      return;
    }
    this.#timer = setTimeout(() => this.refresh(), ms);
    this.#state = { ...this.#state, nextAt: Date.now() + ms };
  }

  #update(patch) {
    this.#state = { ...this.#state, ...patch };
    const snap = this.snapshot;
    for (const fn of [...this.#listeners]) fn(snap);
  }
}
