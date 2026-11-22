// Short messages over the map: new alerts, confirmations, problems.

import { $, esc, icon } from './dom.js';

const ICON = { ok: 'check', warning: 'alert', shelter: 'alert', info: 'info' };

/**
 * @param {{title: string, text?: string, tone?: 'ok'|'warning'|'shelter'|'info', action?: {label: string, run: () => void}, timeout?: number}} t
 */
export function toast({ title, text = '', tone = 'info', action, timeout = 6000 }) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast is-${tone}`;
  el.setAttribute('role', tone === 'shelter' || tone === 'warning' ? 'alert' : 'status');
  el.innerHTML = `${icon(ICON[tone] ?? 'info')}<div><div class="toast-title">${esc(title)}</div>${text ? `<div class="toast-text">${esc(text)}</div>` : ''}</div>
    <div class="toast-actions">${action ? `<button class="btn btn-small" type="button" data-act>${esc(action.label)}</button>` : ''}<button class="icon-btn" type="button" data-dismiss aria-label="Dismiss">${icon('close')}</button></div>`;
  const remove = () => {
    clearTimeout(timer);
    el.remove();
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act]')) {
      action?.run();
      remove();
    } else if (e.target.closest('[data-dismiss]')) remove();
  });
  box.prepend(el);
  while (box.children.length > 3) box.lastElementChild.remove();
  const timer = timeout ? setTimeout(remove, timeout) : 0;
  return remove;
}
