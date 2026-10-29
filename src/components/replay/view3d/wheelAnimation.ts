import { Quaternion, Vector3, type Group } from 'three';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { attachWheelRigs, type WheelRig } from './wheelGeometry.js';
import { createSteerAngle, createWheelTravel } from './wheelMotion.js';
import { sampleRenderPose, type RenderPose } from './replayPose.js';
import type { SurfaceHeight } from './surfaceProjection.js';

export interface WheelAnimation { update(pose: RenderPose): void; description: string }
const MAX_TRAVEL_M = 0.15, MAX_FIT_M = 0.75, FIT_SAMPLES = 200;

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function createWheelAnimation(car: Group, lap: ReplayTrajectoryData, surfaceHeight: SurfaceHeight): WheelAnimation {
  const envelope = car.getObjectByName('body-envelope');
  const rigs = envelope && 'isGroup' in envelope ? attachWheelRigs(envelope as Group) : [];
  if (!envelope || rigs.length !== 4) return {update() {}, description: 'Wheel animation unavailable'};
  const travel = createWheelTravel(lap.points), steer = createSteerAngle(lap);
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
  // Fit only the display-model origin, as the lap median, so downforce and kerbs average out.
  // Native body poses stay untouched; a single-pose fit left the tyres sunk or floating elsewhere.
  const offsets: number[] = [], step = Math.max(1, Math.floor(lap.points.length / FIT_SAMPLES));
  for (let i = 0; i < lap.points.length; i += step) {
    const pose = sampleRenderPose(lap.points, i, 0);
    if (!pose?.orientation) continue;
    const corners = rigs.map(rig => roadTravel(rig, pose, pose.orientation!));
    if (corners.some(value => value === null)) continue;
    const offset = corners.reduce<number>((sum, value) => sum + value!, 0) / 4;
    if (Math.abs(offset) <= MAX_FIT_M) offsets.push(offset);
  }
  const fit = median(offsets);
  if (fit !== undefined) envelope.position.y += fit;
  const referenceRideHeights = rigs.map(rig => median(lap.points.map(point => point.rideHeight?.[rig.corner]).filter((value): value is number => Number.isFinite(value))));
  const hasWheelTelemetry = lap.points.some(point => point.wheelSpeeds?.some(Number.isFinite));
  const hasWheelSlip = lap.points.some(point => point.liveWheelSlip !== undefined);
  const hasRideHeight = referenceRideHeights.some(value => value !== undefined);
  const hasSteering = lap.handlingCalibration !== undefined && lap.points.some(point => Number.isFinite(point.steerYaw));
  return {
    description: [`${hasWheelTelemetry ? 'Telemetry' : 'Replay-estimated'} wheel roll${hasWheelSlip ? ' with measured slip' : ''}`,
      `${hasRideHeight ? 'Ride-height-driven' : 'Road-contact'} suspension`,
      ...(hasSteering ? ['Recorded steering'] : []), ...(fit !== undefined ? ['Estimated ground fit'] : [])].join(' · '),
    update(pose) {
      if (!pose.orientation) return;
      const a = lap.points[pose.index], b = lap.points[pose.index + 1], steerAngle = steer(pose.index, pose.fraction);
      for (const rig of rigs) {
        const corner = rig.corner, reference = referenceRideHeights[corner];
        const heightA = a.rideHeight?.[corner], heightB = b?.rideHeight?.[corner];
        let displacement: number | null = null;
        if (reference !== undefined && heightA !== undefined && Number.isFinite(heightA)) {
          const height = heightB !== undefined && Number.isFinite(heightB) ? heightA + (heightB - heightA) * pose.fraction : heightA;
          displacement = (reference - height) / 1000;
        } else displacement = roadTravel(rig, pose, pose.orientation);
        rig.pivot.position.copy(rig.hub);
        // A bounded visual proxy, not a calibrated suspension solver or an airborne ground constraint.
        if (displacement !== null) rig.pivot.position.y += Math.max(-MAX_TRAVEL_M, Math.min(MAX_TRAVEL_M, displacement));
        // Spin about the axle, then steer the fronts; vehicle-local +X is left, so a left (ISO +) steer is -Y.
        rig.pivot.rotation.set(-(travel(pose.index, pose.fraction, corner) / rig.radiusM) % (Math.PI * 2), corner < 2 ? -steerAngle : 0, 0, 'YXZ');
      }
    },
  };
}
