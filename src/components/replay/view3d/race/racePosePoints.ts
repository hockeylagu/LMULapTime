import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { RACE_LAMP, RACE_POSE_CHANNELS, RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import { getSteerAngleDeg } from '../../../../../shared/domain/vehicles/steering.js';

const at = (name: typeof RACE_POSE_CHANNELS[number]) => RACE_POSE_CHANNELS.indexOf(name);
const STEER = at('steerYaw'), BRAKE = at('brake'), LAMPS = at('lamps'), DEFLECTION = at('deflFL'), SPIN = at('spinFL');

/** A car's samples of a pose window as lap samples (NaN where it has no pose): what the lap view's wheels and lamps read. */
export function windowPoints(window: RacePoseWindow, carIndex: number): ReplayTrajectoryPoint[] {
  const data = window.data;
  return Array.from({length: window.count}, (_, sample) => {
    const base = (carIndex * window.count + sample) * RACE_POSE_CHANNEL_COUNT, lamps = data[base + LAMPS];
    const deflections = [0, 1, 2, 3].map(corner => data[base + DEFLECTION + corner]), spins = [0, 1, 2, 3].map(corner => data[base + SPIN + corner]);
    return {
      x: data[base], y: data[base + 1], z: data[base + 2], rotX: data[base + 3], rotY: data[base + 4], rotZ: data[base + 5],
      speedKmh: data[base + 6], timeSec: window.fromSec + sample / window.hz,
      // The lap view's steering scale (`getSteerAngleDeg`), which the wheel animation converts with the car's calibration.
      steerYaw: Number.isFinite(data[base + STEER]) ? getSteerAngleDeg(data[base + STEER]) : undefined,
      brake: data[base + BRAKE],
      headlights: (lamps & RACE_LAMP.headlights) !== 0, pitLimiter: (lamps & RACE_LAMP.pitLimiter) !== 0, rainLight: (lamps & RACE_LAMP.rainLight) !== 0,
      suspensionDeflections: deflections.every(Number.isFinite) ? deflections as [number, number, number, number] : undefined,
      wheelAngularSpeeds: spins.every(Number.isFinite) ? spins as [number, number, number, number] : undefined,
    };
  });
}
