import { expect, it } from 'vitest';
import { Matrix3, Texture, type Mesh, type ShaderMaterial, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { createGlare, GLARE_GAIN } from '../../../../src/components/replay/view3d/glare.js';

it("thresholds the exposed frame at the camera's glare threshold, then blurs it down and back up a half-resolution chain", () => {
  const passes: Array<{shader: string; source: unknown; target: WebGLRenderTarget; additive: boolean; clears: boolean}> = [];
  let target: WebGLRenderTarget | null = null;
  const renderer = {
    autoClear: true,
    setRenderTarget(next: WebGLRenderTarget | null) { target = next; },
    render(quad: Mesh) {
      const material = quad.material as ShaderMaterial;
      passes.push({shader: material.fragmentShader, source: material.uniforms.source.value, target: target!, additive: material.blending !== 1, clears: renderer.autoClear});
    },
  };
  const glare = createGlare(renderer as unknown as WebGLRenderer, 1.25), source = new Texture();
  glare.setSize(1920, 1080);
  glare.render(source, 2, new Matrix3());
  expect(passes).toHaveLength(11);
  expect(passes[0].shader).toContain('luminance - 1.250'); expect(passes[0].source).toBe(source);
  expect(passes.slice(0, 6).map(pass => [pass.target.width, pass.target.height])).toEqual([[960, 540], [480, 270], [240, 135], [120, 67], [60, 33], [30, 16]]);
  // Each level adds onto the next larger one, ending on the half-resolution level the composite samples.
  expect(passes.slice(6).every(pass => pass.additive && !pass.clears)).toBe(true);
  expect(passes.at(-1)!.target.texture).toBe(glare.texture);
  expect(renderer.autoClear).toBe(true);
  expect(glare.scale).toBeCloseTo(GLARE_GAIN / 6);
  glare.dispose();
});
