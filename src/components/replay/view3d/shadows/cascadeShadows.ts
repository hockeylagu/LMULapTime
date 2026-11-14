import {
  DepthTexture, LessEqualCompare, LinearFilter, Matrix4, OrthographicCamera, RedFormat, UnsignedIntType, Vector3, Vector4, WebGLRenderTarget,
  type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer,
} from 'three';
import type { SceneryShadows } from '../../../../../shared/types/scenes/scenery.js';
import { SHADOW_ONLY_LAYER } from '../cars/carBatching.js';
import { createShadowCasterPass } from './shadowCasterPass.js';
import { cascadeCentres, sunSquareAxes, type ShadowCascadeLayout, type SunSquareAxes } from './shadowCascades.js';

/**
 * Cascades reaching this far are live: each frame the cars are drawn over their static depth, which is redrawn only when the cascade's
 * held centre has drifted (see `holdM`). Farther ones are cached: drawn without the cars, again once their centre has moved an eighth
 * of their side, at most one per frame (a redraw of a 1 km square is ~1,000 draws).
 * Every shadow pass re-draws each caster it meets, the frame's main cost (docs/plans/proposed/REPLAY_3D_PERFORMANCE.md).
 */
const LIVE_CASCADE_SPLIT_M = 100;
const CACHED_REDRAW_SIDE_FRACTION = 1 / 8;
/** A cached cascade leaves out casters under this many of its texels across (they would draw to under ~3 texels). */
const CACHED_MIN_CASTER_TEXELS = 3;
/** The light camera sits this far back along the light from a cascade's slice midpoint, at least, over the sun's height (twice that is its depth range). */
const MIN_LIGHT_DISTANCE_M = 400;
/** The sine of the sun's height the depth range stops growing at (about 3 degrees): near sunset it would grow without bound. */
const MIN_SUN_SINE = 0.05;
/**
 * Depth past a camera-facing card's own plane its cascade lookup skips: 1 m, or this many of the cascade's texels when that is more
 * (a card and its shadow lie in one plane, so at a grazing sun a card shadows itself whole).
 */
const CARD_SELF_SHADOW_M = 1;
const CARD_SELF_SHADOW_TEXELS = 14;

/** What the shadow samplers read, per cascade i: `matrices[i]` maps a world position to its tile (u, v in 0..1, depth in 0..1). */
export interface CascadeShadowState {
  /**
   * The package's atlases stacked in one depth texture, atlas a above atlas a − 1 (one sampler instead of one per atlas: the road and
   * terrain programs already use all 16 texture units).
   */
  atlas: DepthTexture;
  matrices: Matrix4[];
  /** `matrices` packed in order, as the samplers read them: a typed array is uploaded as is, an array of matrices is copied per draw. */
  packedMatrices: Float32Array<ArrayBuffer>;
  /** Per cascade: the depth a camera-facing card skips past its own plane, as a fraction of the cascade's depth range. */
  cardDepth: Float32Array<ArrayBuffer>;
  /** Per cascade: where its tile starts (u, v) and its size (u, v), as fractions of the stacked texture. */
  tiles: Vector4[];
}

export interface CascadeShadows {
  state: CascadeShadowState;
  /** The sun moved: every cascade is redrawn from the new direction. `lightTravel` is unit, from the sun toward the ground. */
  setLight(lightTravel: Vector3): void;
  /**
   * Before a frame: redraws the cascades whose held centre has drifted, draws `dynamic` (every moving caster: one left out freezes in
   * the held depth) over the live ones, and redraws the cached cascade most due. True while cached ones are still due.
   */
  update(view: PerspectiveCamera | OrthographicCamera, dynamic: readonly Object3D[]): boolean;
  dispose(): void;
}

/**
 * The depth range of a cascade's light camera, metres: it sits half of it back along the light from the slice midpoint. Under a low
 * sun the ground a square covers stretches toward and away from the sun by 1 / sin(height), and the casters that shade it stand
 * that much farther up the light: the range grows by the same factor, or the ends of the square lose their shadows, and which ends
 * depends on where the square was last drawn.
 */
