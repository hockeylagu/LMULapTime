import { Color, DoubleSide, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Data3DTexture, type IUniform, type Material, type ShaderMaterial, type Texture } from 'three';
import type { CarAppearance, CarMaterialRecipe, CarSurface } from '../../../../../shared/types/scenes/car.js';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { hazePart } from '../atmosphere/haze.js';
import { ALL_LAMPS } from '../night/cockpitLight.js';
import { trackLightPart } from '../night/trackLightProgram.js';
import { coreSurface, drawsOnCore } from '../scenery/materials/coreSurface.js';
import { REFLECTING_KINDS } from '../scenery/materials/sceneryReflection.js';
import { shaderParts, surfaceSamplers, surfaceTextureUnits, surfaceUniforms } from '../scenery/materials/shaderParts.js';
import { isUvAnimation } from '../scenery/materials/surfaceAnimation.js';
import type { SurfaceConfig, SurfaceMap } from '../scenery/materials/surfaceConfig.js';
import { surfaceDefines, surfaceFamilyPart, surfaceValues } from '../scenery/materials/surfaceProgram.js';
import { MAX_ANISOTROPY } from '../scenery/materials/textureSource.js';
import { textureFocusPart } from '../scenery/textureFocus.js';
import { cascadeShadowPart } from '../shadows/cascadeSampling.js';
import { ambientLookupPart } from '../shaders/ambientLookup.js';
import { composedMaterial, type ComposedParameters, type ShaderDefines, type ShaderPart } from '../shaders/composer.js';
import { litTemplate } from '../shaders/litTemplate.js';
import { plainSurfaceMaterial } from '../shaders/plainSurface.js';
import { GUARANTEED_TEXTURE_UNITS } from '../cars/carBatching.js';
import { carPaint } from './carPaint.js';
import { CAR_SURFACE_OVERHEAD_UNITS, carSurfaceProbe } from './carReflection.js';
import { carMapPart, carStandardPart } from './carStandardSurface.js';
import { cockpitOcclusionPart } from './cockpitOcclusion.js';
import { numberPlateGlow, numberPlateGlowPart } from './numberPlateGlow.js';
import { PAINT_MAPS } from './paintLayers.js';

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
 * A mirror the game fills with the rear view (its surface `rearView`): drawn as dark glass (black, fully rough, no metal and no
 * environment light), without the live view, its maps or a reflection. The car probe is taken from the car's centre, so a reflection
 * would show the wrong view.
 */
const isRearView = (recipe: CarMaterialRecipe): boolean => recipe.surface?.rearView === true;

/** Car kinds whose package description reads as a scenery surface, drawn with the scenery's program. */
const SURFACE_KINDS = ['standard', 'standardBlend', 'glass', 'tyre', 'dashboard', 'externalMonitor', 'windscreen', 'windscreenInside'] as const;
const isSurfaceKind = (kind: string): kind is typeof SURFACE_KINDS[number] => (SURFACE_KINDS as readonly string[]).includes(kind);

/**
 * The scenery surface description of a car material the surface program draws (`SURFACE_KINDS`), with each map's texture path
 * (the livery's albedo when it has one); null for the other kinds, which draw on three's standard model with the albedo map.
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

/**
 * The game's draw order of a native material among the blended ones (its surface `sortOffset`, 0 without one): a higher one draws
 * later, over the others, whatever their distance. The outside windscreen (5) is drawn after the lamp glows (0) in the game: on many
 * bodies it covers the tail lights, keeping 7–30 % of the glow under its tinted, lit layer (game captures of 2026-11-24).
 */
export function carSortOffset(recipe: CarMaterialRecipe | undefined): number {
  const offset = recipe?.surface?.sortOffset;
  return typeof offset === 'number' && Number.isFinite(offset) ? offset : 0;
}

