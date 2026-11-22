// A tiny observable store plus storage helpers that never throw: private
// windows, blocked site data and full quotas all fall back to defaults.

/**
 * @template {Record<string, any>} T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    /** @returns {T} */
    get: () => state,
    /** Shallow-merges `patch`; listeners hear only about keys whose value changed. */
    set(patch) {
      const changed = new Set();
      for (const [k, v] of Object.entries(patch)) if (!Object.is(state[k], v)) changed.add(k);
      if (!changed.size) return;
      state = { ...state, ...patch };
      for (const fn of [...listeners]) fn(state, changed);
    },
    /** @param {(state: T, changed: Set<string>) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Reads JSON from storage and merges it over a copy of `defaults`. */
export function loadPersisted(storage, key, defaults) {
  try {
    const raw = storage?.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { ...defaults, ...parsed };
    }
  } catch {
    // Unreadable or blocked storage: run on defaults.
  }
  return { ...defaults };
}

/** localStorage when the browser allows touching it, else null. */
export function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__hook_echo_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** @returns {boolean} whether the value was saved */
export function savePersisted(storage, key, value) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
