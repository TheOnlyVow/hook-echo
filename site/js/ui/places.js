// The People tab (Where I am plus saved places), the add/edit place dialog,
// and the place pins on the map.

import { esc, icon, statusChip } from './dom.js';
import { clock, miles, compass } from '../lib/format.js';
import { KIND_ICON } from '../lib/people.js';
import { MAX_PLACES, MAX_NAME, newPlaceId } from '../lib/share.js';
import { confirmAction } from './confirm.js';

export const KIND_LABEL = { home: 'Home', family: 'Family', friend: 'Friend', trip: 'Trip stop', me: 'Where I am' };

const endOf = (a) => new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0));

function riskLine(risk, outlookLoaded) {
  if (risk && risk.level >= 1) return `<p class="place-line"><span class="risk" style="--risk:${esc(risk.color)}"><i aria-hidden="true"></i></span><span>Storm risk today: <strong>${esc(risk.name)}</strong> (${risk.level} of 5)</span></p>`;
  if (risk) return `<p class="place-line"><span class="risk" style="--risk:${esc(risk.color)}"><i aria-hidden="true"></i></span><span>Thunderstorms possible today, not expected to be severe</span></p>`;
  if (outlookLoaded) return `<p class="place-line">${icon('check')}<span>No thunderstorms expected today</span></p>`;
  return '';
}

function forecastLine(forecast) {
  if (!forecast?.periods?.length) return '';
  const next = forecast.periods.slice(0, 2);
  return next.map((p) => `<p class="place-line">${icon('calendar')}<span><strong>${esc(p.name)}:</strong> ${esc(p.shortForecast)}, ${esc(String(p.temperature))}°${esc(p.temperatureUnit ?? 'F')}</span></p>`).join('');
}

/** One place card. */
export function placeCard({ place, status, nearest, risk }, { forecast, outlookLoaded, now, isMe = false }) {
  const top = status.top;
  const more = status.alerts.length > 1 ? `, plus ${status.alerts.length - 1} more` : '';
  const sub = isMe ? place.detail : `${KIND_LABEL[place.kind] ?? 'Place'}${place.detail ? `, ${place.detail}` : ''}`;
  const lines = [];
  if (top) lines.push(`<p class="place-line">${icon('alert')}<span><strong>${esc(top.event)}</strong> until ${esc(clock(endOf(top)))}${esc(more)}</span></p>`);
  if (status.headsUp) {
    const h = status.headsUp;
    lines.push(`<p class="place-line is-headsup">${icon('tornado')}<span><strong>A tornado could reach ${isMe ? 'you' : 'here'} around ${esc(clock(h.eta))}</strong>, in about ${h.minutes} min</span></p>`);
  }
  if (status.level === 'unknown') lines.push(`<p class="place-line">${icon('offline')}<span>Warning data is delayed, so this place can't be confirmed clear.</span></p>`);
  if (nearest && nearest.distanceKm < 160) {
    lines.push(`<p class="place-line">${icon('target')}<span>Nearest warned storm ${esc(miles(nearest.distanceKm))} ${esc(compass(nearest.bearingFromPlace))}, ${nearest.toward ? '<strong>heading this way</strong>' : 'moving away'}</span></p>`);
  }
  lines.push(riskLine(risk, outlookLoaded));
  lines.push(forecastLine(forecast));
  return `<article class="place${isMe ? ' me-card is-on' : ''}" data-level="${esc(status.level)}" data-place="${esc(place.id)}" tabindex="-1" aria-label="${esc(`${place.name}: ${status.level === 'shelter' ? 'take shelter' : status.level}`)}">
    <div class="place-head">
      <span class="place-icon">${icon(isMe ? 'locate' : KIND_ICON[place.kind] ?? 'trip')}</span>
      <div style="min-width:0"><h3 class="place-name">${esc(place.name)}</h3><p class="place-sub">${esc(sub ?? '')}</p></div>
      ${statusChip(status.level)}
    </div>
    <div class="place-lines">${lines.join('')}</div>
    <div class="place-actions">
      <button class="btn btn-small" type="button" data-show="${esc(place.id)}">${icon('target')}Show on map</button>
      ${isMe ? `<button class="btn btn-small btn-ghost" type="button" data-me="off">Turn off</button>` : `<button class="btn btn-small btn-ghost" type="button" data-edit="${esc(place.id)}">${icon('edit')}Edit</button>`}
    </div>
  </article>`;
}

