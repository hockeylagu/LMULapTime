import { Box3, Euler, Group, Matrix4, Quaternion, Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';
import type { SceneryLayoutResource } from '../../../../../shared/types/scenes/scenery.js';
import type { RaceReplayCar, ReplayDaylightClock, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { RACE_POSE_CHANNEL_COUNT, sampleRacePose, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import type { NextPose } from '../../race/racePoseCache.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import type { SceneLoadProgress } from '../scene/loadProgress.js';
import type { CameraMode } from '../camera/cameraModes.js';
import { isDriverCamera } from '../camera/driverCameras.js';
import { nativeToScene, type RenderPose } from '../scene/replayPose.js';
import type { SceneContent, SceneShell } from '../scene/sceneShell.js';
import type { CarParts } from '../cars/carParts.js';
import type { CarMotion } from '../cars/carMotion.js';
import { createCarSets, type Cabin, type CarSets, type DrivenCar } from '../cars/drawnCar.js';
import { windowPoints } from './racePosePoints.js';
import { createRaceField, type RaceField } from './raceField.js';
import { createStandInCars, type StandInCars } from './standInCars.js';
import { carSpans, carsUnder, PICK_BOX, placeOnRoad, type DrawnPlace } from './carPick.js';
import { createReadoutStates, type ReadoutStates } from '../car/readoutCanvas.js';
import { playbackIndexAt, playbackSampleFraction } from '../../inspector/replayPlaybackClock.js';
import type { RaceCockpitLap } from './useRaceCockpitLap.js';

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
  /**
   * The car the frame shows under a point of the canvas (CSS pixels from its top left corner); null for none (`carPick.ts`). A car
   * too small on screen is not picked, nor one hidden there by anything the frame draws in front of it (scenery, another car).
   */
  pick(x: number, y: number): Promise<number | null>;
  /** Lights the scene by the in-game clock (`SceneShell.setDaylight`: a small move of the sun changes nothing). */
  daylight(clock: ReplayDaylightClock | undefined): void;
  /** The followed car's lap its wheel and dash screens read (`useRaceCockpitLap`); null leaves them as last drawn. */
  cockpitLap(lap: RaceCockpitLap | null): void;
  dispose(): void;
}

/** A car drawn as its model: the followed car or another. */
interface FollowedCar {
  slot: number;
  /** The model; null for a car without a body (a grey stand-in draws it). */
  car: Group | null;
  /** Its wheels and lamps, its part table and its cabin's; null without a model. */
  motion: CarMotion | null;
  parts: CarParts | null;
  cabin: Cabin | null;
  /** Its body as the pointer picks it (`DrawnCar.pickShape`); null without a model. */
  pickShape: {box: Box3; parts: Box3[]} | null;
  cameras: LoadedBody['descriptor']['cameras']['list'];
  chaseLodMultiplier: number;
  /** Once warmed up: its batches each draw only while one of their parts shows. */
  ready(): void;
  /** Whether it is the field's full model of the car (`RaceField.lend`), not a car of its own. */
  lent: boolean;
  dispose(): void;
}

/**
 * The race's cars, all but the followed one's own model: the field, the stand-ins and the root they hang from. A race view leaves
 * them on its shell; the next race view of the same session (its overview's cars) takes them, its redraw and body loads in `hooks`.
 */
interface RaceCars {
  cars: readonly RaceReplayCar[];
  sets: CarSets;
  root: Group;
  standIns: StandInCars;
  field: RaceField;
  hooks: {changed: () => void; bodyOf: (slot: number) => Promise<LoadedBody | null>};
}
/**
 * By shell: one race's field at most, freed by the next race of another session, or with the shell (the replay page left, or the
 * circuit changed: its renderer drops the GPU context).
 */
const keptRaceCars = new WeakMap<SceneShell, RaceCars>();

function newRaceCars(shell: SceneShell, layout: SceneryLayoutResource, cars: readonly RaceReplayCar[]): RaceCars {
  const sets = createCarSets(shell.carTemplates, shell.carTextures, layout.shading, shell.surfaceHeight);
  const root = new Group(), hooks: RaceCars['hooks'] = {changed: () => {}, bodyOf: () => Promise.resolve(null)};
  /** A car still loading draws as the grey far model of the first car of its class loaded (of any class until then), nothing before any. */
  const classOf = new Map(cars.map(car => [car.slot, car.carClass ?? '']));
  const standIns = createStandInCars(root, cars.length, object => shell.warm(object));
  /** The other cars, the followed car's included (hidden while followed); the scene's `draw` gives them their poses. */
  const field = createRaceField(shell, sets, root, cars, slot => hooks.bodyOf(slot), () => hooks.changed(), (slot, car) => standIns.offer(classOf.get(slot) ?? '', car));
  return {cars, sets, root, standIns, field, hooks};
}

function disposeRaceCars({root, standIns, field}: RaceCars): void {
  field.dispose(); standIns.dispose(); root.removeFromParent(); disposeObjects(root);
}

/** A race pose (channel order) as the lap view's render pose: native position and the body's yaw, pitch and roll. */
function renderPose(pose: Float32Array, index: number, fraction: number, orientation: Quaternion, euler: Euler): RenderPose {
  const [x, y, z, rotX, rotY, rotZ] = pose;
  orientation.setFromEuler(euler.set(rotX, rotY, rotZ, 'YXZ'));
  return {x, y, z, yaw: rotY, orientation, index, fraction};
}

/**
 * The race replay's 3D scene: the scene shell with every car of the session on one clock, each its body model. The cameras ride on
 * the followed car: the field's full model of it (`RaceField.lend`), drawn at its full level with its cabin; the others draw the
 * body's level for their distance from the camera (`extras.lod`).
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
  // The race's cars a race view of this session left on the shell show again as they were (lap ↔ race): nothing loads twice.
  const kept = keptRaceCars.get(shell);
  keptRaceCars.delete(shell);
  if (kept && kept.cars !== cars) disposeRaceCars(kept);
  const raceCars = kept?.cars === cars ? kept : newRaceCars(shell, layout, cars);
  const {sets, root, standIns, field, hooks} = raceCars;
  /** Stands in for the reflection probe's car while the followed car has no model: never visible, so the probe stays idle. */
  const noCar = new Group(); noCar.visible = false;
  const followedCentre = new Vector3();
  let followed: FollowedCar | null = null;
  const classOf = new Map(cars.map(car => [car.slot, car.carClass ?? '']));
  // The field's models can be ready before the scene draws (the first followed car's): nothing to redraw until `draw` exists.
  let drawing = false;
  hooks.changed = () => { if (drawing) draw(); };
  hooks.bodyOf = bodyOf;
  /** A followed car without a model of its own: a grey stand-in, or the field's model of it while its cabin builds. */
  const bare = (slot: number): FollowedCar => ({slot, car: null, motion: null, parts: null, cabin: null, pickShape: null, cameras: [], chaseLodMultiplier: 1, ready() {}, lent: false, dispose() {}});
  /** A followed car of its own (`DrivenCar`): the lap view's car, or the first followed one; it stays with the shell when let go. */
  const ownFollowed = (slot: number, own: DrivenCar): FollowedCar => {
    root.add(own.drawn.car);
    return {
      slot, car: own.drawn.car, motion: own.drawn.motion, parts: own.drawn.parts, cabin: own.cabin, pickShape: own.drawn.pickShape,
      cameras: own.body.descriptor.cameras.list, chaseLodMultiplier: own.body.descriptor.cameras.chase.lodMultiplier, ready: () => own.show(),
      lent: false, dispose: () => shell.keptCar.keep(own),
    };
  };
  /**
   * The followed car: the field's full model of it (its body's full models built first when they are not), which is already on the
   * GPU, with its cabin added. Without a body, or when its body's full models fail, the field draws it as it draws the others.
   */
  const buildFollowed = async (slot: number | null, body: LoadedBody | null): Promise<FollowedCar | null> => {
    if (slot === null) return null;
    if (!body) return bare(slot);
    const own = shell.keptCar.take(body);
    if (own) return ownFollowed(slot, own);
    const near = field.near(slot), cabin = await sets.cabin(body, near), drawn = await near;
    if (!drawn || !cabin) return bare(slot);
    const built: FollowedCar = {
      slot, car: drawn.car, motion: drawn.motion, parts: drawn.parts, cabin, pickShape: drawn.pickShape, cameras: body.descriptor.cameras.list,
      chaseLodMultiplier: body.descriptor.cameras.chase.lodMultiplier, ready: () => cabin.show(), lent: true,
      // A build dropped as stale leaves the model to the followed car of the same slot, which still draws it.
      dispose: () => { cabin.dispose(); if (followed === built || followed?.slot !== slot) field.reclaim(slot); },
    };
    return built;
  };
  // A shell that already shows the circuit (the lap view left it) shows the race at once, the followed car standing in until the view
  // follows it (`follow`, once the scene is ready); a new shell starts with the followed car built.
  // The first followed car is built on its own, as the lap's car: the lap view takes it as it is.
  const firstOwn = async (slot: number | null, body: LoadedBody | null): Promise<FollowedCar | null> => {
    if (slot === null) return null;
    if (!body) return bare(slot);
    const own = shell.keptCar.take(body) ?? await sets.driven(body);
    return ownFollowed(slot, own);
  };
  const pending = shell.started ? null : firstOwn(first.slot, first.body);
  pending?.then(() => shell.report({cars: 1}), () => {}); // A failure surfaces below.
  // The chase camera looks ahead along the followed car's own samples of the window, and the trackside spots stand along them.
  let points: ReplayTrajectoryPoint[] = [], distances: number[] = [], pointsOf: {window: RacePoseWindow; slot: number} | null = null;
  const rigCar = () => ({primary: followed?.car ?? noCar, cameras: followed?.cameras ?? [], chaseLodMultiplier: followed?.chaseLodMultiplier ?? 1, trajectory: {points}, primaryDistances: distances});
  const content = (): SceneContent => ({
    root, reflected: followed?.car ?? noCar,
    beforeDraw(camera: PerspectiveCamera | OrthographicCamera) {
      followed?.parts?.sync(); followed?.cabin?.parts.sync();
      field.beforeDraw(camera);
    },
    casters() {
      const near = field.casters();
      return followed?.car?.visible ? [...near, followed.car.getWorldPosition(followedCentre)] : near;
    },
    refreshHeights() { followed?.motion?.refreshHeights(); field.refreshHeights(); },
    dispose() {
      followed?.dispose();
      // Kept for the next race view: a load the leaving view cuts off leaves its cars to load again (`createRaceField`).
      hooks.changed = () => {};
      root.removeFromParent(); keptRaceCars.set(shell, raceCars);
    },
  });
  /** The followed car's lap for its screens, and the readouts built on its model from it. */
  let cockpitLap: RaceCockpitLap | null = null, readouts: {lap: RaceCockpitLap; car: Group; states: ReadoutStates | null} | null = null;
  /** Draws the followed car's screens at session time `at` from its lap's samples, as the lap view draws them at its cursor. */
  const drawReadouts = (car: Group, slot: number, placed: RenderPose, at: number) => {
    const lap = cockpitLap;
    if (lap?.slot !== slot) return;
    if (readouts?.lap !== lap || readouts.car !== car) readouts = {lap, car, states: createReadoutStates(car, lap.trajectory.points, lap.trajectory)};
    if (!readouts.states) return;
    const {points, timeReference} = lap.trajectory, lapClock = timeReference === 'lap' ? at - lap.startSec : at;
    const index = playbackIndexAt(points, lapClock);
    readouts.states.update({...placed, index, fraction: playbackSampleFraction(points, {timeSec: lapClock, index})});
  };
  const setFollowed = (next: FollowedCar | null) => {
    followed?.dispose(); followed = next; readouts = null;
    if (next?.lent) field.lend(next.slot);
    pointsOf = null; points = []; distances = [];
    rig.setLayer(rigCar());
  };
  try {
    if (shell.started) {
      // The shell already shows the circuit (the lap view left it): the race's cars take its place, the camera placed afresh on the
      // followed car's stand-in.
      // The lap view's car, when it is the followed one's, shows as it is; another stands in until the view follows it.
      const own = first.slot === null || !first.body ? null : shell.keptCar.take(first.body);
      rig.unplace(); setFollowed(first.slot === null ? null : own ? ownFollowed(first.slot, own) : bare(first.slot));
      shell.report({cars: 1, shaders: 1});
      if (!shell.isAttached(host)) throw new DOMException('The race view left', 'AbortError');
      shell.show(content());
    } else {
      await shell.lit;
      await shell.underView();
      const firstCar = await pending!;
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
  /** Where each car on the track was last drawn: what `pick` looks through. */
  let drawnPlaces: readonly DrawnPlace[] = [];
  /**
   * A car's body bounds in its frame (`DrawnPlace.box` before it is put on the road), and its parts' for the followed model (its full
   * model, drawn large); the field's far model bounds for another car.
   */
  const pickShapeOf = (slot: number): {box: Box3; parts?: Box3[]} | null => {
    if (slot === followed?.slot && followed.pickShape) return followed.pickShape;
    const box = field.bounds(slot);
    return box && {box};
  };
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
    const current = window, places: DrawnPlace[] = [];
    let followedAt: {x: number; z: number} | null = null;
    standIns.begin();
    for (const [ownIndex, slot] of current.slots.entries()) {
      if (!classOf.has(slot)) continue;
      const isFollowed = slot === followed?.slot, model = isFollowed ? followed?.car : null;
      let shown = sampleRacePose(current, ownIndex, timeSec, pose), samples = current, carIndex = ownIndex, at = timeSec;
      if (!shown && isFollowed) {
        // Out of the replay: it waits at its next pose, still.
        const next = waitingPose(slot, current);
        if (next && next.timeSec > timeSec) { samples = next.window; carIndex = next.carIndex; at = next.timeSec; shown = sampleRacePose(samples, carIndex, at, pose); }
      }
      // The window sample the pose lies after: the wheels and lamps read the car's samples there.
      const sample = (at - samples.fromSec) * samples.hz, index = Math.max(0, Math.min(Math.floor(sample), samples.count - 2));
      const fraction = Math.max(0, Math.min(1, sample - index));
      const placed = shown ? renderPose(pose, index, fraction, orientation, euler) : null;
      if (placed) places.push({slot, x: pose[0], y: pose[1], z: pose[2], rotX: pose[3], rotY: pose[4], rotZ: pose[5]});
      // The field draws every car but a followed one with its own model.
      field.pose(slot, placed && !model ? placed : null, samples, carIndex);
      if (model) {
        model.visible = Boolean(placed);
        if (placed) {
          const motion = followed!.motion;
          motion?.setTrack(samples, () => ({points: windowPoints(samples, carIndex), handlingCalibration: handlingOf.get(slot)}));
          shell.placeCar(model, placed, motion);
          drawReadouts(model, slot, placed, at);
        }
      }
      // After its model is placed: the driver cameras sit on the car's body as it is this frame, not as it was the last one.
      if (placed && isFollowed) {
        followedAt = {x: pose[0], z: pose[2]};
        followedPoints(samples, carIndex);
        const stationM = distances[index] + ((distances[index + 1] ?? distances[index]) - distances[index]) * fraction;
        rig.follow({target: target.set(...nativeToScene(placed, origin)), yaw: placed.yaw ?? 0, timeSec, stationM, index, fraction});
      }
      if (!placed || model || field.has(slot)) continue;
      // A stand-in's lowest point is its origin: on the road under the pose (the body's centre, above it).
      const ground = shell.surfaceHeight({x: pose[0], y: pose[1], z: pose[2]}) ?? pose[1];
      standIns.place(classOf.get(slot) ?? '', matrix.compose(position.set(pose[0] - origin.x, ground - origin.y, pose[2] - origin.z), orientation, scale));
    }
    standIns.end();
    drawnPlaces = places;
    if (!followedAt) placeAside(current);
    const from = followedAt ?? places[0];
    field.load(from ? places.filter(car => car.slot !== followed?.slot).map(car => ({slot: car.slot, metres: Math.hypot(car.x - from.x, car.z - from.z)})) : []);
    shell.invalidate();
  };
  drawing = true;
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
      if (slot === followed?.slot && (followed.car || !body)) return true;
      // The camera goes to the car at once, the field drawing it until its own model is ready (2 to 4 s to build, compile and
      // upload, 2026-11-16); a driver camera needs that model's cameras and stays on the car it follows until then.
      if (slot !== null && slot !== followed?.slot && !isDriverCamera(rig.mode)) {
        // The chase camera starts again behind the new car: a car near the old one would read as the same car moving on.
        if (rig.mode === 'chase') rig.unplace();
        setFollowed(bare(slot)); shell.show(content()); draw();
      }
      const next = await buildFollowed(slot, body);
      if (disposed || signal?.aborted || ticket !== request) { next?.dispose(); return false; }
      // Its lit materials take the probe's prefiltered cube before they compile: warmed with the venue's (another size, a program
      // define), each would link again at its first draw, a dozen programs one after another in the frame it shows (2 s, 2026-11-16).
      if (next?.car) { shell.shareReflection(next.car); await shell.warm(next.car); }
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
    // Right after a frame: the cars where that frame drew them, as the pointer sees them.
    pick: (x, y) => shell.afterFrame(() => {
      // Each car's box: its body, or the fixed box for a stand-in, on the road under it (a pose is the body's centre, above the road).
      const places = drawnPlaces.map(car => {
        const body = pickShapeOf(car.slot), box = placeOnRoad(body?.box ?? PICK_BOX, car.y, shell.surfaceHeight(car)), lift = box.min.y - (body?.box ?? PICK_BOX).min.y;
        return {...car, box, parts: body?.parts?.map(part => part.clone().translate(new Vector3(0, lift, 0)))};
      });
      const {width, height} = shell.drawnSize, under = carsUnder(places, shell.drawnView, origin, width, height, x, y);
      const spans = carSpans(under, origin, shell.pointerRay(x, y));
      if (!spans.length) return null;
      // The car whose surface the frame draws under the pointer: the GPU tells which car's stretch of the ray holds it.
      return shell.surfaceWithin(x, y, spans.map(span => [span.enter, span.leave] as const)).then(index => spans[index]?.car.slot ?? null);
    }),
    daylight: clock => shell.setDaylight(clock),
    cockpitLap(lap) {
      if (lap === cockpitLap) return;
      cockpitLap = lap; draw();
    },
    dispose() {
      disposed = true;
      shell.detach(host); content().dispose();
    },
  };
}

