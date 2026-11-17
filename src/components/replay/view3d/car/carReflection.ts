import { Box3, CubeCamera, HalfFloatType, LinearMipmapLinearFilter, MeshStandardMaterial, PMREMGenerator, ShaderChunk, Vector3, WebGLCubeRenderTarget, type IUniform, type Material, type Mesh, type Object3D, type Scene, type Texture, type WebGLRenderer } from 'three';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { convolveReflection, type ReflectionCubes } from '../reflectionCube.js';
import { SCENERY_REFLECTION_GLSL, sceneryReflectionUniforms } from '../scenery/materials/sceneryReflection.js';
import { isCarPaint, setPaintReflection } from './carPaint.js';
import { createOverheadMap, OVERHEAD_GLSL, overheadUniforms, type CarOverhead } from './overheadMap.js';

/**
 * Face size as the reference frames' reflections (2026-11-09): 1024 px a face. One face a frame, so a probe renews every eight
 * frames (six faces, then its two conversions): each face is a full scenery pass, and three a frame cost ~5 ms of a Silverstone frame (user, 2026-11-11). How far each
 * face sees: beyond 150 m the sky shows, the range the reference reflections reach. Each face draws its share of the scenery, so
 * the reach is the probe's cost: at 1.5 km Silverstone's frames doubled (p50 7 → 14 ms, production pass); at 300 m they matched
 * the frame without the probe.
 */
export const CAR_REFLECTION_PX = 1024;
const FACES_PER_FRAME = 1, NEAR_M = 0.1, FAR_M = 150;
/**
 * Updates a probe takes: its faces, then three's prefilter and the paint's convolution, each in a frame of its own (together with
 * the last face they made every sixth frame the slowest of a playing lap, 2026-11-12). With the reflection set it takes fewer.
 */
export const CAR_REFLECTION_STEPS = 6 / FACES_PER_FRAME + 2;
/**
 * With the game's reflection set (scenery/reflectionSet.ts) a face is a few draws of few triangles, and the probe draws three faces
 * a frame, a cube every two frames, as a capture of the game's own car cube shows (2026-11-16). The conversions ride with the faces:
 * the prefilter with the last three, the convolution with the next cube's first three, so every frame carries one step.
 */
const SET_FACES_PER_FRAME = 3;
/**
 * Once the car has a probe, a face renders every other frame (the frames between ask for the next): the probe renews every
 * 14 frames instead of 8 and costs half as much a frame (a face is ~2.4 ms of GPU at the Le Mans start, 2026-11-13). The first
 * probe still renders a face a call, so the scene completes it before its first frame.
 */
const FRAMES_PER_FACE = 2;
/** A paused view keeps its finished probe until the car or the scenery moves. */
const MOVED_M = 0.5;
/** The probe's eye above the centre of the car's bounding box: roof height, as the reference frames place it (0.72 m on a GT3). */
const EYE_ABOVE_CENTRE_M = 0.72;

/** What the faces draw in place of the scenery (`scenery`, shown outside the faces): the game's reflection set (`set`, hidden outside them). */
export interface ReflectionFaces { set: Object3D; scenery: Object3D }

export interface CarReflection {
  /** The car that takes the reflection: its materials sample the probe, which is empty until the first one is complete (the scene
   * completes it before the first frame). Hidden while faces render. */
  setCar(car: Object3D, hidden: Object3D): void;
  /**
   * Another car near the reflected one reflects its probe too, as the reference's other cars reflect the player's car cube: its paint
   * reads the probe's cubes, its other lit materials (glass, trim, mirrors) the prefiltered one, in place of the venue's view from
   * one place of the circuit. Their programs are then the reflected car's: following a car of another body links nothing new. Its
   * surface-program parts keep the venue's cube.
   */
  share(car: Object3D): void;
  /** The resident scenery changed: render a new probe even if the car has not moved. */
  stale(): void;
  /**
   * Renders the next cube face from the car's roof, given the car's position in scene coordinates, one face a frame so no
   * frame pays for all six; the two frames after the last face convert the cube. True until the frame that shows a finished probe: the caller renders another frame.
   * On a `busy` frame (one already carrying heavy work) a probe that has one leaves its step to the next frame, never two in a row.
   */
  update(car: Vector3, busy?: boolean): boolean;
  dispose(): void;
}

