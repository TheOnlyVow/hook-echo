// Canvas-drawn map images: the hatch used for tornado emergencies and PDS
// warnings, and the storm-report markers (shape is the backup encoding for
// color: triangle, hollow triangle, circle, square, diamond, dot).

const RATIO = 2;

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size * RATIO;
  const g = c.getContext('2d');
  g.scale(RATIO, RATIO);
  return { c, g };
}

const toImage = ({ c, g }) => ({ width: c.width, height: c.height, data: new Uint8Array(g.getImageData(0, 0, c.width, c.height).data.buffer) });

/** Diagonal hatch, tiled by MapLibre's fill-pattern. */
export function hatch(color, size = 14) {
  const k = canvas(size);
  const { g } = k;
  g.strokeStyle = color;
  g.lineWidth = 2.4;
  g.lineCap = 'square';
  for (let i = -size; i <= size * 2; i += size / 2) {
    g.beginPath();
    g.moveTo(i, size);
    g.lineTo(i + size, 0);
    g.stroke();
  }
  return toImage(k);
}

/**
 * One report marker. `ring` is the map-surface color, drawn around the mark
 * so overlapping markers stay separable.
 */
export function reportIcon(type, color, ring, size = 22) {
  const k = canvas(size);
  const { g } = k;
  const m = size / 2;
  const r = size * 0.34;
  g.lineJoin = 'round';
  const path = () => {
    g.beginPath();
    switch (type) {
      case 'tornado':
      case 'funnel':
        g.moveTo(m - r * 1.12, m - r * 0.72);
        g.lineTo(m + r * 1.12, m - r * 0.72);
        g.lineTo(m, m + r * 1.12);
        g.closePath();
        break;
      case 'hail':
        g.arc(m, m, r, 0, Math.PI * 2);
        break;
      case 'wind':
        g.rect(m - r * 0.9, m - r * 0.9, r * 1.8, r * 1.8);
        break;
      case 'flood':
        g.moveTo(m, m - r * 1.15);
        g.lineTo(m + r * 1.05, m);
        g.lineTo(m, m + r * 1.15);
        g.lineTo(m - r * 1.05, m);
        g.closePath();
        break;
      default:
        g.arc(m, m, r * 0.62, 0, Math.PI * 2);
    }
  };
  path();
  g.lineWidth = 4;
  g.strokeStyle = ring;
  g.stroke();
  if (type === 'funnel') {
    g.lineWidth = 2.4;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = ring;
    g.globalAlpha = 0.6;
    g.fill();
    g.globalAlpha = 1;
  } else {
    g.fillStyle = color;
    g.fill();
  }
  return toImage(k);
}

/** Small arrowhead for projected paths, pointing up (rotated by the map). */
export function arrowHead(color, ring, size = 18) {
  const k = canvas(size);
  const { g } = k;
  const m = size / 2;
  g.beginPath();
  g.moveTo(m, 2.5);
  g.lineTo(size - 3.5, size - 3);
  g.lineTo(m, size - 6.5);
  g.lineTo(3.5, size - 3);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = ring;
  g.stroke();
  g.fillStyle = color;
  g.fill();
  return toImage(k);
}

/** The "X" NHC uses for a disturbance it is watching, with a ring so it reads over water and land. */
export function crossMark(color, ring, size = 20) {
  const k = canvas(size);
  const { g } = k;
  const a = 5;
  const b = size - 5;
  const strokes = () => {
    g.beginPath();
    g.moveTo(a, a);
    g.lineTo(b, b);
    g.moveTo(b, a);
    g.lineTo(a, b);
  };
  g.lineCap = 'round';
  strokes();
  g.lineWidth = 6.4;
  g.strokeStyle = ring;
  g.stroke();
  strokes();
  g.lineWidth = 3.2;
  g.strokeStyle = color;
  g.stroke();
  return toImage(k);
}

export const IMAGE_RATIO = RATIO;
