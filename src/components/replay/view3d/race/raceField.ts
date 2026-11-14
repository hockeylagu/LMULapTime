import { Box3, Frustum, Group, Matrix4, Mesh, Quaternion, Sphere, Vector3, type Object3D, type OrthographicCamera, type PerspectiveCamera } from 'three';
import { normalizeVehicleId } from '../../../../../shared/packageContract/index.js';
import type { RaceReplayCar } from '../../../../../shared/types/replay.js';
import { RACE_LAMP, RACE_POSE_CHANNEL_COUNT, RACE_POSE_CHANNELS, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import type { RenderPose } from '../scene/replayPose.js';
import type { SceneShell } from '../scene/sceneShell.js';
import { makeCar } from '../cars/sceneObjects.js';
import { buildCarParts, setCameraDistance, type CarParts } from '../cars/carParts.js';
import { batchCars, type CarBatchSet } from '../cars/carBatching.js';
import type { CarSets, DrawnCar, DrawnCars } from '../cars/drawnCar.js';
import { createFarCarLoader } from '../cars/farCars.js';
import { createFarGlows, FAR_GLOW_MAX, type FarGlowCar } from '../cars/farGlows.js';
import { attachWheelRigs } from '../cars/wheelGeometry.js';
import { windowPoints } from './raceTrack.js';
import { createBlobShadows } from './blobShadows.js';

/** Bodies loading their far models at once (each with all its cars), nearest the followed car first; and their full models. */
const BODY_LOADS = 2, NEAR_LOADS = 1;
/** Full models drawn at once: the cars nearest the camera. */
const NEAR_MAX = 6;
/**
 * A car turns near (its full model) inside this share of its body's far distance (`far.fromM`), and far again beyond it: a car
 * at the threshold does not switch back and forth.
 */
const NEAR_ENTER = 0.85;
/** A sphere holding a car about its origin (metres), for the view test. */
const CAR_RADIUS_M = 4;
/** Poses of a window a far car's road fit samples, and the largest fit taken (as the full models' wheels do). */
const FIT_SAMPLES = 32, MAX_FIT_M = 0.75;
/** How far from the camera a far car's headlights and brake lights glow (`farGlows`, the nearest `FAR_GLOW_MAX`). */
const FAR_GLOW_M = 300;
const BRAKE = RACE_POSE_CHANNELS.indexOf('brake'), LAMPS = RACE_POSE_CHANNELS.indexOf('lamps');

/** A body's cars: their full models, built together the first time one of them turns near, then kept. */
interface FieldBody {
  cars: FieldCar[];
  near: 'none' | 'loading' | 'ready' | 'failed';
  /** Whether its parse is held (`CarTemplates.hold`): from its near build while any of its cars is near. */
  held: boolean;
}

/** A car of the field: its far model always, its full model once its body's full models are built. */
interface FieldCar {
  body: LoadedBody;
  of: FieldBody;
  far: {car: Group; parts: CarParts};
  /**
   * The far model's road fit, as a full model's wheels place its body (`createWheelAnimation`), so the swap between them does not
   * jump: its body moves by `y` so that `bottomY` (in its frame) lies on the road under its poses in `window`. `bottomY` is the
   * full model's tyre contact (hubs less radius, at rest) once its body's full models are built; until then the far model's
   * lowest point, which can be a body part a little below the tyres.
   */
  fit: {envelope: Object3D; bottomY: number; y: number; window: RacePoseWindow | null};
  /** The far model's bounds in its frame: its contact shadow's footprint (`blobShadows`). */
  footprint: Box3;
  near: DrawnCar | null;
  tier: 'far' | 'near';
  /** Its pose at the last drawn time (null while off the track or followed), and the window and index its samples are in. */
  pose: RenderPose | null;
  orientation: Quaternion;
  window: RacePoseWindow | null;
  carIndex: number;
  /** Its far model's body frame (`FarGlowCar.frame`), while its lamps glow. */
  glowFrame: Matrix4;
}

export interface RaceField {
  /** Whether the slot draws as a model (its far model is loaded): its stand-in hides. */
  has(slot: number): boolean;
  /** The car's pose at the drawn time, or null off the track or while followed (the followed car draws its own model). */
  pose(slot: number, pose: RenderPose | null, window: RacePoseWindow, carIndex: number): void;
  /** Starts the next bodies to load: those of the cars given (on the track, without a model), nearest first. */
  load(distances: ReadonlyArray<{slot: number; metres: number}>): void;
  /** Places the cars in view for the frame: the nearest few with their full model, wheels and lamps, the others with their far model. */
  beforeDraw(camera: PerspectiveCamera | OrthographicCamera): void;
  /** Where the cars the last `beforeDraw` drew with their full model are (world): a far model casts no shadow. */
  casters(): readonly Vector3[];
  refreshHeights(): void;
  dispose(): void;
}

/**
 * The race's other cars, by distance from the camera: near (the nearest `NEAR_MAX` inside their body's far distance) as full
 * models with wheels, lamps and shadows; far as the body's far model, still, its contact shadow drawn with the others
 * (`blobShadows`); out of view hidden. The cars of a body share their batches in each tier. Every car of a body loads its far
 * model at once, and its full model with the others of the body the first time one of them turns near; both stay. The nearest far cars' headlights and brake lights glow (`farGlows`).
 * `sets` builds the full models, `root` is the cars' parent; `changed` asks for a redraw. `farModel` sees each car's far model as it
 * is built, before its batching releases the parsed vertices (the stand-ins take their shape from it).
 */
export function createRaceField(
  shell: SceneShell, sets: CarSets, root: Group, cars: readonly RaceReplayCar[],
  bodyOf: (slot: number) => Promise<LoadedBody | null>, changed: () => void, farModel: (slot: number, car: Group) => void = () => {},
): RaceField {
  const {origin} = shell;
  const handlingOf = new Map(cars.map(car => [car.slot, car.handling]));
  /** The field by slot: null while its body loads, 'none' for a car that cannot load (its stand-in stays). */
  const field = new Map<number, FieldCar | null | 'none'>();
  const farSets: CarBatchSet[] = [], nearSets: DrawnCars[] = [], bodies = new Set<string>(), fieldBodies: FieldBody[] = [];
  let bodyLoads = 0, nearLoads = 0, disposed = false;
  const view = new Frustum(), viewMatrix = new Matrix4(), bounds = new Sphere(), centre = new Vector3();
  const glows = createFarGlows(root, shell.carTemplates, shell.carTextures, object => shell.warm(object), changed), glowing: FarGlowCar[] = [];
  const blobs = createBlobShadows(root, cars.length, object => shell.warm(object));
  /** A far car's lamps at its pose: braking on any brake pedal, headlights from the lamp flags (the full models' lamps read the same). */
  const glowOf = (car: FieldCar): FarGlowCar => {
    const window = car.window!, base = (car.carIndex * window.count + car.pose!.index) * RACE_POSE_CHANNEL_COUNT;
    car.far.car.updateMatrix(); car.fit.envelope.updateMatrix();
    return {
      body: car.body, frame: car.glowFrame.multiplyMatrices(car.far.car.matrix, car.fit.envelope.matrix),
      braking: window.data[base + BRAKE] > 0, headlights: (window.data[base + LAMPS] & RACE_LAMP.headlights) !== 0,
    };
  };
  /** The median, over the car's poses in its window, of how far its far model's lowest point is above the road under it. */
  const fitFar = (car: FieldCar) => {
    const {window, carIndex, fit} = car, data = window!.data, offsets: number[] = [];
    fit.window = window;
    const step = Math.max(1, Math.floor(window!.count / FIT_SAMPLES));
    for (let sample = 0; sample < window!.count; sample += step) {
      const base = (carIndex * window!.count + sample) * RACE_POSE_CHANNEL_COUNT, x = data[base], y = data[base + 1], z = data[base + 2];
      if (!Number.isFinite(x)) continue;
      const ground = shell.surfaceHeight({x, y, z});
      if (ground === null) continue;
      const offset = ground - (y + fit.bottomY);
      if (Math.abs(offset) <= MAX_FIT_M) offsets.push(offset);
    }
    // Without road under the poses yet, the fit stays: the road streaming in fits it again (`refreshHeights`).
    if (!offsets.length) return;
    offsets.sort((a, b) => a - b);
    fit.y = offsets[Math.floor(offsets.length / 2)];
    fit.envelope.position.y = fit.y;
  };
  /** The tyres' contact height in a full model's frame (hubs less radius, at rest); null for a body without wheel rigs. */
  const tyreContact = (car: Group): number | null => {
    const envelope = car.getObjectByName('body-envelope') as Group | undefined;
    if (!envelope?.getObjectByName('wheel_fl')) return null;
    const rigs = attachWheelRigs(envelope);
    return envelope.position.y + rigs.reduce((sum, rig) => sum + rig.hub.y - rig.radiusM, 0) / rigs.length;
  };
  /** The far model's bounds in its car's frame (its parts hang at the model origin); a point at the origin without parts. */
  const boundsOf = (car: Group) => {
    const box = new Box3();
    car.getObjectByName('body-envelope')!.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const geometry = object.geometry as Mesh['geometry'];
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      box.union(geometry.boundingBox!);
    });
    return box.isEmpty() ? box.setFromCenterAndSize(new Vector3(), new Vector3()) : box;
  };

  /** The scene's corner note counts the cars asked for and those settled (a model, or a stand-in for good), while any load. */
  let reported = '';
  const reportLoads = () => {
    let loaded = 0;
    for (const car of field.values()) if (car !== null) loaded++;
    const key = `${loaded}/${field.size}`;
    if (key === reported) return;
    reported = key;
    shell.report({carModels: {loaded, total: field.size}});
  };
  const loadBody = async (slot: number) => {
    let slots = [slot];
    // Far cars built but not yet in the field: a load that fails or outlives the field frees them.
    let unplaced: Group[] = [];
    bodyLoads++;
    try {
      const body = await bodyOf(slot);
      if (!body || disposed) return;
      // A body already loading covers this car: that load settles it.
      if (bodies.has(body.resource.folder)) { slots = []; return; }
      bodies.add(body.resource.folder);
      const served = new Set(body.resource.vehicleIds.map(normalizeVehicleId));
      slots = cars.filter(car => car.vehicleId && served.has(normalizeVehicleId(car.vehicleId))).map(car => car.slot);
      for (const each of slots) if (!field.get(each)) field.set(each, null);
      // The body's far file is parsed for this load alone: once its cars are batched, nothing holds the parsed vertices.
      const farLoader = createFarCarLoader(shell.carTextures);
      const built = await Promise.all(slots.map(async each => {
        const livery = await bodyOf(each);
        return livery ? {livery, car: makeCar(MAP_COLORS.carBody, false, await farLoader.model(livery))} : null;
      }));
      built.forEach((entry, index) => { if (entry) farModel(slots[index], entry.car); });
      const present = built.filter(entry => entry !== null);
      unplaced = present.map(({car}) => car);
      const boxes = present.map(({car}) => boundsOf(car)), tables = present.map(({car}) => buildCarParts(car));
      const batches = await batchCars(tables, {releaseParsed: true, transparent: true});
      farSets.push(batches);
      await Promise.all([shell.warm(batches.shared), ...present.map(({car}) => shell.warm(car))]);
      if (disposed) return;
      root.add(batches.shared); batches.ready();
      const of: FieldBody = {cars: [], near: 'none', held: false};
      fieldBodies.push(of);
      built.forEach((entry, index) => {
        if (!entry) { field.set(slots[index], 'none'); return; }
        entry.car.visible = false; root.add(entry.car);
        const car: FieldCar = {
          body: entry.livery, of, far: {car: entry.car, parts: tables[present.indexOf(entry)]}, near: null,
          fit: {envelope: entry.car.getObjectByName('body-envelope')!, bottomY: boxes[present.indexOf(entry)].min.y, y: 0, window: null},
          footprint: boxes[present.indexOf(entry)],
          tier: 'far', pose: null, orientation: new Quaternion(), window: null, carIndex: 0, glowFrame: new Matrix4(),
        };
        of.cars.push(car); field.set(slots[index], car);
      });
      unplaced = [];
      changed();
    } catch {
      // The cars that cannot load stay stand-ins (below).
    } finally {
      for (const car of unplaced) { car.removeFromParent(); disposeObjects(car); }
      bodyLoads--;
      for (const each of slots) if (field.get(each) === null) field.set(each, 'none');
      if (!disposed) reportLoads();
    }
  };
  /**
   * Builds the full models of every car of the body at once, from one parse of the body, their parts sharing batches as their far
   * models do (one copy of each geometry; only the livery's own materials split them). A car turning near then only shows its
   * instances: going back and forth through the grid loads nothing. Until then, and for a body that fails, its cars stay far.
   */
  const loadNear = async (of: FieldBody) => {
    of.near = 'loading'; nearLoads++;
    let set: DrawnCars | null = null;
    // The body's parse stays while its cars are near: following one of them builds from it instead of parsing the file again.
    shell.carTemplates.hold(of.cars[0].body); of.held = true;
    try {
      set = await sets.build(of.cars.map(car => car.body), {own: false});
      // Every car of the body has the same wheels: the far models fit to the road by them from now on.
      const contact = tyreContact(set.cars[0].car);
      if (contact !== null) for (const car of of.cars) { car.fit.bottomY = contact; car.fit.window = null; }
      const shared = set.shared;
      for (const object of [...(shared ? [shared] : []), ...set.cars.map(car => car.car)]) shell.shareReflection(object);
      await Promise.all([...(shared ? [shell.warm(shared)] : []), ...set.cars.map(car => shell.warm(car.car))]);
      if (disposed) { set.dispose(); return; }
      nearSets.push(set);
      if (shared) root.add(shared);
      set.ready();
      set.cars.forEach((near, index) => { near.car.visible = false; root.add(near.car); of.cars[index].near = near; });
      of.near = 'ready';
      changed();
    } catch {
      // The cars stay far.
      of.near = 'failed';
      set?.dispose();
    } finally { nearLoads--; }
  };
  const hide = (shape: {car: Group; parts: CarParts} | null) => { if (shape?.car.visible) { shape.car.visible = false; shape.parts.hide(); } };
  /** The cars in view this frame, nearest first. */
  const inView: Array<{car: FieldCar; metres: number}> = [];
  /** The full models drawn this frame, and their places (`casters`), reused. */
  const casting: Object3D[] = [], castingAt: Vector3[] = [];
  return {
    has: slot => typeof field.get(slot) === 'object' && field.get(slot) !== null,
    pose(slot, pose, window, carIndex) {
      const car = field.get(slot);
      if (!car || car === 'none') return;
      car.pose = pose ? {...pose, orientation: pose.orientation ? car.orientation.copy(pose.orientation) : undefined} : null;
      car.window = window; car.carIndex = carIndex;
    },
    load(distances) {
      if (bodyLoads >= BODY_LOADS) return;
      const waiting = distances.filter(car => !field.has(car.slot)).sort((a, b) => a.metres - b.metres);
      for (const {slot} of waiting.slice(0, BODY_LOADS - bodyLoads)) { field.set(slot, null); void loadBody(slot); }
      reportLoads();
    },
    beforeDraw(camera) {
      camera.updateMatrixWorld();
      view.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      inView.length = 0;
      for (const car of field.values()) {
        if (!car || car === 'none') continue;
        const pose = car.pose;
        // A car out of view costs nothing more this frame (its shadow included): most of the field is behind the camera or far
        // round the lap. The world group mirrors native z: the car's centre goes through the root's world matrix.
        if (pose) centre.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z).applyMatrix4(root.matrixWorld);
        if (!pose || !view.intersectsSphere(bounds.set(centre, CAR_RADIUS_M))) { hide(car.far); hide(car.near); car.tier = 'far'; continue; }
        // The LOD distance: the view's multiplier keeps detail further out (`CameraRig.lodMultiplier`).
        inView.push({car, metres: camera.position.distanceTo(centre) / shell.rig.lodMultiplier});
      }
      inView.sort((a, b) => a.metres - b.metres);
      let near = 0;
      glowing.length = 0; casting.length = 0;
      blobs.begin();
      for (const {car, metres} of inView) {
        const reach = car.body.resource.far.fromM * (car.tier === 'near' ? 1 : NEAR_ENTER);
        car.tier = near < NEAR_MAX && metres < reach ? 'near' : 'far';
        if (car.tier === 'near') {
          near++;
          if (car.of.near === 'none' && nearLoads < NEAR_LOADS) void loadNear(car.of);
        }
        const shown = car.tier === 'near' && car.near ? car.near : car.far, other = shown === car.far ? car.near : car.far;
        hide(other);
        shown.car.visible = true;
        const motion = shown === car.near ? car.near.motion : null, window = car.window!, carIndex = car.carIndex, slot = window.slots[carIndex];
        motion?.setTrack(window, () => ({points: windowPoints(window, carIndex), handlingCalibration: handlingOf.get(slot)}));
        if (shown === car.far && car.fit.window !== window) fitFar(car);
        shell.placeCar(shown.car, car.pose!, motion);
        if (shown === car.near) casting.push(shown.car);
        setCameraDistance(shown.car, metres);
        shown.parts.sync();
        if (shown === car.far && metres < FAR_GLOW_M && glowing.length < FAR_GLOW_MAX) glowing.push(glowOf(car));
        // The road under a far model: its lowest point, fitted to the road by the envelope's offset.
        if (shown === car.far) { shown.car.updateMatrix(); blobs.place(shown.car.matrix, car.fit.bottomY + car.fit.y, car.footprint); }
      }
      blobs.end();
      glows.draw(glowing);
      for (const body of fieldBodies) if (body.held && !body.cars.some(car => car.tier === 'near')) { shell.carTemplates.release(body.cars[0].body); body.held = false; }
    },
    casters: () => casting.map((car, i) => car.getWorldPosition(castingAt[i] ??= new Vector3())),
    refreshHeights() {
      for (const car of field.values()) if (car && car !== 'none') { car.near?.motion.refreshHeights(); car.fit.window = null; }
    },
    dispose() {
      disposed = true;
      glows.dispose(); blobs.dispose();
      for (const set of [...farSets, ...nearSets]) set.dispose();
      for (const car of field.values()) {
        if (!car || car === 'none') continue;
        car.far.car.removeFromParent(); disposeObjects(car.far.car);
      }
    },
  };
}