export function cascadeDepthRangeM(sideM: number, lightTravel: Vector3): number {
  return 2 * Math.max(MIN_LIGHT_DISTANCE_M, sideM) / Math.max(MIN_SUN_SINE, -lightTravel.y);
}

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/** The light camera of one cascade: an orthographic square of `sideM` on the sun's axes around `centre`, looking along the light. */
export function placeCascadeCamera(camera: OrthographicCamera, axes: SunSquareAxes, lightTravel: Vector3, centre: readonly [number, number],
  alongLightM: number, sideM: number): void {
  const half = sideM / 2, depthM = cascadeDepthRangeM(sideM, lightTravel), distance = depthM / 2;
  Object.assign(camera, {left: -half, right: half, top: half, bottom: -half, near: 0, far: depthM});
  camera.updateProjectionMatrix();
  // Camera x = u, y = v, z = −L (it looks along +L): u × v = −L, a right-handed frame.
  camera.matrix.makeBasis(axes.u, axes.v, lightTravel.clone().negate());
  camera.matrix.setPosition(new Vector3().addScaledVector(axes.u, centre[0]).addScaledVector(axes.v, centre[1])
    .addScaledVector(lightTravel, alongLightM - distance));
  camera.matrix.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrixWorld(true);
}

export function createCascadeShadows(renderer: WebGLRenderer, scene: Scene, shadows: SceneryShadows, layout: ShadowCascadeLayout,
  lightTravel: Vector3): CascadeShadows {
  const {sizePx, tilePx, count} = shadows.atlas, heightPx = count * sizePx;
  if (heightPx > renderer.capabilities.maxTextureSize) throw Error(`The shadow atlases need a ${sizePx} x ${heightPx} depth texture; the GPU allows ${renderer.capabilities.maxTextureSize}`);
  const depth = new DepthTexture(sizePx, heightPx, UnsignedIntType);
  depth.compareFunction = LessEqualCompare; depth.minFilter = LinearFilter; depth.magFilter = LinearFilter;
  const target = new WebGLRenderTarget(sizePx, heightPx, {format: RedFormat, depthTexture: depth, generateMipmaps: false});
  // A sampler needs its depth texture to exist before the first draw.
  renderer.initRenderTarget(target);
  const lightCamera = () => {
    // It also sees the shadow-only layer: the near cars' depth-only batches draw there and nowhere else.
    const camera = new OrthographicCamera();
    camera.layers.enable(SHADOW_ONLY_LAYER);
    return camera;
  };
  const sliceStartM = (i: number) => i === 0 ? layout.nearM : layout.cascades[i - 1].splitM;  const cascades = layout.cascades.map((cascade, i) => {
    const live = cascade.splitM <= LIVE_CASCADE_SPLIT_M, redrawM = CACHED_REDRAW_SIDE_FRACTION * cascade.sideM;
    // A live cascade's held square must keep the view line of its slice inside the tile the surfaces select from (halfExtent of the side
    // around the centre), or the near end of the slice falls to the next, coarser cascade: the drift it may hold is what is left of
    // that half-extent past half the slice. The cached cascades are sized with margin to spare; the live ones are tight (the first one
    // has nearly none), and one that cannot hold a texel of drift is drawn whole every frame as before.
    const marginM = shadows.select.halfExtent * cascade.sideM - (cascade.splitM - sliceStartM(i)) / 2;
    const holdM = live ? Math.min(redrawM, marginM) : redrawM;
    return {
      cascade, camera: lightCamera(), live, holdM, held: live && holdM >= cascade.texelM,
      viewport: new Vector4(cascade.tile[1], cascade.tile[0] * sizePx + cascade.tile[2], tilePx, tilePx),
      drawnCentre: null as [number, number] | null,
    };
  });
  // The static depth of the held live cascades, in the atlas' own tiles, of the atlas' depth type: the shadow pass copies it as stored.
  const staticDepth = cascades.some(row => row.held) ? new DepthTexture(sizePx, heightPx, UnsignedIntType) : null;
  const staticTarget = staticDepth && new WebGLRenderTarget(sizePx, heightPx, {format: RedFormat, depthTexture: staticDepth, generateMipmaps: false});
  if (staticTarget) renderer.initRenderTarget(staticTarget);
  const state: CascadeShadowState = {
    atlas: depth,
    matrices: cascades.map(() => new Matrix4()),
    packedMatrices: new Float32Array(cascades.length * 16),
    cardDepth: new Float32Array(cascades.length),
    tiles: cascades.map(({viewport: {x, y}}) => new Vector4(x / sizePx, y / heightPx, tilePx / sizePx, tilePx / heightPx)),
  };
  const casters = createShadowCasterPass(renderer, scene), light = lightTravel.clone(), eye = new Vector3(), forward = new Vector3();
  let axes = sunSquareAxes(light);
  const layersOf = (indices: readonly number[]) => indices.map(i => ({viewport: cascades[i].viewport, light: cascades[i].camera,
    depthBias: {slope: layout.slopeBias, units: cascades[i].cascade.depthBiasUnits}}));
  // Puts the cascades' cameras at their new centres; what is drawn from them follows (`moved`).
  const place = (indices: readonly number[], centres: Array<[number, number]>) => {
    for (const i of indices) {
      const {cascade, camera} = cascades[i];
      const alongLightM = eye.clone().addScaledVector(forward, (sliceStartM(i) + cascade.splitM) / 2).dot(light);
      placeCascadeCamera(camera, axes, light, centres[i], alongLightM, cascade.sideM);
      state.matrices[i].multiplyMatrices(BIAS, camera.projectionMatrix).multiply(camera.matrixWorldInverse).toArray(state.packedMatrices, i * 16);
      state.cardDepth[i] = Math.max(CARD_SELF_SHADOW_M, CARD_SELF_SHADOW_TEXELS * cascade.texelM) / cascadeDepthRangeM(cascade.sideM, light);
      cascades[i].drawnCentre = centres[i];
    }
  };
  return {
    state,
    setLight(lightTravel) {
      light.copy(lightTravel); axes = sunSquareAxes(light);
      for (const row of cascades) row.drawnCentre = null;
    },
    update(view, dynamic) {
      view.updateMatrixWorld();
      view.getWorldPosition(eye); view.getWorldDirection(forward);
      const centres = cascadeCentres(layout, eye, forward, axes);
      // How far each cascade's centre has drifted from its held one, in its hold distance; never drawn counts as most due.
      const due = cascades.map(({drawnCentre, holdM}, i) => !drawnCentre ? Infinity
        : Math.max(Math.abs(centres[i][0] - drawnCentre[0]), Math.abs(centres[i][1] - drawnCentre[1])) / holdM);
      const indicesOf = (pick: (row: (typeof cascades)[number]) => boolean) => cascades.flatMap((row, i) => pick(row) ? [i] : []);
      // The live cascades share one scene walk and material swap per kind, a cached one has its own caster floor so draws alone; each
      // cascade keeps its own camera and viewport. Held live: static casters (cars left out) into the static target when moved, then
      // every frame its tile is drawn into the atlas from it and the cars over that. Whole live: everything into the atlas each frame.
      const held = indicesOf(row => row.held), whole = indicesOf(row => row.live && !row.held);
      const moved = held.filter(i => due[i] >= 1);
      if (moved.length) { place(moved, centres); casters.draw(staticTarget!, layersOf(moved), view, dynamic, 0); }
      if (whole.length) { place(whole, centres); casters.draw(target, layersOf(whole), view, [], 0); }
      if (held.length) {
        casters.drawRoots(target, layersOf(held), view, dynamic, staticTarget!);
      }
      // Until every cached cascade has been drawn once, all of them at once; afterwards the most due one, if one is due.
      const settled = cascades.every(row => row.live || row.drawnCentre);
      const order = due.map((value, i) => [value, i] as const).filter(([value, i]) => !cascades[i].live && value >= 1).sort((a, b) => b[0] - a[0]);
      for (const [, i] of settled ? order.slice(0, 1) : order) {
        place([i], centres);
        casters.draw(target, layersOf([i]), view, dynamic, CACHED_MIN_CASTER_TEXELS * cascades[i].cascade.texelM);
      }
      return settled && order.length > 1;
    },
    dispose() {
      depth.dispose(); target.dispose(); staticDepth?.dispose(); staticTarget?.dispose(); casters.dispose();
    },
  };
}
