import React, { useSyncExternalStore } from 'react';
import type { RaceReplayCar, ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { RACE_AID, RACE_LAMP, RACE_POSE_CHANNELS, RACE_POSE_CHANNEL_COUNT, sampleRacePose, type RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';
import { getSteerAngleDeg } from '../../../../shared/domain/vehicles/steering.js';
import { GpsMapTelemetryHud } from '../map/display/GpsMapTelemetryHud.js';
import type { RaceClock } from './raceClock.js';
import type { RacePoseCache } from './racePoseCache.js';

const at = (key: typeof RACE_POSE_CHANNELS[number]) => RACE_POSE_CHANNELS.indexOf(key);
const [SPEED, THROTTLE, BRAKE, STEER, GEAR, LAT, LON, IN_PIT, LAMPS, AIDS] =
  (['speedKmh', 'throttle', 'brake', 'steerYaw', 'gear', 'accelLatG', 'accelLonG', 'inPit', 'lamps', 'aids'] as const).map(at);
/** Shown while the car has no pose (garage, recording gap, window loading): every reading reads "--", the bar keeps its height. */
const NO_READING: ReplayTrajectoryPoint = { x: NaN, y: NaN, z: NaN };

/** The followed car's readings at `timeSec`, as the lap view's bar reads a lap sample; null when it has no pose then. */
export function racePosePoint(window: RacePoseWindow | null, slot: number | null, timeSec: number): ReplayTrajectoryPoint | null {
  const car = window && slot !== null ? window.slots.indexOf(slot) : -1;
  const pose = new Float32Array(RACE_POSE_CHANNEL_COUNT);
  if (!window || car < 0 || !sampleRacePose(window, car, timeSec, pose)) return null;
  return {
    x: pose[at('x')], y: pose[at('y')], z: pose[at('z')], speedKmh: pose[SPEED], throttle: pose[THROTTLE], brake: pose[BRAKE],
    // Stored normalized; the lap view's samples carry the wheel angle (as `telemetryPostProcessing` converts it).
    steerYaw: getSteerAngleDeg(pose[STEER]), gear: pose[GEAR], accelLatG: pose[LAT], accelLonG: pose[LON], inPit: pose[IN_PIT] === 1,
    pitLimiter: (pose[LAMPS] & RACE_LAMP.pitLimiter) !== 0, tcActive: (pose[AIDS] & RACE_AID.tcActive) !== 0,
    absActive: (pose[AIDS] & RACE_AID.absActive) !== 0,
  };
}

/** The lap view's telemetry bar for the followed car, on the session clock. */
export const RaceCarHud: React.FC<{ clock: RaceClock; poses: RacePoseCache; followSlot: number | null; car?: RaceReplayCar }> = ({ clock, poses, followSlot, car }) => {
  const { timeSec } = useSyncExternalStore(clock.subscribe, clock.getState);
  const point = racePosePoint(poses.windowAt(timeSec), followSlot, timeSec);
  return <GpsMapTelemetryHud primaryPoint={point ?? NO_READING} primaryLabel={car?.carNumber ? `#${car.carNumber}` : (car?.name ?? 'No car')}
    className="border-t" />;
};
