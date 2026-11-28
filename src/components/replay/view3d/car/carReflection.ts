import { CubeCamera, HalfFloatType, LinearMipmapLinearFilter, PMREMGenerator, Vector3, WebGLCubeRenderTarget, type IUniform, type Material, type Mesh, type Object3D, type Scene, type Texture, type WebGLRenderer } from 'three';
import type { SceneryShading } from '../../../../../shared/types/scenes/scenery.js';
import { convolveReflection, type ReflectionCubes } from '../reflectionCube.js';
import { reflectionPart, sceneryReflectionUniforms } from '../scenery/materials/sceneryReflection.js';
import { composedTemplate, type ShaderPart } from '../shaders/composer.js';
import { litTemplate, ownEnvironment, setOwnEnvironment } from '../shaders/litTemplate.js';
import { isPlainSurface } from '../shaders/plainSurface.js';
import { withoutCarSpots } from '../night/carSpots.js';
import type { CarAppearance } from '../../../../../shared/types/scenes/car.js';
import { isCarPaint, setPaintBox, setPaintReflection } from './carPaint.js';
import { modelBox } from '../cars/carParts.js';
import { createOverheadMap, OVERHEAD_GLSL, overheadUniforms, type CarOverhead } from './overheadMap.js';

/**
 * Face size as the reference frames' reflections (2026-11-09): 1024 px a face, the package's `reflection.textureSize` at every venue.
 */
export const CAR_REFLECTION_PX = 1024;
const NEAR_M = 0.1;
/**
 * The probe draws the scenery parts the game reflects in its car cube (the package's `lmuReflect` nodes, out to its clip distance), three faces a frame: a cube every two frames, as a capture of the game's own car cube shows (2026-11-16). The conversions ride with the faces: three's
 * prefilter with the last three, the paint's convolution with the next cube's first three, so every frame carries one step.
 * A frame past its time budget draws no more faces (one at least): at Spa the three faces cost about as much as the frame's own
 * pass and made most of its slowest frames (2026-11-27).
 */
const FACES_PER_FRAME = 3;
/** Updates a first probe takes: its faces, then the frame of its convolution. */
export const CAR_REFLECTION_STEPS = 6 / FACES_PER_FRAME + 1;
/** A paused view keeps its finished probe until the car or the scenery moves. */
const MOVED_M = 0.5;
/** The probe's eye above the centre of the car's bounding box: roof height, as the reference frames place it (0.72 m on a GT3). */
const EYE_ABOVE_CENTRE_M = 0.72;

/**
 * The scenery the faces leave out: the parts the game does not reflect (their batches and own draws), hidden while the faces render;
 * and how far a face sees, the package's `reflection.observedClipM` (beyond it the sky shows).
 */
export interface ReflectionFaces { notReflected(): Iterable<Object3D>; clipM: number }

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
   * Renders the next three cube faces from the car's roof, given the car's position in scene coordinates, and the conversion step
   * due. True until the frame that shows a finished probe: the caller renders another frame. On a `busy` frame (one already
   * carrying heavy work) a probe that has one leaves its step to the next frame, never two in a row. Past `until` (a
   * `performance.now()` time) it draws no further face, one at least.
   */
  update(car: Vector3, busy?: boolean, until?: number): boolean;
  dispose(): void;
}

/** The probe each car material reads by the scenery's rule or corrects overhead, once its car has one, and what stands over the car. */
interface CarProbe { cube: Texture | null; overhead: CarOverhead | null }
const surfaceProbes = new WeakMap<Material, CarProbe>();

/** The samplers the overhead correction adds to a car surface's program: the overhead test's two maps and the venue's cube. */
export const CAR_SURFACE_OVERHEAD_UNITS = 3;

/** The overhead test (car/overheadMap.ts) and the venue's convolved cube read by the scenery rule, which stands for the sky. */
const OVERHEAD_SKY_GLSL = `${OVERHEAD_GLSL}
  uniform samplerCube overhead_sky;
  vec3 overheadSky(vec3 r, float roughness) { return textureLod(overhead_sky, r, surface_reflectionLodScale * roughness).rgb; }`;

