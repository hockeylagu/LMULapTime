import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { insideClosedLap, placeMarkerBox, placeMarkerNear, tethersCross } from '../../../../../src/components/replay/map/scene/markerPlacement.js';
import { buildRibbonIndex, type MarkerObstacle } from '../../../../../src/components/replay/map/scene/cornerRibbonClearance.js';
import { placeStartFinish } from '../../../../../src/components/replay/map/scene/startFinishPlacement.js';
import { placeBrakeMarkers, showsFullBrakeBoards } from '../../../../../src/components/replay/map/display/placeBrakeMarkers.js';
import { GpsBrakeMarkers } from '../../../../../src/components/replay/map/display/GpsBrakeMarkers.js';
import { GpsStartFinishLine } from '../../../../../src/components/replay/map/scene/GpsStartFinishLine.js';
import { GpsSectorMarkers, placeSectorMarkers } from '../../../../../src/components/replay/map/scene/GpsSectorMarkers.js';
import { GpsSceneMarkers } from '../../../../../src/components/replay/map/scene/GpsSceneMarkers.js';
import { MarkerGuide } from '../../../../../src/components/replay/map/scene/MarkerGuide.js';

function renderedBox(shape: Element): MarkerObstacle {
  const circle = shape.tagName.toLowerCase() === 'circle';
  const number = (name: string) => Number(shape.getAttribute(name));
  let hw = circle ? number('r') : number('width') / 2;
  let hh = circle ? hw : number('height') / 2;
  let x = circle ? number('cx') : number('x') + hw;
  let y = circle ? number('cy') : number('y') + hh;
  for (let parent = shape.parentElement; parent && parent.tagName.toLowerCase() !== 'svg'; parent = parent.parentElement) {
    const transforms = [...(parent.getAttribute('transform') ?? '').matchAll(/(translate|scale)\(([^)]+)\)/g)].reverse();
    for (const transform of transforms) {
      const values = transform[2].trim().split(/[ ,]+/).map(Number);
      if (transform[1] === 'translate') { x += values[0]; y += values[1] ?? 0; }
      else { x *= values[0]; y *= values[1] ?? values[0]; hw *= values[0]; hh *= values[1] ?? values[0]; }
    }
  }
  return { x, y, hw, hh };
}

