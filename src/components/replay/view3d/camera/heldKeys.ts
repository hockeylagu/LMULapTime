/** Keyboard input for the replay camera. Movement is measured in scene metres. */
export type HeldKey = 'w' | 'a' | 's' | 'd' | 'q' | 'e' | 'shift' | 'in' | 'out';

/**
 * Fly speed: at least MOVE_M_PER_SEC, and this share of the camera's reach (its distance to the lap) each second, as editor and map
 * fly cameras scale with distance: high over the whole circuit a fixed 25 m/s barely moved it (driver, 2026-11-28). Shift multiplies it.
 */
const MOVE_M_PER_SEC = 25, MOVE_REACH_PER_SEC = 0.5, BOOST = 4;
const ZOOM_HOLD_DELAY_SEC = 0.25;
const ZOOM_STEPS_PER_SEC = 12;
// Limit the distance covered by a single frame after a stall.
const MAX_STEP_SEC = 0.1;

export function heldKeyOf(key: string): HeldKey | null {
  const lower = key.toLowerCase();
  if (lower === 'w' || lower === 'a' || lower === 's' || lower === 'd' || lower === 'q' || lower === 'e') return lower;
  if (key === 'Shift') return 'shift';
  if (key === '+' || key === '=') return 'in';
  if (key === '-' || key === '_') return 'out';
  return null;
}

export const movesCamera = (key: HeldKey) => key !== 'in' && key !== 'out' && key !== 'shift';

export interface HeldMove {
  strafe: number;
  forward: number;
  lift: number;
  zoomSteps: number;
}

export function createHeldKeys() {
  const held = new Set<HeldKey>();
  let zoomDelay = 0;
  const axis = (positive: HeldKey, negative: HeldKey) => Number(held.has(positive)) - Number(held.has(negative));
  return {
    /** Returns whether this press changed the held state. */
    set(key: HeldKey, down: boolean): boolean {
      if (down === held.has(key)) return false;
      if (down) held.add(key);
      else held.delete(key);
      if (key === 'in' || key === 'out') zoomDelay = ZOOM_HOLD_DELAY_SEC;
      return true;
    },
    releaseAll() { held.clear(); zoomDelay = 0; },
    get moving() { return held.size > Number(held.has('shift')); },
    /** One frame's move over `dtSec`, the camera `reachM` from the lap. */
    step(dtSec: number, reachM = 0): HeldMove | null {
      if (!this.moving) return null;
      const dt = Math.max(0, Math.min(MAX_STEP_SEC, dtSec));
      const strafe = axis('d', 'a'), forward = axis('w', 's'), lift = axis('e', 'q');
      const distance = Math.max(MOVE_M_PER_SEC, reachM * MOVE_REACH_PER_SEC) * (held.has('shift') ? BOOST : 1) * dt;
      const scale = distance / Math.max(1, Math.hypot(strafe, forward, lift));
      const zoom = axis('in', 'out');
      const zoomDt = Math.max(0, dt - zoomDelay);
      if (zoom) zoomDelay = Math.max(0, zoomDelay - dt);
      return {strafe: strafe * scale, forward: forward * scale, lift: lift * scale, zoomSteps: zoom * ZOOM_STEPS_PER_SEC * zoomDt};
    },
  };
}
