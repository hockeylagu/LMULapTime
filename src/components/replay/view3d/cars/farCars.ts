import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh, MeshStandardMaterial, RepeatWrapping, type ShaderMaterial, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeVehicleId } from '../../../../../shared/packageContract/index.js';
import type { CarAppearance } from '../../../../../shared/types/scenes/car.js';
import { appearanceOf, startFileOf, type LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { carPartOrder } from '../car/carMaterials.js';
import { carMapPart, carStandardPart } from '../car/carStandardSurface.js';
import { PAINT_LAYERS, PAINT_MAPS, paintAlbedo, paintLayers, paintSamplers } from '../car/paintLayers.js';
import type { CarTextures } from './carModels.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';
import { trackLightPart } from '../night/trackLightProgram.js';
import { hazePart } from '../atmosphere/haze.js';
import { cascadeShadowPart } from '../shadows/cascadeSampling.js';
import { ambientLookupPart } from '../shaders/ambientLookup.js';
import { composedMaterial, type ShaderPart } from '../shaders/composer.js';
import { litTemplate } from '../shaders/litTemplate.js';

/** A primitive of the far model, its role named on its material (`extras.lmuFar`). */
type FarRole = 'paint' | 'appearance' | 'vertexColour';

/**
 * The glow meshes of a body's headlight and brake lamps on its far model (`extras.lmuFar: "lamp"`), which a far car leaves out and
 * `farGlows` draws: `lamp` indexes the descriptor's lamps, and the geometry keeps `_lmu_option` (0 always shown, else 1 + the index
 * in `optionNodes` of the option part the vertex belongs to).
 */
export interface FarLamps { optionNodes: readonly string[]; lamps: Array<{lamp: number; geometry: BufferGeometry}> }

interface FarTemplate extends FarLamps {
  /**
   * The `far` node's primitives, each with its glTF material (`source`, which a livery's material is built from), its role and, for
   * an appearance primitive, the material name a livery retextures.
   */
  primitives: Array<{mesh: Mesh<BufferGeometry, Material>; source: MeshStandardMaterial; role: FarRole; materialName: string | undefined}>;
  /** Each primitive's geometry for a set of shown options (its key), drawing only the triangles of the options an appearance shows. */
  shown: Map<string, BufferGeometry[]>;
}

type PaintLayers = ReturnType<typeof paintLayers>;

/**
 * The far model's paint takes the diffuse light the full model's paint does (`PAINT_LAYERS`, the livery's own `layers`): the
 * albedo darkened to carbon where the region map says so, the ambient light less the AO mask and what the coats reflect, the
 * sun's less what they reflect at its incidence, all of it through the lacquer. Without them a car turning far brightened (twice
 * the ambient light on a rear panel) and a carbon livery drew its raw albedo. Both coats reflect as the full model's do before its
 * first probe (`carPaint`): the base coat by its specular strength and Fresnel at its own roughness, the clear coat by its
 * Fresnel over everything under it, each reading the environment and its occlusion from the mask. Without them a panel facing the
 * sky drew a third darker than the full model's. The car's own surroundings (its probe), the sun's glint and the flakes stay with
 * the full model. Its lookups are plain: a far car's textures never sharpen.
 */
function farPaintPart(layers: PaintLayers): ShaderPart {
  return {
    name: 'farPaint',
    slots: {
      // The clear coat's reflected light, and its strength times its Fresnel at the view angle, for the outgoing light.
      fragmentPars: {at: 10, glsl: `${PAINT_LAYERS.declarations}\nvec3 farCoatLight = vec3(0.0); float farCoatFresnel = 0.0;`},
      fragmentAlbedo: {at: 10, glsl: paintAlbedo(layers.maps, (sampler, uv) => `texture2D(${sampler}, ${uv})`)},
      fragmentColour: {at: 10, glsl: '  roughnessFactor = clamp(paintBaseRoughness, 0.0, 1.0);'},
      fragmentMaterial: {at: 0, glsl: `    material.specularColor = vec3(paintBaseF0 * paintBaseSpecular); material.specularColorBlended = material.specularColor;
    material.specularF90 = paintBaseSpecular;`},
      fragmentOcclusion: {at: 10, glsl: `
    {
      float grazing = pow(1.0 - saturate(dot(normal, geometryViewDir)), 5.0);
      reflectedLight.indirectSpecular = radiance * paintBaseSpecular * (paintBaseF0 + (1.0 - paintBaseF0) * grazing);
      reflectedLight.directSpecular *= paintBaseOcclusion; reflectedLight.indirectSpecular *= paintBaseOcclusion;
      farCoatFresnel = paintCoat * (paintCoatF0 + (1.0 - paintCoatF0) * grazing);
      farCoatLight = getIBLRadiance(geometryViewDir, normal, paintCoatRoughness) * paintCoatOcclusion;
    }${PAINT_LAYERS.diffuse}`},
      fragmentLight: {at: 0, glsl: `  outgoingLight = (totalDiffuse + totalSpecular) * ${PAINT_LAYERS.absorption} * (1.0 - farCoatFresnel) + farCoatLight * farCoatFresnel + totalEmissiveRadiance;`},
    },
    uniforms: () => layers.uniforms,
    ownTextures: paintSamplers(layers.maps),
  };
}

/**
 * A far primitive that is not paint carries its surface per vertex (`_LMU_SURFACE`: metalness, roughness, ambient occlusion and
 * specular occlusion, sampled from the full model's material as its colour is) and takes them as the full model's standard
 * surface does: the occlusion on the ambient light, the specular occlusion on the reflected surroundings. Without them a metal
 * part drew its albedo as diffuse colour (an unlit lamp housing read bright). A primitive of `glass` (`extras.glass`) adds its
 * reflections at whole strength, as the full model's glass does (`glassSurface`): divided by its opacity before the blend.
 * Without it a clear pane reflected the sky by its opacity only. The sun's glint stays with the full model.
 */
function farSurfacePart(glass: boolean): ShaderPart {
  return {
    name: 'farSurface',
    slots: {
      vertexPars: {at: 10, glsl: 'attribute vec4 _lmu_surface;\nvarying vec4 vFarSurface;'},
      vertexOutputs: {at: 10, glsl: '  vFarSurface = _lmu_surface;'},
      fragmentPars: {at: 10, glsl: 'varying vec4 vFarSurface;'},
      fragmentColour: {at: 10, glsl: '  roughnessFactor = clamp(vFarSurface.y, 0.045, 1.0);\n  metalnessFactor = vFarSurface.x;'},
      fragmentOcclusion: {at: 10, glsl: '  reflectedLight.indirectDiffuse *= vFarSurface.z; reflectedLight.indirectSpecular *= vFarSurface.w;'},
      ...(glass ? {fragmentLight: {at: 0, glsl: '  outgoingLight = totalDiffuse + totalSpecular / clamp(diffuseColor.a + 0.001, 0.001, 1.0) + totalEmissiveRadiance;'}} : {}),
    },
  };
}

/** The glTF maps a far material does not draw: a material with one throws. */
const UNDRAWN_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'lightMap', 'bumpMap', 'displacementMap', 'envMap'] as const;

