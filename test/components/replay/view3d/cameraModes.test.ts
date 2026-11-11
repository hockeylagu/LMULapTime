import { expect, it } from 'vitest';
import { exposureType, shadowCascadeSet } from '../../../../src/components/replay/view3d/cameraModes.js';

it('exposes the cockpit as onboard, trackside as TV and every other view as external', () => {
  expect(exposureType('cockpit')).toBe('onboard');
  expect(exposureType('trackside')).toBe('tv');
  expect((['follow', 'chase', 'hood', 'roof', 'orbit', 'top'] as const).map(exposureType)).toEqual(Array(6).fill('external'));
});

it('samples the cockpit cascade set onboard and the chase set in every other view', () => {
  expect(shadowCascadeSet('cockpit')).toBe('cockpit');
  expect((['follow', 'chase', 'hood', 'roof', 'orbit', 'trackside', 'top'] as const).map(shadowCascadeSet)).toEqual(Array(7).fill('chase'));
});
