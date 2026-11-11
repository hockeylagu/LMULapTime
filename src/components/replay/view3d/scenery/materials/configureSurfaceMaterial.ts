import { Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type IUniform, type Material, type Texture } from 'three';
import { digitalFlagClock } from './flagSurface.js';
import { billboardShadowMaterial, computeCustomProgramCacheKey, patchSurfaceShader } from './patchSurfaceShader.js';
import { list, value } from './shaderContext.js';
import { readSurfaceConfig, type SurfaceConfig } from './surfaceConfig.js';
import type { SurfaceTextureSource } from './textureSource.js';

const START_MS = performance.now();

/** The textures a configured surface material samples through its own uniforms (not glTF slots), for GPU warm-up. */
export const surfaceTextureMaps = new WeakMap<Material, Texture[]>();

/** A scenery mesh's material, or null when the mesh holds several (the exporter never writes those). */
function singleMaterial(mesh: Mesh): MeshStandardMaterial | null {
  return mesh.material instanceof MeshStandardMaterial ? mesh.material : null;
}

/** Clearcoat and glass need the physical model; the rest keep a per-mesh clone of the standard material loaded from the GLB. */
function ownMaterial(source: MeshStandardMaterial, config: SurfaceConfig): MeshStandardMaterial {
  if (config.kind !== 'clearcoat' && config.kind !== 'glass') return source.clone();
  const material = new MeshPhysicalMaterial();
  MeshStandardMaterial.prototype.copy.call(material, source);
  material.defines = { STANDARD: '', PHYSICAL: '' };
  if (config.kind === 'clearcoat') {
    const { clearCoat: coat, baseCoat: base } = config.parameters;
    material.clearcoat = value(coat, 'strength');
    material.clearcoatRoughness = value(coat, 'roughness');
    material.ior = value(base, 'ior');
  } else { material.ior = 1.5; material.roughness = 0; }
  return material;
}

/**
 * Draws `material` with the native surface program of `config`, sampling `loaded` (one texture per map key, its UV scale from the
 * map). The material's own tint, roughness, metalness and normal scale come from the surface's `adjust` group.
 */
export function bindSurfaceProgram(material: MeshStandardMaterial, config: SurfaceConfig, loaded: Record<string, Texture>): void {
  const uniforms: Record<string, IUniform> = {};
  for (const [key, texture] of Object.entries(loaded)) {
    uniforms[`surface_${key}`] = { value: texture };
    uniforms[`surface_scale_${key}`] = { value: new Vector2(...config.maps[key]!.scale) };
  }
  material.userData.surfaceTextures = Object.keys(loaded);
  surfaceTextureMaps.set(material, Object.values(loaded));
  const adjust = config.parameters.adjust;
  material.roughness = value(adjust, 'roughness');
  material.metalness = value(adjust, 'metalness');
  const [r, g, b] = list(adjust, 'tint');
  material.color.setRGB(r * r, g * g, b * b);
  const intensity = value(adjust, 'normalStrength');
  material.normalScale = new Vector2(intensity, intensity * config.normalYSign);
  // Three retains uniforms per material even when the compiled program is shared. The packed source normals, AO and roughness
  // are decoded by the patched shader exactly once, so the glTF maps are dropped.
  material.normalMap = null; material.aoMap = null; material.roughnessMap = null; material.metalnessMap = null; material.emissiveMap = null;
  material.onBeforeCompile = shader => { patchSurfaceShader(shader, config, uniforms); };
  const programKey = computeCustomProgramCacheKey(config);
  material.customProgramCacheKey = () => programKey;
  material.map = loaded.layerA ?? loaded.albedo ?? loaded.on ?? null;
  material.needsUpdate = true;
}

/**
 * Configured scenery materials shared between meshes: every mesh of a surface with the same textures and GLB material state draws
 * with one material, so consecutive draws need no material switch (each switch uploads the material's uniforms again). A material
 * is disposed when the last mesh that took it is released.
 */
export interface SharedSurfaceMaterials {
  /** The material for `key`, built by `build` the first time; each call counts one user. */
  take(key: string, build: () => MeshStandardMaterial): MeshStandardMaterial;
  /** Gives back one user of `material`; false for a material this registry did not hand out. */
  release(material: Material): boolean;
  /** Whether this registry handed `material` out (its disposal is the registry's). */
  owns(material: Material): boolean;
}

