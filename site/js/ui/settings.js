// The settings dialog: alarm sound and test, chimes, heads-ups, phone
// notifications, keeping the screen on, theme, data saver, install, about.

import { esc, icon } from './dom.js';

const sw = (id, key, checked, label, help, disabled = false) => `<div class="switch-row">
  <label for="${id}"><span class="switch-label">${esc(label)}</span><br><span class="switch-help">${esc(help)}</span></label>
  <span class="switch"><input type="checkbox" role="switch" id="${id}" data-setting="${key}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></span>
</div>`;

const seg = (key, value, options, label) => `<div class="segmented" role="radiogroup" aria-label="${esc(label)}">${options
  .map(([v, text]) => `<button type="button" role="radio" data-seg="${key}" data-value="${v}" aria-checked="${value === v}">${esc(text)}</button>`)
  .join('')}</div>`;

export function createSettings({ dialog, getSettings, setSetting, alarm, onOpenSources, getInstall, isStandalone, isDev = () => false, onOpenDev = () => {} }) {
  let note = '';

  function render() {
    const s = getSettings();
    const notifSupported = 'Notification' in globalThis;
    const notifState = notifSupported ? Notification.permission : 'unsupported';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const notifHelp = !notifSupported
      ? isIOS && !isStandalone()
        ? 'On iPhone, add Hook Echo to your Home Screen first, then turn this on.'
        : 'This browser can’t show notifications.'
      : notifState === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser’s site settings.'
        : 'Shows alarms outside the app while Hook Echo is open in the background.';
    const wakeSupported = 'wakeLock' in navigator;
    const install = getInstall();
    dialog.innerHTML = `<div class="dialog-head"><h2 id="settings-title">Settings</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon('close')}</button></div>
      <div class="dialog-body">
        <section class="settings-section">
          <h3>Alarms</h3>
          <div class="switch-row">
            <span><span class="switch-label">Alarm sound</span><br><span class="switch-help">${
              alarm.unlocked() ? 'On. A siren plays when a tornado warning covers one of your places.' : 'Browsers keep sound off until you tap the page. Test the alarm to turn it on.'
            }</span></span>
            <button class="btn btn-small" type="button" data-test>${icon('sound')}Test alarm</button>
          </div>
          ${sw('set-chimes', 'chimes', s.chimes, 'Chime for other warnings', 'Severe thunderstorm and flash flood warnings, and tornado watches, for your places.')}
          ${sw('set-headsup', 'headsUp', s.headsUp, 'Heads-up before a tornado arrives', 'When a warned storm is projected to pass within 5 miles of a place.')}
          ${sw('set-notify', 'notifications', s.notifications && notifState === 'granted', 'Phone notifications', notifHelp, !notifSupported || notifState === 'denied')}
          ${sw('set-awake', 'keepAwake', s.keepAwake && wakeSupported, 'Keep the screen on', wakeSupported ? 'Useful on storm nights, with the phone on a charger.' : 'This browser can’t keep the screen on.', !wakeSupported)}
          ${note ? `<p class="field-error">${esc(note)}</p>` : ''}
          <p class="fine">Hook Echo only alarms while it’s open. Keep Wireless Emergency Alerts on, too: they reach your phone even when it’s locked.</p>
        </section>
        <section class="settings-section">
          <h3>Look</h3>
          ${seg('theme', s.theme, [['system', 'Match device'], ['dark', 'Dark'], ['light', 'Light']], 'Theme')}
        </section>
        <section class="settings-section">
          <h3>Data use</h3>
          ${seg('dataSaver', s.dataSaver, [['auto', 'Automatic'], ['on', 'Save data'], ['off', 'Full speed']], 'Data saver')}
          <p class="switch-help">Saving data refreshes alert areas and the full alert list less often. Tornado and severe warnings always refresh every minute.</p>
        </section>
        ${
          isStandalone()
            ? ''
            : `<section class="settings-section"><h3>Install</h3>
              <p class="switch-help">${install ? 'Install Hook Echo for a full-screen app with its own icon.' : 'In your browser menu, choose Add to Home Screen (or Install app) for a full-screen app with its own icon.'}</p>
              ${install ? `<div><button class="btn" type="button" data-install>${icon('plus')}Install Hook Echo</button></div>` : ''}</section>`
        }
        <section class="settings-section">
          <h3>About</h3>
          <p class="switch-help">Live data from the National Weather Service, the Storm Prediction Center, the National Hurricane Center and the Iowa Environmental Mesonet. Not an official warning source.</p>
          <div class="detail-actions"><button class="btn btn-small" type="button" data-sources>Data sources</button><a class="btn btn-small" href="#demo">Open the demo replay</a></div>
        </section>
        ${
          isDev()
            ? `<section class="settings-section"><h3>Developer</h3>
              <p class="switch-help">Feeds, raw alerts, why each place has its status, map internals, a live log and simulated warnings. On a keyboard, the \` key opens and closes it.</p>
              <div><button class="btn btn-small" type="button" data-dev>Open the developer console</button></div></section>`
            : ''
        }
      </div>
      <div class="dialog-foot"><button class="btn btn-primary" type="button" data-close>Done</button></div>`;
  }

  dialog.addEventListener('click', async (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) return dialog.close();
    if (e.target.closest('[data-test]')) {
      dialog.close();
      alarm.test();
      return;
    }
    if (e.target.closest('[data-sources]')) {
      dialog.close();
      return onOpenSources();
    }
    if (e.target.closest('[data-dev]')) {
      dialog.close();
      return onOpenDev();
    }
    if (e.target.closest('[data-install]')) {
      const p = getInstall();
      await p?.prompt?.();
      return render();
    }
    if (e.target.closest('a[href="#demo"]')) dialog.close();
    const b = e.target.closest('[data-seg]');
    if (b) {
      setSetting(b.dataset.seg, b.dataset.value);
      render();
    }
  });

  dialog.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-setting]');
    if (!input) return;
    note = '';
    const key = input.dataset.setting;
    if (key === 'notifications' && input.checked) {
      const result = await Notification.requestPermission().catch(() => 'denied');
      if (result !== 'granted') {
        note = 'Notifications weren’t allowed, so this stays off.';
        setSetting('notifications', false);
        return render();
      }
    }
    setSetting(key, input.checked);
    render();
  });

  return {
    open() {
      note = '';
      render();
      dialog.showModal();
    },
  };
}
