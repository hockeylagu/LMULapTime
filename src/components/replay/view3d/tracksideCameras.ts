import { Vector3 } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import { nativeToScene } from './sceneFrame.js';

/** TV-style spots: one every SPACING_M along the lap, set OFFSET_M beside the line and HEIGHT_M up. */
const SPACING_M = 160, OFFSET_M = 18, HEIGHT_M = 6, LEAD_M = 70;

/**
 * Fixed trackside camera positions (scene coordinates) by lap station. Each spot sits ahead of the
 * stretch it covers, to the left of travel, so the car drives towards it and past; the next spot takes
 * over once the car is through. Positions come from the recorded lap, not track furniture.
 */
export function createTracksideCameras(points: ReplayTrajectoryPoint[], distances: number[], origin: Vector3): (stationM: number) => Vector3 | null {
  const spots: Vector3[] = [];
  const total = distances[distances.length - 1] ?? 0;
  for (let at = LEAD_M, i = 1; at < total && i < points.length - 1; at += SPACING_M) {
    while (i < points.length - 2 && distances[i] < at) i++;
    const a = points[i - 1], b = points[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(length > 0)) { spots.push(spots[spots.length - 1] ?? new Vector3()); continue; }
    // Native +X is the car's left when travelling -Z; the left normal of (dx, dz) is (-dz, dx) in native axes.
    const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
    const p = points[i];
    spots.push(new Vector3(...nativeToScene({x: p.x + nx * OFFSET_M, y: p.y + HEIGHT_M, z: p.z + nz * OFFSET_M}, origin)));
  }
  return stationM => spots.length ? spots[Math.min(spots.length - 1, Math.max(0, Math.floor(stationM / SPACING_M)))] : null;
}