/** The probe's convolved cube of each car material drawn by the surface program, once its car has one, and what stands over the car. */
const surfaceCubes = new WeakMap<Material, {cube: Texture | null; overhead: CarOverhead | null}>();

/** The scenery rule's probe read, and the uniforms it follows. */
const SURFACE_READ = 'vec3 light = surface_reflectionReady > 0.5 ? textureLod(surface_reflection, r, surface_reflectionLodScale * roughness).rgb : radiance;';
const SURFACE_UNIFORMS = 'uniform float surface_reflectionReady, surface_reflectionLodScale, surface_dielectricF0;';
/** three's environment read, which the car's other surface-program materials (glass, screens) take from the probe's prefiltered cube. */
const IBL_READ = 'vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
for (const [chunk, line] of [[SCENERY_REFLECTION_GLSL, SURFACE_READ], [SCENERY_REFLECTION_GLSL, SURFACE_UNIFORMS], [ShaderChunk.lights_fragment_maps, IBL_READ]]) {
  if (!chunk.includes(line)) throw Error(`A reflection lookup changed: the car's overhead correction needs updating (${line})`);
}
/** The samplers the overhead correction adds to a car surface-program material: the overhead test's two maps and the venue's cube. */
export const CAR_SURFACE_OVERHEAD_UNITS = 3;

/**
 * The overhead correction (car/overheadMap.ts) of either read: where the scenery overhead makes the probe stale, the venue's convolved
 * cube by the scenery rule stands for the sky, or the probe is read toward that scenery from the face's eye. For three's read a
 * view-space direction d reads itself as both view and normal.
 */
const CAR_OVERHEAD_GLSL = `${OVERHEAD_GLSL}
  uniform samplerCube overhead_sky; uniform float overhead_skyLodScale;
  vec3 overheadSky(vec3 r, float roughness) { return textureLod(overhead_sky, r, overhead_skyLodScale * roughness).rgb; }
  #ifdef USE_ENVMAP
    vec3 carIBLRadiance(vec3 viewDir, vec3 n, float roughness) {
      vec3 light = getIBLRadiance(viewDir, n, roughness);
      vec4 fix = overheadFix(transformDirectionByInverseViewMatrix(reflect(-viewDir, n), viewMatrix));
      if (fix.w < 0.0) light = mix(light, overheadSky(fix.xyz, roughness), -fix.w);
      else if (fix.w > 0.0) {
        vec3 d = normalize((viewMatrix * vec4(fix.xyz, 0.0)).xyz);
        light = mix(light, getIBLRadiance(d, d, roughness), fix.w);
      }
      return light;
    }
  #endif
`;
const CAR_SURFACE_GLSL = `${SURFACE_UNIFORMS}
  vec3 carSurfaceReflection(vec3 seen, vec3 r, float roughness) {
    vec4 fix = overheadFix(r);
    vec3 light = seen;
    if (fix.w < 0.0) light = mix(seen, overheadSky(r, roughness), -fix.w);
    else if (fix.w > 0.0) light = mix(seen, textureLod(surface_reflection, fix.xyz, surface_reflectionLodScale * roughness).rgb, fix.w);
    return light;
  }
`;

/**
 * Makes a car material drawn by the surface program (lamp housings and covers, wheels, trim) reflect its own car's probe: the
 * program's shared reflection uniforms point at the venue's cube, a view from one place of the circuit. The same rule and
 * values read the car's convolved cube instead; a car without a probe keeps the venue's.
 */
