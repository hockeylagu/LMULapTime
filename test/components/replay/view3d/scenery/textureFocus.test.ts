import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import { FOCUS_MS, focusedLookup, focusing, focusOf, startFocus, textureFocusPart } from '../../../../../src/components/replay/view3d/scenery/textureFocus.js';

describe('texture focus', () => {
  it('holds a sharpened texture back by the levels it drew without, easing to none over the fade', () => {
    const texture = new Texture();
    startFocus(texture, 3, 1000);
    expect(focusOf(texture, 1000)).toBe(3);
    expect(focusOf(texture, 1000 + FOCUS_MS / 2)).toBeCloseTo(1.5);
    expect(focusOf(texture, 1000 + FOCUS_MS / 4)).toBeGreaterThan(1.5 * 1.5);
    expect(focusing(1000 + FOCUS_MS - 1)).toBe(true);
    expect(focusOf(texture, 1000 + FOCUS_MS)).toBe(0);
    expect(focusing(1000 + FOCUS_MS)).toBe(false);
    // Another texture, none and one that lost no levels: in focus.
    startFocus(texture, 0, 5000);
    expect([focusOf(new Texture(), 1000), focusOf(null), focusOf(texture, 5000), focusing(5000)]).toEqual([0, 0, 0, false]);
  });

  it("reads each sampler's focus from the texture it holds at the draw, at the frame's time", () => {
    const texture = new Texture(), uniforms = textureFocusPart({map: {value: texture}, surface_normal: {value: new Texture()}}).uniforms?.() ?? {};
    expect(uniforms.focus_map.value).toBe(0);
    startFocus(texture, 2, 10_000);
    focusing(10_000);
    expect(uniforms.focus_map.value).toBeGreaterThan(1.9);
    expect(uniforms.focus_surface_normal.value).toBe(0);
  });});

it("gives a composed program's lookups the same fade-in: the sampling function and each sampler's focus, read off its texture", () => {
  const texture = new Texture(), sampler = {value: texture}, part = textureFocusPart({surface_b: {value: null}, surface_a: sampler});
  expect(focusedLookup('surface_a', 'uv')).toBe('focusTexture(surface_a, focus_surface_a, uv)');
  const glsl = part.slots.fragmentPars?.glsl ?? '';
  expect(glsl.indexOf('uniform float focus_surface_a;')).toBeLessThan(glsl.indexOf('uniform float focus_surface_b;'));
  expect(glsl).toContain('vec4 focusTexture(sampler2D map2D, float focus, vec2 uv)');
  expect(part.slots.fragmentPars?.at).toBe(-100);
  expect(part.uniforms?.().focus_surface_a.value).toBe(0);
});