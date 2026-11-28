import { Group, Mesh, type Box3, type Material, type Object3D } from 'three';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import { createCarModels, type CarTextures } from './carModels.js';
import type { CarTemplates } from './carTemplates.js';
import { makeCar } from './carObject.js';
import { buildCarParts, setCockpitView, type CarParts } from './carParts.js';
import { batchCars, UNSEEN_LAYER } from './carBatching.js';
import { createSlicer } from '../batching/batchedParts.js';
import { createCarMotion, type CarMotion } from './carMotion.js';
import { envelopeBounds, envelopeParts } from '../race/carPick.js';

/** A car drawn with its full model: the own car (the lap's car, the race's followed car), the lap's ghost and the race's near cars. */
export interface DrawnCar {
  car: Group;
  parts: CarParts;
  motion: CarMotion;
  /**
   * Its body as the pointer picks it (`race/carPick.ts`): its bounds and its parts' cells, measured before the batching takes the
   * batched parts' vertices.
   */
  pickShape: {box: Box3; parts: Box3[]};
}

/** Cars drawn together: the cars of one body share their batches. */
export interface DrawnCars {
  cars: readonly DrawnCar[];
  /** The batches the cars share, for the caller to add beside them (their parent); empty for one car, whose batches ride in it. */
  shared: Group | null;
  /** Once the cars are warmed up: their batches each draw only while one of their parts shows. */
  ready(): void;
  dispose(): void;
}

export interface DrawnCarsOptions {
  /** Batched (the default), or kept part by part: the ghost, whose see-through parts draw in a fixed order. */
  batched?: boolean;
  /** The materials other cars draw with, which the cars leave when dropped. */
  sharedMaterial?: (material: Material) => boolean;
}

/**
 * `models` (of `makeCar`) with their part tables, wheels and lamps, batched together: one copy of each geometry, the solid parts
 * casting their sun shadow from one shadow-only batch. The batched parts let go of the parsed body's vertices (`batchCars`):
 * once its build is done nothing holds the parse (`createCarTemplates`) unless the body is held, and the next car of the body parses
 * its file again.
 */
export async function createDrawnCars(models: readonly Group[], surfaceHeight: SurfaceHeight,
  {batched = true, sharedMaterial = () => false}: DrawnCarsOptions = {}): Promise<DrawnCars> {
  // A body's cars build over several tasks (a car's tables, then the batches): playback keeps its frames meanwhile.
  const slice = createSlicer(), cars: DrawnCar[] = [];
  // The cars of a set are liveries of one body: one pick shape serves them all.
  let shape: DrawnCar['pickShape'] | undefined;
  for (const car of models) {
    const parts = buildCarParts(car);
    // oxlint-disable-next-line no-await-in-loop -- the first car's shape, measured in the build's slices
    shape ??= {box: envelopeBounds(car), parts: await envelopeParts(car, slice)};
    cars.push({car, parts, motion: createCarMotion(car, surfaceHeight), pickShape: shape});
    // oxlint-disable-next-line no-await-in-loop -- yields between cars
    await slice();
  }
  const batches = batched ? await batchCars(cars.map(car => car.parts)) : null;
  return {
    cars, shared: batches && cars.length > 1 ? batches.shared : null,
    ready() { batches?.ready(); },
    dispose() {
      // The batches first: a lone car's ride in it.
      batches?.dispose();
      for (const {car} of cars) { car.removeFromParent(); disposeObjects(car, false, true, sharedMaterial); }
    },
  };
}

/**
 * What the driver cameras add to the car they ride on (`CarTemplates.cabin`), on a car already drawn: its own part table and
 * batches, riding in the car, its parts hanging under the car's nodes. Hidden from its build until `show`: the field draws the car
 * meanwhile.
 */
export interface Cabin {
  /** Placed after the car's own table, each frame the car is drawn. */
  parts: CarParts;
  show(): void;
  /** Takes the cabin out of the car, which goes back to the outside view. */
  dispose(): void;
}

/**
 * The car the cameras ride on, built on its own with its cabin, its materials its own: the lap's car, the race's first followed car.
 * Free of any view, the shell keeps it between views (`keptCar.ts`).
 */
export interface DrivenCar {
  body: LoadedBody;
  drawn: DrawnCar;
  set: DrawnCars;
  cabin: Cabin;
  /** Whether `show` ran: until then its batches and cabin draw nothing (a view that left while it built never showed it). */
  readonly shown: boolean;
  /** Draws its batches and its cabin, once warm. */
  show(): void;
  dispose(): void;
}

