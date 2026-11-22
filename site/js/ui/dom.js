// Small DOM helpers shared by the UI modules.

import { duration, relative } from '../lib/format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapes text for safe use inside HTML. Every string from a feed goes through this. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const icon = (name, cls = '') => `<svg class="icon${cls ? ` ${cls}` : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** Reads a screen-reader announcement aloud (polite announcements use aria-live regions in place). */
export function announce(text) {
  const el = $('#announcer');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = text;
  });
}

/**
 * Updates live time text in place once a second:
 *   data-countdown="<epoch ms>"  ->  "23 min left" / "Ended"
 *   data-ago="<epoch ms>"        ->  "3 min ago"
 */
export function tickTimes(root = document, now = Date.now()) {
  for (const el of root.querySelectorAll('[data-countdown]')) {
    const left = Number(el.dataset.countdown) - now;
    const text = left <= 0 ? 'Ended' : `${duration(left)} left`;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-soon', left > 0 && left < 10 * 60_000);
  }
  for (const el of root.querySelectorAll('[data-ago]')) {
    const text = relative(new Date(Number(el.dataset.ago)), new Date(now));
    if (el.textContent !== text) el.textContent = text;
  }
}

/** Status chip markup for a place level. */
const STATUS = {
  shelter: ['alert', 'Take shelter'],
  warning: ['alert', 'Warning'],
  watch: ['info', 'Watch'],
  advisory: ['info', 'Advisory'],
  clear: ['check', 'Clear'],
  unknown: ['offline', 'Unknown'],
  checking: ['refresh', 'Checking'],
};
export function statusChip(level) {
  const [ic, word] = STATUS[level] ?? STATUS.unknown;
  return `<span class="status" data-level="${esc(level)}">${icon(ic)}${word}</span>`;
}

/** Arrow pointing where a storm is heading. */
export function headingArrow(dirFrom) {
  const heading = (Number(dirFrom) + 180) % 360;
  return `<svg class="icon" aria-hidden="true" style="transform: rotate(${heading}deg)"><use href="#i-heading"/></svg>`;
}

/** Throttles a function to one call per animation frame. */
export function rafThrottle(fn) {
  let queued = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

export const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const isWide = () => globalThis.matchMedia?.('(min-width: 960px)').matches ?? true;
