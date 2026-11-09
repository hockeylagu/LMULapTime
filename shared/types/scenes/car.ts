/** 3D vehicle bodies of the package: a GLB with four wheel rigs, a descriptor JSON and KTX2 textures each. */
import type { Vec3 } from './scenery.js';

export interface BodyTextureRef { asset: string; sha256: string; byteLength: number }

/** A 3D vehicle body: the union of the VEH ids it serves across the vehicle records that list it. */
export interface VehicleBody {
  /** The installed vehicle folder, or `<folder>.<hash>` for a further geometry of that folder. */
  folder: string;
  /** Upper-case VEH ids this body serves. */
  vehicleIds: string[];
  /** Package-relative `vehicles/bodies/<folder>.json`. */
  descriptor: string;
  descriptorSha256: string;
  /** Package-relative `vehicles/<sha256>.glb`. */
  asset: string;
  sha256: string;
  byteLength: number;
  triangles: number;
  vertices: number;
  textures: BodyTextureRef[];
}

export interface BodyResource extends VehicleBody { packageRevision: string }

export type CarCorner = 'fl' | 'fr' | 'rl' | 'rr';

/** One map of a native material recipe (only the fields the viewer reads). */
export interface CarMapRef {
  /** `textures/<sha256>.ktx2.zst`, relative to the vehicles folder; absent for a constant map. */
  texture?: string;
  /** The mesh UV set 0..3 the map samples (glTF TEXCOORD_0..3). */
  uv: 'uv0' | 'uv1' | 'uv2' | 'uv3';
  scale: [number, number];
  srgb?: boolean;
  constant?: number[];
}

/**
 * A material's `surface`, or an appearance's `paint` (version 4: the app's names, every value it reads filled). Kinds shared with
 * the track carry the scenery `parameters` (`adjust.roughness`, ...); car paint carries `regions` (black, red, green, blue, white),
 * `uvScale`, `clearCoatStrength`, `lacquerThickness`, `carbonFibreAlbedoColour` and `metallicFlakeColour`.
 */
export interface CarSurface {
  version: 4;
  kind: string;
  maps: Record<string, CarMapRef>;
  parameters?: Record<string, unknown>;
  renderState?: { alphaBlend?: boolean; alphaMask?: boolean };
  /** Roughness and metalness the app renders the material with; every material but paint has one. */
  finish?: { roughness: number; metalness: number };
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
  /** Albedo of the paint material, `textures/<sha256>.ktx2.zst` relative to the vehicles folder. */
  albedo: string;
  paint: CarSurface;
  /** Livery files replacing the albedo of the same-named material. */
  materialTextures?: Record<string, string>;
  /** The body's option part nodes this entry shows; the others stay hidden. */
  optionNodes: string[];
}

/** A camera of the car, named by role (`cockpit` driver's eye, `hood`, `roof`), in the native car frame of the GLB (+x left, +y up, -z forward). */
export interface CarCamera {
  /** Role: `cockpit`, `hood` or `roof`. */
  name: string;
  position: Vec3;
  /** Pitch, yaw, roll offsets in radians. */
  orientation: Vec3;
  /** Horizontal and vertical field of view in degrees (the vertical one is used). */
  fov: [number, number];
  clipPlanes: [number, number];
  /** Which cockpit mesh variant this camera shows: `in` for driver-eye cameras. */
  cockpitView: 'in' | 'out';
}

export interface BodyDescriptor {
  vehicleFolder: string;
  aliases: string[];
  wheelPivots: Record<CarCorner, Vec3>;
  /** GLB nodes that are alternatives between entries (number plates, lights, body panels): `option_<mesh stem>`, mesh-only. */
  optionNodes: string[];
  wheelRig: { passed: true; rigs: 4; maxRestVertexErrorM: number };
  appearances: CarAppearance[];
  materials: CarMaterialRecipe[];
  /** The car's cockpit, hood and roof cameras. */
  cameras: { list: CarCamera[] };
}
