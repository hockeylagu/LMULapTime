import { describe, expect, it } from 'vitest';
import { isUvAnimation, uvShift } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceAnimation.js';
import { shaderParts } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import { surface } from './surfaceFixture.js';

describe('surface animation', () => {
  it('scrolls or steps the UV, wrapped to one repeat', () => {
    const scroll = uvShift({ mode: 'scroll', rate: [0.25, -0.1], step: [0, 0] }, 3);
    expect(scroll.x).toBeCloseTo(0.75); expect(scroll.y).toBeCloseTo(0.7);
    const step = uvShift({ mode: 'step', rate: [2, 1], step: [0.125, 0.5] }, 1.6);
    expect(step.x).toBeCloseTo(0.375); expect(step.y).toBeCloseTo(0.5);
    expect(uvShift({ mode: 'scroll', rate: [0.25, 0], step: [0, 0] }, 86_400.5).x).toBeCloseTo(0.125);
  });

  it('adds the shift after the scale of an animated map only, from its own uniform', () => {
    const map = { texture: 'A', uv: 'uv0' as const, scale: [2, 2] as [number, number], srgb: true };
    const animated = surface('diffuse', { maps: { albedo: { ...map, uvAnimation: { mode: 'scroll', rate: [0.1, 0], step: [0, 0] } } } });
    for (const uniforms of [true, false]) {
      const parts = shaderParts(animated, { uniforms });
      expect(parts.albedo).toMatch(/texture2D\(surface_albedo, \(vSurfaceUV01\.xy \* \S+ \+ surface_shift_albedo\)\)/);
      expect(parts.declarations).toContain('uniform vec2 surface_shift_albedo;');
    }
    expect(shaderParts(surface('diffuse', { maps: { albedo: map } })).declarations).not.toContain('surface_shift');
  });

  it('accepts only a scroll or step with a rate and step pair', () => {
    expect(isUvAnimation({ mode: 'step', rate: [0, 0.2], step: [0, 0.125] })).toBe(true);
    expect(isUvAnimation({ mode: 'spin', rate: [0, 0.2], step: [0, 0.125] })).toBe(false);
    expect(isUvAnimation({ mode: 'scroll', rate: [0.1], step: [0, 0] })).toBe(false);
    expect(isUvAnimation(null)).toBe(false);
  });
});