export function createSharedSurfaceMaterials(): SharedSurfaceMaterials {
  const entries = new Map<string, { material: MeshStandardMaterial; users: number }>(), keys = new WeakMap<Material, string>();
  return {
    take(key, build) {
      let entry = entries.get(key);
      if (!entry) { entry = { material: build(), users: 0 }; entries.set(key, entry); keys.set(entry.material, key); }
      entry.users++;
      return entry.material;
    },
    release(material) {
      const key = keys.get(material);
      if (key === undefined) return false;
      const entry = entries.get(key);
      if (entry && --entry.users === 0) { entries.delete(key); material.dispose(); }
      return true;
    },
    owns: material => keys.has(material),
  };
}

/** What makes two meshes' configured materials the same: the surface, the texture objects and the GLB material's own state. */
function sharedKey(original: MeshStandardMaterial, config: SurfaceConfig, loaded: Record<string, Texture>): string {
  const { transparent, opacity, side, alphaTest, depthWrite, depthTest, vertexColors, blending, emissiveIntensity, flatShading } = original;
  const textures = Object.entries(loaded).map(([key, texture]) => `${key}:${texture.id}`).sort();
  return JSON.stringify([config, textures, transparent, opacity, side, alphaTest, depthWrite, depthTest, vertexColors, blending,
    original.emissive.getHex(), emissiveIntensity, flatShading]);
}

/** The configured material for a surface: the GLB material's own state, the family's program and the loaded maps. */
function buildMaterial(original: MeshStandardMaterial, config: SurfaceConfig, loaded: Record<string, Texture>, ownsTextures: boolean): MeshStandardMaterial {
  const material = ownMaterial(original, config);
  // Cut-outs (leaf and crowd cards, fences, signs, foliage): a hard alpha cut shimmers, steps at the edges and drops filtered wire
  // as the mesh recedes. In the multisampled scene pass their alpha is their coverage instead (patchSurfaceShader.ts).
  if (material.alphaTest > 0) material.alphaToCoverage = true;
  // A blended two-sided surface (road lines, skid marks, water) draws once with both sides. Three otherwise draws it twice, back
  // faces then front, and marks the material changed before each, so every draw looks its program up again. Glass keeps the two
  // passes: its panes overlap within one mesh, and the far ones must blend first.
  material.forceSinglePass = config.kind !== 'glass';
  if (ownsTextures) material.addEventListener('dispose', () => { for (const texture of Object.values(loaded)) texture.dispose(); });
  bindSurfaceProgram(material, config, loaded);
  material.userData.surfaceConfigured = true;
  return material;
}

/**
 * Rebuilds a scenery mesh's native material from its GLB surface description (`extras.lmuSurface`): loads every map through
 * `textures`, then patches the standard program with the family's GLSL. A mesh without a surface description keeps its glTF
 * material. Without `shared` the material is the mesh's own and frees its textures when disposed (unless `ownsTextures` is false);
 * with it, meshes of the same surface, textures and GLB state share one, which `shared` disposes. An unknown surface, or a map the
 * chunk does not declare, rejects.
 */
export async function configureSurfaceMaterial(mesh: Mesh, textures: SurfaceTextureSource, ownsTextures = true, shared?: SharedSurfaceMaterials): Promise<void> {
  const original = singleMaterial(mesh);
  if (!original || original.userData.surfaceConfigured === true) return;
  const config = readSurfaceConfig(original.userData);
  if (!config) return;
  const loaded: Record<string, Texture> = {};
  await Promise.all(Object.entries(config.maps).map(async ([key, map]) => { if (map) loaded[key] = await textures.load(map); }));
  const placeholder: Texture | undefined = loaded.layerA ?? loaded.albedo ?? loaded.on;
  if (!placeholder && config.kind !== 'standard' && config.kind !== 'standardBlend') throw Error(`Missing base albedo for ${config.name ?? '?'}`);
  const build = () => buildMaterial(original, config, loaded, ownsTextures);
  const material = shared ? shared.take(sharedKey(original, config, loaded), build) : build();
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
  // Digital flags blink on one shared clock, advanced as they draw.
  if (config.kind === 'digitalFlag') mesh.onBeforeRender = () => { digitalFlagClock.value = (performance.now() - START_MS) / 1000; };
}
