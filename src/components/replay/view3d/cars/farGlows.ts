import { BufferGeometry, Group, InstancedMesh, type Matrix4, type Material, type Object3D } from 'three';
import { normalizeVehicleId, type CarLamp } from '../../../../../shared/packageContract/index.js';
import { appearanceOf, startFileOf, type LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { createLampMaterial, lampGlow } from '../car/carLamps.js';
import { lampStateFrame } from '../car/lampStates.js';
import type { CarTextures } from './carModels.js';
import type { FarLamps } from './farCars.js';

/** Far cars whose lamps can glow at once: one instance each per glowing lamp. */
export const FAR_GLOW_MAX = 16;

/** A far car whose lamps may glow this frame. */
export interface FarGlowCar {
  /** Its livery (the appearance's option parts decide which lamps it has). */
  body: LoadedBody;
  /** The far model's body frame in the glows' parent: the car's matrix times its body envelope's. */
  frame: Matrix4;
  braking: boolean;
  headlights: boolean;
}

export interface FarGlows {
  /** A body's lamp glow meshes, given once its far model is read and before any of its cars is drawn. */
  lamps(body: LoadedBody, far: FarLamps): void;
  /** The glowing lamps of these cars (nearest first, at most `FAR_GLOW_MAX`); a body without its glows yet starts loading them. */
  draw(cars: readonly FarGlowCar[]): void;
  dispose(): void;
}

/** One glowing frame of a lamp on one part of its glow mesh: its instances are the cars showing that frame. */
interface GlowFrame {
  lamp: CarLamp & {states: NonNullable<CarLamp['states']>};
  frame: number;
  /** The option parts the triangles belong to: a livery shows them only with all of them. */
  options: string[];
  mesh: InstancedMesh;
}

/** The headlight and brake lamps, the ones a far car's state switches, with their lit frames that have a texture. */
const litFrames = (lamp: CarLamp): number[] => {
  if ((lamp.role !== 'headlight' && lamp.role !== 'brake') || !lamp.states) return [];
  const {off, on, brake} = lamp.states;
  return [...new Set([on, brake])].filter((frame): frame is number => frame !== null && frame !== off && lamp.frames[frame] !== null);
};

/**
 * A lamp's glow mesh by the option parts its triangles belong to (`_lmu_option` per vertex: 0 always shown, else 1 + the option's
 * index): one geometry per set of parts, all on the mesh's own vertices.
 */
function byOptions(geometry: BufferGeometry, optionNodes: readonly string[]): Array<{options: string[]; geometry: BufferGeometry}> {
  const option = geometry.getAttribute('_lmu_option'), index = geometry.index;
  if (!option || !index) throw Error('Far lamp primitive has no _LMU_OPTION or index');
  const parts = new Map<string, {options: string[]; indices: number[]}>();
  for (let at = 0; at < index.count; at += 3) {
    const corners = [index.getX(at), index.getX(at + 1), index.getX(at + 2)];
    const options = [...new Set(corners.map(vertex => option.getX(vertex)).filter(value => value !== 0))].map(value => {
      const name = optionNodes[value - 1];
      if (name === undefined) throw Error(`Far lamp primitive names no option part ${value}`);
      return name;
    });
    const key = options.join('|');
    let part = parts.get(key);
    if (!part) { part = {options, indices: []}; parts.set(key, part); }
    part.indices.push(...corners);
  }
  return [...parts.values()].map(({options, indices}) => {
    const part = new BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) if (name !== '_lmu_option') part.setAttribute(name, attribute);
    part.setIndex(indices);
    return {options, geometry: part};
  });
}

/**
 * The headlights and brake lights of the field's far cars: each body's lamp glow meshes from its far model (`farCars` `lamps`: one
 * mesh per lamp, in the far model's frame), one instanced draw per lamp, set of option parts and lit frame, in the lamp's own glow
 * material (`createLampMaterial`, as a full model draws it) with the frame's start file. A car's instance shows while its state
 * picks that frame (`lampStateFrame`). A body's glows are built the first time one of its cars is asked for, one body at a time:
 * only its frames' textures load then. `parent` is the far cars' parent; `warm` compiles a body's glows before they show.
 */
