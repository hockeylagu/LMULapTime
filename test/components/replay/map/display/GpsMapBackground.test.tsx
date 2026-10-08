import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { GpsMapBackground } from '../../../../../src/components/replay/map/display/GpsMapBackground.js';
import { DEFAULT_MAP_LAYERS } from '../../../../../src/components/replay/map/display/mapLayers.js';
import type { TrackBoundaryGeometry, TrackSurfacePolygon, TrackSurfaceProfile } from '../../../../../shared/types/trackGeometry.js';

const polygon = (offset: number): TrackSurfacePolygon => [[
  [offset, offset], [offset + 10, offset], [offset + 10, offset + 10], [offset, offset],
]];
const column = (value: number) => [value, value, value];
const surfaceProfile = {
  stationM: [0, 30, 60], leftWidthM: column(5), rightWidthM: column(5), elevationM: column(0), gradePct: column(0),
  bankDeg: column(0), leftElevationM: column(0), rightElevationM: column(0), leftKerbWidthM: column(1),
  rightKerbWidthM: column(1), leftKerbHeightM: column(0), rightKerbHeightM: column(0),
  leftKerbType: ['flat', 'flat', 'flat'], rightKerbType: ['flat', 'flat', 'flat'],
} satisfies TrackSurfaceProfile;

const geometry: TrackBoundaryGeometry = {
  layoutKey: 'test_gp', circuitId: 'test', layoutId: 'gp', trackVenue: 'Test', trackCourse: 'GP', lengthM: 100,
  bounds: { minX: 80, maxX: 220, minZ: 180, maxZ: 260, spanX: 140, spanZ: 80 },
  leftBoundary: [[90, 190], [140, 210], [190, 230]], rightBoundary: [[110, 210], [160, 230], [210, 250]],
  centerline: [[100, 200], [150, 220], [200, 240]], geometryRevision: 'geometry-v1', surfaceProfile,
  mapSurfaces: { road: [polygon(100)], kerb: [polygon(110)], runoff: [polygon(120)],
    apron: [polygon(150)], gravel: [polygon(160)], grass: [polygon(170)] },
};

describe('GpsMapBackground legacy surfaces', () => {
  it('draws outer surfaces once and only kerbs inside the kerb clip', () => {
    const layers = { ...DEFAULT_MAP_LAYERS, runoff: true, apron: true, gravel: true, grass: true };
    const { container } = render(<svg><GpsMapBackground geometry={geometry} bounds={geometry.bounds} layers={layers}
      left={[]} right={[]} center={[]} pathD="" /></svg>);
    const drawn = [...container.querySelectorAll('[data-surface]')].map(path => path.getAttribute('data-surface'));
    expect(drawn).toEqual(['grass', 'gravel', 'runoff', 'apron', 'kerb']);
    expect(container.querySelector('[clip-path] [data-surface]')?.getAttribute('data-surface')).toBe('kerb');
  });
});