/**
 * Every car of a scene drawn with its full model. `build` is the one path for every car (the lap's car, the race's near cars, a set
 * per body), drawn with the exterior's parts marked interior at their distance levels (the cabin seen through the windows): the car
 * the cameras ride on (the lap's, the race's followed one, which is the field's model of it) adds the interior file's with `cabin`. The race's cars of a body share their materials; the lap's car owns its own, which
 * go with it when the lap changes. Glass and decals are batched and
 * sorted in their batch. The lap's ghost stays part by part (`ghost`): its see-through parts draw in a fixed order.
 */
export function createCarSets(templates: CarTemplates, carTextures: CarTextures, shading: SceneryShading, surfaceHeight: SurfaceHeight) {
  const models = createCarModels(templates, carTextures, shading, {shareMaterials: true});
  /** The lap's car, the cabins and the ghost, each with materials of its own (the ghost changes them). */
  const ownModels = createCarModels(templates, carTextures, shading);
  const sets = {
    /**
     * The cars of `bodies` (liveries of one body) drawn together. `ownMaterials`: the cars' materials their own, freed with them (the
     * lap's car).
     */
    async build(bodies: readonly LoadedBody[], {ownMaterials = false}: {ownMaterials?: boolean} = {}): Promise<DrawnCars> {
      const from = ownMaterials ? ownModels : models, cars = await Promise.all(bodies.map(body => from.car(body)));
      return createDrawnCars(cars, surfaceHeight, {sharedMaterial: from.sharedMaterial});
    },
    /**
     * Adds `body`'s cabin to its car of `build`, once `car` has it (none without one). The cabin loads meanwhile: a car still to build
     * (the race's followed one waits for its body's far and full models) does not hold up its parse.
     */
    async cabin(body: LoadedBody, car: Promise<DrawnCar | null>): Promise<Cabin | null> {
      const loading = ownModels.cabin(body);
      const drop = () => { void loading.then(disposeObjects, () => {}); };
      let drawn: DrawnCar | null;
      try { drawn = await car; } catch (error) { drop(); throw error; }
      if (!drawn) { drop(); return null; }
      const cabin = await loading, envelope = drawn.car.getObjectByName('body-envelope');
      if (!envelope) throw Error(`Car ${body.vehicleId} has no body to add its cabin to`);
      const added: Object3D[] = [], drawing: Array<{mesh: Object3D; mask: number}> = [];
      // A copy of the list: each part found a parent leaves it.
      for (const part of cabin.children.slice()) {
        const parent = envelope.getObjectByName(part.userData.cabinParent as string);
        // A part under a node this livery leaves out (another livery's option part) stays out with it.
        if (!parent) continue;
        // The car is drawn while its cabin builds: until shown, the cabin waits in a layer no pass draws (`UNSEEN_LAYER`).
        part.traverse(object => { if (object instanceof Mesh) { drawing.push({mesh: object, mask: object.layers.mask}); object.layers.set(UNSEEN_LAYER); } });
        parent.add(part); added.push(part);
      }
      disposeObjects(cabin);
      const parts = buildCarParts(drawn.car, new Set(added));
      const batches = await batchCars([parts]);
      return {
        parts,
        show() {
          // A batched part's mesh left every layer: its batch draws it.
          for (const {mesh, mask} of drawing) if (mesh.layers.mask !== 0) mesh.layers.mask = mask;
          batches.ready();
        },
        dispose() {
          parts.hide(); batches.dispose();
          for (const part of added) { part.removeFromParent(); disposeObjects(part); }
          setCockpitView(drawn.car, 'out');
        },
      };
    },
    /** `body`'s car on its own with its cabin (`DrivenCar`). */
    async driven(body: LoadedBody): Promise<DrivenCar> {
      const building = sets.build([body], {ownMaterials: true});
      const cabining = sets.cabin(body, building.then(set => set.cars[0]));
      cabining.catch(() => {}); // Awaited below, once the car is built: a failure surfaces there.
      const set = await building;
      const cabin = await cabining.catch((error: unknown) => { set.dispose(); throw error; });
      // A built car always gets its cabin (`cabin` is null only without a car).
      let shown = false;
      return {
        body, drawn: set.cars[0], set, cabin: cabin!, get shown() { return shown; },
        show() { set.ready(); cabin!.show(); shown = true; },
        dispose() { cabin!.dispose(); set.dispose(); },
      };
    },
    /** The lap's ghost: see-through, without shadows; disposed with its parent (`disposeObjects`). */
    async ghost(body: LoadedBody): Promise<DrawnCar> {
      const ghost = makeCar(TELEMETRY_COLORS.baseline, true, await ownModels.model(body));
      ghost.traverse(object => { if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; } });
      return (await createDrawnCars([ghost], surfaceHeight, {batched: false})).cars[0];
    },
  };
  return sets;
}

export type CarSets = ReturnType<typeof createCarSets>;
