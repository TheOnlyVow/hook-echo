// Radar loop controls: play/pause, a scrubber over the frames, the frame's
// clock time and age, and the reflectivity legend.

import { icon } from './dom.js';
import { clock, relative } from '../lib/format.js';

const LIVE_MAX_AGE_MS = 15 * 60_000;

export function createTimeline(el, loop) {
  el.innerHTML = `
    <button class="timeline-play" type="button" aria-label="Play radar loop">${icon('play')}</button>
    <div class="timeline-track">
      <input class="timeline-range" id="radar-range" type="range" min="0" max="10" step="1" value="10" aria-label="Radar time" disabled>
      <div class="timeline-scale" aria-hidden="true"></div>
    </div>
    <div class="timeline-time">
      <span class="timeline-clock">--:--</span>
      <span class="timeline-age">Loading radar</span>
    </div>
    <div class="timeline-legend">
      <span>Light</span>
      <span class="dbz-bar" role="img" aria-label="Radar reflectivity scale from 5 dBZ, light rain, to 75 dBZ, large hail"></span>
      <span>Hail</span>
    </div>`;
  const play = el.querySelector('.timeline-play');
  const range = el.querySelector('.timeline-range');
  const scale = el.querySelector('.timeline-scale');
  const clockEl = el.querySelector('.timeline-clock');
  const ageEl = el.querySelector('.timeline-age');
  let unavailable = null;

  play.addEventListener('click', () => loop.toggle());
  range.addEventListener('input', () => {
    loop.pause();
    loop.show(Number(range.value));
  });

  function render(s = loop.state) {
    const n = s.frames.length;
    el.classList.toggle('is-unavailable', !n);
    play.disabled = !n;
    range.disabled = !n;
    play.innerHTML = icon(s.playing ? 'pause' : 'play');
    play.setAttribute('aria-label', s.playing ? 'Pause radar loop' : 'Play radar loop');
    if (!n) {
      clockEl.textContent = '--:--';
      ageEl.textContent = unavailable ?? 'Loading radar';
      ageEl.classList.remove('is-live');
      scale.innerHTML = '';
      return;
    }
    range.max = String(n - 1);
    range.value = String(s.index);
    el.style.setProperty('--frames', n);
    if (scale.childElementCount !== n) scale.innerHTML = '<i></i>'.repeat(n);
    [...scale.children].forEach((tick, k) => {
      tick.classList.toggle('is-loaded', s.loaded[k]);
      tick.classList.toggle('is-current', k === s.index);
    });
    const frame = s.frames[s.index];
    clockEl.textContent = clock(frame.time);
    const age = Date.now() - frame.time.getTime();
    const live = s.live && age < LIVE_MAX_AGE_MS;
    ageEl.textContent = live ? 'Live' : relative(frame.time, new Date());
    ageEl.classList.toggle('is-live', live);
    range.setAttribute('aria-valuetext', `${clock(frame.time)}, ${live ? 'latest' : relative(frame.time, new Date())}`);
  }

  loop.onChange(render);
  setInterval(() => render(), 30_000);

  return {
    /** Shows why radar is missing, e.g. while its feed is failing. */
    setUnavailable(message) {
      unavailable = message || null;
      render();
    },
    setHidden(hidden) {
      el.classList.toggle('is-hidden', hidden);
    },
  };
}
