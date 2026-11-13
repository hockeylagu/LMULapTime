import { Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PropertyBinding, type BufferGeometry, type Material, type Object3D } from 'three';
import { descriptorTexturePath, normalizeVehicleId, type CarLamp } from '../../../../../shared/packageContract/index.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { createLampMaterial, lampGlow } from '../car/carLamps.js';
import { lampStateFrame } from '../car/lampStates.js';
import type { CarTemplates } from './carTemplates.js';
import type { CarTextures } from './carModels.js';

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
  /** The glowing lamps of these cars (nearest first, at most `FAR_GLOW_MAX`); a body without its glows yet starts loading them. */
  draw(cars: readonly FarGlowCar[]): void;
  dispose(): void;
}

/** One glowing frame of a lamp on one glow mesh: its instances are the cars showing that frame. */
interface GlowFrame {
  lamp: CarLamp & {states: NonNullable<CarLamp['states']>};
  frame: number;
  /** The mesh in the body's frame. */
  local: Matrix4;
  /** The option parts above the mesh: a livery shows it only with all of them. */
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
 * The headlights and brake lights of the field's far cars, which their far models leave out: each body's glow meshes from its
 * exterior model (single-level lamp nodes), one instanced draw per lamp, glow mesh and lit frame, in the lamp's own glow material
 * (`createLampMaterial`, as a full model draws it) with the frame's start file. A car's instance shows while its state picks that frame (`lampStateFrame`).
 * A body's glows load the first time one of its cars is asked for, one body at a time, from one parse of the body; the glows keep
 * their own copies of the meshes' geometry. `parent` is the far cars' parent; `warm` compiles a body's glows before they show.
 */
export function createFarGlows(parent: Group, templates: CarTemplates, carTextures: CarTextures, warm: (object: Object3D) => Promise<void>, changed: () => void): FarGlows {
  const group = new Group(); group.name = 'far-glows'; parent.add(group);
  const bodies = new Map<string, GlowFrame[] | 'loading' | 'failed'>();
  const unseen = new MeshBasicMaterial({visible: false});
  let loading = false, disposed = false;
  const instance = new Matrix4();
  /** Frees glows: their geometry copies, lamp materials and the materials' texture copies. */
  const free = (glows: Object3D) => {
    const materials = new Set<Material>();
    glows.traverse(object => {
      if (!(object instanceof InstancedMesh)) return;
      (object.geometry as BufferGeometry).dispose(); object.dispose();
      for (const material of Array.isArray(object.material) ? object.material as Material[] : [object.material as Material]) if (material !== unseen) materials.add(material);
    });
    for (const material of materials) material.dispose();
  };

  const load = async (body: LoadedBody) => {
    const folder = body.resource.folder;
    bodies.set(folder, 'loading'); loading = true;
    const frames: GlowFrame[] = [];
    try {
      const {lamps, materials} = body.descriptor;
      const glowing = lamps.flatMap(lamp => {
        const lit = litFrames(lamp), glow = lit.length ? lampGlow(lamp, materials) : null;
        return glow && lamp.states ? [{lamp: lamp as GlowFrame['lamp'], glow, lit}] : [];
      });
      // A far glow is a few pixels: each frame loads as its start file (the reduced levels) on its own, never sharpened.
      const starts = new Map(body.resource.textures.flatMap(row => row.start ? [[descriptorTexturePath(row.sha256), descriptorTexturePath(row.start.sha256)] as const] : []));
      const fileOf = (frame: string) => starts.get(frame) ?? frame;
      const paths = [...new Set(glowing.flatMap(({lamp, lit}) => lit.map(frame => fileOf(lamp.frames[frame]!))))];
      const [template, loaded] = await Promise.all([templates.body(body), Promise.all(paths.map(path => carTextures.load(path, false, undefined)))]);
      const textures = new Map(paths.map((path, index) => [path, loaded[index]] as const));
      template.updateWorldMatrix(true, true);
      const toBody = new Matrix4().copy(template.matrixWorld).invert(), options = new Set(body.descriptor.optionNodes);
      for (const {lamp, glow, lit} of glowing) {
        // The GLB loader drops `.`, `:`, `/`, `[` and `]` from node names; lamp nodes are the GLB's own names.
        const meshes = new Set<Object3D>();
        for (const name of lamp.nodes) template.getObjectByName(PropertyBinding.sanitizeNodeName(name))?.traverse(object => { if (object.type === 'Mesh') meshes.add(object); });
        for (const frame of lit) {
          const original = textures.get(fileOf(lamp.frames[frame]!))!, texture = original.clone();
          carTextures.copied(texture, original, false);
          const material = createLampMaterial(lamp, glow, texture);
          let used = false;
          for (const mesh of meshes) {
            // Only the mesh's slots of this lamp's material glow; a mesh without one is another lamp's.
            const {material: list, geometry} = mesh as Mesh<BufferGeometry, Material | Material[]>;
            const slots = (Array.isArray(list) ? list : [list]).map(slot => slot.name === lamp.material ? material : unseen);
            if (!slots.includes(material)) continue;
            used = true;
            const above: string[] = [];
            for (let at: Object3D | null = mesh; at && at !== template; at = at.parent) if (options.has(at.name)) above.push(at.name);
            const drawn = new InstancedMesh(geometry.clone(), Array.isArray(list) ? slots : slots[0], FAR_GLOW_MAX);
            // Visible with no instances while it compiles (the compile walks visible objects only); `draw` shows it with its cars.
            drawn.name = `far-glow-${lamp.material}`; drawn.count = 0; drawn.frustumCulled = false;
            drawn.castShadow = false; drawn.receiveShadow = false;
            frames.push({lamp, frame, local: new Matrix4().multiplyMatrices(toBody, mesh.matrixWorld), options: above, mesh: drawn});
          }
          if (!used) material.dispose();
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
      // The body's far cars stay without glows.
      bodies.set(folder, 'failed');
    } finally { loading = false; }
  };

  /** Each livery's shown option parts. */
  const shownOptions = new Map<string, Set<string>>();
  const optionsOf = (body: LoadedBody) => {
    const key = `${body.resource.folder}:${normalizeVehicleId(body.vehicleId)}`;
    let shown = shownOptions.get(key);
    if (!shown) {
      const appearance = body.descriptor.appearances.find(row => normalizeVehicleId(row.alias) === normalizeVehicleId(body.vehicleId));
      shown = new Set(appearance?.optionNodes ?? []);
      shownOptions.set(key, shown);
    }
    return shown;
  };

  return {
    draw(cars) {
      for (const frames of bodies.values()) if (Array.isArray(frames)) for (const entry of frames) entry.mesh.count = 0;
      for (const car of cars.slice(0, FAR_GLOW_MAX)) {
        const frames = bodies.get(car.body.resource.folder);
        if (frames === undefined) { if (!loading) void load(car.body); continue; }
        if (!Array.isArray(frames)) continue;
        const shown = optionsOf(car.body);
        for (const entry of frames) {
          if (lampStateFrame(entry.lamp.states, car.headlights, car.braking) !== entry.frame) continue;
          if (!entry.options.every(name => shown.has(name))) continue;
          entry.mesh.setMatrixAt(entry.mesh.count++, instance.multiplyMatrices(car.frame, entry.local));
        }
      }
      for (const frames of bodies.values()) if (Array.isArray(frames)) for (const {mesh} of frames) {
        mesh.visible = mesh.count > 0;
        if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      disposed = true;
      group.removeFromParent(); free(group); unseen.dispose();
    },
  };
}
