/** Textured car of package manifest schema 3: a GLB with four wheel rigs, a descriptor JSON and KTX2 textures. */
import type { Vec3 } from './scenery.js';

export interface CarTextureRef { asset: string; sha256: string; byteLength: number }

export interface CarCatalogRow {
  schemaVersion: 1;
  vehicleFolder: string;
  /** Installed VEH ids (original case) this model serves. */
  vehicleIds: string[];
  /** Package-relative `cars/<vehicleFolder>.json`. */
  descriptor: string;
  descriptorSha256: string;
  /** Package-relative `cars/<sha256>.glb`. */
  asset: string;
  sha256: string;
  byteLength: number;
  triangles: number;
  vertices: number;
  textures: CarTextureRef[];
}

export interface CarResource extends CarCatalogRow { packageRevision: string }

export type CarCorner = 'fl' | 'fr' | 'rl' | 'rr';

/** One map of a native material recipe (only the fields the viewer reads). */
export interface CarMapRef {
  /** `textures/<sha256>.ktx2`, relative to the cars folder; absent for a constant map. */
  texture?: string;
  uv: string;
  scale: [number, number];
  srgb?: boolean;
  constant?: number[];
}

/** Native shader configuration: a material's `surface`, or an appearance's `paint`. */
export interface CarSurface {
  kind: string;
  maps: Record<string, CarMapRef>;
  parameters?: Record<string, unknown>;
  renderState?: { alphaBlend?: boolean; alphaMask?: boolean };
}

export interface CarMaterialRecipe {
  /** Equals the GLB material's `extras.nativeMaterialId`. */
  id: string;
  name: string;
  /** True when the appearance's VEH paint override replaces this material's shader. */
  paint: boolean;
  /** Absent for paint materials: the appearance supplies the shader. */
  surface?: CarSurface;
}

export interface CarAppearance {
  alias: string;
  /** Albedo of the paint material, `textures/<sha256>.ktx2` relative to the cars folder. */
  albedo: string;
  paint: CarSurface;
  /** Livery files replacing the albedo of the same-named material. */
  materialTextures?: Record<string, string>;
}

export interface CarDescriptor {
  schemaVersion: 1;
  vehicleFolder: string;
  aliases: string[];
  wheelPivots: Record<CarCorner, Vec3>;
  wheelRig: { passed: true; rigs: 4; maxRestVertexErrorM: number };
  appearances: CarAppearance[];
  materials: CarMaterialRecipe[];
}
