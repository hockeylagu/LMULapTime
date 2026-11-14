import { Vector3 } from 'three';
import { resolveShadowSplits } from '../../../../../shared/packageContract/index.js';
import type { CarCamera } from '../../../../../shared/types/scenes/car.js';
import type { SceneryShadowCamera, SceneryShadows } from '../../../../../shared/types/scenes/scenery.js';

/** One cascade of the sun shadow: its far split, the side of its square in the sun's frame and its tile in the atlases. */
export interface ShadowCascade {
  /** The view depth (metres) the cascade reaches. */
  splitM: number;
  /** The side of the cascade's square, metres. */
  sideM: number;
  /** Metres per texel of its tile. */
  texelM: number;
  /** [atlas, x, y] of its tile, in texels. */
  tile: [number, number, number];
  /** The constant depth offset its casters draw with, in units of the 24-bit shadow depth (`depthBias` · 2^23, as the reference applies it). */
  depthBiasUnits: number;
}

/** The camera types the package publishes a cascade set for. */
export type ShadowCascadeSet = 'chase' | 'cockpit' | 'tv';

export interface ShadowCascadeLayout {
  cascades: ShadowCascade[];
  /** Where the first view slice starts (the camera set's `nearM`). */
  nearM: number;
  /** The view depth where the shadow starts fading out, and where it is gone (`farM`). */
  fadeStartM: number;
  farM: number;
  /** The depth offset per unit of the casters' depth slope (`slopeBias`). */
  slopeBias: number;
}

/**
 * A camera set with a car camera's own shadow keys over it (`CarCamera.shadow`): each one the camera sets replaces the set's, as the
 * reference takes the active camera record's. New planes drop the set's published splits, so the layout resolves them again.
 */
export function shadowCameraOf(set: SceneryShadowCamera, own: CarCamera['shadow']): SceneryShadowCamera {
  if (!own) return set;
  const nearM = own.nearM ?? set.nearM, farM = own.farM ?? set.farM, splitRatio = own.splitRatio ?? set.splitRatio;
  const planes = nearM !== set.nearM || farM !== set.farM || splitRatio !== set.splitRatio;
  const ownBias = own.depthBias;
  return {...set, nearM, farM, splitRatio, splitsM: planes ? null : set.splitsM, slopeBias: own.slopeBias ?? set.slopeBias,
    depthBias: ownBias ? set.depthBias.map((bias, i) => ownBias[i] ?? bias) : set.depthBias};
}

/**
 * The cascades of a camera set from the package's shadow profile (docs/PLUGINS.md): the shadow reaches far = farScale · farM, split
 * as published or, where the set leaves them to the viewer, by the split scheme (`resolveShadowSplits`). Cascade i is a square of
 * side widthPerSplit · split_i, the last one widthPerSplit · (far − split_N−2), each in its own atlas tile; the shadow fades out over
 * lengthOfLastSpan · (far − split_N−2) before far. Its casters draw with the set's depth bias: WebGL's polygon offset has no clamp,
 * so a set with one throws.
 */
export function shadowCascadeLayout(shadows: SceneryShadows, camera: SceneryShadowCamera): ShadowCascadeLayout {
  const farM = camera.farM * camera.farScale;
  const splits = camera.splitsM ?? resolveShadowSplits(camera.nearM, farM, camera.splitRatio, camera.count);
  const {fit: {widthPerSplit}, atlas: {tilePx, cascadeTiles}, fade: {lengthOfLastSpan}} = shadows;
  if (splits.length > cascadeTiles.length) throw Error(`${splits.length} shadow cascades for ${cascadeTiles.length} atlas tiles`);
  if (camera.biasClamp !== 0) throw Error('A clamped shadow depth bias has no WebGL equivalent');
  const lastSpanM = farM - (splits.length > 1 ? splits[splits.length - 2] : 0);
  const cascades = splits.map((splitM, i): ShadowCascade => {
    const sideM = widthPerSplit * (i === splits.length - 1 ? lastSpanM : splitM);
    return {splitM, sideM, texelM: sideM / tilePx, tile: cascadeTiles[i], depthBiasUnits: Math.trunc(camera.depthBias[i] * 2 ** 23 + 0.5)};
  });
  return {cascades, nearM: camera.nearM, fadeStartM: farM - lengthOfLastSpan * lastSpanM, farM, slopeBias: camera.slopeBias};
}

/** The axes of every cascade's square: u horizontal across the sun, v in the sun's vertical plane. They do not turn with the view. */
export interface SunSquareAxes { u: Vector3; v: Vector3 }

const UP = new Vector3(0, 1, 0);
/** The squares' axes for light travelling along `lightTravel` (unit, from the sun toward the ground): u = −normalize(L × up), v = u × L. */
export function sunSquareAxes(lightTravel: Vector3): SunSquareAxes {
  const u = new Vector3().crossVectors(lightTravel, UP);
  if (u.lengthSq() < 1e-12) throw Error('A sun straight overhead has no horizontal axis across it');
  u.normalize().negate();
  return {u, v: new Vector3().crossVectors(u, lightTravel)};
}

/**
 * Where each cascade's square is centred, in the squares' axes (metres along u and v): on the view line at the middle of its
 * slice, eye + forward · (split_i−1 + split_i) / 2 with forward unflattened and the first slice starting at `nearM`, then moved
 * onto the middle of a texel of its tile.
 */
export function cascadeCentres(layout: ShadowCascadeLayout, eye: Vector3, forward: Vector3, axes: SunSquareAxes): Array<[number, number]> {
  const at = new Vector3();
  return layout.cascades.map((cascade, i) => {
    const sliceStartM = i === 0 ? layout.nearM : layout.cascades[i - 1].splitM;
    at.copy(eye).addScaledVector(forward, (sliceStartM + cascade.splitM) / 2);
    return [snapCascadeCentre(at.dot(axes.u), cascade), snapCascadeCentre(at.dot(axes.v), cascade)];
  });
}

/** A cascade's centre on its texel grid in the sun's frame (one axis): it lands on texel k + 0.5 so the edges do not shimmer. */
export function snapCascadeCentre(centreM: number, cascade: ShadowCascade): number {
  return (Math.floor(centreM / cascade.texelM) + 0.5) * cascade.texelM;
}
