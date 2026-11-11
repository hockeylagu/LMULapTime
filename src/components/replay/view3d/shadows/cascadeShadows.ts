import {
  DepthTexture, LessEqualCompare, LinearFilter, Matrix4, OrthographicCamera, RedFormat, UnsignedIntType, Vector3, Vector4, WebGLRenderTarget,
  type Object3D, type PerspectiveCamera, type Scene, type WebGLRenderer,
} from 'three';
import type { SceneryShadows } from '../../../../../shared/types/scenes/scenery.js';
import { createShadowCasterPass } from './shadowCasterPass.js';
import { cascadeCentres, sunSquareAxes, type ShadowCascadeLayout, type SunSquareAxes } from './shadowCascades.js';

/**
 * Cascades reaching this far are redrawn every frame with every caster, the cars included. Farther ones are cached: drawn without
 * the cars, again once their centre has moved an eighth of their side, at most one per frame (a redraw of a 1 km square is ~1,000
 * draws). Every shadow pass re-draws each caster it meets, the frame's main cost (docs/plans/proposed/REPLAY_3D_PERFORMANCE.md).
 */
export const LIVE_CASCADE_SPLIT_M = 100;
const CACHED_REDRAW_SIDE_FRACTION = 1 / 8;
/** A cached cascade leaves out casters under this many of its texels across (they would draw to under ~3 texels). */
const CACHED_MIN_CASTER_TEXELS = 3;
/** The light camera sits this far back along the light from a cascade's slice midpoint, at least (twice that is its depth range). */
const MIN_LIGHT_DISTANCE_M = 400;

/** What the shadow samplers read, per cascade i: `matrices[i]` maps a world position to its tile (u, v in 0..1, depth in 0..1). */
export interface CascadeShadowState {
  /**
   * The package's atlases stacked in one depth texture, atlas a above atlas a − 1 (one sampler instead of one per atlas: the road and
   * terrain programs already use all 16 texture units).
   */
  atlas: DepthTexture;
  matrices: Matrix4[];
  /** Per cascade: where its tile starts (u, v) and its size (u, v), as fractions of the stacked texture. */
  tiles: Vector4[];
}

export interface CascadeShadows {
  state: CascadeShadowState;
  /** The sun moved: every cascade is redrawn from the new direction. `lightTravel` is unit, from the sun toward the ground. */
  setLight(lightTravel: Vector3): void;
  /** Before a frame: redraws the live cascades and the cached cascade most due. True while cached ones are still due. */
  update(view: PerspectiveCamera | OrthographicCamera, dynamic: readonly Object3D[]): boolean;
  dispose(): void;
}

/** The depth range of a cascade's light camera, metres: it sits half of it back along the light from the slice midpoint. */
export function cascadeDepthRangeM(sideM: number): number {
  return 2 * Math.max(MIN_LIGHT_DISTANCE_M, sideM);
}

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/** The light camera of one cascade: an orthographic square of `sideM` on the sun's axes around `centre`, looking along the light. */
export function placeCascadeCamera(camera: OrthographicCamera, axes: SunSquareAxes, lightTravel: Vector3, centre: readonly [number, number],
  alongLightM: number, sideM: number): void {
  const half = sideM / 2, depthM = cascadeDepthRangeM(sideM), distance = depthM / 2;
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
  const cascades = layout.cascades.map(cascade => ({
    cascade, camera: new OrthographicCamera(), live: cascade.splitM <= LIVE_CASCADE_SPLIT_M,
    viewport: new Vector4(cascade.tile[1], cascade.tile[0] * sizePx + cascade.tile[2], tilePx, tilePx),
    drawnCentre: null as [number, number] | null,
  }));
  const state: CascadeShadowState = {
    atlas: depth,
    matrices: cascades.map(() => new Matrix4()),
    tiles: cascades.map(({viewport: {x, y}}) => new Vector4(x / sizePx, y / heightPx, tilePx / sizePx, tilePx / heightPx)),
  };
  const casters = createShadowCasterPass(renderer, scene), light = lightTravel.clone(), eye = new Vector3(), forward = new Vector3();
  let axes = sunSquareAxes(light);
  const draw = (i: number, centre: [number, number], view: PerspectiveCamera | OrthographicCamera, dynamic: readonly Object3D[]) => {
    const {cascade, camera, live, viewport} = cascades[i];
    const sliceStartM = i === 0 ? layout.nearM : layout.cascades[i - 1].splitM;
    const alongLightM = eye.clone().addScaledVector(forward, (sliceStartM + cascade.splitM) / 2).dot(light);
    placeCascadeCamera(camera, axes, light, centre, alongLightM, cascade.sideM);
    casters.draw(target, viewport, camera, view, live ? [] : dynamic, live ? 0 : CACHED_MIN_CASTER_TEXELS * cascade.texelM);
    state.matrices[i].multiplyMatrices(BIAS, camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    cascades[i].drawnCentre = centre;
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
      // How far each cached cascade has drifted, in eighths of its side; never drawn counts as most due.
      const due = cascades.map(({live, drawnCentre, cascade}, i) => live ? -1 : !drawnCentre ? Infinity
        : Math.max(Math.abs(centres[i][0] - drawnCentre[0]), Math.abs(centres[i][1] - drawnCentre[1])) / (CACHED_REDRAW_SIDE_FRACTION * cascade.sideM));
      cascades.forEach(({live}, i) => { if (live) draw(i, centres[i], view, dynamic); });
      // Until every cached cascade has been drawn once, all of them at once; afterwards the most due one, if one is due.
      const settled = cascades.every(row => row.live || row.drawnCentre);
      const order = due.map((value, i) => [value, i] as const).filter(([value]) => value >= 1).sort((a, b) => b[0] - a[0]);
      for (const [, i] of settled ? order.slice(0, 1) : order) draw(i, centres[i], view, dynamic);
      return settled && order.length > 1;
    },
    dispose() {
      depth.dispose(); target.dispose();
    },
  };
}
