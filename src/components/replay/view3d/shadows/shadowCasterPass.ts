import {
  BackSide, BatchedMesh, Box2, DoubleSide, FrontSide, Line, Mesh, MeshDepthMaterial, Points, Sprite, Vector2, type BufferGeometry, type Material, type Object3D,
  type OrthographicCamera, type PerspectiveCamera, type Scene, type Side, type Texture, type Vector4, type WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { trackShadowEye } from '../scenery/materials/shadowEye.js';

/** One rectangle (texels) of a depth target and the sun camera that fills it. */
export interface ShadowLayer { viewport: Vector4; light: OrthographicCamera }

/** Draws the shadow casters of a scene into rectangles of a depth target, from sun cameras. */
export interface ShadowCasterPass {
  /**
   * Draws every caster at least `minCasterM` across into each layer's viewport of `target`, cleared first, seen from its light;
   * blended see-through surfaces cast none. The scene is walked and its materials swapped once for all layers; each layer's render
   * still culls by its own camera. `view` is the camera the frame is seen from (camera-facing cards turn toward it). `dynamic`
   * objects are left out.
   */
  draw(target: WebGLRenderTarget, layers: readonly ShadowLayer[], view: PerspectiveCamera | OrthographicCamera,
    dynamic: readonly Object3D[], minCasterM: number): void;
  /**
   * Draws only the casters under `roots` into each layer's viewport of `target`, over what is there (no clear), by the same rules as
   * `draw`. Walks and swaps just those roots, once for all layers. With `base` (a target of `target`'s size and depth type), each tile
   * first takes the depth of `base` at the same texels, so the roots are drawn over it.
   */
  drawRoots(target: WebGLRenderTarget, layers: readonly ShadowLayer[], view: PerspectiveCamera | OrthographicCamera, roots: readonly Object3D[],
    base?: WebGLRenderTarget): void;
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
  const region = new Box2(), at = new Vector2();
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
  // The pass draws only shadow casters, each with its depth material; everything else is hidden for it, then restored.
  const render = (target: WebGLRenderTarget, layers: readonly ShadowLayer[], view: PerspectiveCamera | OrthographicCamera,
    roots: readonly Object3D[], hide: readonly Object3D[], minCasterM: number, clear: boolean, base?: WebGLRenderTarget) => {
    if (!layers.length || (!roots.length && !base)) return;
    const hidden: Object3D[] = [], swapped: [Mesh, Material | Material[]][] = [];
    for (const object of hide) if (object.visible) { object.visible = false; hidden.push(object); }
    for (const root of roots) root.traverseVisible(object => {
      if (object instanceof Mesh) {
        const mesh = object as Mesh<BufferGeometry, Material | Material[]>, geometry = mesh.geometry;
        // A batch's own bounds cover its instances; its geometry is the whole reserved buffer, unused space included.
        const bounds = mesh instanceof BatchedMesh ? mesh : geometry;
        if (mesh.castShadow && !bounds.boundingSphere) bounds.computeBoundingSphere();
        if (mesh.castShadow && 2 * bounds.boundingSphere!.radius * mesh.matrixWorld.getMaxScaleOnAxis() >= minCasterM) {
          swapped.push([mesh, mesh.material]);
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material => depthOf(mesh, material)) : depthOf(mesh, mesh.material);
          return;
        }
        hidden.push(mesh);
      } else if (object instanceof Line || object instanceof Points || object instanceof Sprite) hidden.push(object);
    });
    for (const object of hidden) object.visible = false;
    // The frame has updated the world matrices before its shadow passes; a root rendered on its own would have three walk its tree
    // again for every layer (render() updates a root whose auto update is on), the cars' whole tree each time.
    const updating = roots.filter(root => root.matrixWorldAutoUpdate);
    for (const root of updating) root.matrixWorldAutoUpdate = false;
    trackShadowEye(view);
    const depth = renderer.state.buffers.depth, reversed = depth.getReversed();
    const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear, scissorTest = renderer.getScissorTest();
    try {
      if (base) {
        // Each tile's base depth, copied as stored (a framebuffer blit): before the tiles' scissor, which would clip it.
        renderer.setScissorTest(false);
        for (const {viewport: {x, y, z: width, w: height}} of layers) {
          region.min.set(x, y); region.max.set(x + width, y + height);
          renderer.copyTextureToTexture(base.depthTexture!, target.depthTexture!, region, at.set(x, y));
        }
        renderer.setScissorTest(scissorTest);
      }
      target.scissorTest = true;
      renderer.autoClear = false;
      // The shadow lookups compare plain depth (near 0, far 1), so this pass leaves the scene's reversed depth range.
      depth.setReversed(false);
      for (const {viewport, light} of layers) {
        target.viewport.copy(viewport); target.scissor.copy(viewport);
        renderer.setRenderTarget(target);
        if (clear) renderer.clear(false, true, false);
        for (const root of roots) renderer.render(root, light);
      }
    } finally {
      depth.setReversed(reversed);
      renderer.setRenderTarget(previous); renderer.autoClear = autoClear; renderer.setScissorTest(scissorTest);
      for (const [mesh, material] of swapped) mesh.material = material;
      for (const object of hidden) object.visible = true;
      for (const root of updating) root.matrixWorldAutoUpdate = true;
    }
  };
  return {
    draw: (target, layers, view, dynamic, minCasterM) => render(target, layers, view, [scene], dynamic, minCasterM, true),
    drawRoots: (target, layers, view, roots, base) => render(target, layers, view, roots, [], 0, false, base),
  };
}
