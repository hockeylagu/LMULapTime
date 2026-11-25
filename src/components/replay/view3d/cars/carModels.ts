import { BufferGeometry, Mesh, MeshBasicMaterial, PropertyBinding, RepeatWrapping, SRGBColorSpace, type Group, type Material, type Object3D, type Texture } from 'three';
import type { CarLamp } from '../../../../../shared/types/scenes/car.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { appearanceOf, startFileOf, type LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { carMaterialKey, carPartOrder, carSortOffset, createCarMaterial, materialTexturePaths } from '../car/carMaterials.js';
import { cockpitVolumeTexture } from '../car/cockpitOcclusion.js';
import { createLampMaterial, lampFrame, lampGlow, lampTexturePaths, surfaceLamp } from '../car/carLamps.js';
import { flashes, lampStateFrames, rainLampsFlash, switches } from '../car/lampStates.js';
import { createContactShadow } from '../car/carContactShadow.js';
import { createReadoutCanvas, type ReadoutCanvas } from '../car/readoutCanvas.js';
import { MAP_COLORS } from '../../../../utils/themeColors.js';
import { makeCar } from './carObject.js';
import type { CarTemplates } from './carTemplates.js';

/**
 * The scene's car textures. `load` reads a shared texture by its `textures/<sha256>.ktx2.zst` path under the cars folder, from
 * its start file at `start` when the body lists one. `copied` is told of each map's own copy of a texture; `interior` says only
 * the car's interior uses it; `field` that a car of the race's field draws it (not the car the cameras ride on, nor the ghost).
 */
export interface CarTextures {
  load(path: string, start: {path: string; skip: number} | undefined): Promise<Texture>;
  copied(copy: Texture, original: Texture, interior: boolean, field: boolean): void;
}

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

/** A model of the body's exterior, or of its cabin (`CarTemplates.cabin`). */
type ModelKind = 'body' | 'cabin';

/**
 * Each livery's car models from the scene's parsed bodies: one material per native material and content, the livery's textures
 * loaded first, lamps and glow meshes set up. `shareMaterials` gives every car of a body the same material for the same content
 * (cars drawn many at once); without it each car owns its materials (a ghost changes them). A cabin is modelled as a body is.
 */
