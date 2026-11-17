import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import { FOCUS_MS, focusing, focusOf, patchTextureFocus, startFocus } from '../../../../../src/components/replay/view3d/scenery/textureFocus.js';

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

  it("fades the program's lookups of the samplers named, read from the texture each holds at the draw", () => {
    const texture = new Texture(), other = new Texture();
    const shader = {
      uniforms: {map: {value: texture}, surface_normal: {value: other}, cascade_atlas: {value: null}},
      fragmentShader: '#include <common>\nvec3 n() { return texture2D(surface_normal, vUv).xyz; }\nvoid main() {\n  vec4 a = texture2D( map, vMapUv );\n  float s = texture2D(cascade_atlas, vUv).r;\n  vec4 b = texture2D(surface_missing, vUv);\n}',
    };
    patchTextureFocus(shader, ['map', 'surface_normal', 'surface_missing']);
    const fragment = shader.fragmentShader;
    expect(fragment).toContain('focusTexture(map, focus_map, vMapUv );');
    expect(fragment).toContain('focusTexture(surface_normal, focus_surface_normal, vUv)');
    // A sampler not named, or not a uniform of the program, is left alone.
    expect(fragment).toContain('texture2D(cascade_atlas, vUv)');
    expect(fragment).toContain('texture2D(surface_missing, vUv)');
    // Declared with three's common declarations, ahead of the program's own functions.
    expect(fragment.indexOf('uniform float focus_map;')).toBeGreaterThan(fragment.indexOf('#include <common>'));
    expect(fragment.indexOf('vec4 focusTexture(')).toBeLessThan(fragment.indexOf('vec3 n()'));
    const uniforms = shader.uniforms as Record<string, {value: unknown}>;
    expect(uniforms.focus_map.value).toBe(0);
    startFocus(texture, 2);
    expect(uniforms.focus_map.value).toBeGreaterThan(1.9);
    expect(uniforms.focus_surface_normal.value).toBe(0);
  });

  it('leaves a program reading none of the samplers as it is', () => {
    const shader = {uniforms: {map: {value: null}}, fragmentShader: 'void main() {}'};
    patchTextureFocus(shader, ['map']);
    expect(shader).toEqual({uniforms: {map: {value: null}}, fragmentShader: 'void main() {}'});
  });
});
