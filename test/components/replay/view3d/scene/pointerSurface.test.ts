import { describe, expect, it } from 'vitest';
import { Mesh, OrthographicCamera, PerspectiveCamera, Scene, Vector3, type Camera, type ShaderMaterial, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { createPointerSurface, type RaySpan } from '../../../../../src/components/replay/view3d/scene/pointerSurface.js';

/**
 * A renderer whose scene draw leaves `surface` (normalized device depth, null for the sky) in the pixel, and whose occlusion
 * queries pass where a probe lies in front of it or on it, answered after `delay` looks.
 */
function stubRenderer(surface: number | null, reversed: boolean, delay = 1) {
  const drawn: Camera[] = [], deleted: object[] = [];
  const results = new Map<object, boolean>();
  let current: WebGLRenderTarget | null = null, active: object | null = null, looks = 0, lost = false;
  const far = reversed ? 0 : 1;
  const gl = {
    ANY_SAMPLES_PASSED: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
    createQuery: () => ({}),
    beginQuery: (_kind: number, query: object) => { active = query; },
    endQuery: () => { active = null; },
    getQueryParameter: (query: object, name: number) => (name === 2 ? ++looks > delay : results.get(query)),
    flush: () => {},
    deleteQuery: (query: object) => { deleted.push(query); },
    isContextLost: () => lost,
  };
  const renderer = {
    autoClear: true,
    capabilities: {reversedDepthBuffer: reversed},
    getContext: () => gl,
    getRenderTarget: () => current,
    setRenderTarget: (target: WebGLRenderTarget | null) => { current = target; },
    render(scene: Scene, camera: Camera) {
      const probe = scene.children[0];
      if (!(probe instanceof Mesh) || !active) {
        // As three does on its first draw into a reversed buffer: the camera's projection reversed.
        if (reversed) reverse(camera as PerspectiveCamera);
        drawn.push(camera); return;
      }
      expect(renderer.autoClear).toBe(false);
      const depth = (probe.material as ShaderMaterial).uniforms.depth.value as number, stored = surface ?? far;
      results.set(active, reversed ? depth >= stored : depth <= stored);
    },
  };
  return {renderer: renderer as unknown as WebGLRenderer, drawn, deleted, lose: () => { lost = true; }};
}

/** A camera drawn into a reversed depth buffer: three marks it on its first draw (no public setter) and reverses its projection. */
function reverse(camera: PerspectiveCamera): void {
  Object.defineProperty(camera, 'reversedDepth', {value: true, configurable: true});
  camera.updateProjectionMatrix();
}

/** A 90° camera 1 m up, looking along scene -z, as a frame drew it. */
function drawnCamera(reversed = false) {
  const camera = new PerspectiveCamera(90, 2, 0.1, 1000);
  camera.position.set(0, 1, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  if (reversed) reverse(camera);
  return camera;
}

/** The pixel a scene point draws at on a 200 by 100 canvas. */
function pixelOf(point: Vector3, view: Camera) {
  const ndc = point.clone().project(view);
  return {x: ((ndc.x + 1) / 2) * 200, y: ((1 - ndc.y) / 2) * 100};
}

describe('createPointerSurface', () => {
  it('gives the ray through the pixel centre from the near plane, for both camera kinds', () => {
    const view = drawnCamera(), point = new Vector3(3, 2, -10), {x, y} = pixelOf(point, view);
    const surface = createPointerSurface(stubRenderer(null, false).renderer);
    const ray = surface.ray(view, x, y, 200, 100);
    // A pixel is 20 cm across at 10 m: the ray passes within half its diagonal of the point.
    expect(ray.distanceToPoint(point)).toBeLessThan(0.15);
    expect(-ray.origin.clone().sub(view.position).dot(new Vector3(0, 0, 1))).toBeCloseTo(0.1, 5);
    // An overhead view draws with an orthographic camera: straight down from its near plane.
    const overhead = new OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    overhead.position.set(0, 50, 0); overhead.lookAt(0, 0, 0); overhead.updateMatrixWorld(); overhead.updateProjectionMatrix();
    const down = surface.ray(overhead, 100, 50, 200, 100);
    expect(down.origin.y).toBeCloseTo(49.9, 5);
    expect(down.direction.y).toBeCloseTo(-1, 5);
  });

  it('draws the pixel under the pointer alone and tells which span holds its surface, from occlusion queries', async () => {
    for (const reversed of [false, true]) {
      const view = drawnCamera(reversed), point = new Vector3(3, 2, -10), {x, y} = pixelOf(point, view);
      const {renderer, drawn, deleted} = stubRenderer(point.clone().project(view).z, reversed, 3);
      const surface = createPointerSurface(renderer), ray = surface.ray(view, x, y, 200, 100);
      const along = (distance: number) => ray.at(ray.origin.distanceTo(point) + distance, new Vector3());
      const spans: RaySpan[] = [[along(-3), along(-1)], [along(-0.5), along(0.5)], [along(1), along(3)]];
      expect(await surface.within(new Scene(), view, x, y, 200, 100, spans)).toBe(1);
      // A span ending in front of the surface, and one starting past it, hold nothing.
      expect(await surface.within(new Scene(), view, x, y, 200, 100, [spans[0], spans[2]])).toBe(-1);
      const camera = drawn[0] as PerspectiveCamera;
      expect(camera).not.toBe(view);
      expect(camera.view).toMatchObject({fullWidth: 200, fullHeight: 100, offsetX: Math.floor(x), offsetY: Math.floor(y), width: 1, height: 1});
      expect(renderer.getRenderTarget()).toBeNull();
      expect(renderer.autoClear).toBe(true);
      // Every query is deleted once answered: two for each span.
      expect(deleted).toHaveLength(10);
      surface.dispose();
    }
  });

  it('finds nothing over the sky, draws nothing without spans, and rejects once disposed or lost', async () => {
    const view = drawnCamera(), {x, y} = pixelOf(new Vector3(0, 1, -10), view);
    const sky = stubRenderer(null, false), surface = createPointerSurface(sky.renderer), ray = surface.ray(view, x, y, 200, 100);
    const spans: RaySpan[] = [[ray.at(5, new Vector3()), ray.at(15, new Vector3())]];
    expect(await surface.within(new Scene(), view, x, y, 200, 100, spans)).toBe(-1);
    expect(await surface.within(new Scene(), view, x, y, 200, 100, [])).toBe(-1);
    expect(sky.drawn).toHaveLength(1);
    const pending = surface.within(new Scene(), view, x, y, 200, 100, spans);
    surface.dispose();
    await expect(pending).rejects.toThrow('disposed');
    const lost = stubRenderer(null, false, 5), other = createPointerSurface(lost.renderer);
    const waiting = other.within(new Scene(), view, x, y, 200, 100, spans);
    lost.lose();
    await expect(waiting).rejects.toThrow('graphics context');
    expect(lost.deleted).toHaveLength(0);
  });
});
