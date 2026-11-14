import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, RepeatWrapping, type Material, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { descriptorTexturePath, normalizeVehicleId } from '../../../../../shared/packageContract/index.js';
import type { CarAppearance } from '../../../../../shared/types/scenes/car.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import type { CarTextures } from './carModels.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';
import { patchAmbientLookup } from '../scenery/materials/ambientLookup.js';
import { hazeProgram } from '../atmosphere/haze.js';

/** A primitive of the far model, its role named on its material (`extras.lmuFar`). */
type FarRole = 'paint' | 'appearance' | 'vertexColour';

interface FarTemplate {
  /** The `far` node's primitives, each with its role and, for an appearance primitive, the material name a livery retextures. */
  primitives: Array<{mesh: Mesh<BufferGeometry, MeshStandardMaterial>; role: FarRole; materialName: string | undefined}>;
  optionNodes: readonly string[];
  /** Each primitive's geometry for a set of shown options (its key), drawing only the triangles of the options an appearance shows. */
  shown: Map<string, BufferGeometry[]>;
}

/**
 * The far model's materials draw with the same ambient lookup as every other surface of the scene. Their key is their own: three
 * shares one program between materials whose key and parameters match, and the full models' materials patch the cascade shadow in
 * as well (a far shell drawn by that program lost its paint).
 */
function ambient(material: MeshStandardMaterial): MeshStandardMaterial {
  material.onBeforeCompile = shader => { patchAmbientLookup(shader); };
  material.customProgramCacheKey = () => 'lmu-far-car-ambient';
  hazeProgram(material);
  // Seen from afar, a blended two-sided primitive draws once with both sides (three's two passes look its program up twice a draw).
  material.forceSinglePass = true;
  return material;
}

/** The geometry without the triangles of option parts the appearance hides (`_LMU_OPTION`: 0 always shown, else 1 + option index). */
function optionGeometry(geometry: BufferGeometry, shown: ReadonlySet<number>): BufferGeometry {
  const option = geometry.getAttribute('_lmu_option'), index = geometry.index;
  if (!option || !index) throw Error('Far model primitive has no _LMU_OPTION or index');
  const kept: number[] = [];
  for (let at = 0; at < index.count; at += 3) {
    const a = index.getX(at), b = index.getX(at + 1), c = index.getX(at + 2);
    if ([a, b, c].every(vertex => { const value = option.getX(vertex); return value === 0 || shown.has(value - 1); })) kept.push(a, b, c);
  }
  const result = new BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) if (name !== '_lmu_option') result.setAttribute(name, attribute);
  result.setIndex(new BufferAttribute(index.count > 65535 || geometry.attributes.position.count > 65535 ? new Uint32Array(kept) : new Uint16Array(kept), 1));
  result.userData.sharedAsset = true;
  result.computeBoundingBox(); result.computeBoundingSphere();
  return result;
}

/**
 * Loads the bodies' far models (`resource.far`): the exterior as seen from `fromM` metres on, a few primitives by role, wheels at rest
 * and no lamps. Each car of a body is a clone of its far model with the livery's paint and retextured materials (the textures'
 * start files: a far car never sharpens), the vertex-coloured primitives shared by every car of the body, and only the triangles of
 * the option parts its appearance shows.
 */