describe('shared marker placement', () => {
  it('hides a decorative connector through another badge while keeping an unobstructed guide', () => {
    const box = { x: 50, y: 0, hw: 10, hh: 10 };
    const { container, rerender } = render(<svg><MarkerGuide from={{ sx: 0, sy: 0 }} to={{ sx: 100, sy: 0 }}
      badgeCenter={{ sx: 100, sy: 0 }} obstacles={[box]} /></svg>);
    expect(container.querySelector('line')).toBeNull();
    rerender(<svg><MarkerGuide from={{ sx: 0, sy: 20 }} to={{ sx: 100, sy: 20 }}
      badgeCenter={{ sx: 100, sy: 20 }} obstacles={[box]} /></svg>);
    expect(container.querySelector('line')).toBeInTheDocument();
  });
  it('finds an empty interval after hundreds of overlapping obstacle boxes', () => {
    const occupied = Array.from({ length: 300 }, (_, i) => ({ x: i * 4, y: 0, hw: 10, hh: 10 }));
    const box = placeMarkerBox({ anchor: { sx: 0, sy: 0 }, direction: { sx: 1, sy: 0 }, distance: 20 }, 20, 10, 8, occupied);
    expect(box.x - box.hw).toBeGreaterThan(occupied[299].x + occupied[299].hw + 8);
  });

  it('turns a crowded badge beside its anchor instead of pushing it far along the ray', () => {
    // START sits on the turn's preferred side; a row of boards blocks the ray behind it.
    const occupied = [{ x: 30, y: 0, hw: 21, hh: 9.5 }, ...Array.from({ length: 20 }, (_, i) => ({ x: 60 + i * 20, y: 0, hw: 10, hh: 10 }))];
    const ray = { anchor: { sx: 0, sy: 0 }, direction: { sx: 1, sy: 0 }, distance: 32 };
    expect(placeMarkerBox(ray, 14, 14, 14, occupied).x).toBeGreaterThan(400);
    const box = placeMarkerNear(ray, 14, 14, 14, occupied);
    expect(Math.hypot(box.x, box.y)).toBeLessThan(80);
    for (const other of occupied) {
      expect(Math.abs(box.x - other.x) >= box.hw + other.hw || Math.abs(box.y - other.y) >= box.hh + other.hh).toBe(true);
    }
  });

  it('turns a badge whose leader line would cross an existing one', () => {
    const ray = { anchor: { sx: 0, sy: 0 }, direction: { sx: 1, sy: 0 }, distance: 32 };
    const tethers = [{ from: { sx: 16, sy: -30 }, to: { sx: 16, sy: 30 } }];
    const box = placeMarkerNear(ray, 4, 4, 2, [], undefined, tethers);
    expect(tethersCross(ray.anchor, { sx: box.x, sy: box.y }, tethers[0].from, tethers[0].to)).toBe(false);
    expect(Math.hypot(box.x, box.y)).toBeLessThan(40);
  });

  it('tells the circuit infield from the exterior only on a closed lap', () => {
    const lap = Array.from({ length: 40 }, (_, i) => ({ sx: 100 * Math.cos(i / 39 * 2 * Math.PI), sy: 100 * Math.sin(i / 39 * 2 * Math.PI) }));
    expect(insideClosedLap(lap, 0, 0)).toBe(true);
    expect(insideClosedLap(lap, 150, 0)).toBe(false);
    expect(insideClosedLap(lap.slice(0, 20), 0, 0)).toBeNull();
  });

  it('keeps the preferred direction when its spot is free', () => {
    const ray = { anchor: { sx: 0, sy: 0 }, direction: { sx: 1, sy: 0 }, distance: 32 };
    expect(placeMarkerNear(ray, 14, 14, 14, [{ x: 0, y: 80, hw: 20, hh: 20 }])).toEqual({ x: 32, y: 0, hw: 14, hh: 14 });
  });

  it.each([0.6, 1, 4.5, 10])('renders all badge types without pairwise overlap at %sx', zoom => {
    const scale = 1 / zoom;
    const bounds = { minX: 0, minZ: 0, maxX: 200, maxZ: 200, spanX: 200, spanZ: 200 };
    const left = [{ sx: 0, sy: 0 }, { sx: 200, sy: 0 }, { sx: 200, sy: 200 }, { sx: 0, sy: 200 }];
    const right = [{ sx: 50, sy: 50 }, { sx: 150, sy: 50 }, { sx: 150, sy: 150 }, { sx: 50, sy: 150 }];
    const ribbon = buildRibbonIndex(left, right);
    const brakes = placeBrakeMarkers({ markers: Array.from({ length: 13 }, (_, i) => ({ id: `board-${i}`,
      label: i === 0 ? 'DIGI' : i < 4 ? '100' : 'ADS', center: [175, 100] as [number, number], stationM: i,
      side: 'left' as const, normal: [-1, 0] as [number, number] })),
    bounds, viewBoxSize: 200, padding: 0, markerScale: scale, ribbon });
    const boxes = showsFullBrakeBoards(scale) ? brakes.map(board => ({ x: board.posX, y: board.posY,
      hw: (board.width / 2 + 0.7) * scale, hh: (board.height / 2 + 0.7) * scale })) : [];
    const start = placeStartFinish({ svgPoints: [], gateLeftSvg: { sx: 150, sy: 100 }, gateRightSvg: { sx: 200, sy: 100 },
      markerScale: scale, zoomLevel: zoom, obstacles: boxes, ribbon });
    expect(start).not.toBeNull();
    boxes.push(start!.box);
    const sectors = placeSectorMarkers([{ key: 's1', left: { sx: 150, sy: 100 }, right: { sx: 200, sy: 100 } }],
      scale, zoom, boxes, ribbon);
    boxes.push(...sectors.map(marker => ({ x: marker.x, y: marker.y, hw: marker.hw, hh: marker.hh })));
    const { container } = render(<svg>
      <GpsBrakeMarkers placement={brakes} markerScale={scale} startFinishGate={start!.gate} obstacles={boxes} />
      <GpsStartFinishLine svgPoints={[]} markerScale={scale} placement={start} />
      <GpsSectorMarkers markers={sectors} markerScale={scale} />
      <GpsSceneMarkers markerScale={scale} zoomLevel={zoom} ribbon={ribbon} markerObstacles={boxes}
        selectedCornerNumber={7} cornerMarkers={[7, 8, 9].map(cornerNumber => ({ cornerNumber, sx: 210, sy: 100,
          actualSx: 175, actualSy: 100, idx: cornerNumber }))}
        pedalMarkers={['brake', 'throttle'].flatMap(kind => [false, true].map(isBaseline => ({
          kind: kind as 'brake' | 'throttle', isBaseline, sx: 175, sy: 100, cornerNumber: 7, nx: 1, ny: 0 })))} />
    </svg>);
    const shapes = container.querySelectorAll([
      '[data-marker-id] g[opacity="1"] rect', '[data-testid="start-finish-label"] rect',
      '[data-testid^="map-sector-"] g[transform] rect', '[data-testid^="corner-flag-"] > g:last-child > circle',
      '[data-testid^="pedal-marker-"] g circle', '[data-testid^="apex-marker-"] rect',
    ].join(','));
    // Turns stacked on one apex drop out when zoomed out (no room near it); the selected turn always stays.
    expect(shapes.length).toBeGreaterThanOrEqual(zoom >= 4.5 ? 10 : 8);
    expect(container.querySelector('[data-testid="corner-flag-7"]')).toBeInTheDocument();
    const rendered = [...shapes].map(renderedBox);
    for (let i = 0; i < rendered.length; i++) for (let j = i + 1; j < rendered.length; j++) {
      const a = rendered[i], b = rendered[j];
      expect(Math.abs(a.x - b.x) >= a.hw + b.hw || Math.abs(a.y - b.y) >= a.hh + b.hh,
        `badges ${i} and ${j} overlap at ${zoom}x`).toBe(true);
    }
  });
});
