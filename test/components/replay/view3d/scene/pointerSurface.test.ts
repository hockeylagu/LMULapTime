import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Scene, Vector3, type Camera, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { createPointerSurface } from '../../../../../src/components/replay/view3d/scene/pointerSurface.js';

/** A renderer that records what it draws and reads back `depth` as the drawn pixel's depth. */
function stubRenderer(depth: () => number, reversed: boolean) {
  const drawn: Camera[] = [];
  let current: WebGLRenderTarget | null = null;
  const renderer = {
    capabilities: {reversedDepthBuffer: reversed},
    getRenderTarget: () => current,
    setRenderTarget: (target: WebGLRenderTarget | null) => { current = target; },
    render: (_scene: Scene, camera: Camera) => { drawn.push(camera); },
    readRenderTargetPixelsAsync: (_target: WebGLRenderTarget, _x: number, _y: number, _w: number, _h: number, pixel: Float32Array) => {
      pixel[0] = depth(); return Promise.resolve(pixel);
    },
  };
  return {renderer: renderer as unknown as WebGLRenderer, drawn};
}

/** A 90° camera 1 m up, looking along scene -z, as a frame drew it. */
function drawnCamera() {
  const camera = new PerspectiveCamera(90, 2, 0.1, 1000);
  camera.position.set(0, 1, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  return camera;
}

describe('createPointerSurface', () => {
  it('draws the pixel under the pointer alone and gives back the surface the depth read finds there', async () => {
    const view = drawnCamera(), point = new Vector3(3, 2, -10);
    // The pixel the point is drawn at, on a 200 by 100 canvas, and the depth a standard buffer holds for it.
    const ndc = point.clone().project(view), x = ((ndc.x + 1) / 2) * 200, y = ((1 - ndc.y) / 2) * 100;
    const {renderer, drawn} = stubRenderer(() => ndc.z * 0.5 + 0.5, false);
    const surface = createPointerSurface(renderer);
    const found = await surface.read(new Scene(), view, x, y, 200, 100);
    // Read at the pixel's centre: a pixel is 20 cm across at 10 m, so within half its diagonal of the point.
    expect(found!.distanceTo(point)).toBeLessThan(0.15);
    const camera = drawn[0] as PerspectiveCamera;
    expect(camera).not.toBe(view);
    expect(camera.view).toMatchObject({fullWidth: 200, fullHeight: 100, offsetX: Math.floor(x), offsetY: Math.floor(y), width: 1, height: 1});
    expect(renderer.getRenderTarget()).toBeNull();
    surface.dispose();
  });

  it('finds nothing over the sky: the cleared depth is the far plane', async () => {
    const standard = createPointerSurface(stubRenderer(() => 1, false).renderer);
    expect(await standard.read(new Scene(), drawnCamera(), 100, 50, 200, 100)).toBeNull();
    const reversed = createPointerSurface(stubRenderer(() => 0, true).renderer);
    expect(await reversed.read(new Scene(), drawnCamera(), 100, 50, 200, 100)).toBeNull();
    // An overhead view draws with an orthographic camera.
    const overhead = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    overhead.position.set(0, 50, 0); overhead.lookAt(0, 0, 0); overhead.updateMatrixWorld();
    const {renderer, drawn} = stubRenderer(() => 0.5, false);
    const found = await createPointerSurface(renderer).read(new Scene(), overhead, 100, 50, 200, 100);
    expect(drawn[0]).toBeInstanceOf(OrthographicCamera);
    expect(found!.y).toBeCloseTo(50 - (0.1 + 100) / 2, 0);
  });
});
