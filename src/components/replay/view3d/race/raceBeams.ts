import { Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import type { CarLights } from '../../../../../shared/packageContract/index.js';
import { RACE_LAMP, RACE_POSE_CHANNEL_COUNT, RACE_POSE_CHANNELS, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import type { RenderPose } from '../scene/replayPose.js';
import type { SpotCar } from '../night/carSpots.js';

const LAMPS = RACE_POSE_CHANNELS.indexOf('lamps');
const NO_ROTATION = new Quaternion(), UNIT = new Vector3(1, 1, 1);

/** The race's cars whose headlights are on, for their beams (carSpots.ts): every placed car, in view or not, the followed one too. */
export interface RaceBeams {
  /** Starts a draw's placing. */
  begin(): void;
  /** A car placed at `pose`, sample `pose.index` of its window's car `carIndex` giving its lamp bits. */
  place(slot: number, pose: RenderPose, window: RacePoseWindow, carIndex: number): void;
  /** The cars placed with their headlights on and their body's lights read, their frames through `root` (the cars' parent). */
  headlights(root: Object3D, out: SpotCar[]): void;
}

/**
 * The car's frame is its replay pose, the body's model origin (as `SceneShell.placeCar` places it); a car's lights come from its
 * body (`bodyOf`), read the first time its headlights are on: its beams start once the body is there.
 */
export function createRaceBeams(origin: Vector3, bodyOf: (slot: number) => Promise<LoadedBody | null>): RaceBeams {
  const lightsOf = new Map<number, CarLights | 'loading' | null>(), placed: Array<{lights: CarLights; local: Matrix4; car: SpotCar}> = [];
  const position = new Vector3();
  let count = 0;
  const lights = (slot: number) => {
    const known = lightsOf.get(slot);
    if (known !== undefined) return known === 'loading' ? null : known;
    lightsOf.set(slot, 'loading');
    bodyOf(slot).then(body => lightsOf.set(slot, body?.descriptor.lights ?? null), () => lightsOf.set(slot, null));
    return null;
  };
  return {
    begin() { count = 0; },
    place(slot, pose, window, carIndex) {
      if ((window.data[(carIndex * window.count + pose.index) * RACE_POSE_CHANNEL_COUNT + LAMPS] & RACE_LAMP.headlights) === 0) return;
      const own = lights(slot);
      if (!own) return;
      const entry = placed[count] ??= {lights: own, local: new Matrix4(), car: {lights: own, frame: new Matrix4()}};
      entry.lights = own;
      entry.local.compose(position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z), pose.orientation ?? NO_ROTATION, UNIT);
      count++;
    },
    headlights(root, out) {
      root.updateWorldMatrix(true, false);
      for (let i = 0; i < count; i++) {
        const {lights: own, local, car} = placed[i];
        car.lights = own; car.frame.multiplyMatrices(root.matrixWorld, local);
        out.push(car);
      }
    },
  };
}
