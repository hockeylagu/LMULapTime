import type { ParameterGroup, SurfaceConfig, SurfaceKind } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';

/** The parameter groups each kind reads: a number (1) or a list of that length. Synthetic test values, not package data. */
type Shape = Record<string, Record<string, number>>;
const ADJUST = { tint: 3, normalStrength: 1, roughness: 1, metalness: 1, specular: 1 };
const STANDARD: Shape = {
  adjust: ADJUST,
  base: { albedo: 4, albedoAlt: 4, metalness: 1, roughness: 1, metalnessAlt: 1, roughnessAlt: 1 },
  detail: {
    albedo: 1, ao: 1, aoBlend: 1, specular: 1, specularBlend: 1, roughness: 1, roughnessBlend: 1, metalness: 1, metalnessBlend: 1,
    normal: 2, normalBlend: 1, normalAltBlend: 1, maskAlbedo: 1, maskMetalness: 1, maskRoughness: 1, maskNormal: 1,
  },
  emissive: { colour: 3, strength: 1 },
};
const LAYERS = { A: 1, B: 1, C: 1, D: 1 };
const COAT = { roughness: 1, ior: 1, specular: 1, normalStrength: 1 };
const SHAPES: Record<SurfaceKind, Shape> = {
  terrain: {
    adjust: { ...ADJUST, specularTinting: 1 }, uvScale: { mixLow: 2 }, layerNormalBlend: LAYERS, layerNormalStrength: LAYERS,
    terrain: { mixBias: 1, splatterOverlay: 1, patternStrength: 1, patternA: 1, patternB: 1, patternC: 1, patternD: 1 },
  },
  road: { adjust: ADJUST, decal: { strength: 1, thickness: 1, softness: 1, detail: 1 }, bare: { roughness: 1, specular: 1 } },
  kerb: { adjust: ADJUST, kerbBlend: { mixBias: 1, default: 1 } },
  vegetation: { adjust: { ...ADJUST, specularTint: 3 }, base: { albedo: 4, leafMask: 1, roughness: 1 }, translucency: { power: 1, scale: 1 } },
  standard: STANDARD, standardBlend: STANDARD,
  clearcoat: {
    adjust: ADJUST, singleCoat: COAT, baseCoat: COAT, detail: { albedo: 1 },
    clearCoat: { ...COAT, strength: 1, lacquerColour: 3, lacquerThickness: 1 },
  },
  glass: { adjust: ADJUST },
  flag: { adjust: ADJUST, base: { albedo: 4, metalness: 1, roughness: 1, specular: 1 }, emissive: { colour: 3, strength: 1 } },
  digitalFlag: { adjust: ADJUST, blink: { period: 1 } },
  roadDecal: { adjust: { ...ADJUST, overlayStrength: 1 }, blending: { range: 1, darkening: 1 } },
  dashboard: { adjust: ADJUST, dashboard: { roughness: 1, emissiveStrength: 1 } },
  lowLumEmissive: { adjust: ADJUST }, highLumTrackside: { adjust: ADJUST }, highLumSun: { adjust: ADJUST }, diffuse: { adjust: ADJUST }, water: { adjust: ADJUST },
};
const FLAGS: Partial<Record<SurfaceKind, Record<string, string>>> = { terrain: { layers: '3' }, road: { decalBlend: 'addSub', ambientOcclusion: 'local' } };

type Over = Partial<Omit<SurfaceConfig, 'parameters'>> & { parameters?: Record<string, ParameterGroup> };

/**
 * A complete version 4 surface of `kind` (every number 0.4, lists of 0.6, white tint), with `over` applied on top: its flags
 * and each parameter group merge into the defaults.
 */
export function surface(kind: SurfaceKind, over: Over = {}): SurfaceConfig {
  const parameters: Record<string, ParameterGroup> = {};
  for (const [group, shape] of Object.entries(SHAPES[kind]))
    parameters[group] = Object.fromEntries(Object.entries(shape).map(([key, size]) => [key, size === 1 ? 0.4 : Array<number>(size).fill(0.6)]));
  parameters.adjust.tint = [1, 1, 1];
  for (const [group, values] of Object.entries(over.parameters ?? {})) parameters[group] = { ...parameters[group], ...values };
  return {
    version: 4, kind, name: `test_${kind}`, maps: {}, normalYSign: -1, normalShadowInfluence: 0.5, ...over,
    flags: { ...FLAGS[kind], ...over.flags }, parameters,
  };
}
