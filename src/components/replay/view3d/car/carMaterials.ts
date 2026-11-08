import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, type Texture } from 'three';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../../shared/types/scenes/car.js';
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

/** Every texture path a recipe's material samples for an appearance: its albedo, plus the paint maps for car paint. */
export function materialTexturePaths(recipe: CarMaterialRecipe, appearance: CarAppearance): string[] {
  const albedo = albedoPath(recipe, appearance), paint = recipe.paint && appearance.paint.kind === 'carPaint' ? appearance.paint : null;
  return [...(albedo ? [albedo] : []), ...(paint ? PAINT_MAPS.flatMap(key => paint.maps[key]?.texture ?? []) : [])];
}

/**
 * A three.js material for one native material of a textured car, read from the car descriptor (docs/VEHICLE_PIPELINE.md).
 * The albedo is the appearance's paint texture for paint materials, the livery file of the same-named material when the
 * appearance has one, else the recipe's own map. Car paint is layered paint (carPaint.ts); the other shader kinds
 * map to a standard or physical material with the albedo map.
 * `texture` returns a shared KTX2 texture by its `textures/<sha256>.ktx2.zst` path; each material uses its own clone for its UV channel.
 */
export function createCarMaterial(recipe: CarMaterialRecipe, appearance: CarAppearance, texture: (path: string) => Texture): MeshStandardMaterial {
  const config = recipe.paint ? appearance.paint : recipe.surface;
  if (!config) throw Error(`Car material ${recipe.name} has no shader configuration`);
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
  if (path) {
    // Every textured car material and paint has an albedo map; a livery file replaces its texture on the same UV set.
    const channel = albedo ? UV_CHANNEL[albedo.uv] : undefined;
    if (channel === undefined) throw Error(`Car material ${recipe.name}: no albedo UV set (${albedo?.uv})`);
    const map = texture(path).clone();
    // Car UVs keep the package's native range (V in [-1, 0]), which relies on the glTF default REPEAT sampler; the KTX2 loader's
    // clamp default pinned every lookup to the texture edge (a black car).
    map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping;
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
