import { BoxGeometry, Color, Euler, Frustum, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Sphere, Vector3, type Object3D, type OrthographicCamera, type PerspectiveCamera } from 'three';
import type { SceneryLayoutResource } from '../../../../../shared/types/scenes/scenery.js';
import { normalizeVehicleId } from '../../../../../shared/packageContract/index.js';
import type { RaceReplayCar, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import { RACE_POSE_CHANNEL_COUNT, sampleRacePose, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { raceClassTone } from '../../race/raceClassTone.js';
import { createLapLayerLoader } from '../laps/lapLayer.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import type { SceneLoadProgress } from '../scene/loadProgress.js';
import type { CameraMode } from '../camera/cameraModes.js';
import { isDriverCamera } from '../camera/driverCameras.js';
import type { RenderPose } from '../scene/replayPose.js';
import { nativeToScene } from '../scene/sceneFrame.js';
import { createSceneShell, type SceneContent } from '../scene/sceneShell.js';
import { setCameraDistance } from '../cars/sceneObjects.js';
import { createRaceCarMotion, freezeCar, updateCarMatrices, windowPoints, type RaceCarMotion } from './raceCarMotion.js';
import { createFieldBatches, type FieldCar } from './fieldBatches.js';

/** A class box's size in metres (width, height, length): about a prototype's, standing in while a car's model loads. */
const BOX_SIZE: [number, number, number] = [2, 1.05, 4.9];
/** Bodies loading at once (each with all its cars), nearest the followed car first. */
const LOADS = 2;
/** A sphere holding a car about its origin (metres), for the view test. */
const CAR_RADIUS_M = 4;

export interface RaceSceneHandle {
  /**
   * Draws every car at `timeSec` from the pose window holding it (null while it loads: the cars stay where they were). `stationM`
   * is the followed car's track station, which the scenery streams ahead of (around the camera without it).
   */
  time(timeSec: number, window: RacePoseWindow | null, stationM?: number): void;
  /** Follows a car: its body as a full model when given, else its box. */
  follow(slot: number | null, body: LoadedBody | null, signal?: AbortSignal): Promise<boolean>;
  mode(mode: CameraMode): void;
  reset(): void;
  center(): void;
  zoom(direction: number): void;
  pan(horizontal: number, vertical: number): void;
  dispose(): void;
}

/** A car drawn as its model: the followed car or another. */
interface FollowedCar {
  slot: number;
  /** The model; null for a car without a body (its box stays). */
  car: Group | null;
  /** Its wheels and lamps; null without a model. */
  motion: RaceCarMotion | null;
  cameras: LoadedBody['descriptor']['cameras']['list'];
  dispose(): void;
}

/** Another car of the field: its model, whose opaque parts its body's batches draw, and its wheels and lamps. */
interface FieldModel {
  car: Group | null;
  motion: RaceCarMotion | null;
  parts: FieldCar | null;
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
 * A car is a box in its class colour (one instanced draw) while its model loads, or for good without a body. `bodyOf` loads a
 * car's body (null for a car the replay does not name).
 */
export async function createRaceScene(
  host: HTMLDivElement, layout: SceneryLayoutResource, cars: readonly RaceReplayCar[],
  first: {slot: number | null; body: LoadedBody | null; x: number; z: number}, bodyOf: (slot: number) => Promise<LoadedBody | null>,
  onFailure: (message: string) => void, onProgress: (progress: SceneLoadProgress) => void,
): Promise<RaceSceneHandle> {
  const shell = createSceneShell(host, layout, {onFailure, onProgress, firstView: {kind: 'free', x: first.x, z: first.z}});
  const {rig, origin} = shell;
  const handlingOf = new Map(cars.map(car => [car.slot, car.handling]));
  // The followed car draws part by part with its own materials (the reflection probe's), its vertices leaving the CPU once on the GPU.
  const followLoader = createLapLayerLoader(origin, shell.surfaceHeight, shell.carTextures, () => shell.exposureDisplay(), layout.shading, {releaseUploaded: true});
  // The field's cars share their body's materials and batches (`field`): a body is parsed again for the followed car.
  const fieldLoader = createLapLayerLoader(origin, shell.surfaceHeight, shell.carTextures, () => shell.exposureDisplay(), layout.shading, {releaseUploaded: true, shareMaterials: true});
  const field = createFieldBatches();
  /** The followed car's model, built with the lap view's car loader, its interior kept for the driver cameras. */
  const buildFollowed = async (slot: number | null, body: LoadedBody | null): Promise<FollowedCar | null> => {
    if (slot === null) return null;
    if (!body) return {slot, car: null, motion: null, cameras: [], dispose() {}};
    const car = await followLoader.car(body);
    return {
      slot, car, motion: createRaceCarMotion(car, handlingOf.get(slot), shell.surfaceHeight), cameras: body.descriptor.cameras.list,
      dispose() { car.removeFromParent(); disposeObjects(car); },
    };
  };
  /** A field car's model, before its body's batches take its opaque parts. */
  const buildOther = async (body: LoadedBody): Promise<Group> => {
    const car = await fieldLoader.car(body);
    // No driver camera rides on it: its interior parts would only add to every frame's scene walk.
    const interior: Object3D[] = [];
    car.traverse(object => { if (object.userData.interior === true) interior.push(object); });
    for (const part of interior) part.removeFromParent();
    // Its matrices update once per frame, after it is placed (beforeDraw), not again on each of the frame's render passes.
    freezeCar(car);
    return car;
  };
  const pending = buildFollowed(first.slot, first.body);
  pending.then(() => shell.report({cars: 1}), () => {}); // A failure surfaces below.
  const boxes = new InstancedMesh(new BoxGeometry(...BOX_SIZE).translate(0, BOX_SIZE[1] / 2, 0), new MeshStandardMaterial({roughness: 0.55, metalness: 0.1}), cars.length);
  boxes.name = 'race-cars'; boxes.frustumCulled = false; boxes.castShadow = true; boxes.receiveShadow = true;
  const instanceOf = new Map(cars.map((car, index) => [car.slot, index]));
  cars.forEach((car, index) => boxes.setColorAt(index, new Color(raceClassTone(car.carClass).hex)));
  const hiddenMatrix = new Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < cars.length; index++) boxes.setMatrixAt(index, hiddenMatrix);
  const root = new Group(); root.add(boxes);
  /** Stands in for the reflection probe's car while the followed car has no model: never visible, so the probe stays idle. */
  const noCar = new Group(); noCar.visible = false;
  let followed: FollowedCar | null = null;
  /** The field's models by slot, the followed car's included (hidden while followed): null while its body loads. */
  const models = new Map<number, FieldModel | null>();
  const view = new Frustum(), viewMatrix = new Matrix4(), carBounds = new Sphere(), carCentre = new Vector3();
  /** The other cars' poses at the last drawn time (none while off the track), placed when drawn (`beforeDraw`). */
  const posed = new Map<number, RenderPose>();
  // The chase camera looks ahead along the followed car's own samples of the window, and the trackside spots stand along them.
  let points: ReplayTrajectoryPoint[] = [], distances: number[] = [], pointsOf: {window: RacePoseWindow; slot: number} | null = null;
  const rigCar = () => ({primary: followed?.car ?? noCar, cameras: followed?.cameras ?? [], trajectory: {points}, primaryDistances: distances});
  const content = (): SceneContent => ({
    root, reflected: followed?.car ?? noCar,
    beforeDraw(camera: PerspectiveCamera | OrthographicCamera) {
      camera.updateMatrixWorld();
      view.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const [slot, model] of models) {
        const car = model?.car, pose = posed.get(slot);
        if (!model || !car) continue;
        car.visible = pose !== undefined;
        if (!pose) { model.parts?.show(false); continue; }
        // A car out of view costs nothing more this frame (its shadow included): most of the field is behind the camera or far
        // round the lap. One in view takes its pose, wheels and lamps here, once per frame.
        // The world group mirrors native z: the car's centre in the camera's frame goes through the root's world matrix.
        carCentre.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z).applyMatrix4(root.matrixWorld);
        car.visible = view.intersectsSphere(carBounds.set(carCentre, CAR_RADIUS_M));
        if (!car.visible) { model.parts?.show(false); continue; }
        shell.placeCar(car, pose, model.motion?.wheels ?? null, model.motion?.lights ?? []);
        setCameraDistance(car, camera.position.distanceTo(carCentre));
        updateCarMatrices(car);
        model.parts?.show(true);
      }
    },
    refreshHeights() { followed?.motion?.refreshHeights(); for (const car of models.values()) car?.motion?.refreshHeights(); },
    dispose() { followed?.dispose(); for (const model of models.values()) model?.dispose(); field.dispose(); disposeObjects(root); },
  });
  const setFollowed = (next: FollowedCar | null) => {
    followed?.dispose(); followed = next;
    if (next) posed.delete(next.slot);
    if (next?.car) root.add(next.car);
    pointsOf = null; points = []; distances = [];
    rig.setLayer(rigCar());
  };
  try {
    await shell.lit;
    await shell.underView();
    const firstCar = await pending;
    setFollowed(firstCar);
    if (firstCar?.car) await shell.warm(firstCar.car);
    await shell.start(content());
  } catch (error) { shell.abort(); throw error; }
  let disposed = false, request = 0, timeSec = 0, window: RacePoseWindow | null = null;
  const pose = new Float32Array(RACE_POSE_CHANNEL_COUNT), matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(1, 1, 1);
  const orientation = new Quaternion(), euler = new Euler(), target = new Vector3();
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
  let loading = 0;
  const noModel: FieldModel = {car: null, motion: null, parts: null, dispose() {}};
  /** The bodies loading or loaded, by folder: each loads once, with every car of the session it serves. */
  const bodies = new Set<string>();
  /**
   * Builds the models of every car of the slot's body at once (one copy of the body, its batches at their exact size), the
   * followed car's included: it shows again once no longer followed. A car that cannot load stays a box.
   */
  const loadBody = async (slot: number) => {
    let slots = [slot];
    loading++;
    try {
      const body = await bodyOf(slot);
      if (!body || disposed || bodies.has(body.resource.folder)) return; // A body already loading covers this car.
      bodies.add(body.resource.folder);
      const served = new Set(body.resource.vehicleIds.map(normalizeVehicleId));
      slots = cars.filter(car => car.vehicleId && served.has(normalizeVehicleId(car.vehicleId))).map(car => car.slot);
      for (const each of slots) if (!models.get(each)) models.set(each, null);
      const built = await Promise.all(slots.map(async each => {
        const livery = await bodyOf(each);
        return livery ? buildOther(livery) : null;
      }));
      const present = built.filter(car => car !== null);
      const {cars: parts, batches, ready} = field.addBody(present);
      await Promise.all([shell.warm(batches), ...present.map(car => shell.warm(car))]);
      if (disposed) return;
      root.add(batches); ready();
      built.forEach((car, index) => {
        const own = car ? parts[present.indexOf(car)] : undefined;
        if (!car || !own) { models.set(slots[index], noModel); return; }
        root.add(car);
        const motion = createRaceCarMotion(car, handlingOf.get(slots[index]), shell.surfaceHeight);
        models.set(slots[index], {car, motion, parts: own, dispose() { own.dispose(); car.removeFromParent(); disposeObjects(car); }});
      });
      draw();
    } catch {
      // The cars that cannot load stay boxes (below).
    }
    finally {
      loading--;
      for (const each of slots) if (models.get(each) === null) models.set(each, noModel);
    }
  };
  /** Starts the next bodies to load: those of the cars on track without a model, nearest the followed car first. */
  const loadModels = (distances: Array<{slot: number; metres: number}>) => {
    if (loading >= LOADS) return;
    const waiting = distances.filter(car => !models.has(car.slot)).sort((a, b) => a.metres - b.metres);
    for (const {slot} of waiting.slice(0, LOADS - loading)) { models.set(slot, null); void loadBody(slot); }
  };
  const draw = () => {
    if (!window || disposed) return;
    const current = window, places: Array<{slot: number; x: number; z: number}> = [];
    let followedAt: {x: number; z: number} | null = null;
    for (const [carIndex, slot] of current.slots.entries()) {
      const instance = instanceOf.get(slot);
      if (instance === undefined) continue;
      const shown = sampleRacePose(current, carIndex, timeSec, pose);
      const isFollowed = slot === followed?.slot, drawn = isFollowed ? followed : models.get(slot), model = drawn?.car;
      // The window sample the pose lies after: the wheels and lamps read the car's samples there.
      const sample = (timeSec - current.fromSec) * current.hz, index = Math.max(0, Math.min(Math.floor(sample), current.count - 2));
      const fraction = Math.max(0, Math.min(1, sample - index));
      if (shown) places.push({slot, x: pose[0], z: pose[2]});
      if (shown && isFollowed) {
        followedAt = {x: pose[0], z: pose[2]};
        const placed = renderPose(pose, index, fraction, orientation, euler);
        followedPoints(current, carIndex);
        const stationM = distances[index] + ((distances[index + 1] ?? distances[index]) - distances[index]) * fraction;
        rig.follow({target: target.set(...nativeToScene(placed, origin)), yaw: placed.yaw ?? 0, timeSec, stationM, index, fraction});
      }
      if (!shown || isFollowed) posed.delete(slot);
      if (model) {
        if (isFollowed) model.visible = shown;
        if (shown) {
          const motion = drawn?.motion ?? null;
          motion?.update(current, carIndex);
          if (isFollowed) shell.placeCar(model, renderPose(pose, index, fraction, orientation, euler), motion?.wheels ?? null, motion?.lights ?? []);
          else posed.set(slot, {...renderPose(pose, index, fraction, posed.get(slot)?.orientation ?? new Quaternion(), euler)});
        }
      }
      if (!shown || model) { boxes.setMatrixAt(instance, hiddenMatrix); continue; }
      renderPose(pose, 0, 0, orientation, euler);
      boxes.setMatrixAt(instance, matrix.compose(position.set(pose[0] - origin.x, pose[1] - origin.y, pose[2] - origin.z), orientation, scale));
    }
    boxes.instanceMatrix.needsUpdate = true;
    if (!followedAt) placeAside(current);
    const from = followedAt ?? places[0];
    loadModels(from ? places.filter(car => car.slot !== followed?.slot).map(car => ({slot: car.slot, metres: Math.hypot(car.x - from.x, car.z - from.z)})) : []);
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
      const ticket = ++request, next = await buildFollowed(slot, body);
      if (disposed || signal?.aborted || ticket !== request) { next?.dispose(); return false; }
      if (next?.car) await shell.warm(next.car);
      if (disposed || signal?.aborted || ticket !== request) { next?.dispose(); return false; }
      // A driver camera needs the car's own cameras: without a model, the chase camera follows the box.
      if (!next?.car && isDriverCamera(rig.mode)) shell.setMode('chase');
      setFollowed(next); shell.show(content()); draw();
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
    dispose() { disposed = true; shell.dispose(); },
  };
}