function meCard(me, view, ctx) {
  if (me.on && view) return placeCard(view, { ...ctx, forecast: ctx.forecasts.get('me'), isMe: true });
  let text = 'Follow your phone’s location while Hook Echo is open. It gets the same alerts and heads-ups as your saved places.';
  let action = `<button class="btn btn-primary btn-small" type="button" data-me="on">${icon('locate')}Turn on</button>`;
  if (!me.supported) {
    text = 'This browser can’t share its location.';
    action = '';
  } else if (me.error === 'denied') {
    text = 'Location is blocked for this site. Allow location for Hook Echo in your browser settings, then try again.';
    action = `<button class="btn btn-small" type="button" data-me="on">Try again</button>`;
  } else if (me.on) {
    text = me.error ? 'Still looking for your location. This can take a minute indoors.' : 'Finding your location…';
    action = `<button class="btn btn-small btn-ghost" type="button" data-me="off">Turn off</button>`;
  }
  return `<article class="place me-card${me.on ? ' is-on' : ''}" data-place="me">
    <div class="place-head"><span class="place-icon">${icon('locate')}</span><div><h3 class="place-name">Where I am</h3></div>${me.on ? statusChip('checking') : ''}</div>
    <p class="place-lines">${esc(text)}</p>
    ${action ? `<div class="place-actions">${action}</div>` : ''}
  </article>`;
}

export function createPeople({ el, onAdd, onEdit, onShow, onMe, onShare }) {
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.add !== undefined) onAdd();
    else if (t.dataset.share !== undefined) onShare();
    else if (t.dataset.edit) onEdit(t.dataset.edit);
    else if (t.dataset.show) onShow(t.dataset.show);
    else if (t.dataset.me) onMe(t.dataset.me === 'on');
  });

  /**
   * @param {{people: object[], meView: object | null, me: object, forecasts: Map, outlookLoaded: boolean, now: Date, count: number}} ctx
   */
  function render(ctx) {
    const full = ctx.count >= MAX_PLACES;
    let html = `<div class="toolbar">
      <button class="btn btn-primary" type="button" data-add ${full ? 'disabled' : ''}>${icon('plus')}Add a place</button>
      <button class="btn" type="button" data-share ${ctx.count ? '' : 'disabled'}>${icon('share')}Share my places</button>
    </div>`;
    if (full) html += `<p class="fine" style="padding: 4px 16px">You've saved the most places Hook Echo can watch (${MAX_PLACES}). Remove one to add another.</p>`;
    html += `<div class="stack">${meCard(ctx.me, ctx.meView, ctx)}`;
    if (!ctx.people.length) {
      html += `</div><div class="empty"><span class="empty-icon">${icon('family')}</span>
        <p class="empty-title">Add the places your people are</p>
        <p class="empty-text">Home, family, friends. Hook Echo watches each one and sounds an alarm if a tornado warning covers it, even when the storm is still miles away.</p>
        <p class="empty-text">Want to see how it works first? <a href="#demo">Open the demo replay</a>.</p></div>`;
    } else {
      html += ctx.people.map((p) => placeCard(p, { ...ctx, forecast: ctx.forecasts.get(p.place.id) })).join('') + '</div>';
    }
    html += '<p class="fine" style="padding: 8px 16px 0">Places are saved only on this device.</p>';
    el.innerHTML = html;
  }

  return { render };
}

