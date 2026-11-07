import { Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type IUniform, type Material, type Texture } from 'three';
import { digitalFlagClock } from './flagSurface.js';
import { addFoliageCrown } from './foliageCrown.js';
import { billboardShadowMaterial, computeCustomProgramCacheKey, patchSurfaceShader } from './patchSurfaceShader.js';
import { trackShadowEye } from './shadowEye.js';
import { list, value } from './shaderContext.js';
import { readSurfaceConfig, type ParameterGroup, type SurfaceConfig } from './surfaceConfig.js';
import type { SurfaceTextureSource } from './textureSource.js';

const START_MS = performance.now();

/** The textures a configured surface material samples through its own uniforms (not glTF slots), for GPU warm-up. */
export const surfaceTextureMaps = new WeakMap<Material, Texture[]>();

/** A scenery mesh's material, or null when the mesh holds several (the exporter never writes those). */
function singleMaterial(mesh: Mesh): MeshStandardMaterial | null {
  return mesh.material instanceof MeshStandardMaterial ? mesh.material : null;
}

/** A clearcoat control the exporter guarantees; a surface without it is malformed. */
function required(group: ParameterGroup | undefined, key: string, config: SurfaceConfig): number {
  const v = group?.[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw Error(`Missing clearcoat control: ${config.name}/${key}`);
  return v;
}

/** Clearcoat and glass need the physical model; the rest keep a per-mesh clone of the standard material loaded from the GLB. */
function ownMaterial(source: MeshStandardMaterial, config: SurfaceConfig): MeshStandardMaterial {
  if (config.kind !== 'clearcoat' && config.kind !== 'glass') return source.clone();
  const material = new MeshPhysicalMaterial();
  MeshStandardMaterial.prototype.copy.call(material, source);
  material.defines = { STANDARD: '', PHYSICAL: '' };
  if (config.kind === 'clearcoat') {
    const { ClearCoat: coat, BaseCoat: base } = config.parameters;
    material.clearcoat = required(coat, 'Strength', config);
    material.clearcoatRoughness = required(coat, 'Roughness', config);
    material.ior = required(base, 'RefractiveIndex', config);
  } else { material.ior = 1.5; material.roughness = 0; }
  return material;
}

/**
 * Rebuilds a scenery mesh's native material from its GLB surface description (`extras.lmuSurface`): loads every map through
 * `textures`, then patches the standard program with the family's GLSL. A mesh without a surface description keeps its glTF
 * material. The material owns its textures and frees them when disposed. An unknown surface, or a map the chunk does not
 * declare, rejects.
 */
export async function configureSurfaceMaterial(mesh: Mesh, textures: SurfaceTextureSource, ownsTextures = true): Promise<void> {
  const original = singleMaterial(mesh);
  if (!original || original.userData.surfaceConfigured === true) return;
  const config = readSurfaceConfig(original.userData);
  if (!config) return;
  const material = ownMaterial(original, config);
  if (material.alphaTest > 0 && /^BARRIERS_FENCE[AB]_ALBA$/i.test(config.maps.albedo?.texture ?? '')) {
    // Filtered wire texels lose alpha as the mesh recedes. Keep more of that coverage and smooth the wire edges with MSAA.
    material.alphaTest = Math.min(material.alphaTest, 0.2);
    material.alphaToCoverage = true;
  }
  // Leaf and crowd cards: a hard alpha cut shimmers and steps at their edges. Alpha to coverage over the 4x MSAA target is the
  // anti-aliased alpha test (three sharpens alpha by its screen derivative), so cut-outs stay crisp without the stair steps.
  if (material.alphaTest > 0 && config.billboard) material.alphaToCoverage = true;
  mesh.material = material;
  if (material !== original) original.dispose();

  const uniforms: Record<string, IUniform> = {}, loaded: Record<string, Texture> = {};
  await Promise.all(Object.entries(config.maps).map(async ([key, map]) => {
    if (!map) return;
    const texture = await textures.load(map);
    loaded[key] = texture;
    uniforms[`surface_${key}`] = { value: texture };
    uniforms[`surface_scale_${key}`] = { value: new Vector2(...(map.scale ?? [1, 1])) };
  }));
  const placeholder: Texture | undefined = loaded.layerA ?? loaded.albedo ?? loaded.on;
  if (!placeholder && config.kind !== 'standard' && config.kind !== 'standardBlend') throw Error(`Missing base albedo for ${config.name}`);
  material.userData.surfaceTextures = Object.keys(loaded);
  surfaceTextureMaps.set(material, Object.values(loaded));
  if (ownsTextures) material.addEventListener('dispose', () => { for (const texture of Object.values(loaded)) texture.dispose(); });

  const adjust = config.parameters.Material_Adjust, baseMaterial = config.parameters.Base_Material;
  material.roughness = value(adjust, 'Roughness', value(baseMaterial, 'Roughness', config.kind === 'clearcoat' ? 0 : 0.5));
  material.metalness = value(adjust, 'Metallic', value(baseMaterial, 'Metallic', 0));
  const [r, g, b] = list(adjust, 'AlbedoTint', [1, 1, 1]);
  material.color.setRGB(r * r, g * g, b * b);
  const intensity = value(adjust, 'NormalIntensity', 1);
  material.normalScale = new Vector2(intensity, intensity * config.normalYSign);

  // Three retains uniforms per material even when the compiled program is shared. The packed source normals, AO and roughness
  // are decoded by the patched shader exactly once, so the glTF maps are dropped.
  material.normalMap = null; material.aoMap = null; material.roughnessMap = null; material.metalnessMap = null; material.emissiveMap = null;
  material.onBeforeCompile = shader => { patchSurfaceShader(shader, config, uniforms); };
  const programKey = computeCustomProgramCacheKey(config);
  material.customProgramCacheKey = () => programKey;
  material.map = placeholder ?? null;
  material.userData.surfaceConfigured = true;
  if (config.billboard) {
    // Vertex yaw can move corners outside the rest plane; keep a conservative culling sphere.
    const geometry = mesh.geometry;
    geometry.computeBoundingSphere();
    const corners = geometry.getAttribute('_lmu_corner');
    let extent = 0;
    for (let i = 0; i < corners.count; i++) extent = Math.max(extent, Math.abs(corners.getX(i)));
    if (!geometry.boundingSphere) throw Error(`Billboard without bounds: ${config.name}`);
    geometry.boundingSphere.radius += extent;
    mesh.customDepthMaterial = billboardShadowMaterial();
    mesh.onBeforeShadow = trackShadowEye;
    if (config.kind === 'vegetation') addFoliageCrown(geometry);
  }
  // Digital flags blink on one shared clock, advanced as they draw.
  if (config.kind === 'digitalFlag') mesh.onBeforeRender = () => { digitalFlagClock.value = (performance.now() - START_MS) / 1000; };
  material.needsUpdate = true;
}
