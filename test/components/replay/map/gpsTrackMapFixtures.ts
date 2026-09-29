import { ReplayTrajectoryPoint } from '../../../../server/core/types.js';

export const mockPoints: ReplayTrajectoryPoint[] = [
  { x: 100, y: 10, z: 200, rotY: 0, speedKmh: 150, throttle: 80, brake: 0, inPit: false, timeSec: 0.0 },
  { x: 150, y: 11, z: 220, rotY: 0.5, speedKmh: 180, throttle: 100, brake: 0, inPit: false, timeSec: 0.5 },
  { x: 200, y: 12, z: 240, rotY: 1.0, speedKmh: 90, throttle: 0, brake: 70, inPit: false, timeSec: 1.0 },
];

export const mockBounds = {
  minX: 100,
  maxX: 200,
  minZ: 200,
  maxZ: 240,
  spanX: 100,
  spanZ: 40,
};

export const mockGeometry = {
  layoutKey: 'monza_gp',
  circuitId: 'monza',
  layoutId: 'gp',
  trackVenue: 'Autodromo Nazionale Monza',
  trackCourse: 'Autodromo Nazionale Monza',
  lengthM: 5787,
  bounds: { minX: 80, maxX: 220, minZ: 180, maxZ: 260, spanX: 140, spanZ: 80 },
  leftBoundary: [
    [90, 190],
    [140, 210],
  ] as Array<[number, number]>,
  rightBoundary: [
    [110, 210],
    [160, 230],
  ] as Array<[number, number]>,
  centerline: [
    [100, 200],
    [150, 220],
    [200, 240],
  ] as Array<[number, number]>,
};
