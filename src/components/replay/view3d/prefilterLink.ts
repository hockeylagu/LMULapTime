import { BufferAttribute, BufferGeometry, Mesh, PMREMGenerator, WebGLRenderTarget, type Camera, type Material, type WebGLRenderer } from 'three';

/** What a prefilter generator sets up for a cube size before its first conversion. three keeps these internal. */
interface GeneratorSetup {
  _setSize?(cubePx: number): void;
  _allocateTargets?(): WebGLRenderTarget;
  _ggxMaterial?: Material | null;
}

/**
 * three links the program that prefilters an environment on its first use, on the main thread: a few hundred milliseconds for each
 * cube size when the GPU's shader cache is cold. This starts those links for `cubeSizesPx` and resolves `ready` once the programs
 * exist, so the page keeps working meanwhile; a generator made after that finds its program linked. Where three's internal set-up
 * is not there, `ready` resolves at once and each generator links on its first use. These generators hold the programs until
 * `dispose`: call it once the scene's own generators have run.
 */
export function linkPrefilters(renderer: WebGLRenderer, camera: Camera, cubeSizesPx: readonly number[]): { ready: Promise<void>; dispose(): void } {
  const generators = cubeSizesPx.map(() => new PMREMGenerator(renderer)), target = new WebGLRenderTarget(1, 1);
  // A program is shared between meshes whose geometry has the same kinds of attributes: the generators draw positions, no normals.
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  const meshes = generators.flatMap((generator, index) => {
    const setup = generator as unknown as GeneratorSetup; // three's internal set-up: each field is checked before use.
    if (!setup._setSize || !setup._allocateTargets) return [];
    setup._setSize(cubeSizesPx[index]); setup._allocateTargets().dispose();
    return setup._ggxMaterial ? [new Mesh(geometry, setup._ggxMaterial)] : [];
  });
  // A program for a render target differs from the canvas's (linear output, no tone mapping): the generators draw to targets.
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = Promise.all(meshes.map(mesh => renderer.compileAsync(mesh, camera))).then(() => {});
  renderer.setRenderTarget(previous);
  return {
    ready,
    dispose() {
      for (const generator of generators) generator.dispose();
      geometry.dispose();
      target.dispose();
    },
  };
}
