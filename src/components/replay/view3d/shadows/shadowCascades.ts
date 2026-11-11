import { Vector3 } from 'three';
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
}

/** The camera types the package publishes a cascade set for. */
export type ShadowCascadeSet = 'chase' | 'cockpit';

export interface ShadowCascadeLayout {
  cascades: ShadowCascade[];
  /** Where the first view slice starts (the camera set's `nearM`). */
  nearM: number;
  /** The view depth where the shadow starts fading out, and where it is gone (`farM`). */
  fadeStartM: number;
  farM: number;
}

/**
 * The cascades of one camera type from the package's shadow profile (docs/PLUGINS.md): cascade i is a square of side
 * widthPerSplit · split_i, the last one widthPerSplit · (far − split_N−2), each in its own atlas tile; the shadow fades out over
 * lengthOfLastSpan · (far − split_N−2) before far. Throws for a camera type the package publishes no set for.
 */
export function shadowCascadeLayout(shadows: SceneryShadows, camera: SceneryShadowCamera): ShadowCascadeLayout {
  const splits = camera.splitsM;
  if (!splits) throw Error('The package has no shadow cascades for this camera type');
  const {fit: {widthPerSplit}, atlas: {tilePx, cascadeTiles}, fade: {lengthOfLastSpan}} = shadows;
  const lastSpanM = camera.farM - (splits.length > 1 ? splits[splits.length - 2] : 0);
  const cascades = splits.map((splitM, i): ShadowCascade => {
    const sideM = widthPerSplit * (i === splits.length - 1 ? lastSpanM : splitM);
    return {splitM, sideM, texelM: sideM / tilePx, tile: cascadeTiles[i]};
  });
  return {cascades, nearM: camera.nearM, fadeStartM: camera.farM - lengthOfLastSpan * lastSpanM, farM: camera.farM};
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

/**
 * The cascade that shades a point: the first whose tile holds it, the point's position in each tile being `uv` (0..1 across the
 * square, from the cascade's sun view). -1 when none does.
 */
export function selectCascade(uv: ReadonlyArray<readonly [number, number]>, halfExtent: number): number {
  return uv.findIndex(([u, v]) => Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) <= halfExtent);
}

/** How much of the sun shadow is faded out at a view depth: 0 before the fade starts, 1 at far and beyond. */
export function shadowFadeOut(layout: ShadowCascadeLayout, viewDepthM: number): number {
  return Math.min(Math.max((viewDepthM - layout.fadeStartM) / (layout.farM - layout.fadeStartM), 0), 1);
}
