import {
  BackSide, DepthTexture, DoubleSide, FrontSide, LessEqualCompare, LinearFilter, Line, Matrix4, Mesh, MeshDepthMaterial, OrthographicCamera, Points,
  RedFormat, Sprite, UnsignedIntType, Vector3, WebGLRenderTarget, type BufferGeometry, type IUniform, type Material, type Object3D,
  type PerspectiveCamera, type Scene, type Side, type Texture, type WebGLRenderer,
} from 'three';
import { trackShadowEye } from './scenery/materials/shadowEye.js';

/**
 * The sun's two shadow maps. The near one (three's own, on the sun light) is a square around the camera's focus (the car),
 * shifted ahead along the view so the road the camera looks at is covered: 4096 px over 80 m is ~2 cm per texel, drawn every
 * frame with every caster. At 160 m (~4 cm, ~8 cm along the ground under a low sun) the car's shadow edges stair-stepped. Every shadow pass re-draws each caster it meets, and that per-draw CPU work is the frame's main cost
 * (docs/plans/proposed/REPLAY_3D_PERFORMANCE.md).
 *
 * The static one is a cached shadow map of the scenery only (no cars), 1.2 km ahead of the view at ~29 cm per texel. Beyond the
 * near square, scenery shadows stay put and only the car's shadow moves; surfaces fade from the near map to the static one over
 * the near square's outer tenth (patchSurfaceShader). It is double buffered: surfaces read one map while the next is drawn a
 * quarter per frame (a redraw is ~1,000 draws, a hitch in one frame), then the two swap. A redraw starts after 200 m of travel,
 * or after 100 m when the resident scenery changed meanwhile. Casters under 1 m across are left out (under ~3 texels).
 */
export interface ShadowWindow { halfExtentM: number; leadM: number; mapPx: number; lightDistanceM: number }
export const NEAR_SHADOW: ShadowWindow = {halfExtentM: 40, leadM: 25, mapPx: 4096, lightDistanceM: 400};
export const STATIC_SHADOW: ShadowWindow = {halfExtentM: 600, leadM: 350, mapPx: 4096, lightDistanceM: 1000};
export const SHADOW_NEAR_M = 1;
const STATIC_REFRESH_M = 200, STATIC_STALE_REFRESH_M = 100, STATIC_MIN_CASTER_M = 1, TILES_PER_SIDE = 2;
export const texelOf = (window: ShadowWindow): number => 2 * window.halfExtentM / window.mapPx;
/** Metres of sun-shadow depth per unit of shadow-map depth (each shadow camera's near-to-far span): near map, static map. */
export const SUN_SHADOW_DEPTH_M = [2 * NEAR_SHADOW.lightDistanceM - SHADOW_NEAR_M, 2 * STATIC_SHADOW.lightDistanceM - SHADOW_NEAR_M] as const;
/** The static map's normal offset: ~1.3 texels, as the near map's 5 cm (acne on lines and car bodies below that). */
export const STATIC_NORMAL_BIAS_M = 1.3 * texelOf(STATIC_SHADOW);

/** What the scenery surfaces sample (shared uniform objects: swapping the maps updates every material). */
export const staticShadowUniforms = {
  map: { value: null } as IUniform<Texture | null>,
  matrix: { value: new Matrix4() } as IUniform<Matrix4>,
  ready: { value: 0 } as IUniform<number>,
};

const scratchAhead = new Vector3();
/** Where a shadow window centres: `focus` led along the view, snapped to whole texels in the sun's frame (sliding edges shimmer). */
export function shadowWindowCentre(focus: Vector3, view: PerspectiveCamera | OrthographicCamera | null, window: ShadowWindow, sunFrame: Matrix4,
  fromSunFrame: Matrix4, out: Vector3): Vector3 {
  const texel = texelOf(window);
  out.copy(focus);
  if (view) {
    view.updateMatrixWorld();
    const ahead = view.getWorldDirection(scratchAhead); ahead.y = 0;
    if (ahead.lengthSq() > 1e-6) out.addScaledVector(ahead.normalize(), window.leadM);
  }
  out.applyMatrix4(fromSunFrame);
  out.x = Math.round(out.x / texel) * texel; out.y = Math.round(out.y / texel) * texel;
  return out.applyMatrix4(sunFrame);
}

const SHADOW_SIDE: Record<Side, Side> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };
const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export interface StaticShadow {
  /** The resident scenery changed: redraw once the view has moved 100 m. */
  stale(): void;
  /**
   * Before a frame: starts a redraw when due, and draws the next quarter of one in progress (all four for the first map). True
   * while quarters remain: the caller renders another frame.
   */
  update(view: PerspectiveCamera | OrthographicCamera, focus: Vector3, dynamic: readonly Object3D[]): boolean;
  dispose(): void;
}

