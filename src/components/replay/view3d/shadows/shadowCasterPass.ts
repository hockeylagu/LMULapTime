import {
  AlwaysDepth, BackSide, BatchedMesh, DoubleSide, FrontSide, GLSL3, InstancedMesh, Line, Mesh, MeshDepthMaterial, OrthographicCamera, PlaneGeometry, Points, Scene,
  ShaderMaterial, Sprite, type BufferGeometry, type Material, type Object3D, type PerspectiveCamera, type Side, type Texture, type Vector4,
  type WebGLRenderer, type WebGLRenderTarget,
} from 'three';
import { trackShadowEye } from '../scenery/materials/shadowEye.js';

/** One rectangle (texels) of a depth target and the sun camera that fills it. */
/** A tile to draw: its viewport, its sun camera and the depth offset its casters draw with (polygon offset factor and units). */
export interface ShadowLayer { viewport: Vector4; light: OrthographicCamera; depthBias: {slope: number; units: number} }

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
  /** Frees the pass's depth materials and depth-copy quad, and lets go of the textures they cut by. */
  dispose(): void;
}

const OPPOSITE: Record<Side, Side> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

/**
 * The faces a single-sided caster draws, as the reference's shadow pass culls: an opaque one its visible side, an alpha-cut one the
 * other (a fence card casts from the back of its pair). A two-sided caster draws both; a material's own `shadowSide` wins (foliage).
 */
function casterSide(material: Material, alphaCut: boolean): Side {
  return alphaCut ? OPPOSITE[material.side] : material.side;
}

/**
 * Blended see-through surfaces (glass, windscreens) cast no sun shadow: the sun lights a cockpit through its windscreen. Cut-outs
 * (an alpha test or alpha to coverage) still cast their opaque part.
 */
const castsShadow = (material: Material) => !material.transparent || material.alphaTest > 0 || material.alphaToCoverage;
/** What a blended surface draws with in the pass: nothing. */
const NO_SHADOW = new MeshDepthMaterial({ visible: false });

/**
 * How a caster draws: three builds a batched, an instanced and a plain mesh's program apart, so a depth material drawn by two kinds
 * looks its program up again at every switch between them.
 */
type CasterKind = 'batch' | 'instanced' | 'mesh';
const kindOf = (mesh: Mesh): CasterKind => mesh instanceof BatchedMesh ? 'batch' : mesh instanceof InstancedMesh ? 'instanced' : 'mesh';

/**
 * A quad over the viewport that writes, at each texel, the depth `baseDepth` holds at the same texel (no colour). A depth texture's
 * region is copied by drawing, not by a framebuffer blit: Direct3D 11 copies a depth resource only whole, and a blit of part of one
 * there (WebGL on Windows) silently copies nothing.
 */
function depthCopyQuad(): {scene: Scene; camera: OrthographicCamera; material: ShaderMaterial; geometry: PlaneGeometry} {
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {baseDepth: {value: null}},
    vertexShader: 'void main() { gl_Position = vec4( position.xy * 2.0, 0.0, 1.0 ); }',
    fragmentShader: `precision highp sampler2D;
      uniform sampler2D baseDepth;
      void main() { gl_FragDepth = texelFetch( baseDepth, ivec2( gl_FragCoord.xy ), 0 ).r; }`,
    depthTest: true, depthFunc: AlwaysDepth, depthWrite: true, colorWrite: false,
  });
  const geometry = new PlaneGeometry(1, 1), quad = new Mesh(geometry, material), scene = new Scene();
  quad.frustumCulled = false;
  scene.add(quad);
  return {scene, camera: new OrthographicCamera(), material, geometry};
}

export function createShadowCasterPass(renderer: WebGLRenderer, scene: Scene): ShadowCasterPass {
  let depthCopy: ReturnType<typeof depthCopyQuad> | null = null;
  // Casters that draw the same way share one depth material, so the pass draws them one after another without switching material
  // (every switch uploads the material's uniforms again): keyed by the caster's kind, the card turn, side, alpha cut and the
  // textures the cut reads.
  const depthMaterials = new Map<string, MeshDepthMaterial>();
  // The key's result per scene material and caster kind, so the key is built once.
  let byMaterial = new WeakMap<Material, Partial<Record<CasterKind, MeshDepthMaterial>>>();
  // The texture listeners a cut-out's depth material put on, taken off when the pass goes.
  const listening: Array<[Texture, () => void]> = [];
  const depthOf = (mesh: Mesh, material: Material): MeshDepthMaterial => {
    if (!castsShadow(material)) return NO_SHADOW;
    const kind = kindOf(mesh), known = byMaterial.get(material) ?? {};
    byMaterial.set(material, known);
    const found = known[kind];
    if (found) return found;
    const alphaTest = material.alphaToCoverage ? 0.5 : material.alphaTest;
    const custom = mesh.customDepthMaterial ?? null, side = material.shadowSide ?? casterSide(material, alphaTest > 0), source = material as Material & {map?: Texture | null; alphaMap?: Texture | null};
    const [map, alphaMap] = alphaTest > 0 ? [source.map ?? null, source.alphaMap ?? null] : [null, null];
    const key = `${kind}|${custom?.uuid ?? ''}|${side}|${alphaTest}|${map?.id ?? ''}|${alphaMap?.id ?? ''}`;
    let depth = depthMaterials.get(key);
    if (depth) { known[kind] = depth; return depth; }
    depth = new MeshDepthMaterial({side, alphaTest, map, alphaMap});
    // Camera-facing cards keep their shadow-pass turn (patchSurfaceShader's billboard depth material).
    if (custom) {
      depth.onBeforeCompile = (shader, renderer) => custom.onBeforeCompile(shader, renderer);
      depth.customProgramCacheKey = () => custom.customProgramCacheKey();
    }
    depthMaterials.set(key, depth); known[kind] = depth;
    // A depth material that cuts by a texture goes with it.
    const drop = () => { depth.dispose(); depthMaterials.delete(key); byMaterial = new WeakMap(); };
    for (const texture of [map, alphaMap]) if (texture) { texture.addEventListener('dispose', drop); listening.push([texture, drop]); }
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
    if (base) {
      depthCopy ??= depthCopyQuad();
      depthCopy.material.uniforms.baseDepth.value = base.depthTexture;
    }
    try {
      target.scissorTest = true;
      renderer.autoClear = false;
      // The shadow lookups compare plain depth (near 0, far 1), so this pass leaves the scene's reversed depth range.
      depth.setReversed(false);
      for (const {viewport, light, depthBias} of layers) {
        target.viewport.copy(viewport); target.scissor.copy(viewport);
        for (const caster of depthMaterials.values()) {
          caster.polygonOffset = true; caster.polygonOffsetFactor = depthBias.slope; caster.polygonOffsetUnits = depthBias.units;
        }
        renderer.setRenderTarget(target);
        if (clear) renderer.clear(false, true, false);
        // Each tile first takes its base depth, as stored, at the same texels.
        if (base) renderer.render(depthCopy!.scene, depthCopy!.camera);
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
    dispose() {
      for (const [texture, drop] of listening) texture.removeEventListener('dispose', drop);
      listening.length = 0;
      for (const depth of depthMaterials.values()) depth.dispose();
      depthMaterials.clear(); byMaterial = new WeakMap();
      if (depthCopy) { depthCopy.geometry.dispose(); depthCopy.material.dispose(); depthCopy = null; }
    },
  };
}