/**
 * A far model's material, composed from the glTF material `source` (its colour, roughness, metalness, emission and own state: side,
 * blending, transparency, alpha test, vertex colours) on three's standard model, with the same ambient lookup as every other surface
 * of the scene, the sun's shadow from the cascades as the full models' materials take it (`influence`: the normal shadow influence,
 * the body's paint's), the track lights and beams nearest the camera, and the haze. A livery's material (`livery`) draws the livery's
 * texture over white without vertex colours, and its paint primitive the livery's paint `layers` (`farPaintPart`); every other
 * primitive its own surface (`farSurfacePart`).
 */
function farMaterial(source: MeshStandardMaterial, influence: number, livery?: {map: Texture; layers?: PaintLayers}): ShaderMaterial {
  for (const key of UNDRAWN_MAPS) if (source[key]) throw Error(`Far car material ${source.name || '?'} has a ${key}, which its program does not draw`);
  const map = livery?.map ?? source.map;
  const parts = [
    cascadeShadowPart(influence), ambientLookupPart, trackLightPart('near'),
    carStandardPart({colour: livery ? new Color(1, 1, 1) : source.color.clone(), roughness: source.roughness, metalness: source.metalness,
      emissive: source.emissive.clone().multiplyScalar(source.emissiveIntensity)}),
    ...(map ? [carMapPart(map, false)] : []),
    livery?.layers ? farPaintPart(livery.layers) : farSurfacePart(source.userData.glass === true),
    hazePart,
  ];
  const material = composedMaterial(litTemplate, parts);
  // The glTF map is held in the uniforms, where disposeObjects does not look: freed with the material, as a built-in's map is
  // (one shared asset excepted). A livery's map is the livery material's own (`textured`).
  const gltfMap = livery ? null : source.map;
  if (gltfMap && gltfMap.userData.sharedAsset !== true) material.addEventListener('dispose', () => { gltfMap.dispose(); });
  Material.prototype.copy.call(material, source);
  // A program parameter three reads off any material; a shader material has no field for it.
  if (source.flatShading) Object.assign(material, {flatShading: true});
  if (livery) material.vertexColors = false;
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
 * paint layers, `farPaintPart`) and retextured materials (the textures' start files: a far car never sharpens), the
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
          const mesh = object as Mesh<BufferGeometry, Material>, source = mesh.material;
          if (!(source instanceof MeshStandardMaterial) || source.type !== 'MeshStandardMaterial') throw Error(`Car ${body.resource.folder} far primitive is not a standard material`);
          const data = source.userData as {lmuFar?: unknown; materialName?: unknown; lamp?: unknown};
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
            mesh.material = farMaterial(source, influence);
          }
          primitives.push({mesh, source, role: data.lmuFar, materialName: typeof data.materialName === 'string' ? data.materialName : undefined});
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
  const textured = async (body: LoadedBody, source: MeshStandardMaterial, path: string, paint?: CarAppearance['paint']): Promise<Material> => {
    const layerPaths = paint ? [...new Set(PAINT_MAPS.flatMap(key => paint.maps[key]?.texture ?? []))] : [];
    const [map, ...layerMaps] = await Promise.all([path, ...layerPaths].map(each => texture(body, each)));
    const layers = paint ? paintLayers(paint, each => layerMaps[layerPaths.indexOf(each)], map) : undefined;
    const own = farMaterial(source, paintShadowInfluence(body), {map, layers});
    own.addEventListener('dispose', () => { map.dispose(); layers?.dispose(); });
    return own;
  };
  const liveries = new Map<string, Promise<Map<Mesh, Material>>>();
  const materialsOf = (body: LoadedBody, template: FarTemplate, appearance: CarAppearance) => {
    const key = `${body.resource.far.sha256}:${normalizeVehicleId(appearance.alias)}`;
    let pending = liveries.get(key);
    if (!pending) {
      pending = Promise.all(template.primitives.map(async ({mesh, source, role, materialName}) => {
        // An appearance primitive keeps its authored colours (`COLOR_0`) for a livery that does not retexture it.
        const path = role === 'paint' ? appearance.albedo : role === 'appearance' && materialName ? appearance.materialTextures?.[materialName] : undefined;
        if (role === 'paint' && !path) throw Error(`Car ${body.vehicleId} appearance has no paint albedo`);
        return [mesh, path ? await textured(body, source, path, role === 'paint' ? appearance.paint : undefined) : mesh.material] as const;
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