export function createCarModels(templates: CarTemplates, carTextures: CarTextures, shading: SceneryShading,
  {shareMaterials = false}: {shareMaterials?: boolean} = {}) {
  const loadParts = async (car: LoadedBody, kind: ModelKind) => {
    const template = await (kind === 'cabin' ? templates.cabin(car) : templates.body(car)), appearance = appearanceOf(car);
    if (!appearance) throw Error(`The car package has no appearance for ${car.vehicleId}`);
    // Option parts are alternatives between entries (number plates, lights, body panels): this entry shows its own, the rest stay out.
    const shown = new Set(appearance.optionNodes), hidden = new Set<Object3D>();
    // Only a whole body holds every option and lamp part: the exterior lacks the interior file's (an inside windscreen), and a cabin
    // holds a few parts alone.
    const partial = kind === 'cabin' || car.resource.interior !== null;
    for (const name of car.descriptor.optionNodes) {
      const node = template.getObjectByName(name);
      if (!node && partial) continue;
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
    if (!partial) for (const lamp of [...drawn, ...surfaces]) for (const name of lamp.nodes) if (!template.getObjectByName(PropertyBinding.sanitizeNodeName(name))) throw Error(`Car ${car.vehicleId} has no lamp node ${name}`);
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
    // A native material carries its vertex colour on every part or on none (none: white everywhere); its shaders read white without it.
    const coloured = new Map<string, boolean>();
    template.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const has = '_lmu_colour' in (object.geometry as BufferGeometry).attributes;
      for (const material of Array.isArray(object.material) ? object.material as Material[] : [object.material as Material]) {
        const recipe = recipeOf(material);
        if (coloured.get(recipe.id) === !has) throw Error(`Car ${car.vehicleId} material ${recipe.name} has vertex colours on some parts only`);
        coloured.set(recipe.id, has);
      }
    });
    const white = (material: Material) => coloured.get(recipeOf(material).id) === false;
    // A surface lamp's slot is a car part on a glow mesh: its material's textures load like the other parts'.
    const surfaceNames = new Set(surfaces.map(lamp => lamp.material));
    for (const recipe of car.descriptor.materials) if (surfaceNames.has(recipe.name)) for (const path of materialTexturePaths(recipe, appearance)) paths.set(path, false);
    // A lamp draws its frames' textures as loaded, so a frame loads from its own file, never from a start file.
    const frames = new Set(drawn.flatMap(lamp => lampTexturePaths(lamp, rainFlashes, glows.get(lamp)!)));
    for (const frame of frames) paths.set(frame, false);
    // The entry's readout (wheel and dash screens) is drawn on a car with its own materials, the lap's: its element atlases and font sheets load with the cabin's.
    const readout = !shareMaterials && appearance.readout !== null ? car.descriptor.readouts[appearance.readout] ?? null : null;
    if (appearance.readout !== null && !readout && !shareMaterials) throw Error(`Car ${car.vehicleId} has no readout ${appearance.readout}`);
    for (const element of readout?.elements ?? []) if (element.texture !== null) paths.set(element.texture, paths.get(element.texture) !== false);
    for (const font of readout?.fonts ?? []) paths.set(font.texture, paths.get(font.texture) !== false);
    const textures = new Map(await Promise.all([...paths.keys()].map(async path =>
      [path, await carTextures.load(path, frames.has(path) ? undefined : startFileOf(car, path))] as const)));
    // The cabin volumes, built once a livery; each material samples its own copy of the same source.
    const volumes = new Map(car.resource.volumes.map(row => {
      const path = `volumes/${row.sha256}.bin`, bytes = car.volumes.get(path);
      if (!bytes) throw Error(`Car ${car.vehicleId} has no cabin volume ${path}`);
      return [path, cockpitVolumeTexture(bytes, row)] as const;
    }));
    return {template, appearance, recipeOf, white, isGlow, drawn, glows, surfaces, rainFlashes, textures, volumes, readout, interiorPaths: paths, hiddenNames: new Set([...hidden].map(node => node.name))};
  };
  /** With `shareMaterials`, the materials of each parsed body, by content: every car of the body draws with the same ones. */
  const sharedMaterials = new WeakMap<Group, Map<string, Material>>(), shared = new WeakSet<Material>();
  /** A livery's parsed model and loaded textures, shared by the instances of that car built while they load (as the parse). */
  const parts = {body: new WeakMap<LoadedBody, ReturnType<typeof loadParts>>(), cabin: new WeakMap<LoadedBody, ReturnType<typeof loadParts>>()};
  const partsOf = (car: LoadedBody, kind: ModelKind) => {
    const pendings = parts[kind];
    let pending = pendings.get(car);
    if (!pending) {
      pending = loadParts(car, kind);
      pendings.set(car, pending);
      const settled = () => { if (pendings.get(car) === pending) pendings.delete(car); };
      pending.then(settled, settled);
    }
    return pending;
  };
  /** A car instance of the lap's livery: the shared geometry with one material per native material, textures preloaded. */
  const loadModel = async (car: LoadedBody, kind: ModelKind = 'body'): Promise<Group> => {
    const {template, appearance, recipeOf, white, isGlow, drawn, glows, surfaces, rainFlashes, textures, volumes, readout, interiorPaths, hiddenNames} = await partsOf(car, kind);
    const copyOf = (path: string) => {
      const original = textures.get(path)!, copy = original.clone();
      // Shared materials are the field's (`shareMaterials`); the car the cameras ride on and the ghost own theirs.
      carTextures.copied(copy, original, interiorPaths.get(path) === true, shareMaterials);
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
    // The readout canvas replaces the albedo of the screen materials it names: one canvas for the model, made at its first such material.
    let canvas: ReadoutCanvas | null = null;
    const atlasOf = (path: string) => {
      const copy = copyOf(path);
      copy.wrapS = RepeatWrapping; copy.wrapT = RepeatWrapping; copy.colorSpace = SRGBColorSpace; copy.needsUpdate = true;
      return copy;
    };
    const showsReadout = (material: Material) => readout !== null && recipeOf(material).name === readout.material;
    const replace = (material: Material) => {
      const recipe = recipeOf(material), plain = white(material), screen = showsReadout(material);
      const key = `${carMaterialKey(recipe, appearance)}${plain ? '|white' : ''}${screen ? '|readout' : ''}`;
      let created = materials.get(key);
      if (!created) {
        let texture = copyOf;
        if (screen) {
          const albedo = recipe.surface?.maps.albedo?.texture;
          if (!albedo) throw Error(`Car ${car.vehicleId} readout material ${recipe.name} has no albedo map`);
          canvas ??= createReadoutCanvas(readout!, atlasOf);
          const shown = canvas.texture;
          texture = path => path === albedo ? shown : copyOf(path);
        }
        created = createCarMaterial(recipe, appearance, texture, shading, volumeOf, !plain);
        // The canvas is the game's sRGB render target, whatever the file texture's colour role.
        if (screen) canvas!.texture.colorSpace = SRGBColorSpace;
        materials.set(key, created); if (shareMaterials) shared.add(created);
      }
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
      created = createLampMaterial(lamp, glow, switching?.maps.get(lamp.states!.off ?? lamp.states!.on!) ?? copyOf(lampFrame(lamp, rainFlashes, glow)!), switching, !white(current));
      if (created.transparent) created.userData.sortOffset = carSortOffset(recipeOf(current));
      lampMaterials.set(lamp, created);
      return created;
    })) mesh.removeFromParent();
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      if (!glowMeshes.includes(object)) {
        const screen = (Array.isArray(object.material) ? object.material as Material[] : [object.material as Material]).some(showsReadout);
        object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material as Material);
        if (screen) object.userData.readoutCanvas = canvas;
        object.castShadow = true; object.receiveShadow = true;
      }
      // The blended parts draw in the game's order: the outside windscreen over the lamp glows.
      object.renderOrder = carPartOrder(Array.isArray(object.material) ? object.material as Material[] : [object.material as Material]);
    });
    return model;
  };
  /**
   * A car of `body` drawn part by part on the model's shared geometry: a batch copies the whole body, every distance level
   * included, so many cars in one scene would hold that copy each.
   */
  const car = async (body: LoadedBody) => {
    const model = await loadModel(body), built = makeCar(MAP_COLORS.carBody, false, model);
    model.add(createContactShadow(model, body.resource.folder));
    return built;
  };
  /** Whether every car of a body draws with this material (`shareMaterials`): the loader keeps it, a dropped car leaves it. */
  const sharedMaterial = (material: Material) => shared.has(material);
  /** The body's cabin parts with their materials (`CarTemplates.cabin`), each naming the car node it hangs under. */
  const cabin = (body: LoadedBody) => loadModel(body, 'cabin');
  return {model: loadModel, car, cabin, sharedMaterial};
}
