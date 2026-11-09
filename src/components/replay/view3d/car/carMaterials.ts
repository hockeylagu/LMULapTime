import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../../shared/types/scenes/car.js';
import { bindSurfaceProgram } from '../scenery/materials/configureSurfaceMaterial.js';
import type { SurfaceConfig, SurfaceMap } from '../scenery/materials/surfaceConfig.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';
import { configureCarPaint, PAINT_MAPS } from './carPaint.js';

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

/**
 * The scenery surface description of a car's standard material, with each map's texture path (the livery's albedo when it has
 * one); null for the other kinds, which keep three's standard material with the albedo map.
 */
function nativeSurface(recipe: CarMaterialRecipe, appearance: CarAppearance): SurfaceConfig | null {
  const surface = recipe.surface;
  if (recipe.paint || !surface || (surface.kind !== 'standard' && surface.kind !== 'standardBlend')) return null;
  if (!surface.flags || !surface.parameters || !Number.isFinite(surface.normalYSign)) throw Error(`Car material ${recipe.name} has no surface description`);
  const maps: Record<string, SurfaceMap> = {};
  for (const [key, map] of Object.entries(surface.maps)) {
    const texture = key === 'albedo' ? albedoPath(recipe, appearance) : map.texture;
    if (texture) maps[key] = { texture, uv: map.uv, scale: map.scale, srgb: !!map.srgb };
  }
  return {
    version: 4, kind: surface.kind, name: recipe.name, flags: surface.flags, maps, normalYSign: surface.normalYSign!,
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

/** The map's own copy of a shared texture: repeat-wrapped (car UVs keep their native range) and decoded by the map's colour role. */
function mapTexture(texture: (path: string) => Texture, map: SurfaceMap): Texture {
  const copy = texture(map.texture).clone();
  copy.wrapS = RepeatWrapping; copy.wrapT = RepeatWrapping; copy.anisotropy = MAX_ANISOTROPY;
  copy.colorSpace = map.srgb ? SRGBColorSpace : NoColorSpace;
  copy.needsUpdate = true;
  return copy;
}

/**
 * A three.js material for one native material of a textured car, read from the car descriptor (docs/VEHICLE_PIPELINE.md).
 * Standard materials draw with the scenery's surface program (albedo, metal/roughness, AO/specular, normal and detail maps).
 * The albedo is the appearance's paint texture for paint materials, the livery file of the same-named material when the
 * appearance has one, else the recipe's own map. Car paint is layered paint (carPaint.ts); the other shader kinds
 * map to a standard or physical material with the albedo map.
 * `texture` returns a shared KTX2 texture by its `textures/<sha256>.ktx2.zst` path; each material uses its own clone for its UV channel.
 */
export function createCarMaterial(recipe: CarMaterialRecipe, appearance: CarAppearance, texture: (path: string) => Texture): MeshStandardMaterial {
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
    case 'standard': case 'standardBlend': case 'tyre': case 'diffuse':
      material = new MeshStandardMaterial(finish(config));
      break;
    case 'glass': case 'windscreen': case 'windscreenInside':
      material = new MeshStandardMaterial({ ...finish(config), transparent: true, depthWrite: false });
      break;
    case 'numberPlate': case 'display': case 'staticEffect':
      material = new MeshStandardMaterial({ ...finish(config), transparent: true });
      break;
    default:
      throw Error(`Unhandled native car shader kind ${config.kind}`);
  }
  // Alpha-masked parts (grilles, meshes, decals): alpha to coverage over the 4x MSAA target smooths their cut edges.
  if (config.renderState?.alphaMask) { material.alphaTest = 0.5; material.alphaToCoverage = true; material.side = DoubleSide; }
  if (config.renderState?.alphaBlend) { material.transparent = true; material.depthWrite = false; }
  if (surface) {
    const loaded: Record<string, Texture> = {};
    for (const [key, map] of Object.entries(surface.maps)) loaded[key] = mapTexture(texture, map!);
    bindSurfaceProgram(material, surface, loaded);
    material.addEventListener('dispose', () => { for (const map of Object.values(loaded)) map.dispose(); });
  } else if (path) {
    // Every textured car material and paint has an albedo map; a livery file replaces its texture on the same UV set.
    const channel = albedo ? UV_CHANNEL[albedo.uv] : undefined;
    if (channel === undefined) throw Error(`Car material ${recipe.name}: no albedo UV set (${albedo?.uv})`);
    // Car UVs keep the package's native range (V in [-1, 0]), which relies on the glTF default REPEAT sampler; the KTX2 loader's
    // clamp default pinned every lookup to the texture edge (a black car).
    const map = texture(path).clone();
    map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping; map.anisotropy = MAX_ANISOTROPY;
    // The map's UV scale tiles the texture (a [0,0] or missing scale is 1); three folds `repeat` into the map's UV transform.
    const [scaleU, scaleV] = albedo?.scale ?? [];
    map.repeat.set(scaleU || 1, scaleV || 1);
    map.channel = channel; map.needsUpdate = true;
    material.map = map;
  } else if (albedo?.constant) {
    material.color.setRGB(albedo.constant[0], albedo.constant[1], albedo.constant[2]);
  }
  if (config.kind === 'carPaint' && material.map) configureCarPaint(material as MeshPhysicalMaterial, config, texture);
  material.shadowSide = DoubleSide;
  material.name = recipe.name;
  return material;
}
