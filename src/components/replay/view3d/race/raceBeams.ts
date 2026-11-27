import { Matrix4, Quaternion, Vector3, type Box3, type Object3D } from 'three';
import type { CarLights } from '../../../../../shared/packageContract/index.js';
import { RACE_LAMP, RACE_POSE_CHANNEL_COUNT, RACE_POSE_CHANNELS, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import type { RenderPose } from '../scene/replayPose.js';
import type { SpotCar } from '../night/carSpots.js';
import { isBraking } from '../car/lampStates.js';

const LAMPS = RACE_POSE_CHANNELS.indexOf('lamps'), BRAKE = RACE_POSE_CHANNELS.indexOf('brake');
const NO_ROTATION = new Quaternion(), UNIT = new Vector3(1, 1, 1);

/** The race's cars whose headlights are on or that brake, for their beams (carSpots.ts): every placed car, in view or not, the followed one too. */
export interface RaceBeams {
  /** Starts a draw's placing. */
  begin(): void;
  /** A car placed at `pose`, sample `pose.index` of its window's car `carIndex` giving its lamp bits and brake. */
  place(slot: number, pose: RenderPose, window: RacePoseWindow, carIndex: number): void;
  /** The cars placed with their headlights on or braking and their body's lights read, their frames through `root` (the cars' parent). */
  headlights(root: Object3D, out: SpotCar[]): void;
}

/**
 * The car's frame is its body as drawn: its replay pose (as `SceneShell.placeCar` places the model), then its body envelope's offset
 * there (`envelopeOf`: the road fit or the wheels' lift of the model drawn, as the lap view's beams take it). A car's lights come
 * from its body (`bodyOf`), read the first time its headlights are on: its beams start once the body is there. `boundsOf`: the car's
 * body bounds in that frame (`RaceField.bounds`), which its own spots leave dark. `lit`: a car's lights were read, so its beams draw
 * on the next placing; a paused view draws again (`RaceScene`), else its beams wait for the replay to move.
 */
export function createRaceBeams(origin: Vector3, bodyOf: (slot: number) => Promise<LoadedBody | null>, boundsOf: (slot: number) => Box3 | null,
  envelopeOf: (slot: number) => Object3D | null, lit: () => void): RaceBeams {
  const lightsOf = new Map<number, CarLights | 'loading' | null>();
  const placed: Array<{slot: number; lights: CarLights; local: Matrix4; headlights: boolean; braking: boolean; box: Box3 | null; car: SpotCar}> = [];
  const position = new Vector3();
  let count = 0;
  const lights = (slot: number) => {
    const known = lightsOf.get(slot);
    if (known !== undefined) return known === 'loading' ? null : known;
    lightsOf.set(slot, 'loading');
    bodyOf(slot).then(body => {
      const read = body?.descriptor.lights ?? null;
      lightsOf.set(slot, read);
      if (read) lit();
    }, () => lightsOf.set(slot, null));
    return null;
  };
  return {
    begin() { count = 0; },
    place(slot, pose, window, carIndex) {
      const sample = (carIndex * window.count + pose.index) * RACE_POSE_CHANNEL_COUNT;
      const headlights = (window.data[sample + LAMPS] & RACE_LAMP.headlights) !== 0, braking = isBraking(window.data[sample + BRAKE]);
      if (!headlights && !braking) return;
      const own = lights(slot);
      if (!own) return;
      const entry = placed[count] ??= {slot, lights: own, local: new Matrix4(), headlights, braking, box: null, car: {lights: own, frame: new Matrix4(), headlights, braking, box: null}};
      entry.slot = slot; entry.lights = own; entry.headlights = headlights; entry.braking = braking; entry.box = boundsOf(slot);
      entry.local.compose(position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z), pose.orientation ?? NO_ROTATION, UNIT);
      count++;
    },
    headlights(root, out) {
      root.updateWorldMatrix(true, false);
      for (let i = 0; i < count; i++) {
        const {slot, lights: own, local, headlights, braking, box, car} = placed[i];
        car.lights = own; car.headlights = headlights; car.braking = braking; car.box = box; car.frame.multiplyMatrices(root.matrixWorld, local);
        // After the frame's placing (`beforeDraw`), so the envelope sits where this frame draws it.
        const envelope = envelopeOf(slot);
        if (envelope) { envelope.updateMatrix(); car.frame.multiply(envelope.matrix); }
        out.push(car);
      }
    },
  };
}
