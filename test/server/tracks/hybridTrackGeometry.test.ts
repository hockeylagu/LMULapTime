import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface TrackGeometry {
  centerline: Array<[number, number]>;
  leftBoundary: Array<[number, number]>;
  rightBoundary: Array<[number, number]>;
  nominalWidthM: number;
  surfaceProfile: { leftWidthM: Array<number | null>; rightWidthM: Array<number | null> };
}

const layouts = [
  ['monza_curvagrande', 'monza_gp'],
  ['bahrain_outer', 'bahrain_wec'],
  ['bahrain_paddock', 'bahrain_wec'],
  ['fuji_classic', 'fuji_chicane'],
  ['sebring_school', 'sebring_full'],
] as const;

const read = (directory: string, layout: string): TrackGeometry => JSON.parse(
  fs.readFileSync(path.resolve(directory, `${layout}.json`), 'utf8'),
) as TrackGeometry;

const distance = (a: [number, number], b: [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function edgeSteps(geometry: TrackGeometry): number[] {
  return geometry.centerline.map((_, i) => {
    const next = (i + 1) % geometry.centerline.length;
    return Math.max(
      distance(geometry.leftBoundary[i], geometry.leftBoundary[next]),
      distance(geometry.rightBoundary[i], geometry.rightBoundary[next]),
    );
  });
}

function turnAngles(geometry: TrackGeometry): number[] {
  return geometry.centerline.map((point, i) => {
    const previous = geometry.centerline[(i - 1 + geometry.centerline.length) % geometry.centerline.length];
    const next = geometry.centerline[(i + 1) % geometry.centerline.length];
    const incoming = Math.atan2(point[1] - previous[1], point[0] - previous[0]);
    const outgoing = Math.atan2(next[1] - point[1], next[0] - point[0]);
    return Math.abs(Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming))) * 180 / Math.PI;
  });
}

describe('generated hybrid road corridors', () => {
  it.each(layouts)('%s keeps matched, continuous boundaries', (layout, parentLayout) => {
    const geometry = read('public/tracks', layout);
    const parent = read('public/tracks', parentLayout);
    expect(geometry.leftBoundary).toHaveLength(geometry.centerline.length);
    expect(geometry.rightBoundary).toHaveLength(geometry.centerline.length);

    const parentMaxWidth = Math.max(...parent.leftBoundary.map((left, i) => distance(left, parent.rightBoundary[i])));
    const maxWidth = Math.max(parentMaxWidth, geometry.nominalWidthM) + 0.5;
    const maxEdgeStep = Math.max(6, Math.max(...edgeSteps(parent)) * 1.5);
    const widths = geometry.leftBoundary.map((left, i) => distance(left, geometry.rightBoundary[i]));
    // Where an edge is unmeasured (Sebring's airfield) each layout follows its own AI route, so only
    // the measured road is bounded by the parent's widest point.
    const measured = (i: number): boolean =>
      geometry.surfaceProfile.leftWidthM[i] !== null && geometry.surfaceProfile.rightWidthM[i] !== null;
    const measuredWidths = widths.filter((_, i) => measured(i));
    const perpendicularWidths = geometry.centerline.map((_, i) => {
      const previous = geometry.centerline[(i - 1 + geometry.centerline.length) % geometry.centerline.length];
      const next = geometry.centerline[(i + 1) % geometry.centerline.length];
      const left = geometry.leftBoundary[i], right = geometry.rightBoundary[i];
      const dx = next[0] - previous[0], dy = next[1] - previous[1];
      return (dx * (left[1] - right[1]) - dy * (left[0] - right[0])) / Math.hypot(dx, dy);
    });

    expect(Math.min(...widths)).toBeGreaterThan(5);
    expect(Math.min(...perpendicularWidths)).toBeGreaterThan(5);
    expect(Math.max(...measuredWidths)).toBeLessThan(maxWidth);
    expect(Math.max(...edgeSteps(geometry))).toBeLessThan(maxEdgeStep);
    expect(Math.max(...turnAngles(geometry))).toBeLessThan(35);
  });
});