export function bindCarSurfaceReflection(material: MeshStandardMaterial): void {
  const own: {cube: Texture | null; overhead: CarOverhead | null} = {cube: null, overhead: null}, bound = material.onBeforeCompile.bind(material);
  const cube: IUniform<Texture | null> = {get value() { return own.cube ?? sceneryReflectionUniforms.surface_reflection.value; }};
  const ready: IUniform<number> = {get value() { return own.cube ? 1 : sceneryReflectionUniforms.surface_reflectionReady.value; }};
  surfaceCubes.set(material, own);
  material.onBeforeCompile = (shader, renderer) => {
    bound(shader, renderer);
    shader.uniforms.surface_reflection = cube; shader.uniforms.surface_reflectionReady = ready;
    // Corrected only while the material reads its own car's probe and the venue's cube stands ready for the sky.
    Object.assign(shader.uniforms, overheadUniforms(() => own.cube && sceneryReflectionUniforms.surface_reflectionReady.value > 0.5 ? own.overhead : null), {
      overhead_sky: sceneryReflectionUniforms.surface_reflection, overhead_skyLodScale: sceneryReflectionUniforms.surface_reflectionLodScale,
    });
    const fragment = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${CAR_OVERHEAD_GLSL}`);
    shader.fragmentShader = fragment.includes(SURFACE_READ)
      ? fragment.replace(SURFACE_UNIFORMS, CAR_SURFACE_GLSL).replace(SURFACE_READ, `${SURFACE_READ}\n    light = carSurfaceReflection(light, r, roughness);`)
      : fragment.replace(IBL_READ, 'vec3 iblRadiance = carIBLRadiance( geometryViewDir, geometryNormal, material.roughness );');
  };
  // Its program is no longer the scenery's of the same configuration.
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}-car`;
}

function setSurfaceReflection(material: Material, cubes: ReflectionCubes | null, overhead: CarOverhead | null): boolean {
  const own = surfaceCubes.get(material);
  if (own) { own.cube = cubes?.convolved ?? null; own.overhead = overhead; }
  return own !== undefined;
}

/**
 * Reflects the scenery in the cars, in place of the sky environment the scenery uses: a cube camera at the car, rendering the scene
 * without the cars. When the sixth face completes, the cube is convolved with the package's kernels for the car paint (which reads
 * the sharp cube and the convolved one by its own rule) and prefiltered by three (PMREM) for the car's other lit materials. Faces
 * render after the frame, against its current shadow cascades. Both conversions run here, between frames: given the cube itself,
 * three converts it in the middle of drawing the car, and that nested render left the car's material one texture unit over the
 * GPU's 16. The cube's mips, which the kernels read, regenerate after the last face only. The faces draw into a second cube while
 * the car shows the finished one (the paint reads the sharp cube itself): read while drawn, the paint mixed faces of two probes
 * with the mips of the older one, and popped at every eighth frame. The two cubes swap once a probe is converted.
 */
export function createCarReflection(renderer: WebGLRenderer, scene: Scene, shading: SceneryShading, faces: ReflectionFaces | null = null): CarReflection {
  const facesPerFrame = faces ? SET_FACES_PER_FRAME : FACES_PER_FRAME, framesPerFace = faces ? 1 : FRAMES_PER_FACE;
  const cube = () => new WebGLCubeRenderTarget(CAR_REFLECTION_PX, {type: HalfFloatType, generateMipmaps: false, minFilter: LinearMipmapLinearFilter});
  const targets = [cube(), cube()];
  /** The cube the faces draw into; the other one is shown. */
  let target = targets[0];
  const camera = new CubeCamera(NEAR_M, FAR_M, target);
  // The prefiltered target exists from the start, converted from the empty cube: its size is a program define, so a car's
  // materials take it when the car is set and compile once, with the scene's warm-up, instead of again at the first probe.
  const generator = new PMREMGenerator(renderer); renderer.initRenderTarget(target);
  const prefiltered: WebGLCubeRenderTarget = generator.fromCubemap(target.texture);
  /** What stands over the scenery around the car, and the shown probe's face eyes: the paint tells where the probe is stale. */
  const map = createOverheadMap(renderer, scene), overhead: CarOverhead = {map, eyes: new Float32Array(18)}, drawnEyes = new Float32Array(18);
  let materials: MeshStandardMaterial[] = [], hidden: Object3D | null = null, face = 0, stale = true, rested = 0, deferred = false;
  /** The paint of the cars sharing the probe (`share`), until each material is disposed. */
  const sharedPaint = new Set<Material>();
  const forget = (event: {target: Material}) => { sharedPaint.delete(event.target); };
  /** What the next update does once the faces are drawn: prefilter them for three's materials, then convolve them for the paint. */
  let pending: 'prefilter' | 'convolve' | null = null;
  let cubes: ReflectionCubes | null = null, eyeAbove = EYE_ABOVE_CENTRE_M;
  const at = new Vector3(), probed = new Vector3(), box = new Box3(), measure = new Vector3();
  const prefilter = () => { generator.fromCubemap(target.texture, prefiltered); pending = 'convolve'; };
  const takeReflection = () => {
    for (const material of materials) {
      setSurfaceReflection(material, cubes, overhead);
      if (!setPaintReflection(material, cubes, overhead) && material.envMap === null) material.envMap = prefiltered.texture;
    }
    for (const paint of sharedPaint) setPaintReflection(paint, cubes, overhead);
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
      takeReflection();
    },
    share(car) {
      car.traverse(object => {
        const material: unknown = (object as Partial<Mesh>).material;
        for (const entry of Array.isArray(material) ? material as unknown[] : [material]) {
          if (!(entry instanceof MeshStandardMaterial)) continue;
          if (isCarPaint(entry)) {
            if (!sharedPaint.has(entry)) { sharedPaint.add(entry); entry.addEventListener('dispose', forget); }
            setPaintReflection(entry, cubes, overhead);
          } else if (entry.envMap === null) entry.envMap = prefiltered.texture;
        }
      });
    },
    stale() { stale = true; map.stale(); },
    update(car, busy = false) {
      // A step stacked on a busy frame made it one of the slowest of a race start (a face and a shadow redraw, 2026-11-15).
      const faceDue = (face > 0 || stale || probed.distanceToSquared(car) >= MOVED_M * MOVED_M) && (rested + 1) % framesPerFace === 0;
      if (busy && cubes && !deferred && (pending !== null || faceDue)) { deferred = true; return true; }
      deferred = false;
      // The map is drawn before the faces it is read with.
      if (map.update(car, hidden ? [hidden] : [], busy)) takeReflection();
      // With the set, the convolution shares its frame with the next cube's first faces, which draw into the cube just let go.
      let converted = false;
      if (pending === 'convolve') {
        pending = null;
        cubes = convolveReflection(renderer, target, shading.convolution.kernels, cubes ?? undefined); // Reuses its cube after the first probe.
        overhead.eyes.set(drawnEyes);
        takeReflection(); // The paint's sharp cube is now the one just drawn.
        target = targets[target === targets[0] ? 1 : 0];
        if (!faces) return true; // The next frame shows the new probe.
        converted = true;
      } else if (pending === 'prefilter' && !faces) {
        prefilter();
        return true;
      }
      if (face === 0 && !stale && cubes && probed.distanceToSquared(car) < MOVED_M * MOVED_M) return converted;
      if (cubes && ++rested % framesPerFace !== 0) return true;
      if (face === 0) stale = false;
      // Each face from where the car is now, not where the probe began: the faces render against the frame's shadows, so a face
      // drawn from a place the car has left saw sunlit road where its own shadow had been, and the cockpit roof, which reflects
      // the road below, lit up while the car moved.
      at.copy(car);
      if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
      camera.position.copy(at); camera.position.y += eyeAbove; camera.updateMatrixWorld();
      for (let each = face; each < face + facesPerFrame; each++) camera.position.toArray(drawnEyes, each * 3);
      const previous = renderer.getRenderTarget(), shown = hidden?.visible ?? false;
      try {
        if (hidden) hidden.visible = false;
        if (faces) { faces.scenery.visible = false; faces.set.visible = true; }
        for (const last = face + facesPerFrame; face < last; face++) {
          target.texture.generateMipmaps = face === 5;
          renderer.setRenderTarget(target, face);
          renderer.render(scene, camera.children[face] as Parameters<WebGLRenderer['render']>[1]);
        }
      } finally {
        if (hidden) hidden.visible = shown;
        if (faces) { faces.scenery.visible = true; faces.set.visible = false; }
        renderer.setRenderTarget(previous);
      }
      face %= 6;
      if (face === 0) { probed.copy(at); pending = 'prefilter'; if (faces) prefilter(); }
      return true;
    },
    dispose() {
      for (const material of materials) {
        setSurfaceReflection(material, null, null);
        if (!setPaintReflection(material, null) && material.envMap === prefiltered.texture) material.envMap = null;
      }
      for (const paint of sharedPaint) { setPaintReflection(paint, null); paint.removeEventListener('dispose', forget); }
      sharedPaint.clear();
      for (const each of targets) each.dispose();
      prefiltered.dispose(); cubes?.dispose(); generator.dispose(); map.dispose();
    },
  };
}
