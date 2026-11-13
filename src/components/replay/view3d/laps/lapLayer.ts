import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { Box3, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, PropertyBinding, Vector3, type BufferAttribute, type InterleavedBuffer, type InterleavedBufferAttribute, type Material, type Object3D, type Texture } from 'three';
import type { CarLamp } from '../../../../../shared/types/scenes/car.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { descriptorTexturePath, normalizeVehicleId } from '../../../../../shared/packageContract/index.js';
import { carMaterialKey, createCarMaterial, materialTexturePaths } from '../car/carMaterials.js';
import { batchCarParts } from '../car/carBatches.js';
import { cockpitVolumeTexture } from '../car/cockpitOcclusion.js';
import { createLampMaterial, lampFrame, lampGlow, lampTexturePaths, surfaceLamp } from '../car/carLamps.js';
import { createLampStates, flashes, lampStateFrames, rainLampsFlash, switches } from '../car/lampStates.js';
import { createContactShadow } from '../car/carContactShadow.js';
import { MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../../utils/lapAlignment.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import { createGhostClock } from '../../map/ghostSync.js';
import { makeCar } from '../cars/sceneObjects.js';
import { createWheelAnimation } from '../cars/wheelAnimation.js';
import { BASELINE_LINE, colorRacingLine, makeRacingLine, racingLineColors, refreshRacingLine, syncRacingLine } from './racingLine.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import type { DisplayTransform } from '../autoExposure.js';
import { disposeObjects } from '../scene/disposeObjects.js';

export interface LapCars {
  primary: LoadedBody;
  baseline: LoadedBody | null;
}

/**
 * The scene's car textures. `load` reads a shared texture by its `textures/<sha256>.ktx2.zst` path under the cars folder, from
 * its start file at `start` when the body lists one; `interior` says only the car's interior uses it. `copied` is told of
 * each map's own copy of a texture.
 */
export interface CarTextures {
  load(path: string, interior: boolean, start: {path: string; skip: number} | undefined): Promise<Texture>;
  copied(copy: Texture, original: Texture, interior: boolean): void;
}

/** The model node the car body's fixed parts hang under, in the body's file and in its interior's. */
const CHASSIS = 'chassis';

/** Whether a lamp lights with the rain light: a rain lamp, or a pit lamp whose light a rain lamp also lists (same material and a node). */
function lightsWithRain(lamp: CarLamp, lamps: readonly CarLamp[]): boolean {
  if (lamp.role === 'rain') return true;
  return lamp.role === 'pit' && lamps.some(row => row.role === 'rain' && row.material === lamp.material && row.nodes.some(name => lamp.nodes.includes(name)));
}

/**
 * Gives a glow mesh its lamps' materials: each material slot a drawn lamp covers (one of the lamp's nodes is the mesh or holds it, and
 * the slot is the lamp's GLB material) takes `material(lamp, slot)` (a lamp material, or a surface lamp's car material), the other
 * slots draw nothing. False when no slot is drawn. A mesh of a lamp the player's own car leaves out in the cockpit is marked for the
 * outside view only. `rainFlashes`: see `rainLampsFlash`.
 */
function lightGlowMesh(mesh: Mesh<BufferGeometry, Material | Material[]>, drawn: CarLamp[], rainFlashes: boolean, material: (lamp: CarLamp, current: Material) => Material): boolean {
  const unseen = new MeshBasicMaterial({ visible: false }), names = new Set<string>();
  for (let at: Object3D | null = mesh; at; at = at.parent) names.add(at.name);
  const covering = drawn.filter(lamp => lamp.nodes.some(name => names.has(PropertyBinding.sanitizeNodeName(name))));
  let lit = false, hidden = false;
  const slot = (current: Material) => {
    // A mesh both a rain and a pit lamp list (a shared rear light) takes the pit lamp's material, which also lights with the rain light.
    const matching = covering.filter(row => row.material === current.name);
    const lamp = matching.find(row => flashes(row, rainFlashes)) ?? matching.find(row => switches(row, rainFlashes)) ?? matching[0];
    if (!lamp) return unseen;
    lit = true; hidden ||= lamp.hiddenInOwnCockpit === true;
    return material(lamp, current);
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(slot) : slot(mesh.material);
  mesh.castShadow = false; mesh.receiveShadow = false;
  if (hidden) mesh.userData.cockpitView = 'out';
  return lit;
}

/** Drops a buffer's CPU copy once it is on the GPU (three.js keeps it otherwise): called by the renderer after the upload. */
function releaseUploaded(this: BufferAttribute | InterleavedBuffer): void {
  (this as {array: unknown}).array = null;
}

/** A geometry's buffers: its index and each attribute's (an interleaved attribute's shared buffer). */
export function geometryBuffers(geometry: BufferGeometry): Array<BufferAttribute | InterleavedBuffer> {
  const attributes = geometry.attributes as Record<string, BufferAttribute | InterleavedBufferAttribute | undefined>;
  return [geometry.index, ...Object.values(attributes)].flatMap((attribute): Array<BufferAttribute | InterleavedBuffer> => !attribute ? []
    : (attribute as Partial<InterleavedBufferAttribute>).isInterleavedBufferAttribute ? [(attribute as InterleavedBufferAttribute).data] : [attribute as BufferAttribute]);
}

/** Each buffer of the geometry drops its CPU copy once the renderer has uploaded it. */
export function releaseOnUpload(geometry: BufferGeometry): void {
  for (const buffer of geometryBuffers(geometry)) buffer.onUpload(releaseUploaded);
}

/**
 * Prepares a parsed body for its vertices to leave the CPU: each geometry's bounds, and each part's exact box in the body's frame
 * (`userData.footprint`, min then max), which the contact shadow reads instead of the vertices. With `release`, each buffer then
 * drops its CPU copy once uploaded.
 */
function prepareGeometry(body: Group, release: boolean): void {
  body.updateWorldMatrix(true, true);
  const toBody = new Matrix4().copy(body.matrixWorld).invert(), frame = new Matrix4(), point = new Vector3(), box = new Box3();
  body.traverse(object => {
    const geometry: unknown = object instanceof Mesh ? object.geometry : null;
    if (!(geometry instanceof BufferGeometry)) return;
    const attributes = geometry.attributes as Record<string, BufferAttribute | InterleavedBufferAttribute | undefined>, position = attributes.position;
    geometry.userData.sharedAsset = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    if (position) {
      frame.multiplyMatrices(toBody, object.matrixWorld); box.makeEmpty();
      for (let index = 0; index < position.count; index++) box.expandByPoint(point.fromBufferAttribute(position, index).applyMatrix4(frame));
      object.userData.footprint = [...box.min.toArray(), ...box.max.toArray()];
    }
    if (release) releaseOnUpload(geometry as BufferGeometry);
  });
}

/**
 * Lap objects own their geometry; replacing them cannot release the track's GPU buffers. `releaseUploaded` drops the bodies'
 * vertices from the CPU once they are on the GPU: for a scene that never batches a car after its body is first drawn (the race;
 * the lap view batches each lap's cars from the parsed body). `shareMaterials` gives every car of a body the same material for the
 * same content (a field of cars drawn from shared batches); without it each car owns its materials (a ghost, or a reflection probe,
 * changes them).
 */
export function createLapLayerLoader(origin: Vector3, surfaceHeight: SurfaceHeight, carTextures: CarTextures, display: () => DisplayTransform, shading: SceneryShading,
  {releaseUploaded: release = false, shareMaterials = false}: {releaseUploaded?: boolean; shareMaterials?: boolean} = {}) {
  // Parsed once per body for the scene's life; the files themselves are read for the parse only.
  const templates = new Map<string, Promise<Group>>();
  const loadTemplate = (car: LoadedBody): Promise<Group> => {
    // By folder too: a scene that batches a body's cars drops the parse's vertices for that body alone.
    const key = `${car.resource.folder}:${car.resource.sha256}:${car.resource.interior?.sha256 ?? ''}`;
    let pending = templates.get(key);
    if (!pending) {
      const parse = (bytes: ArrayBuffer) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '').then(result => result.scene);
      pending = car.files().then(({bytes, interiorBytes}) => Promise.all([parse(bytes), interiorBytes ? parse(interiorBytes) : null])).then(([body, interior]) => {
        // The interior's parts hang under its chassis node and join the body's: one model, whose driver-camera parts the
        // cockpit view switches.
        if (interior) {
          const chassis = body.getObjectByName(CHASSIS), parts = interior.getObjectByName(CHASSIS);
          if (!chassis || !parts) throw Error(`Car ${car.vehicleId} has no chassis node for its interior`);
          chassis.add(...parts.children);
        }
        prepareGeometry(body, release);
        return body;
      });
      templates.set(key, pending);
      pending.catch(() => { if (templates.get(key) === pending) templates.delete(key); });
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
    // Glow materials (lamp glow meshes, brake disc glow) are drawn only through a lamp whose frame is known, or a surface lamp's
    // own material (`surfaceLamp`).
    const glow = new Set(car.descriptor.glowMaterialIds);
    const surfaces = car.descriptor.lamps.filter(lamp => surfaceLamp(lamp, car.descriptor.materials));
    const rainFlashes = rainLampsFlash(car.descriptor.lamps);
    const glows = new Map(car.descriptor.lamps.map(lamp => [lamp, lampGlow(lamp, car.descriptor.materials)] as const));
    const drawn = car.descriptor.lamps.filter(lamp => lampFrame(lamp, rainFlashes, glows.get(lamp)!) !== null);
    // The GLB loader drops `.`, `:`, `/`, `[` and `]` from node names; lamp nodes are the GLB's own names.
    for (const lamp of [...drawn, ...surfaces]) for (const name of lamp.nodes) if (!template.getObjectByName(PropertyBinding.sanitizeNodeName(name))) throw Error(`Car ${car.vehicleId} has no lamp node ${name}`);
    const isGlow = (object: Object3D) => {
      if (!(object instanceof Mesh)) return false;
      const list: Material[] = Array.isArray(object.material) ? object.material as Material[] : [object.material as Material];
      return list.every(material => glow.has(recipeOf(material).id));
    };
    // A texture is the interior's when every mesh that uses it carries the package's interior mark (its own or a parent's).
    const isInterior = (object: Object3D) => { for (let at: Object3D | null = object; at; at = at.parent) if (at.userData.interior === true) return true; return false; };
    const paths = new Map<string, boolean>();
    template.traverse(object => {
      if (!(object instanceof Mesh) || isHidden(object) || isGlow(object)) return;
      const interior = isInterior(object);
      for (const material of Array.isArray(object.material) ? object.material as Material[] : [object.material as Material]) {
        for (const path of materialTexturePaths(recipeOf(material), appearance)) paths.set(path, interior && paths.get(path) !== false);
      }
    });
    // A surface lamp's slot is a car part on a glow mesh: its material's textures load like the other parts'.
    const surfaceNames = new Set(surfaces.map(lamp => lamp.material));
    for (const recipe of car.descriptor.materials) if (surfaceNames.has(recipe.name)) for (const path of materialTexturePaths(recipe, appearance)) paths.set(path, false);
    // A lamp draws its frames' textures as loaded, so a frame loads from its own file, never from a start file.
    const frames = new Set(drawn.flatMap(lamp => lampTexturePaths(lamp, rainFlashes, glows.get(lamp)!)));
    for (const frame of frames) paths.set(frame, false);
    // A start file leaves out the full file's levels above its own (the row states both level counts).
    const starts = new Map(car.resource.textures.flatMap(row => row.start && row.levels !== undefined
      ? [[descriptorTexturePath(row.sha256), {path: descriptorTexturePath(row.start.sha256), skip: row.levels - row.start.levels}] as const] : []));
    const textures = new Map(await Promise.all([...paths].map(async ([path, interior]) =>
      [path, await carTextures.load(path, interior, frames.has(path) ? undefined : starts.get(path))] as const)));
    // The cabin volumes, built once a livery; each material samples its own copy of the same source.
    const volumes = new Map(car.resource.volumes.map(row => {
      const path = `volumes/${row.sha256}.bin`, bytes = car.volumes.get(path);
      if (!bytes) throw Error(`Car ${car.vehicleId} has no cabin volume ${path}`);
      return [path, cockpitVolumeTexture(bytes, row)] as const;
    }));
    return {template, appearance, recipeOf, isGlow, drawn, glows, surfaces, rainFlashes, textures, volumes, interiorPaths: paths, hiddenNames: new Set([...hidden].map(node => node.name))};
  };
  /** With `shareMaterials`, the materials of each parsed body, by content: every car of the body draws with the same ones. */
  const sharedMaterials = new WeakMap<Group, Map<string, Material>>();
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
    const {template, appearance, recipeOf, isGlow, drawn, glows, surfaces, rainFlashes, textures, volumes, interiorPaths, hiddenNames} = await partsOf(car);
    const copyOf = (path: string) => {
      const original = textures.get(path)!, copy = original.clone();
      carTextures.copied(copy, original, interiorPaths.get(path) === true);
      return copy;
    };
    const volumeOf = (path: string) => {
      const original = volumes.get(path);
      if (!original) throw Error(`Car ${car.vehicleId} declares no cabin volume ${path}`);
      return original.clone();
    };
    const model = template.clone(true), glowMeshes: Object3D[] = [];
    for (const name of hiddenNames) model.getObjectByName(name)?.removeFromParent();
    model.traverse(object => { if (isGlow(object)) glowMeshes.push(object); });
    // One material per lamp, and one per distinct material content: a car file repeats a material under many names.
    const lampMaterials = new Map<CarLamp, Material>();
    let materials = shareMaterials ? sharedMaterials.get(template) : undefined;
    if (!materials) { materials = new Map<string, Material>(); if (shareMaterials) sharedMaterials.set(template, materials); }
    const replace = (material: Material) => {
      const recipe = recipeOf(material), key = carMaterialKey(recipe, appearance);
      let created = materials.get(key);
      if (!created) { created = createCarMaterial(recipe, appearance, copyOf, shading, volumeOf); materials.set(key, created); }
      return created;
    };
    for (const mesh of glowMeshes) if (!lightGlowMesh(mesh as Mesh<BufferGeometry, Material | Material[]>, [...drawn, ...surfaces], rainFlashes, (lamp, current) => {
      if (surfaces.includes(lamp)) return replace(current);
      let created = lampMaterials.get(lamp);
      if (created) return created;
      // A lamp with states switches between its own copies of each state's frame; it starts on its off frame.
      const switching = switches(lamp, rainFlashes) ? {flashes: flashes(lamp, rainFlashes), rain: lightsWithRain(lamp, drawn), states: lamp.states, maps: new Map(lampStateFrames(lamp.states).flatMap(index => {
        const frame = lamp.frames[index];
        return frame === null ? [] : [[index, copyOf(frame)] as const];
      }))} : undefined;
      const glow = glows.get(lamp)!;
      created = createLampMaterial(lamp, glow, switching?.maps.get(lamp.states!.off ?? lamp.states!.on!) ?? copyOf(lampFrame(lamp, rainFlashes, glow)!), switching);
      lampMaterials.set(lamp, created);
      return created;
    })) mesh.removeFromParent();
    model.traverse(object => {
      if (!(object instanceof Mesh) || glowMeshes.includes(object)) return;
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material as Material);
      object.castShadow = true; object.receiveShadow = true;
    });
    return model;
  };
  const buildCars = async (assets: LapCars) => {
    const [primaryModel, baselineModel] = await Promise.all([loadModel(assets.primary), assets.baseline ? loadModel(assets.baseline) : null]);
    const primary = makeCar(MAP_COLORS.carBody, false, primaryModel);
    primaryModel.add(createContactShadow(primaryModel));
    // The ghost stays part by part: its see-through parts are drawn in a fixed order.
    const primaryBatches = batchCarParts(primaryModel);
    const ghost = baselineModel ? makeCar(TELEMETRY_COLORS.baseline, true, baselineModel) : null;
    ghost?.traverse(object => { if (object instanceof Mesh) { object.castShadow = false; object.receiveShadow = false; } });
    return {primary, ghost, primaryBatches};
  };
  /** The cars `preload` built for the next load of the same `assets`: a load takes them, so no two layers share a car. */
  const preloaded = new WeakMap<LapCars, ReturnType<typeof buildCars>>();
  const load = async (trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapCars, colorBy: MapColorMode) => {
    const built = preloaded.get(assets) ?? buildCars(assets);
    preloaded.delete(assets);
    const cars = await built, primary = cars.primary, primaryBatches = cars.primaryBatches, ghost = baseline && cars.ghost ? cars.ghost : new Group();
    const primaryWheels = createWheelAnimation(primary, trajectory, surfaceHeight);
    const ghostWheels = baseline ? createWheelAnimation(ghost, baseline, surfaceHeight) : null;
    const lights = (car: Group, points: ReplayTrajectoryData['points']) => [createLampStates(car, points)].filter(light => light !== null);
    const primaryLights = lights(primary, trajectory.points), ghostLights = baseline ? lights(ghost, baseline.points) : [];
    let colors = racingLineColors(trajectory, baseline, colorBy);
    const primaryLine = makeRacingLine(trajectory, origin, colors.primary, surfaceHeight, display);
    const baselineLine = baseline ? makeRacingLine(baseline, origin, colors.baseline, surfaceHeight, display, BASELINE_LINE.widthM, BASELINE_LINE.liftM) : null;
    const root = new Group(); root.add(primary, ghost, primaryLine); if (baselineLine) root.add(baselineLine);
    const primaryDistances = getTrajectoryDistances(trajectory.points, trajectory.trackLengthM);
    const baselineDistances = baseline ? getDistancesInReferenceFrame(baseline.points, trajectory.points, trajectory.trackLengthM) : [];
    return {
      root, trajectory, baseline, primary, ghost, primaryWheels, ghostWheels, primaryLights, ghostLights,
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
        // Opacity 0 hides a line: nothing to draw, and nothing for its transparent pass to sort.
        primaryLine.material.opacity = primaryOpacity; primaryLine.visible = primaryOpacity > 0;
        if (baselineLine) { baselineLine.material.opacity = baselineOpacity; baselineLine.visible = baselineOpacity > 0; }
      },
      /** The primary car's batched parts follow its wheels, steering and shown parts: call before each frame is drawn. */
      syncParts() { primaryBatches.sync(); },
      /** Scenery streams in after the lines were draped: re-drape them on the road that is resident now. */
      refreshHeights() {
        primaryWheels.refreshHeights(); ghostWheels?.refreshHeights();
        refreshRacingLine(primaryLine, trajectory, origin, colors.primary, surfaceHeight);
        if (baselineLine && baseline) refreshRacingLine(baselineLine, baseline, origin, colors.baseline, surfaceHeight, BASELINE_LINE.widthM, BASELINE_LINE.liftM);
      },
      dispose() { root.removeFromParent(); primaryBatches.dispose(); disposeObjects(root); },
    };
  };
  /**
   * Builds the lap's cars before the ground is ready: they need none, so the caller can compile and upload them while the scenery
   * loads. The next load of the same `assets` takes them; a failure surfaces from that load too.
   */
  const preload = (assets: LapCars) => {
    const built = buildCars(assets);
    preloaded.set(assets, built);
    return built;
  };
  /**
   * A car of `body` drawn part by part on the model's shared geometry: a batch copies the whole body, every distance level
   * included, so many cars in one scene would hold that copy each.
   */
  const car = async (body: LoadedBody) => {
    const model = await loadModel(body), built = makeCar(MAP_COLORS.carBody, false, model);
    model.add(createContactShadow(model));
    return built;
  };
  return Object.assign(load, {preload, car});
}

export type LapLayer = Awaited<ReturnType<ReturnType<typeof createLapLayerLoader>>>;