export function createStaticShadow(renderer: WebGLRenderer, scene: Scene, toSun: Vector3, sunFrame: Matrix4, fromSunFrame: Matrix4): StaticShadow {
  const size = STATIC_SHADOW.mapPx, half = STATIC_SHADOW.halfExtentM;
  const makeTarget = () => {
    const depth = new DepthTexture(size, size, UnsignedIntType);
    depth.compareFunction = LessEqualCompare; depth.minFilter = LinearFilter; depth.magFilter = LinearFilter;
    return new WebGLRenderTarget(size, size, {format: RedFormat, depthTexture: depth, generateMipmaps: false});
  };
  let front = makeTarget(), back = makeTarget();
  const frontCentre = new Vector3(), buildCentre = new Vector3();
  const camera = new OrthographicCamera(-half, half, half, -half, SHADOW_NEAR_M, 2 * STATIC_SHADOW.lightDistanceM), tile = camera.clone();
  const up = Math.abs(toSun.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  camera.up.copy(up); tile.up.copy(up);
  let hasFront = false, building = -1, staleScenery = false;
  const depthMaterials = new WeakMap<Material, MeshDepthMaterial>();
  const depthOf = (mesh: Mesh, material: Material): MeshDepthMaterial => {
    let depth = depthMaterials.get(material);
    if (depth) return depth;
    depth = new MeshDepthMaterial();
    // Camera-facing cards keep their shadow-pass turn (patchSurfaceShader's billboard depth material).
    const custom = mesh.customDepthMaterial;
    if (custom) {
      depth.onBeforeCompile = (shader, renderer) => custom.onBeforeCompile(shader, renderer);
      depth.customProgramCacheKey = () => custom.customProgramCacheKey();
    }
    const source = material as Material & {map?: Texture | null; alphaMap?: Texture | null};
    depth.alphaTest = material.alphaToCoverage ? 0.5 : material.alphaTest;
    if (depth.alphaTest > 0) { depth.map = source.map ?? null; depth.alphaMap = source.alphaMap ?? null; }
    depth.side = material.shadowSide ?? SHADOW_SIDE[material.side];
    depthMaterials.set(material, depth);
    material.addEventListener('dispose', () => { depth.dispose(); depthMaterials.delete(material); });
    return depth;
  };
  const drawTile = (index: number, view: PerspectiveCamera | OrthographicCamera, dynamic: readonly Object3D[]) => {
    const column = index % TILES_PER_SIDE, row = Math.floor(index / TILES_PER_SIDE), span = 2 * half / TILES_PER_SIDE, px = size / TILES_PER_SIDE;
    Object.assign(tile, {left: -half + column * span, right: -half + (column + 1) * span, bottom: -half + row * span, top: -half + (row + 1) * span});
    tile.position.copy(camera.position); tile.quaternion.copy(camera.quaternion);
    tile.updateProjectionMatrix(); tile.updateMatrixWorld(true);
    // The pass draws only shadow casters, each with its depth material; everything else is hidden for it, then restored.
    const hidden: Object3D[] = [], swapped: [Mesh, Material | Material[]][] = [];
    for (const object of dynamic) if (object.visible) { object.visible = false; hidden.push(object); }
    scene.traverseVisible(object => {
      if (object instanceof Mesh) {
        const mesh = object as Mesh<BufferGeometry, Material | Material[]>, geometry = mesh.geometry;
        if (mesh.castShadow && !geometry.boundingSphere) geometry.computeBoundingSphere();
        if (mesh.castShadow && 2 * geometry.boundingSphere!.radius * mesh.matrixWorld.getMaxScaleOnAxis() >= STATIC_MIN_CASTER_M) {
          swapped.push([mesh, mesh.material]);
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material => depthOf(mesh, material)) : depthOf(mesh, mesh.material);
          return;
        }
        hidden.push(mesh);
      } else if (object instanceof Line || object instanceof Points || object instanceof Sprite) hidden.push(object);
    });
    for (const object of hidden) object.visible = false;
    trackShadowEye(null, null, view);
    const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear, shadowUpdate = renderer.shadowMap.autoUpdate;
    try {
      back.viewport.set(column * px, row * px, px, px); back.scissor.copy(back.viewport); back.scissorTest = true;
      renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(back); renderer.clear(false, true, false);
      renderer.render(scene, tile);
    } finally {
      renderer.setRenderTarget(previous); renderer.autoClear = autoClear; renderer.shadowMap.autoUpdate = shadowUpdate;
      for (const [mesh, material] of swapped) mesh.material = material;
      for (const object of hidden) object.visible = true;
    }
  };
  return {
    stale() { staleScenery = true; },
    update(view, focus, dynamic) {
      if (building < 0) {
        const travelled = Math.hypot(focus.x - frontCentre.x, focus.z - frontCentre.z);
        if (hasFront && travelled <= STATIC_REFRESH_M && !(staleScenery && travelled > STATIC_STALE_REFRESH_M)) return false;
        shadowWindowCentre(focus, view, STATIC_SHADOW, sunFrame, fromSunFrame, buildCentre);
        camera.position.copy(buildCentre).addScaledVector(toSun, STATIC_SHADOW.lightDistanceM); camera.lookAt(buildCentre);
        camera.updateMatrixWorld(true);
        building = 0; staleScenery = false; frontCentre.copy(focus);
      }
      // The first map has nothing to show meanwhile: all four quarters at once (behind the loading screen).
      do drawTile(building++, view, dynamic); while (!hasFront && building < TILES_PER_SIDE * TILES_PER_SIDE);
      if (building < TILES_PER_SIDE * TILES_PER_SIDE) return true;
      [front, back] = [back, front];
      staticShadowUniforms.map.value = front.depthTexture;
      staticShadowUniforms.matrix.value.multiplyMatrices(BIAS, camera.projectionMatrix).multiply(camera.matrixWorldInverse);
      staticShadowUniforms.ready.value = 1;
      hasFront = true; building = -1;
      return false;
    },
    dispose() {
      staticShadowUniforms.map.value = null; staticShadowUniforms.ready.value = 0;
      for (const target of [front, back]) { target.depthTexture?.dispose(); target.dispose(); }
    },
  };
}
