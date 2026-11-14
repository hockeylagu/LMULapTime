import { Euler, Group, Matrix4, Quaternion, Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';
import type { SceneryLayoutResource } from '../../../../../shared/types/scenes/scenery.js';
import type { RaceReplayCar, ReplayDaylightClock, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { RACE_POSE_CHANNEL_COUNT, sampleRacePose, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import type { NextPose } from '../../race/racePoseCache.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import type { SceneLoadProgress } from '../scene/loadProgress.js';
import type { CameraMode } from '../camera/cameraModes.js';
import { isDriverCamera } from '../camera/driverCameras.js';
import type { RenderPose } from '../scene/replayPose.js';
import { nativeToScene } from '../scene/sceneFrame.js';
import type { SceneContent, SceneShell } from '../scene/sceneShell.js';
import type { CarParts } from '../cars/carParts.js';
import type { CarMotion } from '../cars/carMotion.js';
import { createCarSets } from '../cars/drawnCar.js';
import { windowPoints } from './raceTrack.js';
import { createRaceField } from './raceField.js';
import { createStandInCars } from './standInCars.js';

export interface RaceSceneHandle {
  /**
   * Draws every car at `timeSec` from the pose window holding it (null while it loads: the cars stay where they were). `stationM`
   * is the followed car's track station, which the scenery streams ahead of (around the camera without it).
   */
  time(timeSec: number, window: RacePoseWindow | null, stationM?: number): void;
  /** Follows a car: its body as a full model when given, else a grey stand-in. */
  follow(slot: number | null, body: LoadedBody | null, signal?: AbortSignal): Promise<boolean>;
  mode(mode: CameraMode): void;
  reset(): void;
  center(): void;
  zoom(direction: number): void;
  pan(horizontal: number, vertical: number): void;
  /** Lights the scene by the in-game clock (`SceneShell.setDaylight`: a small move of the sun changes nothing). */
  daylight(clock: ReplayDaylightClock | undefined): void;
  dispose(): void;
}

/** A car drawn as its model: the followed car or another. */
interface FollowedCar {
  slot: number;
  /** The model; null for a car without a body (a grey stand-in draws it). */
  car: Group | null;
  /** Its wheels and lamps, and its part table; null without a model. */
  motion: CarMotion | null;
  parts: CarParts | null;
  cameras: LoadedBody['descriptor']['cameras']['list'];
  /** Once warmed up: its batches each draw only while one of their parts shows. */
  ready(): void;
  dispose(): void;
}

/** A race pose (channel order) as the lap view's render pose: native position and the body's yaw, pitch and roll. */
function renderPose(pose: Float32Array, index: number, fraction: number, orientation: Quaternion, euler: Euler): RenderPose {
  const [x, y, z, rotX, rotY, rotZ] = pose;
  orientation.setFromEuler(euler.set(rotX, rotY, rotZ, 'YXZ'));
  return {x, y, z, yaw: rotY, orientation, index, fraction};
}

/**
 * The race replay's 3D scene: the scene shell with every car of the session on one clock, each its body model. The cameras ride on
 * the followed car, drawn at its full level; the others draw the body's level for their distance from the camera (`extras.lod`).
 * A car is a grey stand-in while its model loads, or for good without a body (`standInCars.ts`). `bodyOf` loads a
 * car's body (null for a car the replay does not name). The followed car out of the replay (in its garage before it drives out)
 * waits where it next appears, facing its way out (`nextPose`), with the cameras on it. The scene is the shared shell's (`shell`, of
 * `layout`), its canvas in `host`; its `dispose` leaves the shell to the next view.
 */
export async function createRaceScene(
  shell: SceneShell, host: HTMLDivElement, layout: SceneryLayoutResource, cars: readonly RaceReplayCar[],
  first: {slot: number | null; body: LoadedBody | null; daylight: ReplayDaylightClock | undefined}, bodyOf: (slot: number) => Promise<LoadedBody | null>,
  nextPose: (slot: number, timeSec: number) => Promise<NextPose | null>,
  onFailure: (message: string) => void, onProgress: (progress: SceneLoadProgress) => void,
): Promise<RaceSceneHandle> {
  shell.attach(host, {onFailure, onProgress});
  // A shell the lap view left keeps the lap's sun: the race's moment lights it (nothing changes on the shell it made).
  shell.setDaylight(first.daylight);
  const {rig, origin} = shell;
  const handlingOf = new Map(cars.map(car => [car.slot, car.handling]));
  const sets = createCarSets(shell.carTemplates, shell.carTextures, layout.shading, shell.surfaceHeight);
  /** The followed car: the own car, a set of one apart from its body's near cars. */
  const buildFollowed = async (slot: number | null, body: LoadedBody | null): Promise<FollowedCar | null> => {
    if (slot === null) return null;
    if (!body) return {slot, car: null, motion: null, parts: null, cameras: [], ready() {}, dispose() {}};
    const set = await sets.build([body], {own: true}), [drawn] = set.cars;
    return {slot, car: drawn.car, motion: drawn.motion, parts: drawn.parts, cameras: body.descriptor.cameras.list, ready: () => set.ready(), dispose: () => set.dispose()};
  };
  const pending = buildFollowed(first.slot, first.body);
  pending.then(() => shell.report({cars: 1}), () => {}); // A failure surfaces below.
  const root = new Group();
  /** Stands in for the reflection probe's car while the followed car has no model: never visible, so the probe stays idle. */
  const noCar = new Group(); noCar.visible = false;
  let followed: FollowedCar | null = null;
  /** A car still loading draws as the grey far model of the first car of its class loaded (of any class until then), nothing before any. */
  const classOf = new Map(cars.map(car => [car.slot, car.carClass ?? '']));
  const standIns = createStandInCars(root, cars.length, object => shell.warm(object));
  /** The other cars, the followed car's included (hidden while followed); `draw` gives them their poses. */
  const field = createRaceField(shell, sets, root, cars, bodyOf, () => draw(), (slot, car) => standIns.offer(classOf.get(slot) ?? '', car));
  // The chase camera looks ahead along the followed car's own samples of the window, and the trackside spots stand along them.
  let points: ReplayTrajectoryPoint[] = [], distances: number[] = [], pointsOf: {window: RacePoseWindow; slot: number} | null = null;
  const rigCar = () => ({primary: followed?.car ?? noCar, cameras: followed?.cameras ?? [], trajectory: {points}, primaryDistances: distances});
  const content = (): SceneContent => ({
    root, reflected: followed?.car ?? noCar,
    beforeDraw(camera: PerspectiveCamera | OrthographicCamera) {
      followed?.parts?.sync();
      field.beforeDraw(camera);
    },
    refreshHeights() { followed?.motion?.refreshHeights(); field.refreshHeights(); },
    dispose() { followed?.dispose(); field.dispose(); standIns.dispose(); disposeObjects(root); },
  });
  const setFollowed = (next: FollowedCar | null) => {
    followed?.dispose(); followed = next;
    if (next?.car) root.add(next.car);
    pointsOf = null; points = []; distances = [];
    rig.setLayer(rigCar());
  };
  try {
    if (shell.started) {
      // The shell already shows the circuit (the lap view left it): the race's cars take its place, the camera placed afresh.
      const firstCar = await pending;
      rig.unplace(); setFollowed(firstCar);
      if (firstCar?.car) { shell.reflectCar(firstCar.car); await shell.warm(firstCar.car); }
      shell.report({shaders: 1});
      if (!shell.isAttached(host)) throw new DOMException('The race view left', 'AbortError');
      shell.show(content());
      firstCar?.ready();
    } else {
      await shell.lit;
      await shell.underView();
      const firstCar = await pending;
      setFollowed(firstCar);
      // Warmed as it will be drawn, by its own reflection (as the lap's car): its programs then link once.
      if (firstCar?.car) { shell.reflectCar(firstCar.car); await shell.warm(firstCar.car); }
      await shell.start(content());
      firstCar?.ready();
    }
  } catch (error) { content().dispose(); throw error; }
  let disposed = false, request = 0, timeSec = 0, window: RacePoseWindow | null = null;
  const pose = new Float32Array(RACE_POSE_CHANNEL_COUNT), matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(1, 1, 1);
  const orientation = new Quaternion(), euler = new Euler(), target = new Vector3();
  /** The followed car's next pose while it has none (asked once per slot and window). */
  let waiting: {slot: number; fromSec: number; next: NextPose | null} | null = null;
  const waitingPose = (slot: number, current: RacePoseWindow): NextPose | null => {
    if (waiting?.slot === slot && waiting.fromSec === current.fromSec) return waiting.next;
    const asked = {slot, fromSec: current.fromSec, next: null as NextPose | null};
    waiting = asked;
    nextPose(slot, timeSec).then(next => { asked.next = next; if (waiting === asked && next) draw(); }, () => {});
    return null;
  };
  const followedPoints = (current: RacePoseWindow, carIndex: number) => {
    if (pointsOf?.window === current && pointsOf.slot === followed?.slot) return;
    pointsOf = {window: current, slot: followed!.slot};
    points = windowPoints(current, carIndex);
    // Metres driven since the window's start; a stretch without a pose (garage, gap) adds nothing.
    let driven = 0, last: ReplayTrajectoryPoint | null = null;
    distances = points.map(point => {
      if (!Number.isFinite(point.x)) return driven;
      if (last) driven += Math.hypot(point.x - last.x, point.z - last.z);
      last = point;
      return driven;
    });
    rig.setLayer(rigCar());
  };
  /**
   * Places the camera, once, while the followed car has no pose (still in its garage box): on its nearest pose in the window,
   * else on the first car on the track. Once placed, the camera holds while the car is away.
   */
  const placeAside = (current: RacePoseWindow) => {
    if (rig.placed) return;
    const sample = Math.round((timeSec - current.fromSec) * current.hz), own = current.slots.indexOf(followed?.slot ?? -1);
    const at = (car: number, index: number) => (car * current.count + index) * RACE_POSE_CHANNEL_COUNT;
    const found = (car: number, index: number) => index >= 0 && index < current.count && Number.isFinite(current.data[at(car, index)]);
    let place: number | null = null;
    for (let step = 0; own >= 0 && step < current.count && place === null; step++) {
      if (found(own, sample + step)) place = at(own, sample + step);
      else if (found(own, sample - step)) place = at(own, sample - step);
    }
    for (let car = 0; car < current.slots.length && place === null; car++) if (found(car, Math.max(0, Math.min(current.count - 1, sample)))) place = at(car, Math.max(0, Math.min(current.count - 1, sample)));
    if (place === null) return;
    pose.set(current.data.subarray(place, place + RACE_POSE_CHANNEL_COUNT));
    const placed = renderPose(pose, 0, 0, orientation, euler);
    rig.follow({target: target.set(...nativeToScene(placed, origin)), yaw: placed.yaw ?? 0, timeSec, stationM: 0, index: 0, fraction: 0});
  };
  const draw = () => {
    if (!window || disposed) return;
    const current = window, places: Array<{slot: number; x: number; z: number}> = [];
    let followedAt: {x: number; z: number} | null = null;
    standIns.begin();
    for (const [ownIndex, slot] of current.slots.entries()) {
      if (!classOf.has(slot)) continue;
      const isFollowed = slot === followed?.slot, model = isFollowed ? followed?.car : null, drawn = isFollowed || field.has(slot);
      let shown = sampleRacePose(current, ownIndex, timeSec, pose), samples = current, carIndex = ownIndex, at = timeSec;
      if (!shown && isFollowed) {
        // Out of the replay: it waits at its next pose, still.
        const next = waitingPose(slot, current);
        if (next && next.timeSec > timeSec) { samples = next.window; carIndex = next.carIndex; at = next.timeSec; shown = sampleRacePose(samples, carIndex, at, pose); }
      }
      // The window sample the pose lies after: the wheels and lamps read the car's samples there.
      const sample = (at - samples.fromSec) * samples.hz, index = Math.max(0, Math.min(Math.floor(sample), samples.count - 2));
      const fraction = Math.max(0, Math.min(1, sample - index));
      if (shown) places.push({slot, x: pose[0], z: pose[2]});
      field.pose(slot, shown && !isFollowed ? renderPose(pose, index, fraction, orientation, euler) : null, samples, carIndex);
      if (model) {
        model.visible = shown;
        if (shown) {
          const motion = followed!.motion;
          motion?.setTrack(samples, () => ({points: windowPoints(samples, carIndex), handlingCalibration: handlingOf.get(slot)}));
          shell.placeCar(model, renderPose(pose, index, fraction, orientation, euler), motion);
        }
      }
      // After its model is placed: the driver cameras sit on the car's body as it is this frame, not as it was the last one.
      if (shown && isFollowed) {
        followedAt = {x: pose[0], z: pose[2]};
        const placed = renderPose(pose, index, fraction, orientation, euler);
        followedPoints(samples, carIndex);
        const stationM = distances[index] + ((distances[index + 1] ?? distances[index]) - distances[index]) * fraction;
        rig.follow({target: target.set(...nativeToScene(placed, origin)), yaw: placed.yaw ?? 0, timeSec, stationM, index, fraction});
      }
      if (!shown || model || (drawn && !isFollowed)) continue;
      renderPose(pose, 0, 0, orientation, euler);
      standIns.place(classOf.get(slot) ?? '', matrix.compose(position.set(pose[0] - origin.x, pose[1] - origin.y, pose[2] - origin.z), orientation, scale));
    }
    standIns.end();
    if (!followedAt) placeAside(current);
    const from = followedAt ?? places[0];
    field.load(from ? places.filter(car => car.slot !== followed?.slot).map(car => ({slot: car.slot, metres: Math.hypot(car.x - from.x, car.z - from.z)})) : []);
    shell.invalidate();
  };
  return {
    time(next, nextWindow, stationM) {
      timeSec = next; shell.station = stationM;
      if (nextWindow) window = nextWindow;
      draw();
    },
    async follow(slot, body, signal) {
      if (disposed || signal?.aborted) return false;
      const ticket = ++request;
      // The car the scene already follows (the view asks again once the scene is ready): rebuilding it would parse, upload and
      // link its whole model again, and drop the programs it holds.
      if (slot === followed?.slot) return true;
      const next = await buildFollowed(slot, body);
      if (disposed || signal?.aborted || ticket !== request) { next?.dispose(); return false; }
      if (next?.car) await shell.warm(next.car);
      if (disposed || signal?.aborted || ticket !== request) { next?.dispose(); return false; }
      // A driver camera needs the car's own cameras: without a model, the chase camera follows its stand-in.
      if (!next?.car && isDriverCamera(rig.mode)) shell.setMode('chase');
      next?.ready(); setFollowed(next); shell.show(content()); draw();
      return true;
    },
    mode(next) {
      if (isDriverCamera(next) && !followed?.car) return;
      if (shell.setMode(next)) shell.invalidate();
    },
    reset: () => rig.reset(),
    center: () => rig.center(),
    zoom: direction => rig.zoom(direction),
    pan: (horizontal, vertical) => rig.pan(horizontal, vertical),
    daylight: clock => shell.setDaylight(clock),
    dispose() {
      disposed = true;
      shell.detach(host); content().dispose();
    },
  };
}

