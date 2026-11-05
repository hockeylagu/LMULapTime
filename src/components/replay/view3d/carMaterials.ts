import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, type Texture } from 'three';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../shared/types/scenes/car.js';

const UV_CHANNEL: Record<string, number> = { UV_A: 0, UV_B: 1, UV_C: 2, UV_D: 3 };

function adjust(config: CarSurface, key: 'Roughness' | 'Metallic'): number | undefined {
  const value = (config.parameters?.Material_Adjust as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The albedo texture path (`textures/<sha256>.ktx2.zst`) a recipe uses for an appearance, or undefined for a constant-colour or untextured material. */
export function albedoPath(recipe: CarMaterialRecipe, appearance: CarAppearance): string | undefined {
  return recipe.paint ? appearance.albedo : appearance.materialTextures?.[recipe.name] ?? recipe.surface?.maps.albedo?.texture;
}

/**
 * A three.js material for one native material of a textured car, read from the car descriptor (docs/VEHICLE_PIPELINE.md).
 * The albedo is the appearance's paint texture for paint materials, the livery file of the same-named material when the
 * appearance has one, else the recipe's own map. The game's per-shader lighting (carPaint regions, normal and aoSpec maps) is not
 * reconstructed: each shader kind maps to a standard or physical material with the albedo map.
 * `texture` returns a shared KTX2 texture by its `textures/<sha256>.ktx2.zst` path; each material uses its own clone for its UV channel.
 */
export function createCarMaterial(recipe: CarMaterialRecipe, appearance: CarAppearance, texture: (path: string) => Texture): MeshStandardMaterial {
  const config = recipe.paint ? appearance.paint : recipe.surface;
  if (!config) throw Error(`Car material ${recipe.name} has no shader configuration`);
  const albedo = config.maps.albedo, path = albedoPath(recipe, appearance);
  let material: MeshStandardMaterial;
  switch (config.kind) {
    case 'carPaint':
      material = new MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.05, roughness: 0.35, metalness: 0.1 });
      break;
    case 'standard': case 'standardBlend':
      material = new MeshStandardMaterial({ roughness: adjust(config, 'Roughness') ?? 0.5, metalness: adjust(config, 'Metallic') ?? 0 });
      break;
    case 'tyre':
      material = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
      break;
    case 'diffuse':
      material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
      break;
    case 'glass': case 'windscreen': case 'windscreenInside':
      material = new MeshStandardMaterial({ roughness: 0.05, metalness: 0, transparent: true, depthWrite: false });
      break;
    case 'numberPlate': case 'display': case 'staticEffect':
      material = new MeshStandardMaterial({ roughness: 0.6, metalness: 0, transparent: true });
      break;
    default:
      throw Error(`Unhandled native car shader kind ${config.kind}`);
  }
  if (config.renderState?.alphaMask) { material.alphaTest = 0.5; material.side = DoubleSide; }
  if (config.renderState?.alphaBlend) { material.transparent = true; material.depthWrite = false; }
  if (path) {
    const channel = UV_CHANNEL[albedo?.uv ?? 'UV_A'];
    if (channel === undefined) throw Error(`Unsupported car shader UV ${albedo?.uv}`);
    const map = texture(path).clone();
    // Car UVs keep the game's native range (V in [-1, 0]), which relies on the glTF default REPEAT sampler; the KTX2 loader's
    // clamp default pinned every lookup to the texture edge (a black car).
    map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping;
    map.channel = channel; map.needsUpdate = true;
    material.map = map;
  } else if (albedo?.constant) {
    material.color.setRGB(albedo.constant[0], albedo.constant[1], albedo.constant[2]);
  }
  material.shadowSide = DoubleSide;
  material.name = recipe.name;
  return material;
}
