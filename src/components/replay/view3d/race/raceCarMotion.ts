import type { Group, Object3D } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { VehicleHandlingCalibration } from '../../../../../shared/types/dataPlugin.js';
import { RACE_LAMP, RACE_POSE_CHANNELS, RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import { getSteerAngleDeg } from '../../../../../shared/domain/formatters.js';
import { createWheelAnimation, type WheelAnimation } from '../wheelAnimation.js';
import { createLampStates, type LampStates } from '../car/lampStates.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';

const at = (name: typeof RACE_POSE_CHANNELS[number]) => RACE_POSE_CHANNELS.indexOf(name);
const STEER = at('steerYaw'), BRAKE = at('brake'), LAMPS = at('lamps'), DEFLECTION = at('deflFL');

/** A car's samples of a pose window as lap samples (NaN where it has no pose): what the lap view's wheels and lamps read. */
export function windowPoints(window: RacePoseWindow, carIndex: number): ReplayTrajectoryPoint[] {
  const data = window.data;
  return Array.from({length: window.count}, (_, sample) => {
    const base = (carIndex * window.count + sample) * RACE_POSE_CHANNEL_COUNT, lamps = data[base + LAMPS];
    const deflections = [0, 1, 2, 3].map(corner => data[base + DEFLECTION + corner]);
    return {
      x: data[base], y: data[base + 1], z: data[base + 2], rotX: data[base + 3], rotY: data[base + 4], rotZ: data[base + 5],
      speedKmh: data[base + 6], timeSec: window.fromSec + sample / window.hz,
      // The lap view's steering scale (`getSteerAngleDeg`), which the wheel animation converts with the car's calibration.
      steerYaw: Number.isFinite(data[base + STEER]) ? getSteerAngleDeg(data[base + STEER]) : undefined,
      brake: data[base + BRAKE],
      headlights: (lamps & RACE_LAMP.headlights) !== 0, pitLimiter: (lamps & RACE_LAMP.pitLimiter) !== 0, rainLight: (lamps & RACE_LAMP.rainLight) !== 0,
      suspensionDeflections: deflections.every(Number.isFinite) ? deflections as [number, number, number, number] : undefined,
    };
  });
}

/**
 * Takes a car out of the renderer's matrix walk, which runs on each of a frame's render passes: its matrices then change only
 * through `updateCarMatrices`, once per frame. As the scenery's chunks (sceneShell.ts), but a car moves.
 */
export function freezeCar(car: Object3D): void {
  car.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
}

/** A frozen car's matrices from its current pose and parts (wheels, steering, body height). */
export function updateCarMatrices(car: Object3D): void {
  car.traverse(object => {
    object.updateMatrix();
    if (object.parent) object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix); else object.matrixWorld.copy(object.matrix);
    object.matrixWorldNeedsUpdate = false;
  });
}

/**
 * A full car model's wheels and lamps on the race clock, rebuilt from its samples of each pose window. The build and the wheels'
 * road fit (a few hundred ground rays) wait until the car is drawn: most of a field is out of view, and the scenery streaming in
 * would otherwise refit every car each time.
 */
export interface RaceCarMotion {
  /** Takes the car's samples of `window` (no-op for the window it already has); built when `wheels` or `lights` is next read. */
  update(window: RacePoseWindow, carIndex: number): void;
  readonly wheels: WheelAnimation | null;
  readonly lights: LampStates[];
  /** The road under the car changed: its wheels refit to it when next read. */
  refreshHeights(): void;
}

export function createRaceCarMotion(car: Group, handling: VehicleHandlingCalibration | undefined, surfaceHeight: SurfaceHeight): RaceCarMotion {
  const envelope = car.getObjectByName('body-envelope')!, restY = envelope.position.y;
  let current: RacePoseWindow | null = null, wheels: WheelAnimation | null = null, lights: LampStates[] = [];
  /** The window still to build from (its car index), and whether the built wheels must refit to the road. */
  let pending: {window: RacePoseWindow; carIndex: number} | null = null, stale = false;
  /** Back to the model as built: the wheel animation fits the body and moves each wheel from there. */
  const reset = () => {
    envelope.position.y = restY;
    envelope.traverse(object => {
      const hub: unknown = object.userData.wheelPivot;
      if (object.name.startsWith('wheel_') && Array.isArray(hub)) object.position.fromArray(hub as number[]);
    });
  };
  const build = () => {
    if (pending) {
      const points = windowPoints(pending.window, pending.carIndex);
      pending = null; stale = false;
      reset();
      // The wheel animation measures the model as built (a frozen car's matrices are only as fresh as its last update).
      if (!car.matrixAutoUpdate) updateCarMatrices(car);
      // A model without wheel rigs keeps still wheels.
      try { wheels = createWheelAnimation(car, {points, handlingCalibration: handling}, surfaceHeight); } catch { wheels = null; }
      const lamps = createLampStates(car, points);
      lights = lamps ? [lamps] : [];
    } else if (stale) {
      stale = false;
      wheels?.refreshHeights();
    }
  };
  return {
    update(window, carIndex) {
      if (window === current) return;
      current = window; pending = {window, carIndex};
    },
    get wheels() { build(); return wheels; },
    get lights() { build(); return lights; },
    refreshHeights() { stale = true; },
  };
}