/** Pins for saved places on the map. */
export function createPlaceMarkers(mapApi, onSelect) {
  const markers = new Map();
  let visible = true;
  return {
    set(people) {
      const keep = new Set(visible ? people.map((p) => p.place.id) : []);
      for (const [id, m] of markers) {
        if (!keep.has(id)) {
          m.remove();
          markers.delete(id);
        }
      }
      if (!visible) return;
      for (const { place, status } of people) {
        let m = markers.get(place.id);
        if (!m) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'place-marker';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onSelect(place.id);
          });
          m = mapApi.marker(el, [place.lon, place.lat], 'center');
          markers.set(place.id, m);
        }
        m.setLngLat([place.lon, place.lat]);
        const el = m.getElement();
        el.dataset.level = status.level;
        el.setAttribute('aria-label', `${place.name}, ${status.level === 'shelter' ? 'take shelter' : status.level}`);
        const html = `<span class="place-pin">${icon(KIND_ICON[place.kind] ?? 'trip')}</span><span class="place-label">${esc(place.name)}</span>`;
        if (el.innerHTML !== html) el.innerHTML = html;
      }
    },
    setVisible(on) {
      visible = on;
    },
  };
}

/**
 * The add/edit dialog. Resolves through onSave/onDelete; never throws.
 * @param {{dialog: HTMLDialogElement, search: Function, reverse: Function, locateOnce: () => Promise<{lat: number, lon: number}>,
 *   pickOnMap: () => Promise<{lat: number, lon: number} | null>, onSave: (place: object) => void, onDelete: (id: string) => void}} deps
 */