/**
 * The overhead correction (car/overheadMap.ts) of three's environment read `light` along the view's reflection: where the scenery
 * overhead makes the probe stale, the venue's cube stands for the sky, or the probe is read toward that scenery from the face's
 * eye. A view-space direction d reads itself as both view and normal.
 */
const ENVIRONMENT_OVERHEAD_GLSL = `${OVERHEAD_SKY_GLSL}
  vec3 carOverheadRadiance(vec3 light, vec3 viewDir, vec3 n, float roughness) {
    vec4 fix = overheadFix(transformDirectionByInverseViewMatrix(reflect(-viewDir, n), viewMatrix));
    if (fix.w < 0.0) light = mix(light, overheadSky(fix.xyz, roughness), -fix.w);
    else if (fix.w > 0.0) {
      vec3 d = normalize((viewMatrix * vec4(fix.xyz, 0.0)).xyz);
      light = mix(light, getIBLRadiance(d, d, roughness), fix.w);
    }
    return light;
  }
`;

/** The same of the scenery rule's read `seen` along world direction `r`, the probe read again toward the scenery. */
const RULE_OVERHEAD_GLSL = `${OVERHEAD_SKY_GLSL}
  vec3 carSurfaceReflection(vec3 seen, vec3 r, float roughness) {
    vec4 fix = overheadFix(r);
    vec3 light = seen;
    if (fix.w < 0.0) light = mix(seen, overheadSky(r, roughness), -fix.w);
    else if (fix.w > 0.0) light = mix(seen, textureLod(surface_reflection, fix.xyz, surface_reflectionLodScale * roughness).rgb, fix.w);
    return light;
  }`;

/**
 * How a car material drawn by the surface program (lamp housings and covers, wheels, trim, glass, screens) reflects its own car's
 * probe. A kind reflecting by the scenery rule (`reflects`) reads the car's convolved cube by the same rule and values in place of
 * the venue's (a view from one place of the circuit), the venue's while the car has no probe; the others read three's environment,
 * which is the probe's prefiltered cube once their car has one (`setOwnEnvironment`). `overhead`: whether the read also takes the
 * overhead correction (`CAR_SURFACE_OVERHEAD_UNITS` more samplers), which a material at the texture unit limit goes without. `bind`
 * makes the material built with the parts the one the probe reaches.
 */
export function carSurfaceProbe(reflects: boolean, overhead: boolean): {parts: ShaderPart[]; bind: (material: Material) => void} {
  const own: CarProbe = {cube: null, overhead: null};
  // Corrected only while the material reads its own car's probe and the venue's cube stands ready for the sky.
  const corrected = (): Record<string, IUniform> => ({
    ...overheadUniforms(() => own.cube && sceneryReflectionUniforms.surface_reflectionReady.value > 0.5 ? own.overhead : null),
    overhead_sky: sceneryReflectionUniforms.surface_reflection,
  });
  const bind = (material: Material) => { surfaceProbes.set(material, own); };
  if (reflects) {
    const uniforms = {
      ...sceneryReflectionUniforms,
      surface_reflection: {get value() { return own.cube ?? sceneryReflectionUniforms.surface_reflection.value; }},
      surface_reflectionReady: {get value() { return own.cube ? 1 : sceneryReflectionUniforms.surface_reflectionReady.value; }},
      ...(overhead ? corrected() : {}),
    };
    return {parts: [reflectionPart('carSurfaceReflection', uniforms, overhead ? {declarations: RULE_OVERHEAD_GLSL, afterRead: '\n    light = carSurfaceReflection(light, r, roughness);'} : undefined)], bind};
  }
  if (!overhead) return {parts: [], bind};
  return {
    parts: [{
      name: 'carOverhead',
      slots: {
        fragmentPars: {at: 30, glsl: ENVIRONMENT_OVERHEAD_GLSL},
        fragmentReflection: {at: 0, glsl: '  radiance = carOverheadRadiance( radiance, geometryViewDir, geometryNormal, material.roughness );'},
      },
      uniforms: corrected,
    }],
    bind,
  };
}

function setSurfaceReflection(material: Material, cubes: ReflectionCubes | null, overhead: CarOverhead | null): void {
  const own = surfaceProbes.get(material);
  if (own) { own.cube = cubes?.convolved ?? null; own.overhead = overhead; }
}

