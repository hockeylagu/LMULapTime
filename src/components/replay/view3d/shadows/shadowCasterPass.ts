import {
  BackSide, DoubleSide, FrontSide, Line, Mesh, MeshDepthMaterial, Points, Sprite, type BufferGeometry, type Material, type Object3D,
  type OrthographicCamera, type PerspectiveCamera, type Scene, type Side, type Texture, type Vector4, type WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { trackShadowEye } from '../scenery/materials/shadowEye.js';

/** Draws the shadow casters of a scene into one rectangle of a depth target, from a sun camera. */
export interface ShadowCasterPass {
  /**
   * Draws every caster at least `minCasterM` across into `viewport` (texels) of `target`, cleared first, seen from `light`; blended
   * see-through surfaces cast none. `view` is the camera the frame is seen from (camera-facing cards turn toward it). `dynamic`
   * objects are left out.
   */
  draw(target: WebGLRenderTarget, viewport: Vector4, light: OrthographicCamera, view: PerspectiveCamera | OrthographicCamera,
    dynamic: readonly Object3D[], minCasterM: number): void;
}

const SHADOW_SIDE: Record<Side, Side> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

/**
 * Blended see-through surfaces (glass, windscreens) cast no sun shadow: the sun lights a cockpit through its windscreen. Cut-outs
 * (an alpha test or alpha to coverage) still cast their opaque part.
 */
const castsShadow = (material: Material) => !material.transparent || material.alphaTest > 0 || material.alphaToCoverage;
/** What a blended surface draws with in the pass: nothing. */
const NO_SHADOW = new MeshDepthMaterial({ visible: false });

export function createShadowCasterPass(renderer: WebGLRenderer, scene: Scene): ShadowCasterPass {
  // Casters that draw the same way share one depth material, so the pass draws them one after another without switching material
  // (every switch uploads the material's uniforms again): keyed by the card turn, side, alpha cut and the textures the cut reads.
  const depthMaterials = new Map<string, MeshDepthMaterial>();
  let byMaterial = new WeakMap<Material, MeshDepthMaterial>(); // The key's result per scene material, so the key is built once.
  const depthOf = (mesh: Mesh, material: Material): MeshDepthMaterial => {
    if (!castsShadow(material)) return NO_SHADOW;
    const known = byMaterial.get(material);
    if (known) return known;
    const custom = mesh.customDepthMaterial ?? null, side = material.shadowSide ?? SHADOW_SIDE[material.side];
    const alphaTest = material.alphaToCoverage ? 0.5 : material.alphaTest, source = material as Material & {map?: Texture | null; alphaMap?: Texture | null};
    const [map, alphaMap] = alphaTest > 0 ? [source.map ?? null, source.alphaMap ?? null] : [null, null];
    const key = `${custom?.uuid ?? ''}|${side}|${alphaTest}|${map?.id ?? ''}|${alphaMap?.id ?? ''}`;
    let depth = depthMaterials.get(key);
    if (depth) { byMaterial.set(material, depth); return depth; }
    depth = new MeshDepthMaterial({side, alphaTest, map, alphaMap});
    // Camera-facing cards keep their shadow-pass turn (patchSurfaceShader's billboard depth material).
    if (custom) {
      depth.onBeforeCompile = (shader, renderer) => custom.onBeforeCompile(shader, renderer);
      depth.customProgramCacheKey = () => custom.customProgramCacheKey();
    }
    depthMaterials.set(key, depth); byMaterial.set(material, depth);
    // A depth material that cuts by a texture goes with it.
    for (const texture of [map, alphaMap]) texture?.addEventListener('dispose', () => { depth.dispose(); depthMaterials.delete(key); byMaterial = new WeakMap(); });
    return depth;
  };
  return {
    draw(target, viewport, light, view, dynamic, minCasterM) {
      // The pass draws only shadow casters, each with its depth material; everything else is hidden for it, then restored.
      const hidden: Object3D[] = [], swapped: [Mesh, Material | Material[]][] = [];
      for (const object of dynamic) if (object.visible) { object.visible = false; hidden.push(object); }
      scene.traverseVisible(object => {
        if (object instanceof Mesh) {
          const mesh = object as Mesh<BufferGeometry, Material | Material[]>, geometry = mesh.geometry;
          if (mesh.castShadow && !geometry.boundingSphere) geometry.computeBoundingSphere();
          if (mesh.castShadow && 2 * geometry.boundingSphere!.radius * mesh.matrixWorld.getMaxScaleOnAxis() >= minCasterM) {
            swapped.push([mesh, mesh.material]);
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material => depthOf(mesh, material)) : depthOf(mesh, mesh.material);
            return;
          }
          hidden.push(mesh);
        } else if (object instanceof Line || object instanceof Points || object instanceof Sprite) hidden.push(object);
      });
      for (const object of hidden) object.visible = false;
      trackShadowEye(view);
      const depth = renderer.state.buffers.depth, reversed = depth.getReversed();
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      try {
        target.viewport.copy(viewport); target.scissor.copy(viewport); target.scissorTest = true;
        renderer.autoClear = false;
        // The shadow lookups compare plain depth (near 0, far 1), so this pass leaves the scene's reversed depth range.
        depth.setReversed(false);
        renderer.setRenderTarget(target); renderer.clear(false, true, false);
        renderer.render(scene, light);
      } finally {
        depth.setReversed(reversed);
        renderer.setRenderTarget(previous); renderer.autoClear = autoClear;
        for (const [mesh, material] of swapped) mesh.material = material;
        for (const object of hidden) object.visible = true;
      }
    },
  };
}
