import { DoubleSide, MeshPhysicalMaterial, type Data3DTexture, MeshStandardMaterial, NoColorSpace, RepeatWrapping, ShaderChunk, SRGBColorSpace, type Texture } from 'three';
import { patchTextureFocus } from '../scenery/textureFocus.js';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../../shared/types/scenes/car.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { hazeProgram } from '../atmosphere/haze.js';
import { patchAmbientLookup } from '../scenery/materials/patchSurfaceShader.js';
import { bindSurfaceProgram } from '../scenery/materials/configureSurfaceMaterial.js';
import { REFLECTING_KINDS } from '../scenery/materials/sceneryReflection.js';
import { surfaceTextureUnits } from '../scenery/materials/shaderParts.js';
import { isUvAnimation } from '../scenery/materials/surfaceAnimation.js';
import type { SurfaceConfig, SurfaceMap } from '../scenery/materials/surfaceConfig.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';
import { patchCascadeShadow } from '../shadows/cascadeSampling.js';
import { configureCarPaint } from './carPaint.js';
import { PAINT_MAPS } from './paintLayers.js';
import { bindCarSurfaceReflection, CAR_SURFACE_OVERHEAD_UNITS } from './carReflection.js';
import { GUARANTEED_TEXTURE_UNITS } from '../cars/carBatching.js';
import { bindCockpitOcclusion } from './cockpitOcclusion.js';

const UV_CHANNEL: Record<string, number> = { uv0: 0, uv1: 1, uv2: 2, uv3: 3 };

/** The roughness and metalness the exporter writes for every car material but paint. */
function finish(config: CarSurface): { roughness: number; metalness: number } {
  const { roughness, metalness } = config.finish ?? {};
  if (!Number.isFinite(roughness) || !Number.isFinite(metalness)) throw Error(`Car material ${config.kind} has no finish`);
  return { roughness: roughness!, metalness: metalness! };
}

/** The albedo texture path (`textures/<sha256>.ktx2.zst`) a recipe uses for an appearance, or undefined for a constant-colour or untextured material. */
function albedoPath(recipe: CarMaterialRecipe, appearance: CarAppearance): string | undefined {
  return recipe.paint ? appearance.albedo : appearance.materialTextures?.[recipe.name] ?? recipe.surface?.maps.albedo?.texture;
}

/** Car kinds whose package description reads as a scenery surface, drawn with the scenery's program. */
const SURFACE_KINDS = ['standard', 'standardBlend', 'glass', 'tyre', 'dashboard', 'externalMonitor', 'windscreen', 'windscreenInside'] as const;
const isSurfaceKind = (kind: string): kind is typeof SURFACE_KINDS[number] => (SURFACE_KINDS as readonly string[]).includes(kind);

/**
 * The scenery surface description of a car material the surface program draws (`SURFACE_KINDS`), with each map's texture path
 * (the livery's albedo when it has one); null for the other kinds, which keep three's standard material with the albedo map.
 */
function nativeSurface(recipe: CarMaterialRecipe, appearance: CarAppearance): SurfaceConfig | null {
  const surface = recipe.surface;
  const kind = surface?.kind ?? '';
  if (recipe.paint || !surface || !isSurfaceKind(kind)) return null;
  if (!surface.flags || !surface.parameters || !Number.isFinite(surface.normalYSign) || typeof surface.normalShadowInfluence !== 'number' || surface.normalShadowInfluence < 0) throw Error(`Car material ${recipe.name} has no surface description`);
  const maps: Record<string, SurfaceMap> = {};
  for (const [key, map] of Object.entries(surface.maps)) {
    const texture = key === 'albedo' ? albedoPath(recipe, appearance) : map.texture;
    const animation = map.uvAnimation;
    if (animation !== undefined && !isUvAnimation(animation)) throw Error(`Car material ${recipe.name}: unsupported UV animation of ${key}`);
    if (texture) maps[key] = { texture, uv: map.uv, scale: map.scale, srgb: !!map.srgb, ...(animation ? { uvAnimation: animation } : {}) };
  }
  return {
    version: 4, kind, name: recipe.name, flags: surface.flags, maps, normalYSign: surface.normalYSign!,
    normalShadowInfluence: surface.normalShadowInfluence,
    parameters: surface.parameters as SurfaceConfig['parameters'],
  };
}

