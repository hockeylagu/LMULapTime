import { Quaternion, Vector3, type Group, type Object3D } from 'three';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';
import { attachWheelRigs, type WheelRig } from './wheelGeometry.js';
import { createSteerAngle, createSteeringWheelAngle, createWheelTravel } from './wheelMotion.js';
import { isContinuousPose, sampleRenderPose, type RenderPose } from './replayPose.js';
import type { SurfaceHeight } from './scenery/sceneryGround.js';

export interface WheelAnimation { update(pose: RenderPose): void; refreshHeights(): void; description: string }
const MAX_TRAVEL_M = 0.15, MAX_FIT_M = 0.75, FIT_SAMPLES = 200;

const vector = (value: unknown): Vector3 | null =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? new Vector3(...(value as number[])) : null;

/**
 * The exporter's `steering_wheel` node rests at the car origin and turns about the descriptor's steering axis (unit) through
 * `steeringWheelPivot`, both in the native car frame.
 */
function steeringWheelRig(envelope: Object3D): {node: Object3D; axis: Vector3; pivot: Vector3} | null {
  const node = envelope.getObjectByName('steering_wheel');
  const axis = vector(node?.userData.steeringWheelAxis), pivot = vector(node?.userData.steeringWheelPivot);
  return node && axis && pivot ? {node, axis: axis.normalize(), pivot} : null;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The ride height the display model rests at: the lap's slowest tenth, where aero load barely compresses the car.
 * Against the lap median it would understate how far the car sinks at speed. Without speeds, the median of the lap.
 */
function staticRideHeight(points: ReplayTrajectoryPoint[], corner: number): number | undefined {
  const samples = points.flatMap(point => Number.isFinite(point.rideHeight?.[corner]) ? [{height: point.rideHeight![corner], speed: point.speedKmh}] : []);
  if (samples.every(sample => Number.isFinite(sample.speed))) samples.sort((a, b) => a.speed! - b.speed!);
  else return median(samples.map(sample => sample.height));
  return median(samples.slice(0, Math.max(1, Math.ceil(samples.length / 10))).map(sample => sample.height));
}

export function createWheelAnimation(car: Group, lap: ReplayTrajectoryData, surfaceHeight: SurfaceHeight): WheelAnimation {
  const envelope = car.getObjectByName('body-envelope');
  if (!envelope || !('isGroup' in envelope)) throw Error('Car has no body envelope');
  const rigs = attachWheelRigs(envelope as Group);
  const travel = createWheelTravel(lap.points), steer = createSteerAngle(lap), steeringWheel = steeringWheelRig(envelope);
  const wheelAngle = createSteeringWheelAngle(lap);
  const hub = new Vector3(), body = new Vector3(), inverse = new Quaternion();
  /** Body-frame hub movement that puts this tyre on the road at the pose; null without road coverage. */
  const roadTravel = (rig: WheelRig, pose: RenderPose, orientation: Quaternion): number | null => {
    body.set(pose.x, pose.y, pose.z);
    hub.copy(rig.hub).add(envelope.position).applyQuaternion(orientation).add(body);
    const ground = surfaceHeight({x: hub.x, y: pose.y, z: hub.z});
    if (ground === null) return null;
    inverse.copy(orientation).invert();
    return hub.set(hub.x, ground + rig.radiusM, hub.z).sub(body).applyQuaternion(inverse).sub(envelope.position).y - rig.hub.y;
  };
  const referenceRideHeights = rigs.map(rig => staticRideHeight(lap.points, rig.corner));
  const rideDisplacement = (a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint | undefined, fraction: number, corner: number): number | null => {
    const reference = referenceRideHeights[corner], heightA = a.rideHeight?.[corner], heightB = b?.rideHeight?.[corner];
    if (reference === undefined || heightA === undefined || !Number.isFinite(heightA)) return null;
    const height = heightB !== undefined && Number.isFinite(heightB) ? heightA + (heightB - heightA) * fraction : heightA;
    return (reference - height) / 1000;
  };
  // Fit only the display-model origin, as the lap median, so downforce and kerbs average out.
  // Native body poses stay untouched; a single-pose fit left the tyres sunk or floating elsewhere.
  const offsets: number[] = [], step = Math.max(1, Math.floor(lap.points.length / FIT_SAMPLES));
  for (let i = 0; i < lap.points.length; i += step) {
    const pose = sampleRenderPose(lap.points, i, 0);
    if (!pose?.orientation) continue;
    // Measured suspension already lifts the hub by its own travel, so the fit only has to cover the rest.
    const corners = rigs.map(rig => {
      const needed = roadTravel(rig, pose, pose.orientation!);
      return needed === null ? null : needed - (rideDisplacement(lap.points[i], undefined, 0, rig.corner) ?? 0);
    });
    if (corners.some(value => value === null)) continue;
    const offset = corners.reduce<number>((sum, value) => sum + value!, 0) / 4;
    if (Math.abs(offset) <= MAX_FIT_M) offsets.push(offset);
  }
  const fit = median(offsets);
  if (fit !== undefined) envelope.position.y += fit;
  const hasWheelSlip = lap.points.some(point => point.wheelSlip !== undefined);
  const hasRideHeight = referenceRideHeights.some(value => value !== undefined);
  const hasSteering = lap.handlingCalibration !== undefined && lap.points.some(point => Number.isFinite(point.steerYaw));
  const contacts = new Map<number, Array<number | null>>();
  const contactAt = (index: number, corner: number): number | null => {
    let cached = contacts.get(index);
    if (!cached) {
      const sample = sampleRenderPose(lap.points, index, 0);
      cached = rigs.map(rig => sample?.orientation ? roadTravel(rig, sample, sample.orientation) : null);
      contacts.set(index, cached);
    }
    return cached[corner];
  };
  return {
    description: [`Replay-estimated wheel roll${hasWheelSlip ? ' with measured slip' : ''}`,
      `${hasRideHeight ? 'Ride-height-driven' : 'Road-contact'} suspension`,
      ...(hasSteering ? [steeringWheel ? 'Recorded steering (wheel and tyres)' : 'Recorded steering'] : []), ...(fit !== undefined ? ['Estimated ground fit'] : [])].join(' · '),
    refreshHeights() {
      for (const [index, cached] of contacts) if (cached.some(value => value === null)) contacts.delete(index);
    },
    update(pose) {
      if (!pose.orientation) return;
      const a = lap.points[pose.index], b = lap.points[pose.index + 1], steerAngle = steer(pose.index, pose.fraction);
      // Native +x is left, so a left (ISO +) turn is a negative rotation about the column axis, as for the road wheels about +Y.
      if (steeringWheel) {
        const {node, axis, pivot} = steeringWheel;
        node.quaternion.setFromAxisAngle(axis, -wheelAngle(pose.index, pose.fraction));
        node.position.copy(pivot).applyQuaternion(node.quaternion).negate().add(pivot);
      }
      for (const rig of rigs) {
        const corner = rig.corner, reference = referenceRideHeights[corner];
        let displacement = rideDisplacement(a, b, pose.fraction, corner);
        if (reference === undefined || displacement === null) {
          const current = contactAt(pose.index, corner);
          displacement = current;
          if (pose.fraction > 0 && isContinuousPose(a, b)) {
            const next = contactAt(pose.index + 1, corner);
            displacement = current !== null && next !== null ? current + (next - current) * pose.fraction : null;
          }
        }
        rig.pivot.position.copy(rig.hub);
        // A bounded visual proxy, not a calibrated suspension solver or an airborne ground constraint.
        if (displacement !== null) rig.pivot.position.y += Math.max(-MAX_TRAVEL_M, Math.min(MAX_TRAVEL_M, displacement));
        // Spin about the axle, then steer the fronts; vehicle-local +X is left, so a left (ISO +) steer is -Y.
        rig.spin.rotation.x = -(travel(pose.index, pose.fraction, corner) / rig.radiusM) % (Math.PI * 2);
        rig.steer.rotation.y = corner < 2 ? -steerAngle : 0;
      }
    },
  };
}
