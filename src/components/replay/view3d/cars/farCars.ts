import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, RepeatWrapping, ShaderLib, type Material, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeVehicleId } from '../../../../../shared/packageContract/index.js';
import type { CarAppearance } from '../../../../../shared/types/scenes/car.js';
import { appearanceOf, startFileOf, type LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { carPartOrder } from '../car/carMaterials.js';
import { PAINT_LAYERS, PAINT_MAPS, paintLayers } from '../car/paintLayers.js';
import type { CarTextures } from './carModels.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';
import { patchAmbientLookup } from '../scenery/materials/patchSurfaceShader.js';
import { hazeProgram } from '../atmosphere/haze.js';
import { patchCascadeShadow } from '../shadows/cascadeSampling.js';

/** A primitive of the far model, its role named on its material (`extras.lmuFar`). */
type FarRole = 'paint' | 'appearance' | 'vertexColour';

/**
 * The glow meshes of a body's headlight and brake lamps on its far model (`extras.lmuFar: "lamp"`), which a far car leaves out and
 * `farGlows` draws: `lamp` indexes the descriptor's lamps, and the geometry keeps `_lmu_option` (0 always shown, else 1 + the index
 * in `optionNodes` of the option part the vertex belongs to).
 */
export interface FarLamps { optionNodes: readonly string[]; lamps: Array<{lamp: number; geometry: BufferGeometry}> }

interface FarTemplate extends FarLamps {
  /** The `far` node's primitives, each with its role and, for an appearance primitive, the material name a livery retextures. */
  primitives: Array<{mesh: Mesh<BufferGeometry, MeshStandardMaterial>; role: FarRole; materialName: string | undefined}>;
  /** Each primitive's geometry for a set of shown options (its key), drawing only the triangles of the options an appearance shows. */
  shown: Map<string, BufferGeometry[]>;
}

type PaintLayers = ReturnType<typeof paintLayers>;

const OUTGOING_LIGHT = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';
if (!ShaderLib.physical.fragmentShader.includes(OUTGOING_LIGHT)) throw Error('three.js meshphysical fragment changed: the far paint absorption and glass reflection need updating');

/**
 * The far model's paint takes the diffuse light the full model's paint does (`PAINT_LAYERS`, the livery's own `layers`): the
 * albedo darkened to carbon where the region map says so, the ambient light less the AO mask and what the coats reflect, the
 * sun's less what they reflect at its incidence, all of it through the lacquer. Without them a car turning far brightened (twice
 * the ambient light on a rear panel) and a carbon livery drew its raw albedo. Both coats reflect as the full model's do before its
 * first probe (`carPaint`): the base coat by its specular strength and Fresnel at its own roughness, the clear coat by its
 * Fresnel over everything under it, each reading three's sky environment and its occlusion from the mask. Without them a panel
 * facing the sky drew a third darker than the full model's. The car's own surroundings (its probe), the sun's glint and the
 * flakes stay with the full model.
 */
const FAR_PAINT = {
  /** The clear coat's reflected light, and its strength times its Fresnel at the view angle, for the outgoing light. */
  declarations: 'vec3 farCoatLight = vec3(0.0); float farCoatFresnel = 0.0;',
  physical: `#include <lights_physical_fragment>
    material.specularColor = vec3(paintBaseF0 * paintBaseSpecular); material.specularColorBlended = material.specularColor;
    material.specularF90 = paintBaseSpecular;`,
  reflection: `
    {
      float grazing = pow(1.0 - saturate(dot(normal, geometryViewDir)), 5.0);
      reflectedLight.indirectSpecular = radiance * paintBaseSpecular * (paintBaseF0 + (1.0 - paintBaseF0) * grazing);
      reflectedLight.directSpecular *= paintBaseOcclusion; reflectedLight.indirectSpecular *= paintBaseOcclusion;
      farCoatFresnel = paintCoat * (paintCoatF0 + (1.0 - paintCoatF0) * grazing);
      #ifdef USE_ENVMAP
        farCoatLight = getIBLRadiance(geometryViewDir, normal, paintCoatRoughness) * paintCoatOcclusion;
      #endif
    }`,
};

/** Makes a far paint material's program draw the livery's `layers` (`FAR_PAINT`). */
function patchFarPaint(shader: WebGLProgramParametersWithUniforms, layers: PaintLayers): void {
  Object.assign(shader.uniforms, layers.uniforms);
  shader.fragmentShader = layers.fragment(shader.fragmentShader.replace('void main() {', `${PAINT_LAYERS.declarations}
${FAR_PAINT.declarations}
void main() {`)
    .replace('#include <map_fragment>', PAINT_LAYERS.albedo)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(paintBaseRoughness, 0.0, 1.0);')
    .replace('#include <lights_physical_fragment>', FAR_PAINT.physical)
    .replace('#include <aomap_fragment>', `#include <aomap_fragment>${FAR_PAINT.reflection}${PAINT_LAYERS.diffuse}`)
    .replace(OUTGOING_LIGHT, `vec3 outgoingLight = (totalDiffuse + totalSpecular) * ${PAINT_LAYERS.absorption} * (1.0 - farCoatFresnel) + farCoatLight * farCoatFresnel + totalEmissiveRadiance;`));
}

/**
 * A far primitive that is not paint carries its surface per vertex (`_LMU_SURFACE`: metalness, roughness, ambient occlusion and
 * specular occlusion, sampled from the full model's material as its colour is) and takes them as the full model's standard
 * surface does: the occlusion on the ambient light, the specular occlusion on the reflected surroundings. Without them a metal
 * part drew its albedo as diffuse colour (an unlit lamp housing read bright). A primitive of `glass` (`extras.glass`) adds its
 * reflections at whole strength, as the full model's glass does (`glassSurface`): divided by its opacity before the blend.
 * Without it a clear pane reflected the sky by its opacity only. The sun's glint stays with the full model.
 */
function patchFarSurface(shader: WebGLProgramParametersWithUniforms, glass: boolean): void {
  shader.vertexShader = shader.vertexShader.replace('void main() {', `attribute vec4 _lmu_surface;
varying vec4 vFarSurface;
void main() {
  vFarSurface = _lmu_surface;`);
  shader.fragmentShader = shader.fragmentShader.replace('void main() {', `varying vec4 vFarSurface;
void main() {`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(vFarSurface.y, 0.045, 1.0);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = vFarSurface.x;')
    .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= vFarSurface.z; reflectedLight.indirectSpecular *= vFarSurface.w;');
  if (glass) shader.fragmentShader = shader.fragmentShader.replace(OUTGOING_LIGHT, 'vec3 outgoingLight = totalDiffuse + totalSpecular / clamp(diffuseColor.a + 0.001, 0.001, 1.0) + totalEmissiveRadiance;');
}

/**
 * The far model's materials draw with the same ambient lookup as every other surface of the scene and take the sun's shadow from
 * the cascades, as the full models' materials do (`influence`: the normal shadow influence, the body's paint's); its paint also
 * with the livery's paint `layers` (`patchFarPaint`), every other primitive with its own surface (`patchFarSurface`). Their key is
 * their own: three shares one program between materials whose key and parameters match, and the full models' materials patch more
 * (a far shell drawn by such a program lost its paint).
 */
function farMaterial(material: MeshStandardMaterial, influence: number, layers?: PaintLayers): MeshStandardMaterial {
  const glass = material.userData.glass === true;
  material.onBeforeCompile = shader => {
    if (layers) patchFarPaint(shader, layers); else patchFarSurface(shader, glass);
    patchAmbientLookup(shader); patchCascadeShadow(shader, influence);
  };
  material.customProgramCacheKey = () => layers ? `lmu-far-car-paint-${layers.variant}` : glass ? 'lmu-far-car-glass' : 'lmu-far-car-surface';
  hazeProgram(material);
  // Casts as the full models' materials do: an open shell still shades the road behind it.
  material.shadowSide = DoubleSide;
  // Seen from afar, a blended two-sided primitive draws once with both sides (three's two passes look its program up twice a draw).
  material.forceSinglePass = true;
  return material;
}

/**
 * The normal shadow influence a body's far model takes the sun's shadow with: its paint's, which covers most of the far shell (every
 * livery of a body carries the same).
 */
function paintShadowInfluence(body: LoadedBody): number {
  const values = new Set(body.descriptor.appearances.map(row => row.paint.normalShadowInfluence));
  const [value] = values;
  if (values.size !== 1 || typeof value !== 'number' || !(value >= 0)) throw Error(`Car ${body.resource.folder} paint has no single normal shadow influence`);
  return value;
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
 * and its lamps' glow meshes apart (`lamps`). Each car of a body is a clone of its far model with the livery's paint (its albedo and
 * paint layers, `patchFarPaint`) and retextured materials (the textures' start files: a far car never sharpens), the
 * vertex-coloured primitives shared by every car of the body, and only the triangles of the option parts its appearance shows.
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
        const primitives: FarTemplate['primitives'] = [], lamps: FarLamps['lamps'] = [], influence = paintShadowInfluence(body);
        far.updateWorldMatrix(true, true);
        far.traverse(object => {
          if (!(object instanceof Mesh)) return;
          const mesh = object as Mesh<BufferGeometry, MeshStandardMaterial>, data = mesh.material.userData as {lmuFar?: unknown; materialName?: unknown; lamp?: unknown};
          if (!object.matrixWorld.equals(far.matrixWorld)) throw Error(`Car ${body.resource.folder} far primitive is not at the far node`);
          // A lamp's glow mesh is no part of the far car: it draws only while the lamp is lit (`farGlows`).
          if (data.lmuFar === 'lamp') {
            if (typeof data.lamp !== 'number' || !body.descriptor.lamps[data.lamp]) throw Error(`Car ${body.resource.folder} far lamp primitive names no lamp of the body`);
            lamps.push({lamp: data.lamp, geometry: mesh.geometry});
            return;
          }
          if (data.lmuFar !== 'paint' && data.lmuFar !== 'appearance' && data.lmuFar !== 'vertexColour') throw Error(`Car ${body.resource.folder} far primitive has no role`);
          // The paint primitive draws only as a livery's own material (`textured`).
          if (data.lmuFar !== 'paint') {
            if (!mesh.geometry.getAttribute('_lmu_surface')) throw Error(`Car ${body.resource.folder} far primitive has no _LMU_SURFACE`);
            farMaterial(mesh.material, influence);
          }
          primitives.push({mesh, role: data.lmuFar, materialName: typeof data.materialName === 'string' ? data.materialName : undefined});
        });
        return {primitives, lamps, optionNodes: extras.optionNodes as string[], shown: new Map()};
      });
      templates.set(body.resource.far.sha256, pending);
      pending.catch(() => { if (templates.get(body.resource.far.sha256) === pending) templates.delete(body.resource.far.sha256); });
    }
    return pending;
  };
  /** A livery's texture on the far model's single UV set, from its start file when the body lists one. */
  const texture = async (body: LoadedBody, path: string): Promise<Texture> => {
    const copy = (await carTextures.load(path, startFileOf(body, path))).clone();
    copy.wrapS = RepeatWrapping; copy.wrapT = RepeatWrapping; copy.anisotropy = MAX_ANISOTROPY; copy.channel = 0; copy.needsUpdate = true;
    return copy;
  };
  /**
   * The livery's material for a textured primitive: the far model's own finish with the livery's texture, and for the paint
   * primitive the livery's paint layers too (their maps from their start files, each the material's own copy).
   */
  const textured = async (body: LoadedBody, material: MeshStandardMaterial, path: string, paint?: CarAppearance['paint']): Promise<Material> => {
    const layerPaths = paint ? [...new Set(PAINT_MAPS.flatMap(key => paint.maps[key]?.texture ?? []))] : [];
    const [map, ...layerMaps] = await Promise.all([path, ...layerPaths].map(each => texture(body, each)));
    const layers = paint && paintLayers(paint, each => layerMaps[layerPaths.indexOf(each)], map);
    const own = farMaterial(material.clone(), paintShadowInfluence(body), layers);
    own.map = map; own.vertexColors = false; own.color.setRGB(1, 1, 1);
    own.addEventListener('dispose', () => { own.map?.dispose(); layers?.dispose(); });
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
        return [mesh, path ? await textured(body, mesh.material, path, role === 'paint' ? appearance.paint : undefined) : mesh.material] as const;
      })).then(entries => new Map(entries));
      liveries.set(key, pending);
      pending.catch(() => { if (liveries.get(key) === pending) liveries.delete(key); });
    }
    return pending;
  };
  return {
    /** A far car of the body's livery (`body.vehicleId`): a model for `makeCar`. */
    async model(body: LoadedBody): Promise<Group> {
      const template = await loadTemplate(body), appearance = appearanceOf(body);
      if (!appearance) throw Error(`The car package has no appearance for ${body.vehicleId}`);
      const shownOptions = new Set(template.optionNodes.flatMap((name, index) => appearance.optionNodes.includes(name) ? [index] : []));
      const optionKey = [...shownOptions].join(',');
      let geometries = template.shown.get(optionKey);
      if (!geometries) { geometries = template.primitives.map(({mesh}) => optionGeometry(mesh.geometry, shownOptions)); template.shown.set(optionKey, geometries); }
      const materials = await materialsOf(body, template, appearance), model = new Group();
      template.primitives.forEach(({mesh}, index) => {
        if (!geometries[index].index!.count) return;
        const part = new Mesh(geometries[index], materials.get(mesh));
        // A far car casts the sun's shadow and takes it as its full model does: turning near or far, its shadow stays.
        part.castShadow = true; part.receiveShadow = true; part.name = `far ${mesh.material.name}`;
        // A blended part draws in the game's order, as on the full model: its material's `sortOffset` (glTF extras), 0 without one.
        part.renderOrder = carPartOrder([part.material]);
        model.add(part);
      });
      return model;
    },
    /** The body's lamp glow meshes, from the same parse as its far cars. */
    async lamps(body: LoadedBody): Promise<FarLamps> {
      const {optionNodes, lamps} = await loadTemplate(body);
      return {optionNodes, lamps};
    },
  };
}
