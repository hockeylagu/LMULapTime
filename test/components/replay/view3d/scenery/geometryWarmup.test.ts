import { BoxGeometry, Group, Mesh, PerspectiveCamera, type Scene, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createGeometryWarmup } from '../../../../../src/components/replay/view3d/scenery/geometryWarmup.js';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  let target: WebGLRenderTarget | null = null;
  const render = vi.fn<(scene: Scene) => void>(), setRenderTarget = vi.fn((next: WebGLRenderTarget | null) => { target = next; });
  const compile = vi.fn((scene: Scene) => ({target, attributes: Object.keys((scene.children[0] as Mesh).geometry.attributes)}));
  const renderer = {getRenderTarget: () => target, setRenderTarget, render, compile} as unknown as WebGLRenderer;
  const root = new Group(), first = new BoxGeometry(), second = new BoxGeometry();
  root.add(new Mesh(first), new Mesh(first), new Mesh(second));
  return {renderer, root, render, setRenderTarget, compile, first, second};
}

it('uploads each shared geometry once offscreen, yielding slices and restoring the render target', async () => {
  const {renderer, root, render, setRenderTarget, first, second} = fixture();
  const geometries: unknown[] = [];
  render.mockImplementation(scene => { geometries.push((scene.children[0] as Mesh).geometry); });
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now++);
  const nextFrame = vi.fn(async () => {}), warmup = createGeometryWarmup(renderer, nextFrame, 1);
  try {
    await warmup.upload(root, new PerspectiveCamera(), new AbortController().signal);
    expect(geometries).toEqual([first, second]);
    expect(nextFrame).toHaveBeenCalledTimes(2);
    expect(setRenderTarget.mock.calls[2][0]?.width).toBe(1);
    expect(setRenderTarget.mock.calls[2][0]?.height).toBe(1);
    expect(renderer.getRenderTarget()).toBeNull();
    await warmup.upload(root, new PerspectiveCamera(), new AbortController().signal);
    expect(render).toHaveBeenCalledTimes(2);
  } finally { warmup.dispose(); }
});

it('links its program when created, for its own target and for geometry with positions and normals', () => {
  const {renderer, compile} = fixture(), warmup = createGeometryWarmup(renderer, async () => {}, 1);
  try {
    expect(compile).toHaveBeenCalledOnce();
    const linked = compile.mock.results[0].value as {target: WebGLRenderTarget | null; attributes: string[]};
    expect([linked.target?.width, linked.attributes, renderer.getRenderTarget()]).toEqual([1, ['position', 'normal'], null]);
  } finally { warmup.dispose(); }
});

it('allows a larger startup budget without yielding after every geometry', async () => {
  const {renderer, root, render} = fixture();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now++);
  const nextFrame = vi.fn(async () => {}), warmup = createGeometryWarmup(renderer, nextFrame, 1);
  try {
    await warmup.upload(root, new PerspectiveCamera(), new AbortController().signal, 12);
    expect(render).toHaveBeenCalledTimes(2);
    expect(nextFrame).not.toHaveBeenCalled();
  } finally { warmup.dispose(); }
});

it('restores the target after an upload error and does not upload canceled or disposed work', async () => {
  const {renderer, root, render} = fixture(), nextFrame = vi.fn(async () => {});
  const warmup = createGeometryWarmup(renderer, nextFrame, 1), camera = new PerspectiveCamera();
  try {
    render.mockImplementation(() => { throw Error('upload failed'); });
    await expect(warmup.upload(root, camera, new AbortController().signal)).rejects.toThrow('upload failed');
    expect(renderer.getRenderTarget()).toBeNull();
    render.mockClear();
    const abort = new AbortController(); abort.abort();
    await expect(warmup.upload(root, camera, abort.signal)).rejects.toThrow();
    expect(render).not.toHaveBeenCalled();
    warmup.dispose();
    await warmup.upload(root, camera, new AbortController().signal);
    expect(render).not.toHaveBeenCalled();
  } finally { warmup.dispose(); }
});