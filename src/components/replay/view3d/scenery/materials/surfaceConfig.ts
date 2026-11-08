/**
 * The material description a scenery GLB carries in `material.extras.lmuSurface` (version 4): the flags and parameters the app
 * reads, in its own names, every value filled by the exporter. The runtime reads this contract and nothing else: an unknown
 * version, kind or UV set throws.
 */
/** Texture coordinate source: the mesh UV sets 0..3 (glTF TEXCOORD_0..3) or the world XZ projection. */
export type UvSet = 'uv0' | 'uv1' | 'uv2' | 'uv3' | 'worldPlanar';
const UV_SETS = new Set<string>(['uv0', 'uv1', 'uv2', 'uv3', 'worldPlanar']);

export const SURFACE_KINDS = [
  'terrain', 'road', 'kerb', 'vegetation', 'standard', 'standardBlend', 'clearcoat', 'glass', 'flag', 'digitalFlag', 'roadDecal',
  'lowLumEmissive', 'highLumTrackside', 'highLumSun', 'dashboard', 'diffuse', 'water',
] as const;
export type SurfaceKind = typeof SURFACE_KINDS[number];

export interface SurfaceMap {
  /** Texture stem; the image is `<stem>__srgb.ktx2.zst` or `<stem>__linear.ktx2.zst` by `srgb`. */
  texture: string;
  uv: UvSet;
  scale: [number, number];
  srgb: boolean;
  normal?: boolean;
}

/** One named block of shader parameters (`adjust`, `terrain`, ...): numbers and number lists. */
export type ParameterGroup = Record<string, number | number[] | undefined>;

export interface SurfaceConfig {
  version: 4;
  kind: SurfaceKind;
  name?: string;
  /** Switches (`'on'`) and modes in the app's words; a switch that is off is absent. */
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
  const stored = userData.lmuSurface as { version?: unknown } | undefined;
  if (stored === undefined) return null;
  if (stored.version !== 4) throw Error('Unsupported private surface material');
  const given = stored as Partial<SurfaceConfig>;
  if (!isSurfaceKind(given.kind)) throw Error(`Unsupported source shader family: ${String(given.kind)}`);
  const name = typeof given.name === 'string' ? given.name : '?';
  if (!given.flags || !given.parameters || !given.maps || !Number.isFinite(given.normalYSign)) throw Error(`Incomplete surface material: ${name}`);
  const config = given as SurfaceConfig;
  for (const [key, map] of Object.entries(config.maps)) {
    if (!map || typeof map.texture !== 'string' || !UV_SETS.has(map.uv)) throw Error(`Unsupported shader UV: ${name}/${key}`);
    if (!Array.isArray(map.scale) || map.scale.length !== 2 || !map.scale.every(Number.isFinite)) throw Error(`Missing map scale: ${name}/${key}`);
  }
  return config;
}

/** Colour and numeric data may share a game texture name but need different KTX metadata, so the image name carries the role. */
export function textureAsset(stem: string, srgb: boolean): string {
  if (!stem || stem.includes('/') || stem.includes(String.fromCharCode(92))) throw Error('Invalid source texture stem');
  return `${stem}__${srgb ? 'srgb' : 'linear'}.ktx2.zst`;
}

/** Albedo layers of a terrain material (`layers` 1-4), which the exporter always writes. */
export function terrainLayerCount(flags: Record<string, string | undefined> | undefined): number {
  const count = Number(flags?.layers);
  if (!Number.isInteger(count) || count < 1 || count > 4) throw Error(`Unsupported terrain layer count ${String(flags?.layers)}`);
  return count;
}

/** The shader lerps A toward B, C and D in turn by the splatter r, g and b blends; these are the resulting layer weights. */
export const TERRAIN_WEIGHTS: Record<number, string> = {
  1: 'vec4(1.0, 0.0, 0.0, 0.0)',
  2: 'vec4(1.0-blend.r, blend.r, 0.0, 0.0)',
  3: 'vec4((1.0-blend.r)*(1.0-blend.g), blend.r*(1.0-blend.g), blend.g, 0.0)',
  4: 'vec4((1.0-blend.r)*(1.0-blend.g)*(1.0-blend.b), blend.r*(1.0-blend.g)*(1.0-blend.b), blend.g*(1.0-blend.b), blend.b)',
};
