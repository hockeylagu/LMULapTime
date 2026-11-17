import { Mesh, type Box3, type Group, type Material, type Object3D } from 'three';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { disposeObjects } from '../scene/disposeObjects.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import { createCarModels, type CarTextures } from './carModels.js';
import type { CarTemplates } from './carTemplates.js';
import { makeCar } from './sceneObjects.js';
import { buildCarParts, type CarParts } from './carParts.js';
import { batchCars } from './carBatching.js';
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
   * batched parts' vertices. With `pickShape` only.
   */
  pickShape: {box: Box3; parts: Box3[]} | null;
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
  /** Glass and decals batched too, sorted in their batch: the race's other cars (`batchCars`). */
  transparent?: boolean;
  /** The materials other cars draw with, which the cars leave when dropped. */
  sharedMaterial?: (material: Material) => boolean;
  /** Each car's pick shape measured (`DrawnCar.pickShape`): the race's followed car. */
  pickShape?: boolean;
}

/**
 * `models` (of `makeCar`) with their part tables, wheels and lamps, batched together: one copy of each geometry, the solid parts
 * casting their sun shadow from one shadow-only batch. The batched parts let go of the parsed body's vertices (`releaseParsed`):
 * once its build is done nothing holds the parse (`createCarTemplates`) unless the body is held, and the next car of the body parses
 * its file again.
 */
export async function createDrawnCars(models: readonly Group[], surfaceHeight: SurfaceHeight,
  {batched = true, transparent = false, sharedMaterial = () => false, pickShape = false}: DrawnCarsOptions = {}): Promise<DrawnCars> {
  // A body's cars build over several tasks (a car's tables, then the batches): playback keeps its frames meanwhile.
  const slice = createSlicer(), cars: DrawnCar[] = [];
  for (const car of models) {
    const parts = buildCarParts(car);
    cars.push({car, parts, motion: createCarMotion(car, surfaceHeight), pickShape: pickShape ? {box: envelopeBounds(car), parts: envelopeParts(car)} : null});
    // oxlint-disable-next-line no-await-in-loop -- yields between cars
    await slice();
  }
  const batches = batched ? await batchCars(cars.map(car => car.parts), {releaseParsed: true, transparent, shadows: true}) : null;
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

export interface CarSetOptions {
  /**
   * The own car (the lap's car, the race's followed car): its own materials, which the reflection probe changes, and its interior,
   * for the driver cameras. Otherwise cars of the field: every car of a body draws with the same materials, without an interior.
   */
  own: boolean;
  /** Each car's pick shape measured (`DrawnCar.pickShape`). */
  pickShape?: boolean;
}

/**
 * Every car of a scene drawn with its full model. `build` is the one path for the lap's car, the race's followed car (each a set of
 * one) and the race's near cars (a set per body): glass and decals batched and sorted in their batch, the own car differing only by
 * its materials and interior. The lap's ghost stays part by part (`ghost`): its see-through parts draw in a fixed order.
 */
export function createCarSets(templates: CarTemplates, carTextures: CarTextures, shading: SceneryShading, surfaceHeight: SurfaceHeight) {
  const ownModels = createCarModels(templates, carTextures, shading);
  const fieldModels = createCarModels(templates, carTextures, shading, {shareMaterials: true});
  return {
    /** The cars of `bodies` (liveries of one body) drawn together. */
    async build(bodies: readonly LoadedBody[], {own, pickShape = false}: CarSetOptions): Promise<DrawnCars> {
      const models = own ? ownModels : fieldModels;
      const cars = await Promise.all(bodies.map(body => models.car(body)));
      for (const car of cars) {
        // No driver camera rides on the field's cars: their interior parts would only add to their draws. The own car draws its full
        // level alone (no camera distance is set on it): built from a held parse of the whole exterior, its farther levels would only
        // add to its batches and uploads (a followed car's shadow batch held 765k triangles of every level, 2026-11-17).
        const dropped: Object3D[] = [];
        car.traverse(object => {
          if (own ? ((object.userData.lod as {inM: number} | undefined)?.inM ?? 0) > 0 : object.userData.interior === true) dropped.push(object);
        });
        for (const part of dropped) part.removeFromParent();
      }
      return createDrawnCars(cars, surfaceHeight, {transparent: true, sharedMaterial: models.sharedMaterial, pickShape});
    },
    /** The lap's ghost: see-through, without shadows; disposed with its parent (`disposeObjects`). */
    async ghost(body: LoadedBody): Promise<DrawnCar> {
      const ghost = makeCar(TELEMETRY_COLORS.baseline, true, await ownModels.model(body));
      ghost.traverse(object => { if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; } });
      return (await createDrawnCars([ghost], surfaceHeight, {batched: false})).cars[0];
    },
  };
}

export type CarSets = ReturnType<typeof createCarSets>;
