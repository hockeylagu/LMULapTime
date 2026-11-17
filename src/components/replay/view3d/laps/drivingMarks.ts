import { BufferGeometry, Float32BufferAttribute, type Vector3 } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { CornerSegmentComparison } from '../../../../utils/cornerAnalysis/types.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { sampleStationPose } from '../scene/replayPose.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import type { DisplayTransform } from '../autoExposure.js';
import { makeDataMesh } from './racingLine.js';

export type DrivingMarkKind = 'braking' | 'turnIn' | 'apex' | 'throttle';

/** A point where a lap's driving changes in a corner, in the primary lap's distance frame (the corner analysis's). */
export interface DrivingMark {
  lap: 'primary' | 'baseline';
  kind: DrivingMarkKind;
  distM: number;
}

/** A lap's samples and their distances in the primary lap's frame. */
export interface MarkedLap {
  points: ReplayTrajectoryPoint[];
  distances: number[];
}

/**
 * A corner's driving marks on each lap: brake point, turn-in, slowest point and throttle on (the corner table's). A point a lap
 * lacks (no braking in a corner taken flat) is left out; the comparison lap's only when it is `compared`.
 */
export function cornerDrivingMarks(corner: CornerSegmentComparison, compared: boolean): DrivingMark[] {
  const marks = (lap: DrivingMark['lap'], points: Array<[DrivingMarkKind, number | null | undefined]>): DrivingMark[] =>
    points.flatMap(([kind, distM]) => distM === null || distM === undefined ? [] : [{lap, kind, distM}]);
  return [
    ...marks('primary', [['braking', corner.primaryBrakingDistM], ['turnIn', corner.primaryTurnInDistM], ['apex', corner.minDistM],
      ['throttle', corner.primaryThrottleOnDistM]]),
    ...compared ? marks('baseline', [['braking', corner.baselineBrakingDistM], ['turnIn', corner.baselineTurnInDistM],
      ['apex', corner.baselineMinDistM], ['throttle', corner.baselineThrottleOnDistM]]) : [],
  ];
}

/**
 * Each mark is a stripe across its lap's line, in the lap's colour: wider than the line so it reads as a bar across it, the
 * comparison lap's narrower and on top, as its line is. Both lie above the lines.
 */
export const MARK_STRIPES = {
  primary: {halfWidthM: 1.1, halfDepthM: 0.25, liftM: 0.02, color: TELEMETRY_COLORS.primary},
  baseline: {halfWidthM: 0.7, halfDepthM: 0.15, liftM: 0.025, color: TELEMETRY_COLORS.baseline},
} as const;

/**
 * The stripes where each lap was at its marks, draped on the road. `missing` counts marks with no road resident under them yet
 * (the scenery streams in): draw them again once it has.
 */
export function drivingMarksGeometry(marks: DrivingMark[], laps: {primary: MarkedLap; baseline: MarkedLap | null}, origin: Vector3,
  surfaceHeight: SurfaceHeight): {geometry: BufferGeometry; colors: string[]; missing: number} {
  const positions: number[] = [], indices: number[] = [], colors: string[] = [];
  let missing = 0;
  for (const mark of marks) {
    const lap = laps[mark.lap], pose = lap ? sampleStationPose(lap.points, lap.distances, mark.distM) : null;
    if (!lap || !pose) continue;
    const before = lap.points[Math.max(0, pose.index - 1)], after = lap.points[Math.min(lap.points.length - 1, pose.index + 2)];
    const length = Math.hypot(after.x - before.x, after.z - before.z);
    if (!(length > 0)) continue;
    const dx = (after.x - before.x) / length, dz = (after.z - before.z) / length;
    const {halfWidthM, halfDepthM, liftM, color} = MARK_STRIPES[mark.lap];
    // Behind-left, behind-right, ahead-left, ahead-right: two vertices per colour, as the line ribbons.
    const corners = [[-halfDepthM, halfWidthM], [-halfDepthM, -halfWidthM], [halfDepthM, halfWidthM], [halfDepthM, -halfWidthM]].map(([along, across]) => {
      const x = pose.x + dx * along - dz * across, z = pose.z + dz * along + dx * across;
      const y = surfaceHeight({x, y: pose.y, z});
      return y === null ? null : [x - origin.x, y - origin.y + liftM, z - origin.z];
    });
    if (corners.some(corner => corner === null)) { missing++; continue; }
    const base = positions.length / 3;
    for (const corner of corners) if (corner) positions.push(...corner);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    colors.push(color, color);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  return {geometry, colors, missing};
}

/** The marks as one mesh in the line colours (`makeDataMesh`), drawn over both lines. */
export function makeDrivingMarks(marks: DrivingMark[], laps: {primary: MarkedLap; baseline: MarkedLap | null}, origin: Vector3,
  surfaceHeight: SurfaceHeight, display: () => DisplayTransform) {
  const {geometry, colors, missing} = drivingMarksGeometry(marks, laps, origin, surfaceHeight);  const mesh = makeDataMesh(geometry, colors, display, 4);
  mesh.name = 'driving-marks';
  return {mesh, missing};
}