export function createPlaceEditor({ dialog, search, reverse, locateOnce, pickOnMap, onSave, onDelete }) {
  let draft = null;
  let searchCtl = null;
  let searchTimer = 0;
  let results = [];

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function render() {
    const editing = Boolean(draft.id && draft.existing);
    const isTrip = draft.kind === 'trip';
    dialog.innerHTML = `<div class="dialog-head"><h2 id="place-title">${editing ? 'Edit place' : isTrip ? 'Add a trip stop' : 'Add a place'}</h2>
        <button class="icon-btn" type="button" data-close aria-label="Close">${icon('close')}</button></div>
      <form class="dialog-body" id="place-form" novalidate>
        <div class="field">
          <label class="field-label" for="place-search">Where</label>
          ${
            draft.lat != null
              ? `<div class="picked">${icon('check')}<span><strong>${esc(draft.detail || draft.name || 'Picked spot')}</strong><br><span class="fine">${draft.lat.toFixed(3)}, ${draft.lon.toFixed(3)}</span></span><button class="btn btn-small btn-ghost" type="button" data-change style="margin-left:auto">Change</button></div>`
              : `<div class="search">${icon('search')}<input class="input" id="place-search" type="search" placeholder="Town, address or school" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="place-results" aria-autocomplete="list"></div>
                 <div class="results" id="place-results" role="listbox" aria-label="Matching places"></div>
                 <div class="detail-actions">
                   <button class="btn btn-small" type="button" data-here>${icon('locate')}Use my current location</button>
                   <button class="btn btn-small" type="button" data-pick>${icon('target')}Pick on the map</button>
                 </div>
                 <p class="field-error" id="where-error" ${draft.whereError ? '' : 'hidden'}>${esc(draft.whereError ?? '')}</p>`
          }
        </div>
        <div class="field">
          <label class="field-label" for="place-name">Name</label>
          <input class="input" id="place-name" maxlength="${MAX_NAME}" value="${esc(draft.name ?? '')}" placeholder="${isTrip ? 'Lincoln High School' : 'Mom’s house'}" ${draft.nameError ? 'aria-invalid="true" aria-describedby="name-error"' : ''}>
          ${draft.nameError ? `<p class="field-error" id="name-error">${esc(draft.nameError)}</p>` : ''}
        </div>
        <div class="field">
          <span class="field-label" id="kind-label">What is this place</span>
          <div class="segmented" role="radiogroup" aria-labelledby="kind-label">
            ${['home', 'family', 'friend', 'trip'].map((k) => `<button type="button" role="radio" data-kind="${k}" aria-checked="${draft.kind === k}">${icon(KIND_ICON[k])}${KIND_LABEL[k].replace(' stop', '')}</button>`).join('')}
          </div>
        </div>
        ${
          isTrip
            ? `<div class="row-2">
                <div class="field"><label class="field-label" for="trip-from">Arrive</label><input class="input" type="date" id="trip-from" value="${esc(draft.from ?? today())}"></div>
                <div class="field"><label class="field-label" for="trip-to">Leave</label><input class="input" type="date" id="trip-to" value="${esc(draft.to ?? draft.from ?? today())}" ${draft.dateError ? 'aria-invalid="true"' : ''}></div>
              </div>${draft.dateError ? `<p class="field-error">${esc(draft.dateError)}</p>` : ''}`
            : ''
        }
      </form>
      <div class="dialog-foot">
        ${editing ? `<button class="btn btn-ghost btn-danger" type="button" data-delete style="margin-right:auto">${icon('trash')}Delete</button>` : ''}
        <button class="btn" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="button" data-save>${editing ? 'Save changes' : 'Save place'}</button>
      </div>`;
  }

  function renderResults(state) {
    const box = dialog.querySelector('#place-results');
    const input = dialog.querySelector('#place-search');
    if (!box || !input) return;
    if (state === 'searching') box.innerHTML = '<p class="results-note">Searching…</p>';
    else if (state === 'error') box.innerHTML = '<p class="results-note">Search isn’t working right now. Use your location or pick a spot on the map instead.</p>';
    else if (state === 'empty') box.innerHTML = `<p class="results-note">No US places match “${esc(input.value.trim())}”. Try a town and state, like Moore, OK.</p>`;
    else if (state === 'clear') box.innerHTML = '';
    else box.innerHTML = results.map((r, i) => `<button class="result" type="button" role="option" id="result-${i}" data-result="${i}" aria-selected="false"><span class="result-name">${esc(r.name)}</span><span class="result-detail">${esc(r.detail)}</span></button>`).join('');
    input.setAttribute('aria-expanded', String(results.length > 0 && state === 'results'));
  }

  function choose(r) {
    draft = { ...draft, lat: r.lat, lon: r.lon, detail: r.detail ? `${r.name}, ${r.detail}` : r.name, name: draft.name || r.name, whereError: null };
    render();
    dialog.querySelector('#place-name')?.focus();
  }

  function readFields() {
    const name = dialog.querySelector('#place-name')?.value ?? draft.name;
    draft = { ...draft, name };
    const from = dialog.querySelector('#trip-from')?.value;
    const to = dialog.querySelector('#trip-to')?.value;
    if (from !== undefined) draft = { ...draft, from, to };
  }

  dialog.addEventListener('input', (e) => {
    if (e.target.id !== 'place-search') return;
    clearTimeout(searchTimer);
    searchCtl?.abort();
    const q = e.target.value.trim();
    if (q.length < 2) {
      results = [];
      renderResults('clear');
      return;
    }
    searchTimer = setTimeout(async () => {
      searchCtl = new AbortController();
      renderResults('searching');
      try {
        results = await search(q, searchCtl.signal);
        renderResults(results.length ? 'results' : 'empty');
      } catch (err) {
        if (err?.code !== 'aborted') renderResults('error');
      }
    }, 300);
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.target.id === 'place-search' && e.key === 'ArrowDown') {
      e.preventDefault();
      dialog.querySelector('[data-result="0"]')?.focus();
    } else if (e.target.closest('.result') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const i = Number(e.target.closest('.result').dataset.result) + (e.key === 'ArrowDown' ? 1 : -1);
      (dialog.querySelector(`[data-result="${i}"]`) ?? dialog.querySelector('#place-search'))?.focus();
    } else if (e.key === 'Enter' && e.target.id === 'place-name') {
      e.preventDefault();
      save();
    }
  });

  dialog.addEventListener('click', async (e) => {
    if (e.target === dialog) return dialog.close();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.close !== undefined) return dialog.close();
    if (b.dataset.result !== undefined) return choose(results[Number(b.dataset.result)]);
    if (b.dataset.kind) {
      readFields();
      draft = { ...draft, kind: b.dataset.kind };
      render();
      return dialog.querySelector(`[data-kind="${b.dataset.kind}"]`)?.focus();
    }
    if (b.dataset.change !== undefined) {
      readFields();
      draft = { ...draft, lat: null, lon: null, detail: '' };
      render();
      return dialog.querySelector('#place-search')?.focus();
    }
    if (b.dataset.here !== undefined) {
      b.classList.add('is-busy');
      try {
        const p = await locateOnce();
        const r = await reverse(p);
        readFields();
        choose({ lat: p.lat, lon: p.lon, name: r.name, detail: r.detail });
      } catch (err) {
        b.classList.remove('is-busy');
        draft = { ...draft, whereError: err?.code === 1 ? 'Location is blocked for this site. Search for the place instead.' : 'Couldn’t find your location. Search for the place instead.' };
        const msg = dialog.querySelector('#where-error');
        if (msg) {
          msg.hidden = false;
          msg.textContent = draft.whereError;
        }
      }
      return;
    }
    if (b.dataset.pick !== undefined) {
      readFields();
      dialog.close();
      const p = await pickOnMap();
      if (!p) return open(draft, { keepDraft: true });
      const r = await reverse(p);
      draft = { ...draft, lat: p.lat, lon: p.lon, detail: r.detail ? (r.name ? `${r.name}, ${r.detail}` : r.detail) : '', name: draft.name || r.name, whereError: null };
      return open(draft, { keepDraft: true });
    }
    if (b.dataset.delete !== undefined) {
      const ok = await confirmAction({ title: `Delete ${draft.name || 'this place'}?`, text: 'Hook Echo will stop watching it. This can’t be undone.', confirmLabel: 'Delete place', danger: true });
      if (ok) {
        onDelete(draft.id);
        dialog.close();
      } else dialog.showModal();
      return;
    }
    if (b.dataset.save !== undefined) save();
  });

  function save() {
    readFields();
    const name = (draft.name ?? '').trim();
    draft = { ...draft, nameError: null, dateError: null, whereError: null };
    if (draft.lat == null) draft.whereError = 'Choose a place from the list, use your location, or pick a spot on the map.';
    if (!name) draft.nameError = 'Give this place a name.';
    if (draft.kind === 'trip' && (!draft.from || (draft.to && draft.to < draft.from))) draft.dateError = 'Choose when you arrive, and a leave date on or after it.';
    if (draft.whereError || draft.nameError || draft.dateError) {
      render();
      return;
    }
    const place = { id: draft.id ?? newPlaceId(), kind: draft.kind, name: name.slice(0, MAX_NAME), lat: draft.lat, lon: draft.lon, detail: draft.detail ?? '' };
    if (draft.kind === 'trip') {
      place.from = draft.from;
      place.to = draft.to || draft.from;
    }
    onSave(place);
    dialog.close();
  }

  function open(place, { kind = 'family', keepDraft = false } = {}) {
    draft = keepDraft ? place : place ? { ...place, existing: true } : { kind, name: '', lat: null, lon: null, detail: '' };
    results = [];
    render();
    if (!dialog.open) dialog.showModal();
    (dialog.querySelector('#place-search') ?? dialog.querySelector('#place-name'))?.focus();
  }

  return { open };
}