export function createFarCarLoader(carTextures: CarTextures) {
  const templates = new Map<string, Promise<FarTemplate>>();
  const loadTemplate = (body: LoadedBody): Promise<FarTemplate> => {
    let pending = templates.get(body.resource.far.sha256);
    if (!pending) {
      pending = body.farFile().then(bytes => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '')).then(({scene}) => {
        const far = scene.getObjectByName('far');
        const extras = far?.userData.lmuFar as {optionNodes?: unknown} | undefined;
        if (!far || !Array.isArray(extras?.optionNodes)) throw Error(`Car ${body.resource.folder} far model has no far node`);
        const primitives: FarTemplate['primitives'] = [];
        far.updateWorldMatrix(true, true);
        far.traverse(object => {
          if (!(object instanceof Mesh)) return;
          const mesh = object as Mesh<BufferGeometry, MeshStandardMaterial>, data = mesh.material.userData as {lmuFar?: unknown; materialName?: unknown};
          if (data.lmuFar !== 'paint' && data.lmuFar !== 'appearance' && data.lmuFar !== 'vertexColour') throw Error(`Car ${body.resource.folder} far primitive has no role`);
          if (!object.matrixWorld.equals(far.matrixWorld)) throw Error(`Car ${body.resource.folder} far primitive is not at the far node`);
          ambient(mesh.material);
          primitives.push({mesh, role: data.lmuFar, materialName: typeof data.materialName === 'string' ? data.materialName : undefined});
        });
        return {primitives, optionNodes: extras.optionNodes as string[], shown: new Map()};
      });
      templates.set(body.resource.far.sha256, pending);
      pending.catch(() => { if (templates.get(body.resource.far.sha256) === pending) templates.delete(body.resource.far.sha256); });
    }
    return pending;
  };
  /** A livery's texture on the far model's single UV set, from its start file when the body lists one. */
  const texture = async (body: LoadedBody, path: string): Promise<Texture> => {
    const row = body.resource.textures.find(each => descriptorTexturePath(each.sha256) === path);
    const start = row?.start && row.levels !== undefined ? {path: descriptorTexturePath(row.start.sha256), skip: row.levels - row.start.levels} : undefined;
    const copy = (await carTextures.load(path, false, start)).clone();
    copy.wrapS = RepeatWrapping; copy.wrapT = RepeatWrapping; copy.anisotropy = MAX_ANISOTROPY; copy.channel = 0; copy.needsUpdate = true;
    return copy;
  };
  /** The livery's material for a textured primitive: the far model's own finish with the livery's texture. */
  const textured = async (body: LoadedBody, material: MeshStandardMaterial, path: string): Promise<Material> => {
    const own = ambient(material.clone());
    own.map = await texture(body, path); own.vertexColors = false; own.color.setRGB(1, 1, 1);
    own.addEventListener('dispose', () => own.map?.dispose());
    return own;
  };
  const liveries = new Map<string, Promise<Map<Mesh, Material>>>();
  const materialsOf = (body: LoadedBody, template: FarTemplate, appearance: CarAppearance) => {
    const key = `${body.resource.far.sha256}:${normalizeVehicleId(appearance.alias)}`;
    let pending = liveries.get(key);
    if (!pending) {
      pending = Promise.all(template.primitives.map(async ({mesh, role, materialName}) => {
        // An appearance primitive keeps its authored colours (`COLOR_0`) for a livery that does not retexture it.
        const path = role === 'paint' ? appearance.albedo : role === 'appearance' && materialName ? appearance.materialTextures?.[materialName] : undefined;
        if (role === 'paint' && !path) throw Error(`Car ${body.vehicleId} appearance has no paint albedo`);
        return [mesh, path ? await textured(body, mesh.material, path) : mesh.material] as const;
      })).then(entries => new Map(entries));
      liveries.set(key, pending);
      pending.catch(() => { if (liveries.get(key) === pending) liveries.delete(key); });
    }
    return pending;
  };
  return {
    /** A far car of the body's livery (`body.vehicleId`): a model for `makeCar`. */
    async model(body: LoadedBody): Promise<Group> {
      const template = await loadTemplate(body), key = normalizeVehicleId(body.vehicleId);
      const appearance = body.descriptor.appearances.find(row => normalizeVehicleId(row.alias) === key);
      if (!appearance) throw Error(`The car package has no appearance for ${body.vehicleId}`);
      const shownOptions = new Set(template.optionNodes.flatMap((name, index) => appearance.optionNodes.includes(name) ? [index] : []));
      const optionKey = [...shownOptions].join(',');
      let geometries = template.shown.get(optionKey);
      if (!geometries) { geometries = template.primitives.map(({mesh}) => optionGeometry(mesh.geometry, shownOptions)); template.shown.set(optionKey, geometries); }
      const materials = await materialsOf(body, template, appearance), model = new Group();
      template.primitives.forEach(({mesh}, index) => {
        if (!geometries[index].index!.count) return;
        const part = new Mesh(geometries[index], materials.get(mesh));
        // A far car casts no shadow and takes none: shadows are for the followed car and the cars near it.
        part.castShadow = false; part.receiveShadow = false; part.name = `far ${mesh.material.name}`;
        model.add(part);
      });
      return model;
    },
  };
}
