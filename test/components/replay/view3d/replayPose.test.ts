import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { sampleRenderPose, sampleStationPose } from '../../../../src/components/replay/view3d/replayPose.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';

const points: ReplayTrajectoryPoint[] = [
  {x: 0, y: 4, z: 0, rotY: 0, timeSec: 0}, {x: 10, y: 6, z: 0, rotY: 0.2, timeSec: 0.2},
];
describe('3D render pose sampling', () => {
  it('retains recorded body elevation and zero yaw while interpolating continuous samples', () => {
    expect(sampleRenderPose(points, 0, 0)).toMatchObject({x: 0, y: 4, z: 0, yaw: 0});
    const interpolated = sampleRenderPose(points, 0, 0.5);
    expect(interpolated).toMatchObject({x: 5, y: 5, z: 0});
    expect(interpolated?.yaw).toBeCloseTo(0.1);
  });
  it('uses the shortest yaw arc without inventing a body heading', () => {
    const wrap = [{...points[0], rotY: Math.PI - 0.1}, {...points[1], rotY: -Math.PI + 0.1}];
    expect(sampleRenderPose(wrap, 0, 0.5)?.yaw).toBeCloseTo(Math.PI);
    expect(sampleRenderPose([{...points[0], rotY: undefined}], 0, 0)?.yaw).toBeUndefined();
  });
  it.each([{isTeleport: true}, {timeSec: 10}, {y: NaN}, {x: 1000}, {timeSec: 0}])('does not bridge discontinuities %j', patch => {
    const lap = [{...points[0], rotX: 0.1, rotZ: 0.02}, {...points[1], rotX: -0.2, rotZ: -0.1, ...patch}];
    expect(sampleRenderPose(lap, 0, 0.5)).toEqual(sampleRenderPose(lap, 0, 0));
  });
  it('rejects invalid poses and out-of-coverage baseline stations', () => {
    expect(sampleRenderPose([], 0, 0)).toBeNull();
    expect(sampleRenderPose([{...points[0], y: NaN}], 0, 0)).toBeNull();
    const station = sampleStationPose(points, [100, 110], 105);
    expect(station).toMatchObject({x: 5, y: 5, z: 0});
    expect(station?.yaw).toBeCloseTo(0.1);
    expect(sampleStationPose(points, [100, 110], 99)).toBeNull();
    expect(sampleStationPose(points, [100, 110], 111)).toBeNull();
  });
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('pitches uphill independently of native yaw %s, then reflects the full frame once', yaw => {
    const pose = sampleRenderPose([{...points[0], rotX: 0.1, rotY: yaw, rotZ: 0}], 0, 0)!;
    const nose = new Vector3(0, 0, -1).applyQuaternion(pose.orientation!);
    expect(nose.y).toBeCloseTo(Math.sin(0.1));
    expect(nose.x).toBeCloseTo(-Math.sin(yaw) * Math.cos(0.1));
    expect(-nose.z).toBeCloseTo(Math.cos(yaw) * Math.cos(0.1)); // Same Z reflection as terrain.
  });
  it('preserves downhill attitude and banking, including left-high native roll', () => {
    const pose = sampleRenderPose([{...points[0], rotX: -0.12, rotZ: 0.08}], 0, 0)!;
    expect(new Vector3(0, 0, -1).applyQuaternion(pose.orientation!).y).toBeLessThan(0);
    expect(new Vector3(1, 0, 0).applyQuaternion(pose.orientation!).y).toBeGreaterThan(0);
  });
  it('interpolates body attitude across the yaw seam and retains measured braking heave without adding ride height twice', () => {
    const lap: ReplayTrajectoryPoint[] = [
      {...points[0], y: 4.04, rotX: 0.03, rotY: Math.PI - 0.05, rotZ: 0.04, rideHeight: [40, 40, 60, 60]},
      {...points[1], y: 4, rotX: -0.05, rotY: -Math.PI + 0.05, rotZ: -0.02, rideHeight: [20, 22, 65, 67]},
    ];
    const pose = sampleRenderPose(lap, 0, 0.5)!;
    expect(pose.y).toBeCloseTo(4.02);
    const nose = new Vector3(0, 0, -1).applyQuaternion(pose.orientation!);
    expect(nose.z).toBeGreaterThan(0.99); // No spin through zero heading.
    expect(nose.y).toBeLessThan(0); // Braking dive remains in the recorded attitude.
    expect(pose.orientation!.length()).toBeCloseTo(1);
    expect(sampleStationPose(lap, [0, 10], 5)).toEqual(pose); // Ghost follows its own complete pose.
    expect(lap[0].y).toBe(4.04); expect(lap[0].rideHeight).toEqual([40, 40, 60, 60]);
  });
  it('retains yaw-only recordings, missing channels and non-finite fractions without inventing tilt or heading', () => {
    const pose = sampleRenderPose([{...points[0], rotX: NaN, rotZ: undefined}], 0, NaN)!;
    expect(new Vector3(0, 0, -1).applyQuaternion(pose.orientation!).y).toBe(0);
    expect(sampleRenderPose([{...points[0], rotY: undefined, rotX: 0.2}], 0, 0)?.orientation).toBeUndefined();
    const lap = [{...points[0], rotX: 0.1}, {...points[1], rotX: undefined, rotZ: 0.2}];
    const halfway = sampleRenderPose(lap, 0, 0.5)!;
    expect(new Vector3(0, 0, -1).applyQuaternion(halfway.orientation!).y).toBeCloseTo(Math.sin(0.1));
  });
});