/**
 * The car materials that read the probe's prefiltered cube as their environment once their car has one: lit composed ones but the
 * plain surfaces (a rear-view mirror's dark glass, the pose marker) and the paint, which reads the probe's cubes by its own rule.
 */
const takesEnvironment = (material: Material) => composedTemplate(material) === litTemplate && !isPlainSurface(material) && !isCarPaint(material);
/**
 * Reflects the scenery in the cars, in place of the sky environment the scenery uses: a cube camera at the car, rendering the
 * scenery the game reflects (all but `faces.notReflected`) without the cars. When the sixth face completes, the cube is prefiltered by three (PMREM) for the
 * car's other lit materials and, the next frame, convolved with the package's kernels for the car paint (which reads the sharp
 * cube and the convolved one by its own rule). Faces render after the frame, against its current shadow cascades. Both
 * conversions run here, between frames: given the cube itself, three converts it in the middle of drawing the car, and that nested
 * render left the car's material one texture unit over the GPU's 16. The cube's mips, which the kernels read, regenerate after the
 * last face only. The faces draw into a second cube while the car shows the finished one (the paint reads the sharp cube itself):
 * read while drawn, the paint mixed faces of two probes with the mips of the older one, and popped at each new probe. The two
 * cubes swap once a probe is converted.
 */
