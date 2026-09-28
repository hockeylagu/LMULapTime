import { getTrackDefinition } from './serverTrackSync.js';

/**
 * A small SVG path of a layout's centerline for thumbnails (the track ribbon), in a size x size
 * box with the aspect ratio kept and the track centred. The centerline is resampled to `points`
 * points evenly spaced along its length: plenty for a card, a few hundred bytes instead of the
 * ~100 KB geometry file. z grows upwards on the map, as in the replay map.
 */
export function buildTrackOutlinePath(centerline: Array<[number, number]>, size = 100, points = 96): string | null {
  if (centerline.length < 3) return null;
  const cumulative = [0];
  for (let i = 1; i < centerline.length; i++) {
    const [x0, z0] = centerline[i - 1];
    const [x1, z1] = centerline[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(x1 - x0, z1 - z0));
  }
  const total = cumulative[cumulative.length - 1];
  if (!(total > 0)) return null;

  const sampled: Array<[number, number]> = [];
  let segment = 1;
  for (let k = 0; k < points; k++) {
    const target = (total * k) / points;
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment++;
    const span = cumulative[segment] - cumulative[segment - 1];
    const t = span > 0 ? (target - cumulative[segment - 1]) / span : 0;
    const [x0, z0] = centerline[segment - 1];
    const [x1, z1] = centerline[segment];
    sampled.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }

  const xs = sampled.map((p) => p[0]);
  const zs = sampled.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const spanX = Math.max(...xs) - minX;
  const spanZ = Math.max(...zs) - minZ;
  const padding = size * 0.06;
  const scale = (size - 2 * padding) / Math.max(spanX, spanZ, 1e-6);
  const offsetX = (size - spanX * scale) / 2;
  const offsetZ = (size - spanZ * scale) / 2;
  const toSvg = ([x, z]: [number, number]) =>
    `${(offsetX + (x - minX) * scale).toFixed(1)} ${(size - (offsetZ + (z - minZ) * scale)).toFixed(1)}`;
  return `M${sampled.map(toSvg).join('L')}Z`;
}

const outlineCache = new Map<string, string | null>();

/** The thumbnail outline of a layout, or null when its geometry is not known. */
export function getTrackOutlinePath(layoutKey: string): string | null {
  if (!outlineCache.has(layoutKey)) {
    const centerline = getTrackDefinition(layoutKey)?.centerline;
    outlineCache.set(layoutKey, centerline ? buildTrackOutlinePath(centerline) : null);
  }
  return outlineCache.get(layoutKey) ?? null;
}
