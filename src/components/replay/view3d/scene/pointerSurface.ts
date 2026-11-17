import {
  DepthTexture, FloatType, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Ray, Scene, ShaderMaterial, Vector3, WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

/** The camera as a frame drew it (`SceneShell.drawnView`). */
export type DrawnCamera = PerspectiveCamera | OrthographicCamera;

/** A stretch of the pointer's ray: where it enters and leaves something, in scene coordinates. */
export type RaySpan = readonly [enter: Vector3, leave: Vector3];

export interface PointerSurface {
  /**
   * The ray from `view` through a point of the canvas (`x` and `y`, CSS pixels from its top left corner, of `width` by `height`),
   * through the pixel's centre from the near plane, in scene coordinates.
   */
  ray(view: DrawnCamera, x: number, y: number, width: number, height: number, target?: Ray): Ray;
  /**
   * Which of `spans` (stretches of `ray` for the same point) holds the nearest opaque surface `scene` draws there from `view`: the
   * first such span's index, -1 when none does (another surface, the sky). It draws that one pixel with the scene's own materials, so
   * glass and the cut-out parts of a fence let the surface behind through, as the frame does, then asks the GPU with occlusion
   * queries whether the surface's depth lies past each span's start and before its end. The answer comes a frame or two later,
   * without waiting on the GPU: reading a pixel back stalls a frame for as long as the GPU is behind (4 to 24 ms at a race start).
   * Rejects when the graphics context is lost or the surface is disposed meanwhile.
   */
  within(scene: Scene, view: DrawnCamera, x: number, y: number, width: number, height: number, spans: readonly RaySpan[]): Promise<number>;
  dispose(): void;
}

/** A plane over the whole one-pixel target at a set depth (normalized device coordinates), drawing no colour: a depth probe. */
const PROBE_SHADER = {
  vertexShader: 'uniform float depth; void main() { gl_Position = vec4(position.xy, depth, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
};

/** Milliseconds between looks at whether the GPU has answered the queries (as three's own asynchronous reads poll). */
const POLL_MS = 4;

export function createPointerSurface(renderer: WebGLRenderer): PointerSurface {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const target = new WebGLRenderTarget(1, 1, {depthTexture: new DepthTexture(1, 1, FloatType)});
  const quad = new PlaneGeometry(2, 2);
  // Passes where it lies in front of the drawn surface, or on it (three turns the test round for a reversed depth buffer).
  const material = new ShaderMaterial({...PROBE_SHADER, uniforms: {depth: {value: 0}}, depthWrite: false, colorWrite: false});
  const probe = new Mesh(quad, material), probeScene = new Scene(), probeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  probe.frustumCulled = false; probeScene.add(probe);
  const cameras = {perspective: new PerspectiveCamera(), orthographic: new OrthographicCamera()};
  const at = new Vector3();
  let disposed = false;
  // The near and far planes in normalized device depth: a reversed projection puts the near plane at 1 and the far one at 0.
  const planes = (reversed: boolean) => (reversed ? {near: 1, far: 0} : {near: -1, far: 1});
  return {
    ray(view, x, y, width, height, ray = new Ray()) {
      const ndcX = ((Math.floor(x) + 0.5) / width) * 2 - 1, ndcY = 1 - ((Math.floor(y) + 0.5) / height) * 2, {near, far} = planes(view.reversedDepth);
      ray.origin.set(ndcX, ndcY, near).unproject(view);
      ray.direction.set(ndcX, ndcY, far).unproject(view).sub(ray.origin).normalize();
      return ray;
    },
    within(scene, view, x, y, width, height, spans) {
      if (!spans.length) return Promise.resolve(-1);
      // The drawn camera narrowed to the one pixel: the 1 by 1 target holds it, and only what lies along it is drawn.
      const camera = view instanceof PerspectiveCamera ? cameras.perspective.copy(view, false) : cameras.orthographic.copy(view, false);
      camera.setViewOffset(width, height, Math.floor(x), Math.floor(y), 1, 1);
      const queries: WebGLQuery[] = [];
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      try {
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        // Each span's two ends against the surface's depth, one query each, the depth kept: through the camera as the scene drew
        // with it (three reverses its projection on its first draw into a reversed buffer), held between the buffer's planes.
        const {near, far} = planes(renderer.capabilities.reversedDepthBuffer), low = Math.min(near, far), high = Math.max(near, far);
        renderer.autoClear = false;
        for (const point of spans.flat()) {
          material.uniforms.depth.value = Math.min(high, Math.max(low, at.copy(point).project(camera).z));
          const query = gl.createQuery(); queries.push(query);
          gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
          renderer.render(probeScene, probeCamera);
          gl.endQuery(gl.ANY_SAMPLES_PASSED);
        }
        // Sent now: a paused replay draws no frame that would send them, and its answer waited a second.
        gl.flush();
      } finally { renderer.autoClear = autoClear; renderer.setRenderTarget(previous); }
      return new Promise((resolve, reject) => {
        const end = () => { if (!gl.isContextLost()) for (const query of queries) gl.deleteQuery(query); };
        const poll = () => {
          if (disposed || gl.isContextLost()) { end(); reject(new Error('The pointer surface was disposed or lost its graphics context.')); return; }
          if (!queries.every(query => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true)) { setTimeout(poll, POLL_MS); return; }
          const passed = queries.map(query => Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT)));
          end();
          // The surface lies in a span when its start passes (in front of the surface, or on it) and its end does not.
          resolve(spans.findIndex((_span, i) => passed[2 * i] && !passed[2 * i + 1]));
        };
        setTimeout(poll, 0);
      });
    },
    dispose() {
      disposed = true;
      target.depthTexture?.dispose(); target.dispose(); quad.dispose(); material.dispose();
    },
  };
}
