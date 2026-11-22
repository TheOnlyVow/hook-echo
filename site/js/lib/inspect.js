// Turns any value into readable text for the developer console, the way a
// browser console would: dates as ISO strings, Maps and Sets with their
// contents, cycles marked, deep or long values cut short.

const IDENT = /^[A-Za-z_$][\w$]*$/;
const WRAP_AT = 72;

/**
 * @param {unknown} value
 * @param {{depth?: number, maxItems?: number, maxString?: number}} [opts]
 * @returns {string}
 */
export function inspect(value, { depth = 3, maxItems = 50, maxString = 2000 } = {}) {
  const seen = new WeakSet();

  const str = (s, quoted) => {
    const cut = s.length > maxString ? `${s.slice(0, maxString)}… (${s.length - maxString} more characters)` : s;
    return quoted ? `'${cut.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'` : cut;
  };

  const errorText = (e) => {
    const head = `${e.name || 'Error'}: ${e.message}`;
    const frames = String(e.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l)).slice(0, 4);
    return frames.length ? `${head}\n${frames.join('\n')}` : head;
  };

  const wrap = (open, items, close, indent) => {
    if (!items.length) return `${open}${close}`;
    const flat = `${open} ${items.join(', ')} ${close}`;
    if (flat.length <= WRAP_AT && !flat.includes('\n')) return flat;
    const pad = '  '.repeat(indent + 1);
    return `${open}\n${items.map((i) => `${pad}${i.replace(/\n/g, `\n${pad}`)}`).join(',\n')}\n${'  '.repeat(indent)}${close}`;
  };

  const more = (n) => `… ${n} more`;

  function fmt(v, level) {
    if (v === null) return 'null';
    const t = typeof v;
    if (t === 'undefined') return 'undefined';
    if (t === 'string') return str(v, true);
    if (t === 'number' || t === 'boolean') return String(v);
    if (t === 'bigint') return `${v}n`;
    if (t === 'symbol') return v.toString();
    if (t === 'function') return v.name ? `[Function ${v.name}]` : '[Function]';
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
    if (v instanceof Error) return errorText(v);
    if (v instanceof RegExp) return String(v);
    if (typeof Element !== 'undefined' && v instanceof Element) return `<${v.tagName.toLowerCase()}${v.id ? `#${v.id}` : ''}${v.classList.length ? `.${[...v.classList].join('.')}` : ''}>`;
    if (seen.has(v)) return '[Circular]';
    if (level > depth) return Array.isArray(v) ? '[Array]' : v instanceof Map ? '[Map]' : v instanceof Set ? '[Set]' : '[Object]';
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        const items = v.slice(0, maxItems).map((x) => fmt(x, level + 1));
        if (v.length > maxItems) items.push(more(v.length - maxItems));
        return wrap('[', items, ']', level);
      }
      if (v instanceof Map) {
        const items = [...v].slice(0, maxItems).map(([k, x]) => `${typeof k === 'string' ? str(k, false) : fmt(k, level + 1)} => ${fmt(x, level + 1)}`);
        if (v.size > maxItems) items.push(more(v.size - maxItems));
        return `Map(${v.size}) ${wrap('{', items, '}', level)}`;
      }
      if (v instanceof Set) {
        const items = [...v].slice(0, maxItems).map((x) => fmt(x, level + 1));
        if (v.size > maxItems) items.push(more(v.size - maxItems));
        return `Set(${v.size}) ${wrap('{', items, '}', level)}`;
      }
      const keys = Object.keys(v);
      const items = keys.slice(0, maxItems).map((k) => `${IDENT.test(k) ? k : str(k, true)}: ${fmt(v[k], level + 1)}`);
      if (keys.length > maxItems) items.push(more(keys.length - maxItems));
      const proto = Object.getPrototypeOf(v);
      const name = proto && proto !== Object.prototype && proto.constructor?.name ? `${proto.constructor.name} ` : '';
      return `${name}${wrap('{', items, '}', level)}`;
    } finally {
      seen.delete(v);
    }
  }

  return fmt(value, 0);
}
