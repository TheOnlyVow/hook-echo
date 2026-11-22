import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, loadPersisted, savePersisted } from '../site/js/state/store.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const throwingStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

test('subscribe fires after set and stops after unsubscribe', () => {
  const store = createStore({ a: 1, b: 2 });
  const seen = [];
  const off = store.subscribe((state, changed) => seen.push([state.a, [...changed]]));
  store.set({ a: 5 });
  off();
  store.set({ a: 6 });
  assert.deepEqual(seen, [[5, ['a']]]);
  assert.deepEqual(store.get(), { a: 6, b: 2 });
});

test('set with an unchanged value does not notify', () => {
  const store = createStore({ a: 1 });
  let calls = 0;
  store.subscribe(() => calls++);
  store.set({ a: 1 });
  assert.equal(calls, 0);
});

test('persisted values round trip and merge over defaults', () => {
  const storage = memoryStorage();
  assert.equal(savePersisted(storage, 'k', { places: [{ id: 'x' }] }), true);
  assert.deepEqual(loadPersisted(storage, 'k', { places: [], theme: 'system' }), { places: [{ id: 'x' }], theme: 'system' });
});

test('storage that throws', () => {
  const defaults = { places: [], theme: 'system' };
  const loaded = loadPersisted(throwingStorage, 'k', defaults);
  assert.deepEqual(loaded, defaults);
  assert.notEqual(loaded, defaults, 'returns a copy, not the defaults object');
  assert.equal(savePersisted(throwingStorage, 'k', defaults), false);
  assert.deepEqual(loadPersisted(null, 'k', defaults), defaults);
});

test('safeLocalStorage: null when touching storage throws, the storage when it works', async () => {
  const { safeLocalStorage } = await import('../site/js/state/store.js');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.equal(safeLocalStorage(), null);
    const working = memoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: working });
    assert.equal(safeLocalStorage(), working);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('corrupt stored JSON falls back to defaults', () => {
  const storage = memoryStorage();
  storage.setItem('k', '{not json');
  assert.deepEqual(loadPersisted(storage, 'k', { theme: 'system' }), { theme: 'system' });
});
