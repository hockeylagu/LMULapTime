import { Vector2, type IUniform } from 'three';

/**
 * The replay's time in seconds, which every animated surface reads (digital flags blink by it): the scene shell sets it before each
 * frame from the pose the camera follows, so animations pause and scrub with the replay, as the reference animates them by game
 * time.
 */
export const sceneryClock = { value: 0 };

/**
 * UV-animated surface maps (`maps.<role>.uvAnimation`, the pipeline's docs/SCENE_PACKAGE.md): LED boards, screens, fountains and
 * water. The shift is added after the map's UV scale, on the replay's clock (`sceneryClock`), so it scrubs and runs backwards with
 * the replay: scroll adds rate · t, step adds step · floor(rate · t). Texture-frame animations (`frames`) are not drawn: every
 * scenery map published with frames is driven by game state the package does not carry (its first frame is its texture) or names
 * no method.
 */

/** A map's UV animation, added after its UV scale. */
export interface SurfaceUvAnimation {
  mode: 'scroll' | 'step';
  rate: readonly [number, number];
  step: readonly [number, number];
}

/**
 * The UV shift of an animation at a time, wrapped to [0, 1) so the shader adds a small value (animated maps repeat): computed here
 * in double precision, where a day of replay time would leave the shader's float a few texels of jitter.
 */
export function uvShift(animation: SurfaceUvAnimation, timeSec: number, out = new Vector2()): Vector2 {
  const [ru, rv] = animation.rate;
  const u = animation.mode === 'scroll' ? ru * timeSec : animation.step[0] * Math.floor(ru * timeSec);
  const v = animation.mode === 'scroll' ? rv * timeSec : animation.step[1] * Math.floor(rv * timeSec);
  return out.set(u - Math.floor(u), v - Math.floor(v));
}

/** The uniform holding a map's UV shift at the scenery clock's time. */
export function uvShiftUniform(animation: SurfaceUvAnimation): IUniform<Vector2> {
  const out = new Vector2();
  return { get value() { return uvShift(animation, sceneryClock.value, out); } };
}

/** Whether a package UV animation is well formed. */
export function isUvAnimation(value: unknown): value is SurfaceUvAnimation {
  const given = value as Partial<SurfaceUvAnimation> | null;
  const pair = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  return !!given && (given.mode === 'scroll' || given.mode === 'step') && pair(given.rate) && pair(given.step);
}