export function createFarGlows(parent: Group, carTextures: CarTextures, warm: (object: Object3D) => Promise<void>, changed: () => void): FarGlows {
  const group = new Group(); group.name = 'far-glows'; parent.add(group);
  const bodies = new Map<string, GlowFrame[] | 'loading' | 'failed'>(), farLamps = new Map<string, FarLamps>();
  let loading = false, disposed = false;
  /** Frees glows: their geometries (the vertices go with the last of a mesh's parts), lamp materials and the materials' texture copies. */
  const free = (glows: Object3D) => {
    const materials = new Set<Material>();
    glows.traverse(object => {
      if (!(object instanceof InstancedMesh)) return;
      (object.geometry as BufferGeometry).dispose(); object.dispose();
      materials.add(object.material as Material);
    });
    for (const material of materials) material.dispose();
  };

  const load = async (body: LoadedBody) => {
    const folder = body.resource.folder;
    bodies.set(folder, 'loading'); loading = true;
    const frames: GlowFrame[] = [];
    try {
      const far = farLamps.get(folder), {lamps, materials} = body.descriptor;
      if (!far) throw Error(`Car ${folder} has no far lamps yet`);
      const glowing = far.lamps.flatMap(({lamp: index, geometry}) => {
        const lamp = lamps[index], lit = litFrames(lamp), glow = lit.length ? lampGlow(lamp, materials) : null;
        return glow && lamp.states ? [{lamp: lamp as GlowFrame['lamp'], glow, lit, geometry}] : [];
      });
      // A far glow is a few pixels: each frame loads as its start file (the reduced levels) on its own, never sharpened.
      const fileOf = (frame: string) => startFileOf(body, frame)?.path ?? frame;
      const paths = [...new Set(glowing.flatMap(({lamp, lit}) => lit.map(frame => fileOf(lamp.frames[frame]!))))];
      const loaded = await Promise.all(paths.map(path => carTextures.load(path, undefined)));
      const textures = new Map(paths.map((path, index) => [path, loaded[index]] as const));
      for (const {lamp, glow, lit, geometry} of glowing) {
        const parts = byOptions(geometry, far.optionNodes);
        for (const frame of lit) {
          const original = textures.get(fileOf(lamp.frames[frame]!))!, texture = original.clone();
          carTextures.copied(texture, original, false);
          const material = createLampMaterial(lamp, glow, texture);
          for (const part of parts) {
            const drawn = new InstancedMesh(part.geometry, material, FAR_GLOW_MAX);
            // Visible with no instances while it compiles (the compile walks visible objects only); `draw` shows it with its cars.
            drawn.name = `far-glow-${lamp.material}`; drawn.count = 0; drawn.frustumCulled = false;
            drawn.castShadow = false; drawn.receiveShadow = false;
            frames.push({lamp, frame, options: part.options, mesh: drawn});
          }
          if (!parts.length) material.dispose();
        }
      }
      const shown = new Group(); for (const {mesh} of frames) shown.add(mesh);
      await warm(shown);
      for (const {mesh} of frames) mesh.visible = false;
      group.add(shown);
      // Gone while they compiled: `dispose` already ran, so they go here.
      if (disposed) { free(shown); return; }
      bodies.set(folder, frames);
      changed();
    } catch {
      // The body's far cars stay without glows; the glows built before the failure go.
      const failed = new Group(); for (const {mesh} of frames) failed.add(mesh);
      free(failed);
      bodies.set(folder, 'failed');
    } finally { loading = false; }
  };

  /** Each livery's shown option parts. */
  const shownOptions = new Map<string, Set<string>>();
  const optionsOf = (body: LoadedBody) => {
    const key = `${body.resource.folder}:${normalizeVehicleId(body.vehicleId)}`;
    let shown = shownOptions.get(key);
    if (!shown) {
      shown = new Set(appearanceOf(body)?.optionNodes ?? []);
      shownOptions.set(key, shown);
    }
    return shown;
  };

  return {
    lamps(body, far) { farLamps.set(body.resource.folder, far); },
    draw(cars) {
      for (const frames of bodies.values()) if (Array.isArray(frames)) for (const entry of frames) entry.mesh.count = 0;
      for (const car of cars.slice(0, FAR_GLOW_MAX)) {
        const frames = bodies.get(car.body.resource.folder);
        if (frames === undefined) { if (!loading) void load(car.body); continue; }
        // Still loading, failed, or a body without a lamp that glows far.
        if (!Array.isArray(frames) || !frames.length) continue;
        const shown = optionsOf(car.body);
        for (const entry of frames) {
          if (lampStateFrame(entry.lamp.states, car.headlights, car.braking) !== entry.frame) continue;
          if (!entry.options.every(name => shown.has(name))) continue;
          entry.mesh.setMatrixAt(entry.mesh.count++, car.frame);
        }
      }
      for (const frames of bodies.values()) if (Array.isArray(frames)) for (const {mesh} of frames) {
        mesh.visible = mesh.count > 0;
        if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      disposed = true;
      group.removeFromParent(); free(group);
    },
  };
}
