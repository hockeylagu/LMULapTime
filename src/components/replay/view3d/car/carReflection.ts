import { Box3, CubeCamera, HalfFloatType, LinearMipmapLinearFilter, MeshStandardMaterial, PMREMGenerator, Vector3, WebGLCubeRenderTarget, type IUniform, type Material, type Mesh, type WebGLRenderTarget, type Object3D, type Scene, type Texture, type WebGLRenderer } from 'three';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { convolveReflection, type ReflectionCubes } from '../reflectionCube.js';
import { sceneryReflectionUniforms } from '../scenery/materials/sceneryReflection.js';
import { setPaintReflection } from './carPaint.js';

/**
 * Face size and renewal, as the reference frames' reflections (2026-11-09): 1024 px a face, three faces a frame, so a probe
 * renews every two frames. The car programs compile once more than at the sky environment's 256 px (the prefiltered size is a
 * program define). How far each face sees: beyond 150 m the sky shows, the range the reference reflections reach. Each face
 * draws its share of the scenery, so the reach is the probe's cost: at 1.5 km Silverstone's frames doubled (p50 7 → 14 ms,
 * production pass); at 300 m they matched the frame without the probe. Chosen before measuring the cost (user, 2026-11-09).
 */
const FACE_PX = 1024, FACES_PER_FRAME = 3, NEAR_M = 0.1, FAR_M = 150;
/** A paused view keeps its finished probe until the car or the scenery moves. */
const MOVED_M = 0.5;
/** The probe's eye above the centre of the car's bounding box: roof height, as the reference frames place it (0.72 m on a GT3). */
const EYE_ABOVE_CENTRE_M = 0.72;

export interface CarReflection {
  /** The car that takes the reflection: its materials sample the probe once the first one is complete. Hidden while faces render. */
  setCar(car: Object3D, hidden: Object3D): void;
  /** The resident scenery changed: render a new probe even if the car has not moved. */
  stale(): void;
  /**
   * Renders the next cube faces from the car's roof, given the car's position in scene coordinates, three faces a frame so no
   * frame pays for all six. True until the frame that shows a finished probe: the caller renders another frame.
   */
  update(car: Vector3): boolean;
  dispose(): void;
}

/** The probe's convolved cube of each car material drawn by the surface program, once its car has one. */
const surfaceCubes = new WeakMap<Material, {cube: Texture | null}>();

/**
 * Makes a car material drawn by the surface program (lamp housings and covers, wheels, trim) reflect its own car's probe: the
 * program's shared reflection uniforms point at the venue's cube, a view from one place of the circuit. The same rule and
 * values read the car's convolved cube instead; a car without a probe keeps the venue's.
 */
export function bindCarSurfaceReflection(material: MeshStandardMaterial): void {
  const own: {cube: Texture | null} = {cube: null}, bound = material.onBeforeCompile.bind(material);
  const cube: IUniform<Texture | null> = {get value() { return own.cube ?? sceneryReflectionUniforms.surface_reflection.value; }};
  const ready: IUniform<number> = {get value() { return own.cube ? 1 : sceneryReflectionUniforms.surface_reflectionReady.value; }};
  surfaceCubes.set(material, own);
  material.onBeforeCompile = (shader, renderer) => {
    bound(shader, renderer);
    shader.uniforms.surface_reflection = cube; shader.uniforms.surface_reflectionReady = ready;
  };
}

function setSurfaceReflection(material: Material, cubes: ReflectionCubes | null): boolean {
  const own = surfaceCubes.get(material);
  if (own) own.cube = cubes?.convolved ?? null;
  return own !== undefined;
}

/**
 * Reflects the scenery in the cars, in place of the sky environment the scenery uses: a cube camera at the car, rendering the scene
 * without the cars. When the sixth face completes, the cube is convolved with the package's kernels for the car paint (which reads
 * the sharp cube and the convolved one by its own rule) and prefiltered by three (PMREM) for the car's other lit materials. Faces
 * render after the frame, against its current shadow map. Both conversions run here, between frames: given the cube itself,
 * three converts it in the middle of drawing the car, and that nested render left the car's material one texture unit over the
 * GPU's 16. The cube's mips, which the kernels read, regenerate after the last face only.
 */
export function createCarReflection(renderer: WebGLRenderer, scene: Scene, shading: SceneryShading): CarReflection {
  const target = new WebGLCubeRenderTarget(FACE_PX, {type: HalfFloatType, generateMipmaps: false, minFilter: LinearMipmapLinearFilter});
  const camera = new CubeCamera(NEAR_M, FAR_M, target);
  // Compiled now, while the scene loads, so the first probe does not stall a frame.
  const generator = new PMREMGenerator(renderer); generator.compileCubemapShader();
  let materials: MeshStandardMaterial[] = [], hidden: Object3D | null = null, face = 0, stale = true, prefiltered: WebGLRenderTarget | null = null;
  let cubes: ReflectionCubes | null = null, eyeAbove = EYE_ABOVE_CENTRE_M;
  const at = new Vector3(), probed = new Vector3(), box = new Box3(), measure = new Vector3();
  const takeReflection = (texture: Texture) => {
    for (const material of materials) {
      setSurfaceReflection(material, cubes);
      if (!setPaintReflection(material, cubes) && material.envMap === null) material.envMap = texture;
    }
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
      // The eye sits over the car's bounding-box centre, wherever the car's origin is within it.
      car.updateWorldMatrix(true, true); box.setFromObject(car);
      eyeAbove = EYE_ABOVE_CENTRE_M + (box.isEmpty() ? 0 : box.getCenter(measure).y - car.getWorldPosition(measure).y);
      if (prefiltered) takeReflection(prefiltered.texture);
    },
    stale() { stale = true; },
    update(car) {
      if (face === 0) {
        if (!stale && prefiltered && probed.distanceToSquared(car) < MOVED_M * MOVED_M) return false;
        at.copy(car); stale = false;
      }
      if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
      camera.position.copy(at); camera.position.y += eyeAbove; camera.updateMatrixWorld();
      const previous = renderer.getRenderTarget(), shadowUpdate = renderer.shadowMap.autoUpdate, shown = hidden?.visible ?? false;
      try {
        if (hidden) hidden.visible = false;
        renderer.shadowMap.autoUpdate = false;
        for (const last = face + FACES_PER_FRAME; face < last; face++) {
          target.texture.generateMipmaps = face === 5;
          renderer.setRenderTarget(target, face);
          renderer.render(scene, camera.children[face] as Parameters<WebGLRenderer['render']>[1]);
        }
      } finally {
        if (hidden) hidden.visible = shown;
        renderer.shadowMap.autoUpdate = shadowUpdate; renderer.setRenderTarget(previous);
      }
      face %= 6;
      if (face > 0) return true;
      probed.copy(at);
      const first = !prefiltered;
      prefiltered = generator.fromCubemap(target.texture, prefiltered);
      cubes = convolveReflection(renderer, target, shading.convolution.kernels, cubes ?? undefined); // Reuses its cube after the first probe.
      if (first) takeReflection(prefiltered.texture);
      return true; // The next frame shows the new probe.
    },
    dispose() {
      for (const material of materials) {
        setSurfaceReflection(material, null);
        if (!setPaintReflection(material, null) && material.envMap === prefiltered?.texture) material.envMap = null;
      }
      target.dispose(); prefiltered?.dispose(); cubes?.dispose(); generator.dispose();
    },
  };
}
