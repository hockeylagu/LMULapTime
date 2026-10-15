import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GpsTrackSurfaceLayers } from '../../../../../src/components/replay/map/scene/GpsTrackSurfaceLayers.js';
import type { TrackMapSurfaces } from '../../../../../shared/types/trackGeometry.js';

describe('GpsTrackSurfaceLayers', () => {
  it('draws raised kerbs in a distinct colour and hides both kerb types together', () => {
    const surfaces: TrackMapSurfaces = { road: [], kerb: [[[[0, 0], [10, 0], [10, 1], [0, 0]]]],
      raisedKerb: [[[[2, 1], [2.3, 1], [2.3, 4], [2, 1]]]], runoff: [] };
    const props = { surfaces, bounds: { minX: 0, minZ: 0, spanX: 10, spanZ: 10 }, viewBoxSize: 100, padding: 10 };
    const { container, rerender } = render(<svg><GpsTrackSurfaceLayers {...props} /></svg>);
    const ordinary = container.querySelector('[data-surface="kerb"]');
    const raised = container.querySelector('[data-surface="raisedKerb"]');
    expect(raised).not.toBeNull();
    expect(raised?.getAttribute('fill')).not.toBe(ordinary?.getAttribute('fill'));
    rerender(<svg><GpsTrackSurfaceLayers {...props} layers={{ road: true, kerb: false, brakeMarkers: false,
      brakeDistance: true, brakeAds: true, brakeDigi: true, pit: false, centerline: false, runoff: false,
      otherRoad: false, apron: false, gravel: false, grass: false, sectors: true, turns: true, startFinish: true }} /></svg>);
    expect(container.querySelector('[data-surface="kerb"]')).toBeNull();
    expect(container.querySelector('[data-surface="raisedKerb"]')).toBeNull();
  });

  it('draws other roads\' kerbs in the kerb colour only while other roads are shown', () => {
    const surfaces: TrackMapSurfaces = { road: [], kerb: [[[[0, 0], [10, 0], [10, 1], [0, 0]]]],
      otherRoadKerb: [[[[0, 5], [3, 5], [3, 6], [0, 5]]]], runoff: [] };
    const props = { surfaces, bounds: { minX: 0, minZ: 0, spanX: 10, spanZ: 10 }, viewBoxSize: 100, padding: 10 };
    const layers = { road: true, kerb: true, brakeMarkers: false, brakeDistance: true, brakeAds: true, brakeDigi: true,
      pit: false, centerline: false, runoff: false, otherRoad: false, apron: false, gravel: false, grass: false,
      sectors: true, turns: true, startFinish: true };
    const { container, rerender } = render(<svg><GpsTrackSurfaceLayers {...props} layers={layers} /></svg>);
    expect(container.querySelector('[data-surface="otherRoadKerb"]')).toBeNull();
    rerender(<svg><GpsTrackSurfaceLayers {...props} layers={{ ...layers, otherRoad: true }} /></svg>);
    const other = container.querySelector('[data-surface="otherRoadKerb"]');
    expect(other?.getAttribute('fill')).toBe(container.querySelector('[data-surface="kerb"]')?.getAttribute('fill'));
    rerender(<svg><GpsTrackSurfaceLayers {...props} layers={{ ...layers, otherRoad: true, kerb: false }} /></svg>);
    expect(container.querySelector('[data-surface="otherRoadKerb"]')).toBeNull();
  });

  it('projects local meters with the same axis orientation as telemetry and preserves holes', () => {
    const surfaces: TrackMapSurfaces = {
      road: [[[[0, 0], [10, 0], [10, 10], [0, 0]], [[2, 2], [3, 2], [3, 3], [2, 2]]]],
      kerb: [], runoff: [],
    };
    const { container } = render(<svg><GpsTrackSurfaceLayers surfaces={surfaces}
      bounds={{ minX: 0, minZ: 0, spanX: 10, spanZ: 10 }} viewBoxSize={100} padding={10} /></svg>);
    const path = container.querySelector('path');
    expect(path?.getAttribute('fill-rule')).toBe('evenodd');
    expect(path?.getAttribute('d')).toContain('M10.000 90.000 L90.000 90.000 L90.000 10.000');
    expect(path?.getAttribute('d')).toContain('Z M26.000 74.000');
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });
});
