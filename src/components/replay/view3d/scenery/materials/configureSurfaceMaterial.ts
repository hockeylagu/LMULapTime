import { DoubleSide, MeshStandardMaterial, type Material, type Mesh, type ShaderMaterial, type Texture } from 'three';
import { composedParts } from '../../shaders/composer.js';
import { billboardShadowMaterial } from './billboardCard.js';
import { gltfSurfaceMaterial } from './gltfSurface.js';
import { surfaceTextureUnits } from './shaderParts.js';
import { readSurfaceConfig, type SurfaceConfig } from './surfaceConfig.js';
import { surfaceMaterial } from './surfaceProgram.js';
import type { SurfaceTextureSource } from './textureSource.js';

/** The textures of the surfaces a car drives on (road, kerbs and the decals on them): they sharpen first around the camera. */
export const trackSurfaceTextures = new WeakSet<Texture>();
const TRACK_SURFACE_KINDS: ReadonlySet<SurfaceConfig['kind']> = new Set(['road', 'kerb', 'roadDecal']);

/**
 * Configured scenery materials shared between meshes: every mesh of a surface with the same textures and GLB material state draws
 * with one material, so consecutive draws need no material switch (each switch uploads the material's uniforms again). Chunks stay
 * loaded until the scene goes, so the materials are disposed all at once (`dispose`).
 */
export interface SharedSurfaceMaterials {
  /** The material for `key`, built by `build` the first time. */
  take(key: string, build: () => ShaderMaterial): ShaderMaterial;
  /** Whether this registry handed `material` out (its disposal is the registry's). */
  owns(material: Material): boolean;
  /** Disposes every material handed out. */
  dispose(): void;
}

export function createSharedSurfaceMaterials(): SharedSurfaceMaterials {
  const entries = new Map<string, ShaderMaterial>(), owned = new Set<Material>();
  return {
    take(key, build) {
      let material = entries.get(key);
      if (!material) { material = build(); entries.set(key, material); owned.add(material); }
      return material;
    },
    owns: material => owned.has(material),
    dispose() {
      for (const material of owned) material.dispose();
      entries.clear(); owned.clear();
    },
  };
}

/** What makes two meshes' configured materials the same: the surface, the texture objects and the GLB material's own state. */
function sharedKey(original: MeshStandardMaterial, config: SurfaceConfig, loaded: Record<string, Texture>): string {
  const { transparent, opacity, side, alphaTest, depthWrite, depthTest, vertexColors, blending, emissiveIntensity, flatShading } = original;
  const textures = Object.entries(loaded).map(([key, texture]) => `${key}:${texture.id}`).sort();
  return JSON.stringify([config, textures, transparent, opacity, side, alphaTest, depthWrite, depthTest, vertexColors, blending,
    original.emissive.getHex(), emissiveIntensity, flatShading]);
}

/** The configured material for a surface: the GLB material's own state, the family's composed program and the loaded maps. */
function buildMaterial(original: MeshStandardMaterial, config: SurfaceConfig, loaded: Record<string, Texture>): ShaderMaterial {
  const material = surfaceMaterial(original, config, loaded);
  // Cut-outs (leaf and crowd cards, fences, signs, foliage): a hard alpha cut shimmers, steps at the edges and drops filtered wire
  // as the mesh recedes. In the multisampled scene pass their alpha is their coverage instead (shaderParts.ts `SURFACE_ALPHA_TEST`).
  if (material.alphaTest > 0) material.alphaToCoverage = true;
  // The reference turns its foliage cards toward the sun in the shadow pass, so a card casts whichever side faces it.
  if (config.kind === 'vegetation') material.shadowSide = DoubleSide;
  // A blended two-sided surface (road lines, skid marks, water) draws once with both sides. Three otherwise draws it twice, back
  // faces then front, and marks the material changed before each, so every draw looks its program up again. Glass keeps the two
  // passes: its panes overlap within one mesh, and the far ones must blend first.
  material.forceSinglePass = config.kind !== 'glass';
  if (TRACK_SURFACE_KINDS.has(config.kind)) for (const texture of Object.values(loaded)) trackSurfaceTextures.add(texture);
  material.userData.surfaceConfigured = true;
  material.userData.surfaceTextureUnits = surfaceTextureUnits(config);
  return material;
}

/**
 * Rebuilds a scenery mesh's native material from its GLB surface description (`extras.lmuSurface`): loads every map through
 * `textures`, then composes the family's program (surfaceProgram.ts). A mesh without a surface description draws its glTF material's
 * values on the plain lit program, hazed (gltfSurface.ts). Meshes of the same surface, textures and GLB state share one material,
 * which `shared` disposes; the textures are the source's. An unknown surface, or a map the chunk does not declare, rejects.
 */
export async function configureSurfaceMaterial(mesh: Mesh, textures: SurfaceTextureSource, shared: SharedSurfaceMaterials): Promise<void> {
  if (Array.isArray(mesh.material)) throw Error(`Scenery mesh ${mesh.name || '?'} has several materials`);
  // Already composed: a surface or a glTF material drawn by the plain program.
  if (composedParts(mesh.material)) return;
  const original = mesh.material, config = original instanceof MeshStandardMaterial ? readSurfaceConfig(original.userData) : null;
  if (!(original instanceof MeshStandardMaterial) || !config) {
    mesh.material = gltfSurfaceMaterial(original);
    original.dispose();
    return;
  }
  const loaded: Record<string, Texture> = {};
  await Promise.all(Object.entries(config.maps).map(async ([key, map]) => { if (map) loaded[key] = await textures.load(map); }));
  const placeholder: Texture | undefined = loaded.layerA ?? loaded.albedo ?? loaded.on;
  if (!placeholder && config.kind !== 'standard' && config.kind !== 'standardBlend') throw Error(`Missing base albedo for ${config.name ?? '?'}`);
  const material = shared.take(sharedKey(original, config, loaded), () => buildMaterial(original, config, loaded));
  mesh.material = material;
  original.dispose();

  if (config.billboard) {
    // Vertex yaw can move corners outside the rest plane; keep a conservative culling sphere.
    const geometry = mesh.geometry;
    geometry.computeBoundingSphere();
    const corners = geometry.getAttribute('_lmu_corner');
    let extent = 0;
    for (let i = 0; i < corners.count; i++) extent = Math.max(extent, Math.abs(corners.getX(i)));
    if (!geometry.boundingSphere) throw Error(`Billboard without bounds: ${config.name ?? '?'}`);
    geometry.boundingSphere.radius += extent;
    mesh.customDepthMaterial = billboardShadowMaterial();
  }
}