/** Every texture path a recipe's material samples for an appearance: its albedo, its surface maps, plus the paint maps for car paint. */
export function materialTexturePaths(recipe: CarMaterialRecipe, appearance: CarAppearance): string[] {
  const surface = nativeSurface(recipe, appearance);
  if (surface) return Object.values(surface.maps).map(map => map!.texture);
  const albedo = albedoPath(recipe, appearance), paint = recipe.paint && appearance.paint.kind === 'carPaint' ? appearance.paint : null;
  return [...(albedo ? [albedo] : []), ...(paint ? PAINT_MAPS.flatMap(key => paint.maps[key]?.texture ?? []) : [])];
}

/**
 * What `createCarMaterial` builds from, for an appearance: two recipes with the same key make the same material, so a car draws
 * them with one. Car files often repeat a material under several names (one per part).
 */
export function carMaterialKey(recipe: CarMaterialRecipe, appearance: CarAppearance): string {
  return JSON.stringify([recipe.paint, recipe.paint ? appearance.paint : recipe.surface ?? null, albedoPath(recipe, appearance) ?? null, recipe.reflectionOcclusion ?? null]);
}

/** The map's own copy of a shared texture: repeat-wrapped (car UVs keep their native range) and decoded by the map's colour role. */
function mapTexture(texture: (path: string) => Texture, map: SurfaceMap): Texture {
  const copy = texture(map.texture);
  copy.wrapS = RepeatWrapping; copy.wrapT = RepeatWrapping; copy.anisotropy = MAX_ANISOTROPY;
  copy.colorSpace = map.srgb ? SRGBColorSpace : NoColorSpace;
  copy.needsUpdate = true;
  return copy;
}

/**
 * A three.js material for one native material of a textured car, read from the car descriptor (docs/VEHICLE_PIPELINE.md).
 * Standard, tyre, screen, glass and windscreen materials draw with the scenery's surface program (`SURFACE_KINDS`).
 * The albedo is the appearance's paint texture for paint materials, the livery file of the same-named material when the
 * appearance has one, else the recipe's own map. Car paint is layered paint (carPaint.ts); the other shader kinds
 * map to a standard or physical material with the albedo map.
 * `texture` returns a copy of the KTX2 texture at a `textures/<sha256>.ktx2.zst` path, the caller's to set up: each map has its own for its UV channel.
 * `shading` is the scenery package's shading section, read by the car paint. `volume` returns a copy of the cabin volume at a
 * `volumes/<sha256>.bin` path, for a material with a cockpit reflection occlusion (cockpitOcclusion.ts). `vertexColour`: whether its
 * parts carry the package's vertex colour (without it, white).
 */
