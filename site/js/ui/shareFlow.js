// Sharing places: a link that carries the list after "#import=", sent with
// the phone's share sheet or copied; opening such a link previews the
// places and asks before adding them.

import { $, esc, icon } from './dom.js';
import { encodePlaces, decodePlaces, MAX_PLACES } from '../lib/share.js';
import { KIND_ICON } from '../lib/people.js';
import { toast } from './toasts.js';

export function shareLink(places) {
  return `${location.origin}${location.pathname}#import=${encodePlaces(places)}`;
}

export async function sharePlaces(places) {
  const url = shareLink(places);
  const text = `My places on Hook Echo: ${places.map((p) => p.name).join(', ')}`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: 'Hook Echo places', text, url });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', text: 'Send it to family or friends. Opening it lets them add these places on their own phone.', tone: 'ok' });
  } catch {
    showLinkDialog(url);
  }
}

function showLinkDialog(url) {
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="confirm-title">Share my places</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon('close')}</button></div>
    <div class="dialog-body"><p class="dialog-text">Copy this link and send it to family or friends.</p><textarea class="input" style="height:96px;padding:10px" readonly id="share-url">${esc(url)}</textarea></div>
    <div class="dialog-foot"><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
  dialog.addEventListener('click', function onClick(e) {
    if (e.target === dialog || e.target.closest('[data-close]')) {
      dialog.close();
      dialog.removeEventListener('click', onClick);
    }
  });
  dialog.showModal();
  const area = dialog.querySelector('#share-url');
  area.focus();
  area.select();
}

/**
 * Handles "#import=..." on load. Resolves with the places to add (possibly
 * none), after the viewer confirms. Clears the hash either way.
 */
export function importFromHash(existing) {
  const m = /^#import=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return Promise.resolve([]);
  history.replaceState(null, '', location.pathname + location.search);
  let incoming;
  try {
    incoming = decodePlaces(m[1]);
  } catch {
    toast({ title: 'This share link is damaged', text: 'Ask for the link again. Nothing was added.', tone: 'warning', timeout: 9000 });
    return Promise.resolve([]);
  }
  const same = (a, b) => a.name === b.name && Math.abs(a.lat - b.lat) < 0.001 && Math.abs(a.lon - b.lon) < 0.001;
  const fresh = incoming.filter((p) => !existing.some((e) => same(e, p)));
  const room = MAX_PLACES - existing.length;
  if (!fresh.length) {
    toast({ title: 'You already have these places', tone: 'ok' });
    return Promise.resolve([]);
  }
  const adding = fresh.slice(0, Math.max(0, room));
  const dialog = $('#confirm-dialog');
  dialog.innerHTML = `<div class="dialog-head"><h2 id="confirm-title">Add ${adding.length} shared place${adding.length === 1 ? '' : 's'}?</h2></div>
    <div class="dialog-body">
      <p class="dialog-text">Someone shared these with you. Hook Echo will watch them on this device.</p>
      <ul class="import-list">${adding.map((p) => `<li>${icon(KIND_ICON[p.kind] ?? 'trip')}<span>${esc(p.name)}</span></li>`).join('')}</ul>
      ${fresh.length > adding.length ? `<p class="fine">${fresh.length - adding.length} more won't fit. Hook Echo watches up to ${MAX_PLACES} places.</p>` : ''}
    </div>
    <div class="dialog-foot"><button class="btn" type="button" data-answer="no">Don't add</button><button class="btn btn-primary" type="button" data-answer="yes" ${adding.length ? '' : 'disabled'}>Add places</button></div>`;
  return new Promise((resolve) => {
    const finish = (yes) => {
      dialog.removeEventListener('click', onClick);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(yes ? adding : []);
    };
    const onClick = (e) => {
      const b = e.target.closest('[data-answer]');
      if (b) finish(b.dataset.answer === 'yes');
    };
    const onClose = () => finish(false);
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}
