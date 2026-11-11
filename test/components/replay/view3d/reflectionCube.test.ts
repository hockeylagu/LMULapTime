import { expect, it, vi } from 'vitest';
import { HalfFloatType, LinearMipmapLinearFilter, WebGLCubeRenderTarget, type RawShaderMaterial, type Scene, type WebGLRenderer } from 'three';
import { convolveReflection } from '../../../../src/components/replay/view3d/reflectionCube.js';
import { testShading } from '../../../helpers/scenes/sceneryProfiles.js';

/** A renderer that records each draw's target, face, mip and the convolution uniforms at that moment. */
function recordingRenderer() {
  let current: [unknown, number, number] = [null, 0, 0];
  const draws: {target: unknown; face: number; level: number; size: number; count: number; sourceLod: number; material: RawShaderMaterial; source: unknown}[] = [];
  const renderer = {
    autoClear: true, getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: vi.fn((target: unknown, face: number = 0, level: number = 0) => { current = [target, face, level]; }),
    render: vi.fn((scene: Scene) => {
      const material = (scene.children[0] as unknown as {material: RawShaderMaterial}).material, u = material.uniforms;
      draws.push({target: current[0], face: current[1], level: current[2], size: u.size.value as number, count: u.count.value as number, sourceLod: u.sourceLod.value as number, material, source: u.source.value});
    }),
  };
  return {renderer: renderer as unknown as WebGLRenderer, draws, raw: renderer};
}

it('draws each kernel into its mip on all six faces, from the source at its LOD, and restores the renderer', () => {
  const source = new WebGLCubeRenderTarget(64, {type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter});
  const {renderer, draws, raw} = recordingRenderer(), kernels = testShading().convolution.kernels;
  const cubes = convolveReflection(renderer, source, kernels);
  expect(cubes.levels).toBe(2); expect(cubes.sharp).toBe(source.texture);
  expect(draws.map(d => [d.level, d.face])).toEqual([0, 1].flatMap(level => [0, 1, 2, 3, 4, 5].map(face => [level, face])));
  // The mip's own size, the kernel's sample count and source LOD.
  expect(draws[0]).toMatchObject({size: 64, count: 1, sourceLod: 0}); expect(draws[6]).toMatchObject({size: 32, count: 3, sourceLod: 2});
  expect(draws.every(d => d.target !== source && (d.target as WebGLCubeRenderTarget).texture === cubes.convolved)).toBe(true);
  expect(raw.setRenderTarget).toHaveBeenLastCalledWith(null, 0, 0); expect(renderer.autoClear).toBe(true);
  // Only the kernels' mips are defined: no chain is regenerated over them.
  expect(cubes.convolved.generateMipmaps).toBe(false);
  cubes.dispose(); source.dispose();
});

it('needs a source that keeps its mips and is large enough for every kernel', () => {
  const {renderer} = recordingRenderer(), kernels = testShading().convolution.kernels;
  expect(() => convolveReflection(renderer, new WebGLCubeRenderTarget(64, {generateMipmaps: false}), kernels)).toThrow('keep its mips');
  expect(() => convolveReflection(renderer, new WebGLCubeRenderTarget(1, {generateMipmaps: true}), kernels)).toThrow('no mip 1');
});

it('renders into an earlier result for the same size, type and kernels with the same pass, and refuses one that differs', () => {
  const options = {type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter} as const;
  const first = new WebGLCubeRenderTarget(64, options), second = new WebGLCubeRenderTarget(64, options);
  const {renderer, draws} = recordingRenderer(), kernels = testShading().convolution.kernels;
  const cubes = convolveReflection(renderer, first, kernels), again = convolveReflection(renderer, second, kernels, cubes);
  expect(again).toBe(cubes); expect(again.sharp).toBe(second.texture);
  expect(draws.slice(12).every(d => d.target === cubes.target)).toBe(true);
  // A later capture keeps the pass (no new program to link) and reads the new source.
  expect(new Set(draws.map(d => d.material)).size).toBe(1); expect(draws.slice(12).every(d => d.source === second.texture)).toBe(true);
  const disposed = vi.fn(); draws[0].material.addEventListener('dispose', disposed);
  expect(() => convolveReflection(renderer, new WebGLCubeRenderTarget(32, options), kernels, cubes)).toThrow('differ');
  expect(() => convolveReflection(renderer, second, kernels.slice(0, 1), cubes)).toThrow('differ');
  cubes.dispose(); first.dispose(); second.dispose();
  expect(disposed).toHaveBeenCalledOnce();
});