export function createCarMaterial(recipe: CarMaterialRecipe, appearance: CarAppearance, texture: (path: string) => Texture, shading: SceneryShading, volume?: (path: string) => Data3DTexture, vertexColour = true): MeshStandardMaterial {
  const config = recipe.paint ? appearance.paint : recipe.surface;
  if (!config) throw Error(`Car material ${recipe.name} has no shader configuration`);
  const surface = nativeSurface(recipe, appearance);
  const albedo = config.maps.albedo, path = albedoPath(recipe, appearance);
  let material: MeshStandardMaterial;
  switch (config.kind) {
    case 'carPaint':
      // The paint program sets roughness, metalness and the coat per pixel (carPaint.ts).
      material = new MeshPhysicalMaterial();
      break;
    case 'standard': case 'standardBlend': case 'tyre': case 'diffuse': case 'externalMonitor':
      material = new MeshStandardMaterial(finish(config));
      break;
    case 'dashboard':
      // A screen draws as the game blends it (`renderState`, below): its backing layer is opaque and the layer the game draws the
      // readouts into blends over it by alpha.
      material = new MeshStandardMaterial(finish(config));
      break;
    case 'glass': case 'windscreen':
      // The scenery's glass program, on the physical model as the scenery's glass (configureSurfaceMaterial.ts).
      material = surface ? new MeshPhysicalMaterial({ ior: 1.5, transparent: true, depthWrite: false }) : new MeshStandardMaterial({ ...finish(config), transparent: true, depthWrite: false });
      break;
    case 'windscreenInside':
      material = new MeshStandardMaterial({ ...finish(config), transparent: true, depthWrite: false });
      break;
    case 'numberPlate': case 'staticEffect':
      material = new MeshStandardMaterial({ ...finish(config), transparent: true });
      break;
    default:
      throw Error(`Unhandled native car shader kind ${config.kind}`);
  }
  // Alpha-masked parts (grilles, meshes, decals): alpha to coverage over the 4x MSAA target smooths their cut edges. Every car part
  // draws one side, as the reference draws them, masked ones included.
  if (config.renderState?.alphaMask) { material.alphaTest = 0.5; material.alphaToCoverage = true; }
  if (config.renderState?.alphaBlend) { material.transparent = true; material.depthWrite = false; }
  // A blended two-sided part (number plates, decals) draws once with both sides, as the scenery's do (configureSurfaceMaterial.ts):
  // three otherwise draws it twice and marks the material changed before each, so every draw looks its program up again. Glass
  // keeps the two passes.
  material.forceSinglePass = config.kind !== 'glass' && config.kind !== 'windscreen' && config.kind !== 'windscreenInside';
  if (surface) {
    const loaded: Record<string, Texture> = {};
    for (const [key, map] of Object.entries(surface.maps)) loaded[key] = mapTexture(texture, map!);
    bindSurfaceProgram(material, surface, loaded, vertexColour);
    // A cabin part with nine maps and the cabin volume has no room left for the overhead correction: past the limit its program
    // fails to link and the part is not drawn.
    const units = surfaceTextureUnits(surface) + (recipe.reflectionOcclusion ? 1 : 0);
    const overhead = units + CAR_SURFACE_OVERHEAD_UNITS <= GUARANTEED_TEXTURE_UNITS;
    bindCarSurfaceReflection(material, overhead);
    // The car batching reads it (carBatching.ts).
    material.userData.surfaceTextureUnits = units + (overhead ? CAR_SURFACE_OVERHEAD_UNITS : 0);
    material.addEventListener('dispose', () => { for (const map of Object.values(loaded)) map.dispose(); });
  } else if (path) {
    // Every textured car material and paint has an albedo map; a livery file replaces its texture on the same UV set.
    const channel = albedo ? UV_CHANNEL[albedo.uv] : undefined;
    if (channel === undefined) throw Error(`Car material ${recipe.name}: no albedo UV set (${albedo?.uv})`);
    // Car UVs keep the package's native range (V in [-1, 0]), which relies on the glTF default REPEAT sampler; the KTX2 loader's
    // clamp default pinned every lookup to the texture edge (a black car).
    const map = texture(path);
    map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping; map.anisotropy = MAX_ANISOTROPY;
    // The map's UV scale tiles the texture (a [0,0] or missing scale is 1); three folds `repeat` into the map's UV transform.
    const [scaleU, scaleV] = albedo?.scale ?? [];
    map.repeat.set(scaleU || 1, scaleV || 1);
    map.channel = channel; map.needsUpdate = true;
    material.map = map;
  } else if (albedo?.constant) {
    material.color.setRGB(albedo.constant[0], albedo.constant[1], albedo.constant[2]);
  }
  if (config.kind === 'carPaint' && material.map) configureCarPaint(material as MeshPhysicalMaterial, config, texture, shading);
  else if (!surface) {
    // Three's own program otherwise: the same ambient lookup as every other surface of the scene.
    material.onBeforeCompile = shader => {
      patchAmbientLookup(shader);
      // Written out: the albedo's lookup fades in as it sharpens.
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', ShaderChunk.map_fragment);
      patchTextureFocus(shader, ['map']);
    };
    // three shares a program between materials with the same key: the key names every hook these materials get, the cascade
    // shadow added below included, so no material with other hooks takes this program.
    material.customProgramCacheKey = () => 'lmu-car-ambient-cascade';
  }
  if (!surface) {
    // Paint and the materials on three's light loop take the sun's shadow from the cascades too (the surface program patches itself).
    const influence = config.normalShadowInfluence, own = material.onBeforeCompile.bind(material);
    if (typeof influence !== 'number' || influence < 0) throw Error(`Car material ${recipe.name} has no normal shadow influence`);
    material.onBeforeCompile = (shader, renderer) => { own(shader, renderer); patchCascadeShadow(shader, influence); };
  }
  hazeProgram(material);
  material.shadowSide = DoubleSide;
  material.name = recipe.name;
  const occlusion = recipe.reflectionOcclusion;
  if (occlusion) {
    if (!volume) throw Error(`Car material ${recipe.name}: no cabin volume for its reflection occlusion`);
    const loaded = volume(occlusion.volume);
    // The surface program's own cube reflection for the kinds that take it (`REFLECTING_KINDS`), else three's environment radiance.
    bindCockpitOcclusion(material, {volume: loaded, box: occlusion}, surface && REFLECTING_KINDS.has(surface.kind) ? 'surface' : 'standard');
    material.addEventListener('dispose', () => { loaded.dispose(); });
  }
  return material;
}
