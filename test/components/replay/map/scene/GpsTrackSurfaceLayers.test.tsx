import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GpsTrackSurfaceLayers } from '../../../../../src/components/replay/map/scene/GpsTrackSurfaceLayers.js';
import type { TrackMapSurfaces } from '../../../../../src/components/replay/map/useTrackBoundaryGeometry.js';

describe('GpsTrackSurfaceLayers', () => {
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
