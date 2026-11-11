import { expect, it } from 'vitest';
import { exposureType, shadowCascadeSet } from '../../../../src/components/replay/view3d/cameraModes.js';

it('exposes the cockpit as onboard, trackside as TV and every other view as external', () => {
  expect(exposureType('cockpit')).toBe('onboard');
  expect(exposureType('trackside')).toBe('tv');
  expect((['follow', 'chase', 'hood', 'roof', 'orbit', 'top'] as const).map(exposureType)).toEqual(Array(6).fill('external'));
});

it('samples the chase cascades in the external views that follow the car, the cockpit set onboard, and none elsewhere', () => {
  expect((['follow', 'chase', 'cockpit'] as const).map(shadowCascadeSet)).toEqual(['chase', 'chase', 'cockpit']);
  expect((['hood', 'roof', 'orbit', 'trackside', 'top'] as const).map(shadowCascadeSet)).toEqual(Array(5).fill(null));
});
