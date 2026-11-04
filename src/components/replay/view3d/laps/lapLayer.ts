import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { BufferGeometry, Group, Mesh, type Material, type Texture, type Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { normalizeVehicleId, type LoadedCar } from '../../../../api/vehicles/carApi.js';
import { albedoPath, createCarMaterial } from '../carMaterials.js';
import { MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../../utils/lapAlignment.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import { makeCar } from '../sceneObjects.js';
import { createWheelAnimation } from '../wheelAnimation.js';
import { BASELINE_LINE, colorRacingLine, makeRacingLine, racingLineColors, refreshRacingLine } from '../racingLine.js';
import type { SurfaceHeight } from '../surfaceProjection.js';
import { disposeObjects } from './disposeObjects.js';

export interface LapCars {
  primary: LoadedCar;
  baseline: LoadedCar | null;
}

/** Loads a shared car texture by its `textures/<sha256>.ktx2` path under the cars folder. */
export type CarTextureLoader = (path: string) => Promise<Texture>;

/** Lap objects own their geometry; replacing them cannot release the track's GPU buffers. */
export function createLapLayerLoader(origin: Vector3, surfaceHeight: SurfaceHeight, loadTexture: CarTextureLoader) {
  // Only buffers retained by the bounded asset cache keep these parsed templates alive.
  const templates = new WeakMap<ArrayBuffer, Promise<Group>>();
  const loadTemplate = (car: LoadedCar): Promise<Group> => {
    let pending = templates.get(car.bytes);
    if (!pending) {
      pending = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(car.bytes, '').then(result => {
        result.scene.traverse(object => {
          if (object instanceof Mesh && object.geometry instanceof BufferGeometry) object.geometry.userData.sharedAsset = true;
        });
        return result.scene;
      });
      templates.set(car.bytes, pending);
    }
    return pending;
  };
  /** A car instance of the lap's livery: the shared geometry with one material per native material, textures preloaded. */
  const loadModel = async (car: LoadedCar): Promise<Group> => {
    const template = await loadTemplate(car), key = normalizeVehicleId(car.vehicleId);
    const appearance = car.descriptor.appearances.find(row => normalizeVehicleId(row.alias) === key);
    if (!appearance) throw Error(`The car package has no appearance for ${car.vehicleId}`);
    const recipes = new Map(car.descriptor.materials.map(recipe => [recipe.id, recipe]));
    const recipeOf = (material: Material) => {
      const id: unknown = material.userData.nativeMaterialId, recipe = typeof id === 'string' ? recipes.get(id) : undefined;
      if (!recipe) throw Error(`Car material ${material.name} has no descriptor recipe`);
      return recipe;
    };
    const paths = new Set<string>();
    template.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material as Material[] : [object.material as Material]) {
        const path = albedoPath(recipeOf(material), appearance);
        if (path) paths.add(path);
      }
    });
    const textures = new Map(await Promise.all([...paths].map(async path => [path, await loadTexture(path)] as const)));
    const model = template.clone(true), materials = new Map<string, Material>();
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const replace = (material: Material) => {
        const recipe = recipeOf(material);
        let created = materials.get(recipe.id);
        if (!created) { created = createCarMaterial(recipe, appearance, path => textures.get(path)!); materials.set(recipe.id, created); }
        return created;
      };
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material as Material);
      object.castShadow = true; object.receiveShadow = true;
    });
    return model;
  };
  return async (trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapCars, colorBy: MapColorMode) => {
    const [primaryModel, baselineModel] = await Promise.all([loadModel(assets.primary), assets.baseline ? loadModel(assets.baseline) : null]);
    const primary = makeCar(trajectory, MAP_COLORS.carBody, false, primaryModel);
    const ghost = baseline && baselineModel ? makeCar(baseline, TELEMETRY_COLORS.baseline, true, baselineModel) : new Group();
    const primaryWheels = createWheelAnimation(primary, trajectory, surfaceHeight);
    const ghostWheels = baseline ? createWheelAnimation(ghost, baseline, surfaceHeight) : null;
    ghost.traverse(object => { if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; } });
    let colors = racingLineColors(trajectory, baseline, colorBy);
    const primaryLine = makeRacingLine(trajectory, origin, colors.primary, surfaceHeight);
    const baselineLine = baseline ? makeRacingLine(baseline, origin, colors.baseline, surfaceHeight, BASELINE_LINE.widthM, BASELINE_LINE.liftM) : null;
    const root = new Group(); root.add(primary, ghost, primaryLine); if (baselineLine) root.add(baselineLine);
    return {
      root, trajectory, baseline, primary, ghost, primaryWheels, ghostWheels,
      primaryDistances: getTrajectoryDistances(trajectory.points, trajectory.trackLengthM),
      baselineDistances: baseline ? getDistancesInReferenceFrame(baseline.points, trajectory.points, trajectory.trackLengthM) : [],
      colorLines(next: MapColorMode) {
        colors = racingLineColors(trajectory, baseline, next);
        colorRacingLine(primaryLine, colors.primary); if (baselineLine) colorRacingLine(baselineLine, colors.baseline);
      },
      fadeLines(primaryOpacity: number, baselineOpacity: number) {
        primaryLine.material.opacity = primaryOpacity;
        if (baselineLine) baselineLine.material.opacity = baselineOpacity;
      },
      /** Scenery streams in after the lines were draped: re-drape them on the road that is resident now. */
      refreshHeights() {
        primaryWheels.refreshHeights(); ghostWheels?.refreshHeights();
        refreshRacingLine(primaryLine, trajectory, origin, colors.primary, surfaceHeight);
        if (baselineLine && baseline) refreshRacingLine(baselineLine, baseline, origin, colors.baseline, surfaceHeight, BASELINE_LINE.widthM, BASELINE_LINE.liftM);
      },
      dispose() { root.removeFromParent(); disposeObjects(root); },
    };
  };
}

export type LapLayer = Awaited<ReturnType<ReturnType<typeof createLapLayerLoader>>>;
