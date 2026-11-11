import { afterEach, expect, it, vi } from 'vitest';
import { PerspectiveCamera, PMREMGenerator, WebGLRenderTarget, type Mesh, type WebGLRenderer } from 'three';
import { linkPrefilters } from '../../../../src/components/replay/view3d/prefilterLink.js';

/** A renderer that records what is compiled and for which render target. */
function fakeRenderer() {
  const canvasTarget = new WebGLRenderTarget(4, 4);
  let current: WebGLRenderTarget | null = canvasTarget;
  const compiled: {mesh: Mesh; target: WebGLRenderTarget | null}[] = [];
  const renderer = {
    getRenderTarget: () => current,
    setRenderTarget: (target: WebGLRenderTarget | null) => { current = target; },
    compileAsync: vi.fn(async (mesh: Mesh) => { compiled.push({mesh, target: current}); }),
  };
  return {renderer: renderer as unknown as WebGLRenderer, compiled, canvasTarget, current: () => current};
}

type Internals = {_setSize?: unknown};
const prototype = PMREMGenerator.prototype as unknown as Internals, setSize = prototype._setSize;
afterEach(() => { prototype._setSize = setSize; });

it('starts the link of one prefilter program per cube size, for a render target, and leaves the renderer as it was', async () => {
  const {renderer, compiled, canvasTarget, current} = fakeRenderer();
  const prefilters = linkPrefilters(renderer, new PerspectiveCamera(), [128, 1024]);
  expect(current()).toBe(canvasTarget);
  await prefilters.ready;
  expect(compiled).toHaveLength(2);
  const defines = compiled.map(({mesh}) => (mesh.material as unknown as {defines: Record<string, number>}).defines.CUBEUV_TEXEL_HEIGHT);
  expect(defines).toEqual([1 / (4 * 128), 1 / (4 * 1024)]);
  for (const {mesh, target} of compiled) {
    // The generators' own meshes have positions and no normals: a program is shared only with geometry of the same kinds.
    expect([Object.keys(mesh.geometry.attributes), target !== null && target !== canvasTarget]).toEqual([['position'], true]);
  }
  const disposed = vi.fn();
  compiled[0].mesh.geometry.addEventListener('dispose', disposed);
  prefilters.dispose();
  expect(disposed).toHaveBeenCalledOnce();
});

it('resolves without compiling where the generator has no such set-up', async () => {
  prototype._setSize = undefined;
  const {renderer, compiled} = fakeRenderer();
  await linkPrefilters(renderer, new PerspectiveCamera(), [128]).ready;
  expect(compiled).toEqual([]);
});