/**
 * The draw order of a blended lamp glow: just before the other blended parts of its `carSortOffset`. The game draws every lamp
 * emitter before the car's glass of the same order, so the glass over a lamp (a lens or window, α 0.25–0.45) dims it; sorted by
 * distance instead, the nearer lamp drew after its glass, undimmed (night captures of 2026-11-24).
 */
export function lampSortOffset(recipe: CarMaterialRecipe | undefined): number {
  return carSortOffset(recipe) - 0.5;
}

/**
 * The draw order of a car part (three's `renderOrder`): the highest `carSortOffset` (or `lampSortOffset`) of its blended
 * materials, 0 for an opaque part. The blended parts sort by it first, then by distance.
 */
export function carPartOrder(materials: readonly Material[]): number {
  const orders = materials.flatMap(material => material.transparent && typeof material.userData.sortOffset === 'number' ? [material.userData.sortOffset] : []);
  return orders.length ? Math.max(...orders) : 0;
}

/** Every texture path a recipe's material samples for an appearance: its albedo, its surface maps, plus the paint maps for car paint. */
export function materialTexturePaths(recipe: CarMaterialRecipe, appearance: CarAppearance): string[] {
  if (isRearView(recipe)) return [];
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

/** A car material's family: its parts, the defines it needs, the samplers its lookups fade in, and what it frees and binds. */
interface CarFamily {
  parts: ShaderPart[];
  defines?: ShaderDefines;
  samplers: Record<string, IUniform>;
  /** The track lights and beams it takes, and its cockpit light. */
  lamps?: ReturnType<typeof shaderParts>['lamps'];
  /** Its texture units (the car batching reads them, carBatching.ts). */
  units?: number;
  bind?(material: Material): void;
  dispose?(): void;
}

/**
 * A car material drawn by the scenery's surface program (`SURFACE_KINDS`): the family's GLSL on the material's own values (its
 * colour, roughness and metalness from the surface's `adjust`, no emission of its own) and the loaded maps, its own car's probe read
 * (`carSurfaceProbe`), and the cockpit occlusion of a cabin part with `occluded`. A cabin part with nine maps and the cabin volume
 * has no room left for the overhead correction: past the limit its program fails to link and the part is not drawn. A standard
 * material on the core maps draws through the core surface's program of its flags (coreSurface.ts).
 */
function surfaceFamily(own: SurfaceConfig, loaded: Record<string, Texture>, vertexColour: boolean, occluded: boolean): CarFamily {
  const core = drawsOnCore(own) ? coreSurface(own, loaded) : null, surface = core?.config ?? own;
  const code = shaderParts(surface, { uniforms: true, core: core !== null });
  const uniforms = { ...surfaceUniforms(surface, core?.textures ?? loaded, core !== null), ...surfaceValues(surface, new Color(0, 0, 0)), ...core?.switches };
  const units = surfaceTextureUnits(surface) + (occluded ? 1 : 0);
  const overhead = units + CAR_SURFACE_OVERHEAD_UNITS <= GUARANTEED_TEXTURE_UNITS;
  const probe = carSurfaceProbe(REFLECTING_KINDS.has(surface.kind), overhead);
  return {
    parts: [surfaceFamilyPart(surface, code, uniforms, vertexColour), ...probe.parts],
    defines: surfaceDefines(surface),
    samplers: surfaceSamplers(surface, uniforms),
    lamps: code.lamps,
    units: units + (overhead ? CAR_SURFACE_OVERHEAD_UNITS : 0),
    bind: probe.bind,
    dispose: () => { for (const map of Object.values(loaded)) map.dispose(); },
  };
}

/** The blending a car material's kind draws with, before its render state: glass and effects blend, and glass writes no depth. */
function kindParameters(kind: string): ComposedParameters {
  switch (kind) {
    case 'carPaint': case 'standard': case 'standardBlend': case 'tyre': case 'diffuse': case 'externalMonitor': case 'dashboard':
      // A screen draws as the game blends it (`renderState`): its backing layer is opaque and the layer the game draws the readouts
      // into blends over it by alpha.
      return {};
    case 'glass': case 'windscreen': case 'windscreenInside':
      return { transparent: true, depthWrite: false };
    case 'numberPlate': case 'staticEffect':
      return { transparent: true };
    default:
      throw Error(`Unhandled native car shader kind ${kind}`);
  }
}

/**
 * A car material for one native material of a textured car, read from the car descriptor (docs/VEHICLE_PIPELINE.md), composed on
 * the lit template (shaders/litTemplate.ts) with the cascade shadow, the shared ambient lookup, the track lights nearest the camera
 * and the headlight beams, and the haze. Standard, tyre, screen, glass and windscreen materials draw with the scenery's surface
 * program (`SURFACE_KINDS`). Car paint is layered paint (carPaint.ts) over its albedo. The other kinds draw on three's standard
 * model with their albedo map, or their constant colour, and a lit race number's glow. A rear-view mirror is dark glass.
 *
 * The albedo is the appearance's paint texture for paint materials, the livery file of the same-named material when the appearance
 * has one, else the recipe's own map. `texture` returns a copy of the KTX2 texture at a `textures/<sha256>.ktx2.zst` path, the
 * caller's to set up: each map has its own for its UV channel. `shading` is the scenery package's shading section, read by the car
 * paint. `volume` returns a copy of the cabin volume at a `volumes/<sha256>.bin` path, for a material with a cockpit reflection
 * occlusion (cockpitOcclusion.ts). `vertexColour`: whether its parts carry the package's vertex colour (without it, white).
 */
export function createCarMaterial(recipe: CarMaterialRecipe, appearance: CarAppearance, texture: (path: string) => Texture, shading: SceneryShading, volume?: (path: string) => Data3DTexture, vertexColour = true): ShaderMaterial {
  if (isRearView(recipe)) {
    const glass = plainSurfaceMaterial({ colour: 0x000000, roughness: 1, metalness: 0, environment: 0 });
    glass.name = recipe.name;
    return glass;
  }
  const config = recipe.paint ? appearance.paint : recipe.surface;
  if (!config) throw Error(`Car material ${recipe.name} has no shader configuration`);
  const influence = config.normalShadowInfluence;
  if (typeof influence !== 'number' || influence < 0) throw Error(`Car material ${recipe.name} has no normal shadow influence`);
  const parameters: ComposedParameters = { ...kindParameters(config.kind), name: recipe.name, shadowSide: DoubleSide };
  // Alpha-masked parts (grilles, meshes, decals): alpha to coverage over the 4x MSAA target smooths their cut edges. Every car part
  // draws one side, as the reference draws them, masked ones included.
  if (config.renderState?.alphaMask) Object.assign(parameters, { alphaTest: 0.5, alphaToCoverage: true });
  if (config.renderState?.alphaBlend) Object.assign(parameters, { transparent: true, depthWrite: false });
  // A blended two-sided part (number plates, decals) draws once with both sides, as the scenery's do (configureSurfaceMaterial.ts):
  // three otherwise draws it twice and marks the material changed before each, so every draw looks its program up again. Glass
  // keeps the two passes.
  parameters.forceSinglePass = config.kind !== 'glass' && config.kind !== 'windscreen' && config.kind !== 'windscreenInside';

  const occlusion = recipe.reflectionOcclusion;
  if (occlusion && !volume) throw Error(`Car material ${recipe.name}: no cabin volume for its reflection occlusion`);
  const cabinVolume = occlusion && volume ? volume(occlusion.volume) : null;
  const surface = nativeSurface(recipe, appearance), albedo = config.maps.albedo, path = albedoPath(recipe, appearance);
  let family: CarFamily;
  if (surface) {
    const loaded: Record<string, Texture> = {};
    for (const [key, map] of Object.entries(surface.maps)) loaded[key] = mapTexture(texture, map!);
    family = surfaceFamily(surface, loaded, vertexColour, cabinVolume !== null);
  } else {
    // Every textured car material and paint has an albedo map; a livery file replaces its texture on the same UV set.
    let map: Texture | null = null;
    if (path) {
      const channel = albedo ? UV_CHANNEL[albedo.uv] : undefined;
      if (channel === undefined) throw Error(`Car material ${recipe.name}: no albedo UV set (${albedo?.uv})`);
      // Car UVs keep the package's native range (V in [-1, 0]), which relies on the glTF default REPEAT sampler; the KTX2 loader's
      // clamp default pinned every lookup to the texture edge (a black car).
      map = texture(path);
      map.wrapS = RepeatWrapping; map.wrapT = RepeatWrapping; map.anisotropy = MAX_ANISOTROPY;
      // The map's UV scale tiles the texture (a [0,0] or missing scale is 1), folded into the map's UV transform.
      const [scaleU, scaleV] = albedo?.scale ?? [];
      map.repeat.set(scaleU || 1, scaleV || 1);
      map.channel = channel; map.needsUpdate = true;
    }
    family = config.kind === 'carPaint' && map ? paintFamily(config, map, texture, shading) : standardFamily(recipe, config, map);
  }
  // The scenery rule's own read where the kind reflects by it, else three's environment read.
  const reflectsByRule = surface !== null && REFLECTING_KINDS.has(surface.kind);
  const parts = [
    textureFocusPart(family.samplers), cascadeShadowPart(influence), ambientLookupPart, trackLightPart('near', family.lamps ?? ALL_LAMPS),
    ...family.parts,
    ...(occlusion && cabinVolume ? [cockpitOcclusionPart({ volume: cabinVolume, box: occlusion }, reflectsByRule ? 'surface' : 'standard')] : []),
    hazePart,
  ];
  const material = composedMaterial(litTemplate, parts, parameters, family.defines);
  family.bind?.(material);
  // Its parts' draw order among the blended ones (`carSortOffset`); the car batching reads its texture units.
  if (material.transparent) material.userData.sortOffset = carSortOffset(recipe);
  if (family.units !== undefined) material.userData.surfaceTextureUnits = family.units;
  material.addEventListener('dispose', () => { family.dispose?.(); cabinVolume?.dispose(); });
  return material;
}

/** Car paint over its albedo `map` (carPaint.ts), the albedo read by the map part, its lookups fading in. */
function paintFamily(paint: CarSurface, map: Texture, texture: (path: string) => Texture, shading: SceneryShading): CarFamily {
  const layered = carPaint(paint, map, texture, shading), mapPart = carMapPart(map, true);
  return {
    parts: [mapPart, layered.part], defines: layered.defines,
    samplers: { map: mapPart.uniforms!().map, ...layered.samplers },
    // The albedo is the material's own copy, freed with it as the paint maps are.
    bind: layered.bind, dispose: () => { layered.dispose(); map.dispose(); },
  };
}

/**
 * A car part on three's standard model (carStandardSurface.ts): its finish (paint without its albedo: three's physical defaults,
 * fully rough, no metal), its albedo map or its constant colour, and a lit race number's glow.
 */
function standardFamily(recipe: CarMaterialRecipe, config: CarSurface, map: Texture | null): CarFamily {
  const values = config.kind === 'carPaint' ? { roughness: 1, metalness: 0 } : finish(config);
  const constant = !map ? config.maps.albedo?.constant : undefined;
  const colour = constant ? new Color().setRGB(constant[0], constant[1], constant[2]) : new Color(1, 1, 1);
  const plate = config.kind === 'numberPlate' ? numberPlateGlow(recipe.surface) : null;
  const mapPart = map ? carMapPart(map, true) : null;
  return {
    parts: [carStandardPart({ ...values, colour }), ...(mapPart ? [mapPart] : []), ...(plate ? [numberPlateGlowPart(plate, mapPart !== null)] : [])],
    samplers: mapPart ? { map: mapPart.uniforms!().map } : {},
    // The albedo is the material's own copy.
    dispose: () => { map?.dispose(); },
  };
}