export function createCarReflection(renderer: WebGLRenderer, scene: Scene, shading: SceneryShading, faces: ReflectionFaces): CarReflection {
  const cube = () => new WebGLCubeRenderTarget(CAR_REFLECTION_PX, {type: HalfFloatType, generateMipmaps: false, minFilter: LinearMipmapLinearFilter});
  const targets = [cube(), cube()];
  /** The cube the faces draw into; the other one is shown. */
  let target = targets[0];
  const camera = new CubeCamera(NEAR_M, faces.clipM, target);
  // The prefiltered target exists from the start, converted from the empty cube, so a car's materials take it as their own
  // environment when the car is set (its last level a uniform, litTemplate.ts) and the warm-up uploads it with them.
  const generator = new PMREMGenerator(renderer); renderer.initRenderTarget(target);
  const prefiltered: WebGLCubeRenderTarget = generator.fromCubemap(target.texture);
  /** What stands over the scenery around the car, and the shown probe's face eyes: the paint tells where the probe is stale. */
  const map = createOverheadMap(renderer, scene), overhead: CarOverhead = {map, eyes: new Float32Array(18)}, drawnEyes = new Float32Array(18);
  let materials: Material[] = [], hidden: Object3D | null = null, face = 0, stale = true, deferred = false;
  /** The parts a face pass hid, reused from pass to pass. */
  const left: Object3D[] = [];
  /** The paint of the cars sharing the probe (`share`), until each material is disposed. */
  const sharedPaint = new Set<Material>();
  const forget = (event: {target: Material}) => { sharedPaint.delete(event.target); };
  /** The faces are drawn and prefiltered: the next update convolves them for the paint. */
  let convolving = false;
  let cubes: ReflectionCubes | null = null, eyeAbove = EYE_ABOVE_CENTRE_M;
  const at = new Vector3(), probed = new Vector3(), measure = new Vector3();
  const takeReflection = () => {
    for (const material of materials) {
      setSurfaceReflection(material, cubes, overhead);
      setPaintReflection(material, cubes, overhead);
      if (takesEnvironment(material) && ownEnvironment(material) === null) setOwnEnvironment(material, prefiltered.texture);
    }
    for (const paint of sharedPaint) setPaintReflection(paint, cubes, overhead);
  };
  return {
    setCar(car, nextHidden) {
      // The lit materials, which otherwise take the scene's sky environment (unlit ones such as the contact shadow reflect nothing).
      const found = new Set<Material>();
      car.traverse(object => {
        const material = (object as Partial<Mesh>).material;
        for (const entry of material === undefined ? [] : [material].flat()) if (composedTemplate(entry) === litTemplate) found.add(entry);
      });
      materials = [...found]; hidden = nextHidden;
      // Its paint reads the probe within its reflection box, which its body model carries (cars/carModels.ts).
      let framed: Object3D | undefined;
      car.traverse(object => { if (!framed && Array.isArray(object.userData.reflectionBox)) framed = object; });
      setPaintBox(framed ?? null, framed?.userData.reflectionBox as CarAppearance['reflectionBox'] | undefined);
      // The eye sits over the car's bounding-box centre, wherever the car's origin is within it.
      const box = modelBox(car);
      eyeAbove = EYE_ABOVE_CENTRE_M + (box.isEmpty() ? 0 : box.getCenter(measure).y);
      takeReflection();
    },
    share(car) {
      car.traverse(object => {
        const material = (object as Partial<Mesh>).material;
        for (const entry of material === undefined ? [] : [material].flat()) {
          if (isCarPaint(entry)) {
            if (!sharedPaint.has(entry)) { sharedPaint.add(entry); entry.addEventListener('dispose', forget); }
            setPaintReflection(entry, cubes, overhead);
          } else if (takesEnvironment(entry) && ownEnvironment(entry) === null) setOwnEnvironment(entry, prefiltered.texture);
        }
      });
    },
    stale() { stale = true; map.stale(); },
    update(car, busy = false, until = Infinity) {
      // A step stacked on a busy frame made it one of the slowest of a race start (a face and a shadow redraw, 2026-11-15).
      const moved = probed.distanceToSquared(car) >= MOVED_M * MOVED_M;
      if (busy && cubes && !deferred && (convolving || face > 0 || stale || moved)) { deferred = true; return true; }
      deferred = false;
      // The map is drawn before the faces it is read with.
      if (map.update(car, hidden ? [hidden] : [], busy)) takeReflection();
      // The convolution shares its frame with the next cube's first faces, which draw into the cube just let go.
      let converted = false;
      if (convolving) {
        convolving = false;
        cubes = convolveReflection(renderer, target, shading.convolution.kernels, cubes ?? undefined); // Reuses its cube after the first probe.
        overhead.eyes.set(drawnEyes);
        takeReflection(); // The paint's sharp cube is now the one just drawn.
        target = targets[target === targets[0] ? 1 : 0];
        converted = true;
      }
      if (face === 0 && !stale && cubes && !moved) return converted;
      if (face === 0) stale = false;
      // Each face from where the car is now, not where the probe began: the faces render against the frame's shadows, so a face
      // drawn from a place the car has left saw sunlit road where its own shadow had been, and the cockpit roof, which reflects
      // the road below, lit up while the car moved.
      at.copy(car);
      if (camera.coordinateSystem !== renderer.coordinateSystem) { camera.coordinateSystem = renderer.coordinateSystem; camera.updateCoordinateSystem(); }
      camera.position.copy(at); camera.position.y += eyeAbove; camera.updateMatrixWorld();
      const first = face, last = Math.min(6, face + FACES_PER_FRAME);
      const previous = renderer.getRenderTarget(), shown = hidden?.visible ?? false;
      left.length = 0;
      for (const object of faces.notReflected()) if (object.visible) left.push(object);
      try {
        if (hidden) hidden.visible = false;
        for (const object of left) object.visible = false;
        withoutCarSpots(() => {
          for (; face < last && (face === first || performance.now() < until); face++) {
            camera.position.toArray(drawnEyes, face * 3);
            target.texture.generateMipmaps = face === 5;
            renderer.setRenderTarget(target, face);
            renderer.render(scene, camera.children[face] as Parameters<WebGLRenderer['render']>[1]);
          }
        });
      } finally {
        if (hidden) hidden.visible = shown;
        for (const object of left) object.visible = true;
        renderer.setRenderTarget(previous);
      }
      face %= 6;
      if (face === 0) { probed.copy(at); generator.fromCubemap(target.texture, prefiltered); convolving = true; }
      return true;
    },
    dispose() {
      for (const material of materials) {
        setSurfaceReflection(material, null, null);
        setPaintReflection(material, null);
        if (ownEnvironment(material) === prefiltered.texture) setOwnEnvironment(material, null);
      }
      for (const paint of sharedPaint) { setPaintReflection(paint, null); paint.removeEventListener('dispose', forget); }
      sharedPaint.clear(); setPaintBox(null);
      for (const each of targets) each.dispose();
      prefiltered.dispose(); cubes?.dispose(); generator.dispose(); map.dispose();
    },
  };
}
