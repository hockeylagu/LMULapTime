import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { BufferGeometry, Group, Mesh, MeshBasicMaterial, PropertyBinding, type Material, type Object3D, type Texture, type Vector3 } from 'three';
import type { CarLamp } from '../../../../../shared/types/scenes/car.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { normalizeVehicleId, type LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { createCarMaterial, materialTexturePaths } from '../car/carMaterials.js';
import { createLampMaterial, unlitFrame } from '../car/carLamps.js';
import { createContactShadow } from '../car/carContactShadow.js';
import { MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../../utils/lapAlignment.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import { createGhostClock } from '../../map/ghostSync.js';
import { makeCar } from '../sceneObjects.js';
import { createWheelAnimation } from '../wheelAnimation.js';
import { BASELINE_LINE, colorRacingLine, makeRacingLine, racingLineColors, refreshRacingLine, syncRacingLine } from '../racingLine.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import type { DisplayTransform } from '../autoExposure.js';
import { disposeObjects } from './disposeObjects.js';

export interface LapCars {
  primary: LoadedBody;
  baseline: LoadedBody | null;
}

/** Loads a shared car texture by its `textures/<sha256>.ktx2.zst` path under the cars folder. */
export type CarTextureLoader = (path: string) => Promise<Texture>;

/**
 * Gives a glow mesh its lamps' materials: each material slot a drawn lamp covers (one of the lamp's nodes is the mesh or holds it, and
 * the slot is the lamp's GLB material) takes that lamp's material, the other slots draw nothing. False when no slot is drawn. A mesh of
 * a lamp the player's own car leaves out in the cockpit is marked for the outside view only.
 */
function lightGlowMesh(mesh: Mesh<BufferGeometry, Material | Material[]>, drawn: CarLamp[], material: (lamp: CarLamp) => Material): boolean {
  const unseen = new MeshBasicMaterial({ visible: false }), names = new Set<string>();
  for (let at: Object3D | null = mesh; at; at = at.parent) names.add(at.name);
  const covering = drawn.filter(lamp => lamp.nodes.some(name => names.has(PropertyBinding.sanitizeNodeName(name))));
  let lit = false, hidden = false;
  const slot = (current: Material) => {
    const lamp = covering.find(row => row.material === current.name);
    if (!lamp) return unseen;
    lit = true; hidden ||= lamp.hiddenInOwnCockpit === true;
    return material(lamp);
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(slot) : slot(mesh.material);
  mesh.castShadow = false; mesh.receiveShadow = false;
  if (hidden) mesh.userData.cockpitView = 'out';
  return lit;
}

/** Lap objects own their geometry; replacing them cannot release the track's GPU buffers. */
export function createLapLayerLoader(origin: Vector3, surfaceHeight: SurfaceHeight, loadTexture: CarTextureLoader, display: () => DisplayTransform, shading: SceneryShading) {
  // Only buffers retained by the bounded asset cache keep these parsed templates alive.
  const templates = new WeakMap<ArrayBuffer, Promise<Group>>();
  const loadTemplate = (car: LoadedBody): Promise<Group> => {
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
  const loadParts = async (car: LoadedBody) => {
    const template = await loadTemplate(car), key = normalizeVehicleId(car.vehicleId);
    const appearance = car.descriptor.appearances.find(row => normalizeVehicleId(row.alias) === key);
    if (!appearance) throw Error(`The car package has no appearance for ${car.vehicleId}`);
    // Option parts are alternatives between entries (number plates, lights, body panels): this entry shows its own, the rest stay out.
    const shown = new Set(appearance.optionNodes), hidden = new Set<Object3D>();
    for (const name of car.descriptor.optionNodes) {
      const node = template.getObjectByName(name);
      if (!node) throw Error(`Car ${car.vehicleId} has no option part ${name}`);
      if (!shown.has(name)) hidden.add(node);
    }
    const isHidden = (object: Object3D) => { for (let at: Object3D | null = object; at; at = at.parent) if (hidden.has(at)) return true; return false; };
    const recipes = new Map(car.descriptor.materials.map(recipe => [recipe.id, recipe]));
    const recipeOf = (material: Material) => {
      const id: unknown = material.userData.nativeMaterialId, recipe = typeof id === 'string' ? recipes.get(id) : undefined;
      if (!recipe) throw Error(`Car material ${material.name} has no descriptor recipe`);
      return recipe;
    };
    // Glow materials (lamp glow meshes, brake disc glow) are drawn only through a lamp whose unlit frame is known.
    const glow = new Set(car.descriptor.glowMaterialIds);
    const drawn = car.descriptor.lamps.filter(lamp => unlitFrame(lamp) !== null);
    // The GLB loader drops `.`, `:`, `/`, `[` and `]` from node names; lamp nodes are the GLB's own names.
    for (const lamp of drawn) for (const name of lamp.nodes) if (!template.getObjectByName(PropertyBinding.sanitizeNodeName(name))) throw Error(`Car ${car.vehicleId} has no lamp node ${name}`);
    const isGlow = (object: Object3D) => {
      if (!(object instanceof Mesh)) return false;
      const list: Material[] = Array.isArray(object.material) ? object.material as Material[] : [object.material as Material];
      return list.every(material => glow.has(recipeOf(material).id));
    };
    const paths = new Set<string>();
    template.traverse(object => {
      if (!(object instanceof Mesh) || isHidden(object) || isGlow(object)) return;
      for (const material of Array.isArray(object.material) ? object.material as Material[] : [object.material as Material]) {
        for (const path of materialTexturePaths(recipeOf(material), appearance)) paths.add(path);
      }
    });
    for (const lamp of drawn) paths.add(unlitFrame(lamp)!);
    const textures = new Map(await Promise.all([...paths].map(async path => [path, await loadTexture(path)] as const)));
    return {template, appearance, recipeOf, isGlow, drawn, textures, hiddenNames: new Set([...hidden].map(node => node.name))};
  };
  /** A livery's parsed model and loaded textures, shared by every instance of that car (and by `preload`). */
  const parts = new WeakMap<LoadedBody, ReturnType<typeof loadParts>>();
  const partsOf = (car: LoadedBody) => {
    let pending = parts.get(car);
    if (!pending) {
      pending = loadParts(car);
      parts.set(car, pending);
      pending.catch(() => { if (parts.get(car) === pending) parts.delete(car); });
    }
    return pending;
  };
  /** A car instance of the lap's livery: the shared geometry with one material per native material, textures preloaded. */
  const loadModel = async (car: LoadedBody): Promise<Group> => {
    const {template, appearance, recipeOf, isGlow, drawn, textures, hiddenNames} = await partsOf(car);
    const model = template.clone(true), materials = new Map<string, Material>(), glowMeshes: Object3D[] = [];
    for (const name of hiddenNames) model.getObjectByName(name)?.removeFromParent();
    model.traverse(object => { if (isGlow(object)) glowMeshes.push(object); });
    const lampMaterials = new Map<CarLamp, Material>();
    for (const mesh of glowMeshes) if (!lightGlowMesh(mesh as Mesh<BufferGeometry, Material | Material[]>, drawn, lamp => {
      let created = lampMaterials.get(lamp);
      if (!created) { created = createLampMaterial(lamp, textures.get(unlitFrame(lamp)!)!); lampMaterials.set(lamp, created); }
      return created;
    })) mesh.removeFromParent();
    model.traverse(object => {
      if (!(object instanceof Mesh) || glowMeshes.includes(object)) return;
      const replace = (material: Material) => {
        const recipe = recipeOf(material);
        let created = materials.get(recipe.id);
        if (!created) { created = createCarMaterial(recipe, appearance, path => textures.get(path)!, shading); materials.set(recipe.id, created); }
        return created;
      };
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material as Material);
      object.castShadow = true; object.receiveShadow = true;
    });
    return model;
  };
  const load = async (trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapCars, colorBy: MapColorMode) => {
    const [primaryModel, baselineModel] = await Promise.all([loadModel(assets.primary), assets.baseline ? loadModel(assets.baseline) : null]);
    const primary = makeCar(MAP_COLORS.carBody, false, primaryModel);
    primaryModel.add(createContactShadow(primaryModel));
    const ghost = baseline && baselineModel ? makeCar(TELEMETRY_COLORS.baseline, true, baselineModel) : new Group();
    const primaryWheels = createWheelAnimation(primary, trajectory, surfaceHeight);
    const ghostWheels = baseline ? createWheelAnimation(ghost, baseline, surfaceHeight) : null;
    ghost.traverse(object => { if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; } });
    let colors = racingLineColors(trajectory, baseline, colorBy);
    const primaryLine = makeRacingLine(trajectory, origin, colors.primary, surfaceHeight, display);
    const baselineLine = baseline ? makeRacingLine(baseline, origin, colors.baseline, surfaceHeight, display, BASELINE_LINE.widthM, BASELINE_LINE.liftM) : null;
    const root = new Group(); root.add(primary, ghost, primaryLine); if (baselineLine) root.add(baselineLine);
    const primaryDistances = getTrajectoryDistances(trajectory.points, trajectory.trackLengthM);
    const baselineDistances = baseline ? getDistancesInReferenceFrame(baseline.points, trajectory.points, trajectory.trackLengthM) : [];
    return {
      root, trajectory, baseline, primary, ghost, primaryWheels, ghostWheels,
      /** The primary car's game cameras (cockpit, hood and roof views). */
      cameras: assets.primary.descriptor.cameras.list,
      primaryDistances, baselineDistances,
      /** Both laps' elapsed time against distance, for the time-synced ghost. */
      ghostClock: baseline ? createGhostClock(trajectory.points, primaryDistances, baseline.points, baselineDistances, trajectory.trackLengthM) : null,
      colorLines(next: MapColorMode) {
        colors = racingLineColors(trajectory, baseline, next);
        colorRacingLine(primaryLine, colors.primary); if (baselineLine) colorRacingLine(baselineLine, colors.baseline);
      },
      /** The camera type changed: re-bake the line colours for its display transform. */
      syncLines() { syncRacingLine(primaryLine); if (baselineLine) syncRacingLine(baselineLine); },
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
  /** Starts parsing the cars and loading their textures before the ground is ready; a failure surfaces from the later load. */
  const preload = (assets: LapCars) => {
    for (const car of [assets.primary, assets.baseline]) if (car) partsOf(car).catch(() => {});
  };
  return Object.assign(load, {preload});
}

export type LapLayer = Awaited<ReturnType<ReturnType<typeof createLapLayerLoader>>>;
