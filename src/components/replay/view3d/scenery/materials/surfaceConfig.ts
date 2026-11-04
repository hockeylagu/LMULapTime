/**
 * The native material description a scenery GLB carries in `material.extras.lmuSurface` (pipeline `surfaceConfig.mjs`, schema 3).
 * The runtime reads this contract and nothing else: an unknown version, kind or UV set throws.
 */
export type UvSet = 'UV_A' | 'UV_B' | 'UV_C' | 'UV_D' | 'WorldPlanar';
const UV_SETS = new Set<string>(['UV_A', 'UV_B', 'UV_C', 'UV_D', 'WorldPlanar']);

export const SURFACE_KINDS = [
  'terrain', 'road', 'kerb', 'vegetation', 'standard', 'standardBlend', 'clearcoat', 'glass', 'flag', 'digitalFlag', 'roadDecal',
  'lowLumEmissive', 'highLumTrackside', 'highLumSun', 'dashboard', 'diffuse', 'water',
] as const;
export type SurfaceKind = typeof SURFACE_KINDS[number];

export interface SurfaceMap {
  /** Texture stem; the image is `<stem>__srgb.ktx2` or `<stem>__linear.ktx2` by `srgb`. */
  texture: string;
  uv: UvSet;
  scale?: [number, number];
  srgb: boolean;
  normal?: boolean;
}

/** One named block of authored shader parameters (`Material_Adjust`, `Terrain`, ...): numbers and number lists. */
export type ParameterGroup = Record<string, number | number[] | undefined>;

export interface SurfaceConfig {
  version: 3;
  kind: SurfaceKind;
  name: string;
  shader: string;
  flags: Record<string, string | undefined>;
  parameters: Record<string, ParameterGroup | undefined>;
  maps: Record<string, SurfaceMap | undefined>;
  normalYSign: number;
  /** False for the diffuse shader that ignores vertex colour. */
  vertexColour?: false;
  /** Camera-facing billboard geometry (`_lmu_pivot` and `_lmu_corner` attributes). */
  billboard?: true;
}

export function isSurfaceKind(kind: unknown): kind is SurfaceKind {
  return (SURFACE_KINDS as readonly unknown[]).includes(kind);
}

/** The surface description of a material's `userData`, validated; `null` for a material without one (it keeps its glTF look). */
export function readSurfaceConfig(userData: Record<string, unknown>): SurfaceConfig | null {
  const raw = userData.lmuSurface as Partial<SurfaceConfig> | undefined;
  if (raw === undefined) return null;
  if (raw.version !== 3) throw Error('Unsupported private surface material');
  if (!isSurfaceKind(raw.kind)) throw Error(`Unsupported source shader family: ${String(raw.kind)}`);
  const name = typeof raw.name === 'string' ? raw.name : '?';
  if (!raw.flags || !raw.parameters || !raw.maps || !Number.isFinite(raw.normalYSign)) throw Error(`Incomplete surface material: ${name}`);
  for (const [key, map] of Object.entries(raw.maps)) {
    if (!map || typeof map.texture !== 'string' || !UV_SETS.has(map.uv)) throw Error(`Unsupported shader UV: ${name}/${key}`);
  }
  return raw as SurfaceConfig;
}

/** Colour and numeric data may share a game texture name but need different KTX metadata, so the image name carries the role. */
export function textureAsset(stem: string, srgb: boolean): string {
  if (!stem || stem.includes('/') || stem.includes(String.fromCharCode(92))) throw Error('Invalid source texture stem');
  return `${stem}__${srgb ? 'srgb' : 'linear'}.ktx2`;
}

/** Albedo layers of a terrain material: ALBEDOMAPS 1-4 (shader default 3), or null for a variant not handled. */
export function terrainLayerCount(flags: Record<string, string | undefined> | undefined): number | null {
  const count = Number(flags?.ALBEDOMAPS ?? '3');
  return Number.isInteger(count) && count >= 1 && count <= 4 ? count : null;
}

/** The shader lerps A toward B, C and D in turn by the splatter r, g and b blends; these are the resulting layer weights. */
export const TERRAIN_WEIGHTS: Record<number, string> = {
  1: 'vec4(1.0, 0.0, 0.0, 0.0)',
  2: 'vec4(1.0-blend.r, blend.r, 0.0, 0.0)',
  3: 'vec4((1.0-blend.r)*(1.0-blend.g), blend.r*(1.0-blend.g), blend.g, 0.0)',
  4: 'vec4((1.0-blend.r)*(1.0-blend.g)*(1.0-blend.b), blend.r*(1.0-blend.g)*(1.0-blend.b), blend.g*(1.0-blend.b), blend.b)',
};
