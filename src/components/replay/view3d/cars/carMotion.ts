import type { Group, Object3D } from 'three';
import { createWheelAnimation, type WheelAnimation } from './wheelAnimation.js';
import { createLampStates, type LampStates } from '../car/lampStates.js';
import { createReadoutStates, type ReadoutStates } from '../car/readoutCanvas.js';
import type { WheelLap } from './wheelMotion.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import type { RenderPose } from '../scene/replayPose.js';

/**
 * A car's wheels, lamps and screen readouts along its track: the lap view's lap, or the race's samples of one pose window. The build and the wheels'
 * road fit (a few hundred ground rays) wait until the car is drawn with them (`wheels`, `lights` read): a race's far cars never
 * build, and the scenery streaming in does not refit a car until it is drawn again.
 */
export interface CarMotion {
  /**
   * Takes the car's track, read from `source` when next built: a no-op for the track it already has (`key`, the lap or the pose
   * window).
   */
  setTrack(key: object, source: () => WheelLap): void;
  readonly wheels: WheelAnimation | null;
  readonly lights: readonly LampStates[];
  /** Moves the wheels and switches the lamps for the pose (the track's sample `pose.index`); builds them first if needed. */
  update(pose: RenderPose): void;
  /** The road under the car changed: its wheels refit to it when next drawn. */
  refreshHeights(): void;
}

/** `car` is a car of `makeCar`; a body without wheel rigs keeps still wheels. */
export function createCarMotion(car: Group, surfaceHeight: SurfaceHeight): CarMotion {
  const envelope = car.getObjectByName('body-envelope');
  /**
   * The body and its rig nodes as built: each new track's wheel animation fits the body and measures each wheel from there (a
   * turned wheel measures another radius).
   */
  const rest = [envelope, ...(envelope ? rigNodes(envelope) : [])].flatMap(node => node ? [{node, position: node.position.clone(), quaternion: node.quaternion.clone()}] : []);
  /** A body without wheel rigs keeps still wheels; a rig the package gets wrong throws (`attachWheelRigs`). */
  const rigged = rest.some(({node}) => node.name.startsWith('wheel_'));
  let key: object | null = null, pending: (() => WheelLap) | null = null, stale = false;
  let wheels: WheelAnimation | null = null, lights: LampStates[] = [], readouts: ReadoutStates | null = null;
  const build = () => {
    if (pending) {
      const lap = pending();
      pending = null; stale = false;
      for (const {node, position, quaternion} of rest) { node.position.copy(position); node.quaternion.copy(quaternion); }
      wheels = rigged ? createWheelAnimation(car, lap, surfaceHeight) : null;
      const lamps = createLampStates(car, lap.points);
      lights = lamps ? [lamps] : [];
      readouts = createReadoutStates(car, lap.points);
    } else if (stale) {
      stale = false;
      wheels?.refreshHeights();
    }
  };
  return {
    setTrack(next, source) {
      if (next === key) return;
      key = next; pending = source;
    },
    get wheels() { build(); return wheels; },
    get lights() { build(); return lights; },
    update(pose) {
      build();
      wheels?.update(pose);
      for (const light of lights) light.update(pose);
      readouts?.update(pose);
    },
    refreshHeights() { stale = true; },
  };
}

function rigNodes(envelope: Object3D): Object3D[] {
  const nodes: Object3D[] = [];
  envelope.traverse(object => { if (/^((wheel|steer|spin)_(fl|fr|rl|rr)|steering_wheel)$/.test(object.name)) nodes.push(object); });
  return nodes;
}
