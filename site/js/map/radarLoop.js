// The radar loop: one raster layer per frame, all loaded at opacity 0 so the
// tiles are ready, then shown one at a time with a short crossfade.

import { prefersReducedMotion } from '../ui/dom.js';

const FRAME_MS = 620;
const DWELL_MS = 1700;
const MAX_WAIT_MS = 2500;

export class RadarLoop {
  #map;
  #beforeId;
  #frames = [];
  #index = -1;
  #playing = false;
  #timer = null;
  #opacity;
  #visible = true;
  #loaded = new Set();
  #listeners = new Set();
  #waitStart = 0;

  constructor(map, { beforeId, opacity = 0.78 }) {
    this.#map = map;
    this.#beforeId = beforeId;
    this.#opacity = opacity;
    map.on('sourcedata', (e) => {
      if (e.sourceId?.startsWith('radar-') && map.isSourceLoaded(e.sourceId) && !this.#loaded.has(e.sourceId)) {
        this.#loaded.add(e.sourceId);
        this.#emit();
      }
    });
    // A pan or zoom needs new tiles for every frame.
    map.on('movestart', () => {
      this.#loaded.clear();
      this.#emit();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(this.#timer);
      else if (this.#playing) this.#schedule(FRAME_MS);
    });
  }

  #id(frame) {
    return `radar-${frame.time.getTime()}`;
  }

  /** Replaces the frame list, reusing layers whose tiles have not changed. */
  setFrames(frames) {
    const map = this.#map;
    const wasLive = this.#index < 0 || this.#index === this.#frames.length - 1;
    const keep = new Map(frames.map((f) => [this.#id(f), f]));
    for (const f of this.#frames) {
      const id = this.#id(f);
      const next = keep.get(id);
      if (!next || next.tiles !== f.tiles) this.#remove(id);
    }
    const fade = prefersReducedMotion() ? 0 : 260;
    for (const f of frames) {
      const id = this.#id(f);
      if (map.getSource(id)) continue;
      map.addSource(id, { type: 'raster', tiles: [f.tiles], tileSize: 256, maxzoom: 10, attribution: 'Radar: Iowa Environmental Mesonet, NWS NEXRAD' });
      map.addLayer(
        {
          id,
          type: 'raster',
          source: id,
          layout: { visibility: this.#visible ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: fade, delay: 0 }, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
        },
        this.#beforeId,
      );
    }
    for (const f of frames) map.moveLayer(this.#id(f), this.#beforeId);
    this.#frames = frames;
    this.show(wasLive ? frames.length - 1 : Math.min(Math.max(this.#index - 1, 0), frames.length - 1));
  }

  #remove(id) {
    const map = this.#map;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    this.#loaded.delete(id);
  }

  show(i) {
    if (!this.#frames.length) return;
    const index = Math.max(0, Math.min(this.#frames.length - 1, i));
    this.#frames.forEach((f, k) => {
      const id = this.#id(f);
      if (this.#map.getLayer(id)) this.#map.setPaintProperty(id, 'raster-opacity', k === index ? this.#opacity : 0);
    });
    this.#index = index;
    this.#emit();
  }

  play() {
    if (!this.#frames.length || this.#playing) return;
    this.#playing = true;
    if (this.#index === this.#frames.length - 1) this.show(0);
    this.#schedule(FRAME_MS);
    this.#emit();
  }

  pause() {
    this.#playing = false;
    clearTimeout(this.#timer);
    this.#emit();
  }

  toggle() {
    if (this.#playing) this.pause();
    else this.play();
  }

  /** Jumps to the newest frame and stops. */
  live() {
    this.pause();
    this.show(this.#frames.length - 1);
  }

  setOpacity(x) {
    this.#opacity = x;
    this.show(this.#index);
  }

  setVisible(on) {
    this.#visible = on;
    for (const f of this.#frames) {
      const id = this.#id(f);
      if (this.#map.getLayer(id)) this.#map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
    if (!on) this.pause();
    this.#emit();
  }

  #schedule(ms) {
    clearTimeout(this.#timer);
    if (document.hidden) return;
    this.#timer = setTimeout(() => this.#tick(), ms);
  }

  #tick() {
    if (!this.#playing) return;
    const last = this.#frames.length - 1;
    const next = this.#index >= last ? 0 : this.#index + 1;
    const nextId = this.#id(this.#frames[next]);
    // Wait briefly for tiles so the loop never flashes an empty frame.
    if (!this.#map.isSourceLoaded(nextId) && this.#waitStart === 0) this.#waitStart = performance.now();
    if (!this.#map.isSourceLoaded(nextId) && performance.now() - this.#waitStart < MAX_WAIT_MS) {
      this.#schedule(150);
      return;
    }
    this.#waitStart = 0;
    this.show(next);
    this.#schedule(next === last ? DWELL_MS : FRAME_MS);
  }

  onChange(fn) {
    this.#listeners.add(fn);
    fn(this.state);
    return () => this.#listeners.delete(fn);
  }

  get state() {
    return {
      frames: this.#frames,
      index: this.#index,
      playing: this.#playing,
      visible: this.#visible,
      opacity: this.#opacity,
      loaded: this.#frames.map((f) => this.#loaded.has(this.#id(f))),
      live: this.#frames.length > 0 && this.#index === this.#frames.length - 1,
    };
  }

  #emit() {
    const s = this.state;
    for (const fn of [...this.#listeners]) fn(s);
  }
}
