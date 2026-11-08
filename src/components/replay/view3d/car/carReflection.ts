import { CubeCamera, HalfFloatType, MeshStandardMaterial, PMREMGenerator, WebGLCubeRenderTarget, type Mesh, type WebGLRenderTarget, type Object3D, type Scene, type Texture, type Vector3, type WebGLRenderer } from 'three';

/**
 * Face size (256, as the sky environment's PMREM: the car programs compile once for either), and how far each face sees: beyond
 * 300 m the sky shows. Each face draws its share of the scenery, so the reach is the probe's cost: at 1.5 km Silverstone's
 * frames doubled (p50 7 → 14 ms, production pass); at 300 m they match the frame without the probe.
 */
const FACE_PX = 256, NEAR_M = 0.5, FAR_M = 300;
/** A paused view keeps its finished probe until the car or the scenery moves. */
const MOVED_M = 0.5;

export interface CarReflection {
  /** The car that takes the reflection: its materials sample the probe once the first one is complete. Hidden while faces render. */
  setCar(car: Object3D, hidden: Object3D): void;
  /** The resident scenery changed: render a new probe even if the car has not moved. */
  stale(): void;
  /**
   * Renders the next cube face around `centre` (the car, in scene coordinates), one face a frame so no frame pays for all six.
   * True until the frame that shows a finished probe: the caller renders another frame.
   */
  update(centre: Vector3): boolean;
  dispose(): void;
}

/**
 * Reflects the scenery in the cars, in place of the sky environment the scenery uses. The standard three technique: a cube camera at the car,
 * rendering the scene without the cars, convolved into a prefiltered environment (PMREM) for the car materials when the sixth
 * face completes. Faces render after the frame, against its current shadow map. The convolution runs here, between frames: given
 * the cube itself, three converts it in the middle of drawing the car, and that nested render left the car's material one texture
 * unit over the GPU's 16.
 */
export function createCarReflection(renderer: WebGLRenderer, scene: Scene): CarReflection {
  const target = new WebGLCubeRenderTarget(FACE_PX, {type: HalfFloatType, generateMipmaps: false});
  const camera = new CubeCamera(NEAR_M, FAR_M, target);
  // Compiled now, while the scene loads, so the first probe does not stall a frame.
  const generator = new PMREMGenerator(renderer); generator.compileCubemapShader();
  let materials: MeshStandardMaterial[] = [], hidden: Object3D | null = null, face = 0, stale = true, prefiltered: WebGLRenderTarget | null = null;
  const at = camera.position.clone(), probed = camera.position.clone();
  const takeReflection = (texture: Texture) => {
    for (const material of materials) if (material.envMap === null) material.envMap = texture;
  };
  return {
    setCar(car, nextHidden) {
      // The lit materials, which otherwise take the scene's sky environment (unlit ones such as the contact shadow reflect nothing).
      const found = new Set<MeshStandardMaterial>();
      car.traverse(object => {
        const material: unknown = (object as Partial<Mesh>).material;
        for (const entry of Array.isArray(material) ? material as unknown[] : [material]) if (entry instanceof MeshStandardMaterial) found.add(entry);
      });
      materials = [...found]; hidden = nextHidden;
      if (prefiltered) takeReflection(prefiltered.texture);
    },
    stale() { stale = true; },
    update(centre) {
      if (face === 0) {
        if (!stale && prefiltered && probed.distanceToSquared(centre) < MOVED_M * MOVED_M) return false;
        at.copy(centre); stale = false;
      }
      if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
      camera.position.copy(at); camera.updateMatrixWorld();
      const previous = renderer.getRenderTarget(), shadowUpdate = renderer.shadowMap.autoUpdate, shown = hidden?.visible ?? false;
      try {
        if (hidden) hidden.visible = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(target, face);
        renderer.render(scene, camera.children[face] as Parameters<WebGLRenderer['render']>[1]);
      } finally {
        if (hidden) hidden.visible = shown;
        renderer.shadowMap.autoUpdate = shadowUpdate; renderer.setRenderTarget(previous);
      }
      face = (face + 1) % 6;
      if (face > 0) return true;
      probed.copy(at);
      const first = !prefiltered;
      prefiltered = generator.fromCubemap(target.texture, prefiltered);
      if (first) takeReflection(prefiltered.texture);
      return true; // The next frame shows the new probe.
    },
    dispose() {
      for (const material of materials) if (material.envMap === prefiltered?.texture) material.envMap = null;
      target.dispose(); prefiltered?.dispose(); generator.dispose();
    },
  };
}
