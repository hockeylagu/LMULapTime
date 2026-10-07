import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GpsBrakeMarkers } from '../../../../../src/components/replay/map/display/GpsBrakeMarkers.js';
import type { TrackBrakeMarker } from '../../../../../shared/types/trackGeometry.js';

const bounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 100, spanX: 100, spanZ: 100 };

const marker = (id: string, label: string, x: number, stationM: number): TrackBrakeMarker =>
  ({ id, center: [x, 50], label, stationM, side: 'right', normal: [1, 0] });

function renderMarkers(markers: TrackBrakeMarker[], markerScale: number, extra: Partial<React.ComponentProps<typeof GpsBrakeMarkers>> = {}) {
  return render(
    <svg>
      <GpsBrakeMarkers markers={markers} bounds={bounds} viewBoxSize={800} padding={60} markerScale={markerScale} {...extra} />
    </svg>
  );
}

const badgeOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-marker-id="${id}"] g[transform]`) as SVGGElement;
const tickOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-marker-id="${id}"] line`) as SVGLineElement;

describe('GpsBrakeMarkers', () => {
  const markers = [marker('a', '150', 20, 100), marker('b', '100', 60, 400)];

  it('hides badges at full-track zoom while keeping the roadside ticks', () => {
    const { container } = renderMarkers(markers, 0.6);
    expect(badgeOf(container, 'a')).toHaveAttribute('opacity', '0');
    const tick = tickOf(container, 'a');
    expect(tick).toHaveAttribute('stroke-width', '1.6');
    expect(Number(tick.getAttribute('stroke-opacity'))).toBeGreaterThan(0.8);
  });

  it('switches directly between LOD roadside ticks and full boards without intermediate opacity', () => {
    // At or above 0.48: LOD tick lines only, badge hidden
    expect(badgeOf(renderMarkers(markers, 0.48).container, 'a')).toHaveAttribute('opacity', '0');
    // Below 0.48: full board with opacity 1 (no semi-transparent intermediate levels)
    expect(badgeOf(renderMarkers(markers, 0.42).container, 'a')).toHaveAttribute('opacity', '1');
    expect(badgeOf(renderMarkers(markers, 0.2).container, 'a')).toHaveAttribute('opacity', '1');
  });

  it('connects the tick to the badge once the badge is visible', () => {
    const { container } = renderMarkers(markers, 0.2);
    const tick = tickOf(container, 'a');
    expect(tick).toHaveAttribute('stroke-width', '1.2');
    const x1 = Number(tick.getAttribute('x1'));
    const x2 = Number(tick.getAttribute('x2'));
    expect(x2 - x1).toBeGreaterThan(7 * 0.2);
  });

  it('applies the distance, ad and digi filters', () => {
    const mixed = [marker('n', '150', 20, 1), marker('ad', 'BRAND', 40, 2), marker('d', 'DIGI', 60, 3)];
    const ids = (c: HTMLElement) => [...c.querySelectorAll('[data-marker-id]')].map(el => el.getAttribute('data-marker-id'));
    expect(ids(renderMarkers(mixed, 0.2).container)).toEqual(['n', 'ad', 'd']);
    expect(ids(renderMarkers(mixed, 0.2, { showDistance: false }).container)).toEqual(['ad', 'd']);
    expect(ids(renderMarkers(mixed, 0.2, { showAds: false }).container)).toEqual(['n', 'd']);
    expect(ids(renderMarkers(mixed, 0.2, { showDigi: false }).container)).toEqual(['n', 'ad']);
  });

  it('spreads colliding ads over candidate slots and accepts the last slot when every slot is taken', () => {
    const crowd = Array.from({ length: 13 }, (_, i) => marker(`ad${i}`, 'ADS', 50, i));
    const { container } = renderMarkers(crowd, 0.2);
    const positions = crowd.map(m => badgeOf(container, m.id).getAttribute('transform'));
    expect(positions).toHaveLength(13);
    expect(new Set(positions.slice(0, 10)).size).toBeGreaterThan(3);
    // Slots exhausted: the remaining boards all take the same last candidate instead of being dropped.
    expect(positions[11]).toBe(positions[12]);
    expect(positions[12]).not.toBe(positions[0]);
  });
});
