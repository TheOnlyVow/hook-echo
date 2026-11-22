// The map: our own vector basemap (basemap.js), every overlay from
// layers.js, map images, hover and tap handling, and the slow pulse on
// tornado warnings.

import { installLayers, applyColors, readColors, setData, setGroupVisible, setSelected, RADAR_SLOT, GROUPS } from './layers.js';
import { OMT_SOURCE, GLYPHS, baseLayers, themePaint } from './basemap.js';
import { hatch, reportIcon, arrowHead, crossMark, IMAGE_RATIO } from './patterns.js';
import { RadarLoop } from './radarLoop.js';
import { RISK_COLORS } from './features.js';
import { EXPLAINED_LAYERS } from '../lib/explain.js';
import { prefersReducedMotion, isWide } from '../ui/dom.js';

const ML = globalThis.maplibregl;
const REPORT_TYPES = ['tornado', 'funnel', 'hail', 'wind', 'flood', 'other'];
/** Sources whose areas light up under the pointer. */
const HOVER_SOURCES = { 'warn-fill': 'alerts', 'watch-fill': 'alerts', 'zones-fill': 'alerts', 'mcd-fill': 'mcd' };

/** @typedef {{layer: string, props: object}} MapHit */

/**
 * @param {{container: HTMLElement, theme: 'dark'|'light',
 *   onHover?: (hits: MapHit[] | null, point: {x: number, y: number}) => void,
 *   onTap?: (hits: MapHit[], lngLat: object, point: {x: number, y: number}) => void,
 *   onPick?: (lngLat: object) => void}} opts
 */
