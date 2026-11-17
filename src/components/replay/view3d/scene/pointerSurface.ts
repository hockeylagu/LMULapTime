import {
  DepthTexture, FloatType, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3, WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

/** The camera as a frame drew it (`SceneShell.drawnView`). */
export type DrawnCamera = PerspectiveCamera | OrthographicCamera;

export interface PointerSurface {
  /**
   * The nearest opaque surface `scene` draws under a point of the canvas (`x` and `y`, CSS pixels from its top left corner, of
   * `width` by `height`) from `view`, in scene coordinates; null where only the sky is. It draws that one pixel with the scene's own
   * materials, so glass and the cut-out parts of a fence let the surface behind through, as the frame does.
   */
  read(scene: Scene, view: DrawnCamera, x: number, y: number, width: number, height: number): Promise<Vector3 | null>;
  dispose(): void;
}

/** The depth of the drawn pixel, copied to a float colour (a depth attachment is not read back). */
const COPY_SHADER = {
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D depth; void main() { gl_FragColor = vec4(texture2D(depth, vec2(0.5)).r, 0.0, 0.0, 1.0); }',
};

export function createPointerSurface(renderer: WebGLRenderer): PointerSurface {
  const target = new WebGLRenderTarget(1, 1, {depthTexture: new DepthTexture(1, 1, FloatType)});
  const copy = new WebGLRenderTarget(1, 1, {type: FloatType, depthBuffer: false});
  const quad = new PlaneGeometry(2, 2), material = new ShaderMaterial({...COPY_SHADER, uniforms: {depth: {value: target.depthTexture}}, depthTest: false, depthWrite: false});
  const copyScene = new Scene(), copyCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  copyScene.add(new Mesh(quad, material));
  const cameras = {perspective: new PerspectiveCamera(), orthographic: new OrthographicCamera()};
  const pixel = new Float32Array(4);
  return {
    async read(scene, view, x, y, width, height) {
      // The drawn camera narrowed to the one pixel: the 1 by 1 target holds it, and only what lies along it is drawn.
      const camera = view instanceof PerspectiveCamera ? cameras.perspective.copy(view, false) : cameras.orthographic.copy(view, false);
      camera.setViewOffset(width, height, Math.floor(x), Math.floor(y), 1, 1);
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        renderer.setRenderTarget(copy); renderer.render(copyScene, copyCamera);
      } finally { renderer.setRenderTarget(previous); }
      await renderer.readRenderTargetPixelsAsync(copy, 0, 0, 1, 1, pixel);
      // The cleared depth is the far plane: 0 in a reversed depth buffer, else 1.
      const reversed = renderer.capabilities.reversedDepthBuffer, depth = pixel[0];
      if (reversed ? depth <= 0 : depth >= 1) return null;
      // Back through the camera as drawn, at the pixel's centre.
      const ndc = new Vector3(((Math.floor(x) + 0.5) / width) * 2 - 1, 1 - ((Math.floor(y) + 0.5) / height) * 2, reversed ? depth : depth * 2 - 1);
      return ndc.applyMatrix4(view.projectionMatrixInverse).applyMatrix4(view.matrixWorld);
    },
    dispose() {
      target.depthTexture?.dispose(); target.dispose(); copy.dispose(); quad.dispose(); material.dispose();
    },
  };
}
