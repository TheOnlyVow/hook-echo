// Alarms: the full-screen takeover, a siren made from the 853 Hz + 960 Hz
// emergency attention tones, chimes, vibration and system notifications.
// Browsers only allow sound after the viewer has interacted with the page,
// so unlock() runs on the first tap or key press.

import { esc, icon, announce } from './dom.js';
import { clock, duration } from '../lib/format.js';
import { actionFor, instructionExcerpt, mostSevere, notificationFor } from '../lib/alarmText.js';
import { toast } from './toasts.js';

const SIREN_ON_S = 2;
const SIREN_GAP_S = 0.6;
const SIREN_MAX_MS = 3 * 60_000;
const VIBRATE = [600, 300, 600, 300, 600];
const endOf = (a) => new Date(Math.max(a.expires?.getTime() ?? 0, a.ends?.getTime() ?? 0));
const nameOf = (place) => (place?.kind === 'me' ? 'Where you are' : place?.name ?? '');
const names = (list) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`);

export function createAlarm({ dialog, onShowOnMap, demo = false }) {
  let audio = null;
  let sirenTimer = 0;
  let sirenStop = 0;
  let nodes = [];
  let leadAlertId = null;

  function unlock() {
    try {
      audio ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch {
      audio = null;
    }
    return audio?.state === 'running';
  }
  const unlocked = () => audio?.state === 'running';

  function tone(freqs, start, dur, gain) {
    const g = audio.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.02);
    g.gain.setValueAtTime(gain, start + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, start + dur);
    g.connect(audio.destination);
    nodes.push(g);
    for (const f of freqs) {
      const o = audio.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start(start);
      o.stop(start + dur + 0.05);
      nodes.push(o);
    }
  }

  function startSiren() {
    stopSiren();
    unlock();
    if (!audio) return;
    const burst = () => {
      if (Date.now() > sirenStop) return stopSiren();
      nodes = nodes.slice(-12);
      tone([853, 960], audio.currentTime + 0.03, SIREN_ON_S, 0.32);
      navigator.vibrate?.(VIBRATE);
    };
    sirenStop = Date.now() + SIREN_MAX_MS;
    burst();
    sirenTimer = setInterval(burst, (SIREN_ON_S + SIREN_GAP_S) * 1000);
  }

  function stopSiren() {
    clearInterval(sirenTimer);
    sirenTimer = 0;
    for (const n of nodes) {
      try {
        n.stop?.();
        n.disconnect?.();
      } catch {
        // Already stopped.
      }
    }
    nodes = [];
    navigator.vibrate?.(0);
  }

  function chime() {
    if (!unlock()) return;
    const t = audio.currentTime + 0.03;
    tone([880], t, 0.2, 0.22);
    tone([660], t + 0.24, 0.3, 0.22);
    navigator.vibrate?.([200, 100, 200]);
  }

  async function notify(event) {
    if (globalThis.Notification?.permission !== 'granted') return;
    const n = notificationFor(event);
    const title = `${demo ? 'Demo: ' : ''}${n.title}`;
    const opts = { body: n.body, tag: n.tag, renotify: true, requireInteraction: n.requireInteraction, icon: 'icons/icon-192.png', vibrate: VIBRATE, data: { alertId: event.alert?.id ?? null } };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, opts);
      else new Notification(title, opts);
    } catch {
      // Notifications are a bonus; the on-screen alarm already showed.
    }
  }

  function takeoverHtml(events, { test }) {
    const lead = mostSevere(events);
    const a = lead.alert;
    const key = a.vtec?.key ?? a.id;
    const keyOf = (e) => e.alert?.vtec?.key ?? e.alert?.id;
    const placesHit = [...new Set(events.filter((e) => e.kind === 'alarm' && keyOf(e) === key).map((e) => nameOf(e.place)))];
    const approaching = events.filter((e) => e.kind === 'headsup').map((e) => `${nameOf(e.place)} in about ${e.headsUp.minutes} min`);
    const others = events.filter((e) => keyOf(e) !== key && e.kind === 'alarm');
    const end = endOf(a);
    const kicker = test ? 'Test alarm' : demo ? 'Demo alarm' : 'Hook Echo alarm';
    const body = test
      ? 'This is how a tornado warning alarm looks and sounds. If you can hear the tone, your volume is set. Real alarms also name the warning and the place.'
      : instructionExcerpt(a.instruction) || a.headline || '';
    return `<div class="takeover-inner">
      <div class="takeover-content">
        <p class="takeover-kicker">${icon('alert')}${esc(kicker)}</p>
        <h2 id="takeover-title">${esc(a.event)}</h2>
        <p class="takeover-place">${esc(test ? 'Your places' : names(placesHit))}</p>
        <p class="takeover-action">${esc(actionFor(a))}</p>
        <p class="takeover-time">${test ? 'Test only. No warning is in effect.' : `Until ${esc(clock(end))}, ${esc(duration(Math.max(0, end - Date.now())))} left`}</p>
        <p class="takeover-body" id="takeover-body">${esc(body)}</p>
        ${approaching.length ? `<p class="takeover-more">A tornado could also reach ${esc(approaching.join(', '))}.</p>` : ''}
        ${others.length ? `<p class="takeover-more">Also: ${esc(others.map((e) => `${e.alert.event} for ${nameOf(e.place)}`).join('; '))}</p>` : ''}
        <div class="takeover-buttons">
          <button class="btn btn-primary" type="button" data-silence>Silence alarm</button>
          ${test ? '' : `<button class="btn" type="button" data-map>${icon('target')}Show on map</button>`}
        </div>
      </div>
    </div>`;
  }

  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-silence]')) dialog.close();
    if (e.target.closest('[data-map]')) {
      dialog.close();
      if (leadAlertId) onShowOnMap(leadAlertId);
    }
  });
  dialog.addEventListener('close', stopSiren);

  function showTakeover(events, opts = {}) {
    const lead = mostSevere(events);
    leadAlertId = lead.alert?.id ?? null;
    dialog.innerHTML = takeoverHtml(events, opts);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-silence]').focus();
  }

  /** Fires the events decided by alarmRules (already filtered by settings). */
  function trigger(events) {
    const lead = mostSevere(events);
    if (!lead) return;
    for (const e of events) notify(e);
    const a = lead.alert;
    if (lead.kind === 'alarm') {
      showTakeover(events);
      startSiren();
      announce(`${a.event} for ${nameOf(lead.place)}. ${actionFor(a)}.`);
      return;
    }
    chime();
    if (lead.kind === 'headsup') {
      const h = lead.headsUp;
      toast({
        title: `A tornado could reach ${lead.place?.kind === 'me' ? 'you' : nameOf(lead.place)} in about ${h.minutes} min`,
        text: `Projected from the storm’s motion, around ${clock(h.eta)}. Be ready to take shelter.`,
        tone: 'warning',
        timeout: 0,
        action: a ? { label: 'Show', run: () => onShowOnMap(a.id) } : undefined,
      });
    } else {
      toast({ title: `${a.event} for ${nameOf(lead.place)}`, text: `${actionFor(a)}. Until ${clock(endOf(a))}.`, tone: 'warning', timeout: 15_000, action: { label: 'Show', run: () => onShowOnMap(a.id) } });
    }
  }

  function test() {
    const fake = { event: 'Tornado Warning', instruction: '', headline: '', expires: new Date(Date.now() + 30 * 60_000), tags: [], rank: 90 };
    showTakeover([{ kind: 'alarm', alert: fake, place: { name: 'Your places' } }], { test: true });
    startSiren();
  }

  return { unlock, unlocked, trigger, test, chime };
}