export function createMap({ container, theme, onHover = () => {}, onTap = () => {}, onPick = () => {} }) {
  const map = new ML.Map({
    container,
    style: { version: 8, glyphs: GLYPHS, sources: { omt: OMT_SOURCE }, layers: baseLayers(theme) },
    center: [-96.4, 38.6],
    zoom: isWide() ? 3.8 : 2.75,
    minZoom: 1.6,
    maxZoom: 13.5,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    fadeDuration: 0,
    cooperativeGestures: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new ML.AttributionControl({ compact: true, customAttribution: 'Alerts: NWS. Outlooks: SPC. Tropical: NHC. Surveys: NWS DAT.' }), 'bottom-right');

  let colors = null;
  let radar = null;
  let currentTheme = theme;
  let pulseHandle = 0;
  const ready = new Promise((resolve) => {
    map.on('load', () => {
      document.documentElement.dataset.effectiveTheme = theme;
      colors = readColors();
      addImages();
      installLayers(map, colors);
      radar = new RadarLoop(map, { beforeId: RADAR_SLOT, opacity: currentTheme === 'light' ? 0.72 : 0.78 });
      wireInteractions();
      startPulse();
      resolve();
    });
  });

  // Tile failures are expected now and then (a frame not yet built, an offline moment); keep them out of the console.
  map.on('error', (e) => {
    if (e?.sourceId || e?.tile) return;
    console.warn('Map error:', e?.error?.message ?? e);
  });

  function addImages() {
    const ring = currentTheme === 'light' ? '#ffffff' : '#0d1217';
    const put = (id, img) => {
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, img, { pixelRatio: IMAGE_RATIO });
    };
    put('hatch-life', hatch(currentTheme === 'light' ? '#8a0010' : '#ff5a6e'));
    put('hatch-sig', hatch(currentTheme === 'light' ? '#0f1720' : '#e7edf4', 10));
    put('path-arrow', arrowHead(colors['path-line'], colors.casing));
    for (const t of REPORT_TYPES) put(`rp-${t}`, reportIcon(t, colors[`rp-${t}`], ring));
    for (const [risk, color] of Object.entries(RISK_COLORS)) put(`dev-x-${risk}`, crossMark(color, '#161b22'));
  }

  /** Everything explainable under a point, topmost first. `pad` widens the hit area for fingers. */
  function hitsAt(point, pad) {
    const layers = EXPLAINED_LAYERS.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
    const box = [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]];
    return map.queryRenderedFeatures(box, { layers }).map((f) => ({ layer: f.layer.id, props: { ...f.properties, id: f.properties?.id ?? f.id } }));
  }

  function wireInteractions() {
    // Highlight the area under the pointer, explain what is there, and say what a click will do.
    const lit = new Map();
    const light = (hits) => {
      const next = new Map();
      for (const h of hits) {
        const source = HOVER_SOURCES[h.layer];
        if (source && h.props.id != null && !next.has(source)) next.set(source, h.props.id);
      }
      for (const [source, id] of lit) if (next.get(source) !== id) map.setFeatureState({ source, id }, { hover: false });
      for (const [source, id] of next) if (lit.get(source) !== id) map.setFeatureState({ source, id }, { hover: true });
      lit.clear();
      for (const [k, v] of next) lit.set(k, v);
    };
    let queued = null;
    let frame = 0;
    const finePointer = globalThis.matchMedia?.('(hover: hover) and (pointer: fine)');
    map.on('mousemove', (e) => {
      // Touch screens fire a mouse move after each tap; only a real mouse hovers.
      if (e.originalEvent?.sourceCapabilities?.firesTouchEvents || !finePointer?.matches) return;
      queued = e.point;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!queued) return;
        const hits = hitsAt(queued, 4);
        map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
        light(hits);
        onHover(hits.length ? hits : null, queued);
      });
    });
    const leave = () => {
      queued = null;
      light([]);
      map.getCanvas().style.cursor = '';
      onHover(null, null);
    };
    map.on('mouseout', leave);
    map.on('movestart', (e) => e.originalEvent && onHover(null, null));
    map.on('click', (e) => {
      const touch = e.originalEvent?.pointerType === 'touch' || e.originalEvent?.sourceCapabilities?.firesTouchEvents || !finePointer?.matches;
      onTap(hitsAt(e.point, touch ? 12 : 5), e.lngLat, e.point);
    });
    map.on('contextmenu', (e) => onPick(e.lngLat));
    // Long press on touch screens picks a spot too.
    let pressTimer = 0;
    let pressStart = null;
    map.on('touchstart', (e) => {
      if (e.originalEvent.touches.length !== 1) return;
      pressStart = e.point;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => onPick(e.lngLat), 650);
    });
    const cancel = (e) => {
      if (e?.point && pressStart && Math.hypot(e.point.x - pressStart.x, e.point.y - pressStart.y) < 8) return;
      clearTimeout(pressTimer);
    };
    map.on('touchmove', cancel);
    map.on('touchend', () => clearTimeout(pressTimer));
    map.on('touchcancel', () => clearTimeout(pressTimer));
    map.on('movestart', (e) => e.originalEvent && clearTimeout(pressTimer));
  }

  // A slow pulse on tornado warnings and on warned storms' current position.
  function startPulse() {
    cancelAnimationFrame(pulseHandle);
    if (prefersReducedMotion()) return;
    let last = 0;
    const frame = (t) => {
      pulseHandle = requestAnimationFrame(frame);
      if (document.hidden || t - last < 50) return;
      last = t;
      const phase = (Math.sin((t / 2000) * Math.PI * 2) + 1) / 2;
      const ring = (t % 2200) / 2200;
      if (map.getLayer('tor-line')) {
        map.setPaintProperty('tor-line', 'line-width', 3 + phase * 1.6);
        map.setPaintProperty('tor-line', 'line-opacity', 0.65 + phase * 0.35);
      }
      if (map.getLayer('storm-now-ring')) {
        map.setPaintProperty('storm-now-ring', 'circle-radius', 7 + ring * 16);
        map.setPaintProperty('storm-now-ring', 'circle-stroke-opacity', 0.85 * (1 - ring));
      }
    };
    pulseHandle = requestAnimationFrame(frame);
  }

  function setTheme(next) {
    if (next === currentTheme) return;
    currentTheme = next;
    document.documentElement.dataset.effectiveTheme = next;
    ready.then(() => {
      colors = readColors();
      for (const [id, prop, value] of themePaint(next)) if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
      addImages();
      applyColors(map, colors);
      radar.setOpacity(next === 'light' ? 0.72 : 0.78);
    });
  }

  return {
    map,
    ready,
    get radar() {
      return radar;
    },
    get colors() {
      return colors;
    },
    setTheme,
    setData: (id, fc) => ready.then(() => setData(map, id, fc)),
    setGroupVisible: (group, on) => ready.then(() => setGroupVisible(map, group, on)),
    setSelected: (id) => ready.then(() => setSelected(map, id)),
    groups: Object.keys(GROUPS),
    fitBounds(bounds, padding, maxZoom = 9.5) {
      if (!bounds) return;
      map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding, maxZoom, duration: prefersReducedMotion() ? 0 : 900 });
    },
    flyTo(lngLat, zoom, padding) {
      map.easeTo({ center: lngLat, zoom: zoom ?? Math.max(map.getZoom(), 8), padding, duration: prefersReducedMotion() ? 0 : 900 });
    },
    hitsAt,
    set debug({ tiles = false, collisions = false, padding = false }) {
      map.showTileBoundaries = tiles;
      map.showCollisionBoxes = collisions;
      map.showPadding = padding;
    },
    get debug() {
      return { tiles: map.showTileBoundaries, collisions: map.showCollisionBoxes, padding: map.showPadding };
    },
    marker(el, lngLat, anchor = 'center') {
      return new ML.Marker({ element: el, anchor }).setLngLat(lngLat).addTo(map);
    },
  };
}
