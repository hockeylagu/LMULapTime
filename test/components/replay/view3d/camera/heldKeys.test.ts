import { expect, it } from 'vitest';
import { createHeldKeys, heldKeyOf, movesCamera } from '../../../../../src/components/replay/view3d/camera/heldKeys.js';

it('maps shifted and unshifted keys to the same action', () => {
  expect(['W', 'a', 'Q', 'e', 'Shift', 'c', '+', '=', '-', '_'].map(heldKeyOf))
    .toEqual(['w', 'a', 'q', 'e', 'shift', null, 'in', 'in', 'out', 'out']);
  expect(movesCamera('q')).toBe(true);
  expect(movesCamera('in')).toBe(false);
  expect(movesCamera('shift')).toBe(false);
});

it('moves at a fixed speed, normalizes diagonal movement, and boosts immediately', () => {
  const keys = createHeldKeys();
  keys.set('w', true);
  expect(keys.step(0.1)?.forward).toBeCloseTo(2.5);
  expect(keys.step(5)?.forward).toBeCloseTo(2.5);
  keys.set('d', true);
  const diagonal = keys.step(0.1)!;
  expect(Math.hypot(diagonal.strafe, diagonal.forward)).toBeCloseTo(2.5);
  keys.set('shift', true);
  keys.set('d', false);
  expect(keys.step(0.1)?.forward).toBeCloseTo(10);
  keys.set('s', true);
  expect(keys.step(0.1)?.forward).toBe(0);
  keys.releaseAll();
  expect(keys.step(0.1)).toBeNull();
});

it('starts continuous zoom after a short hold, independent of Shift and movement', () => {
  const keys = createHeldKeys();
  expect(keys.set('in', true)).toBe(true);
  expect(keys.step(0.1)?.zoomSteps).toBe(0);
  expect(keys.set('in', true)).toBe(false);
  expect(keys.step(0.1)?.zoomSteps).toBe(0);
  expect(keys.step(0.1)?.zoomSteps).toBeCloseTo(0.6);
  keys.set('shift', true);
  keys.set('w', true);
  expect(keys.step(0.1)?.zoomSteps).toBeCloseTo(1.2);
  keys.set('in', false);
  expect(keys.step(0.1)?.zoomSteps).toBe(0);
});
