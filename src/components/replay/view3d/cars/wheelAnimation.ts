import { Quaternion, Vector3, type Group, type Object3D } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { attachWheelRigs, type WheelRig } from './wheelGeometry.js';
import { createSteerAngle, createSteeringWheelAngle, createWheelTravel, type WheelLap } from './wheelMotion.js';
import { isContinuousPose, sampleRenderPose, type RenderPose } from '../scene/replayPose.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';

export interface WheelAnimation { update(pose: RenderPose): void; refreshHeights(): void; description: string }
/** Bounds only the road-contact estimate; measured suspension travel is drawn as recorded. */
const MAX_ESTIMATED_TRAVEL_M = 0.15, MAX_FIT_M = 0.75, FIT_SAMPLES = 200;

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
 * A measured suspension channel: one value per corner, and the hub's rise in metres from the value the display model rests at.
 * Ride height (100 Hz telemetry, mm) falls as the car compresses; the replay's suspension deflection (every car, m) grows.
 */
interface Suspension { label: string; read(point: ReplayTrajectoryPoint, corner: number): number | undefined; rise(rest: number, value: number): number }
const RIDE_HEIGHT: Suspension = {label: 'Ride-height-driven suspension', read: (point, corner) => point.rideHeight?.[corner], rise: (rest, height) => (rest - height) / 1000};
const DEFLECTION: Suspension = {label: 'Recorded suspension', read: (point, corner) => point.suspensionDeflections?.[corner], rise: (rest, deflection) => deflection - rest};

/**
 * The value the display model rests at until the road is resident: the lap's slowest tenth, where aero load barely compresses
 * the car. Without speeds, the median of the lap. The road fit then replaces it per corner.
 */
function restValue(points: ReplayTrajectoryPoint[], corner: number, channel: Suspension): number | undefined {
  const samples = points.flatMap(point => {
    const value = channel.read(point, corner);
    return value !== undefined && Number.isFinite(value) ? [{value, speed: point.speedKmh}] : [];
  });
  if (samples.every(sample => Number.isFinite(sample.speed))) samples.sort((a, b) => a.speed! - b.speed!);
  else return median(samples.map(sample => sample.value));
  return median(samples.slice(0, Math.max(1, Math.ceil(samples.length / 10))).map(sample => sample.value));
}

export function createWheelAnimation(car: Group, lap: WheelLap, surfaceHeight: SurfaceHeight): WheelAnimation {
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
  // The 100 Hz telemetry's ride height where the lap has it, else the replay's own suspension travel (every car), else none:
  // the wheels then follow the road under them.
  const restsFor = (channel: Suspension) => rigs.map(rig => restValue(lap.points, rig.corner, channel));
  const rideRests = restsFor(RIDE_HEIGHT), deflectionRests = restsFor(DEFLECTION);
  const [suspension, rests] = rideRests.some(value => value !== undefined) ? [RIDE_HEIGHT, rideRests]
    : deflectionRests.some(value => value !== undefined) ? [DEFLECTION, deflectionRests] : [null, rideRests];
  /** Each corner's shift from its slowest-tenth rest to its road-fitted rest. */
  const cornerFits = rigs.map(() => 0);
  const rideDisplacement = (a: ReplayTrajectoryPoint, b: ReplayTrajectoryPoint | undefined, fraction: number, corner: number): number | null => {
    const rest = rests[corner], valueA = suspension?.read(a, corner), valueB = b && suspension?.read(b, corner);
    if (!suspension || rest === undefined || valueA === undefined || !Number.isFinite(valueA)) return null;
    const value = valueB !== undefined && Number.isFinite(valueB) ? valueA + (valueB - valueA) * fraction : valueA;
    return suspension.rise(rest, value) + cornerFits[corner];
  };
  const contacts = new Map<number, Array<number | null>>();
  const restY = envelope.position.y;
  let fit: number | undefined;
  /**
   * Fit the display-model origin to the road as the lap median, so downforce and kerbs average out; native body poses stay
   * untouched (a single-pose fit left the tyres sunk or floating elsewhere). With measured travel, each corner's rest is fitted
   * too, as the lap median of what its tyre needs beyond its travel: the setup's ride height and the model's wheel placement
   * are not known otherwise. Refitted as the road streams in.
   */
  const fitToRoad = () => {
    envelope.position.y = restY;
    cornerFits.fill(0);
    contacts.clear();
    const offsets: number[] = [], perCorner = rigs.map((): number[] => []), step = Math.max(1, Math.floor(lap.points.length / FIT_SAMPLES));
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
      if (Math.abs(offset) > MAX_FIT_M) continue;
      offsets.push(offset);
      corners.forEach((value, corner) => perCorner[corner].push(value!));
    }
    fit = median(offsets);
    if (fit === undefined) return;
    envelope.position.y += fit;
    for (const rig of rigs) if (rests[rig.corner] !== undefined) cornerFits[rig.corner] = median(perCorner[rig.corner])! - fit;
  };
  fitToRoad();
  const hasWheelSlip = lap.points.some(point => point.wheelSlip !== undefined);
  const hasSteering = lap.handlingCalibration !== undefined && lap.points.some(point => Number.isFinite(point.steerYaw));
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
    get description() {
      return [`Replay-estimated wheel roll${hasWheelSlip ? ' with measured slip' : ''}`,
        suspension?.label ?? 'Road-contact suspension',
        ...(hasSteering ? [steeringWheel ? 'Recorded steering (wheel and tyres)' : 'Recorded steering'] : []),
        ...(fit !== undefined ? [suspension ? 'Estimated ground and corner fit' : 'Estimated ground fit'] : [])].join(' · ');
    },
    refreshHeights: fitToRoad,
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
        const corner = rig.corner;
        let displacement = rideDisplacement(a, b, pose.fraction, corner);
        const measured = displacement !== null;
        if (displacement === null) {
          const current = contactAt(pose.index, corner);
          displacement = current;
          if (pose.fraction > 0 && isContinuousPose(a, b)) {
            const next = contactAt(pose.index + 1, corner);
            displacement = current !== null && next !== null ? current + (next - current) * pose.fraction : null;
          }
        }
        rig.pivot.position.copy(rig.hub);
        // The road-contact estimate is a bounded visual proxy, not a suspension solver or an airborne ground constraint.
        if (displacement !== null) rig.pivot.position.y += measured ? displacement : Math.max(-MAX_ESTIMATED_TRAVEL_M, Math.min(MAX_ESTIMATED_TRAVEL_M, displacement));
        // Spin about the axle, then steer the fronts; vehicle-local +X is left, so a left (ISO +) steer is -Y.
        rig.spin.rotation.x = -(travel(pose.index, pose.fraction, corner) / rig.radiusM) % (Math.PI * 2);
        rig.steer.rotation.y = corner < 2 ? -steerAngle : 0;
      }
    },
  };
}
