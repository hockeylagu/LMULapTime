import { Box3, Group, MathUtils, OrthographicCamera, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer, type Object3D, type Ray } from 'three';
import type { SceneryBounds, SceneryLayoutResource } from '../../../../../shared/types/scenes/scenery.js';
import type { ReplayDaylightClock } from '../../../../../shared/types/replay.js';
import { VEHICLE_FILES } from '../../../../api/vehicles/bodyApi.js';
import { createRealRoadSurface } from '../scenery/realRoad.js';
import type { RenderPose } from './replayPose.js';
import type { CarTextures } from '../cars/carModels.js';
import { createCarTemplates, type CarTemplates } from '../cars/carTemplates.js';
import { createKeptCar, type KeptCar } from '../cars/keptCar.js';
import { disposeObjects } from './disposeObjects.js';
import { updateShownMatrices } from './shownMatrices.js';
import { exposureType, followsCar, shadowCascadeSet, type CameraMode } from '../camera/cameraModes.js';
import { createCameraRig, type CameraRig } from '../camera/cameraRig.js';
import { addSceneEnvironment, cloudSun, sceneSun, sunSeenFrom, type SceneSun } from '../sceneEnvironment.js';
import type { CloudEye } from '../atmosphere/clouds.js';
import { createSunMeter } from '../atmosphere/sunMeter.js';
import { assertHazed } from '../atmosphere/haze.js';
import { linkConvolution } from '../reflectionCube.js';
import { createAutoExposure, type DisplayTransform } from '../autoExposure.js';
import { createPointerSurface, type DrawnCamera, type RaySpan } from './pointerSurface.js';
import { underCarBaker } from '../car/carContactShadow.js';
import { CAR_REFLECTION_STEPS, createCarReflection } from '../car/carReflection.js';
import { CachedKtx2Loader, type TextureStartFile } from '../scenery/cachedKtx2Loader.js';
import { createChunkLoader } from '../scenery/chunkLoader.js';
import { createSceneryBatches } from '../scenery/sceneryBatches.js';
import { NO_LOAD_PROGRESS, type SceneLoadProgress } from './loadProgress.js';
import { createSceneryGround, type SurfaceHeight } from '../scenery/sceneryGround.js';
import type { StreamView } from '../scenery/residency.js';
import { createSceneryStream } from '../scenery/sceneryStream.js';
import { createReflectionSet } from '../scenery/reflectionSet.js';
import { createSceneWarmup } from '../scenery/sceneWarmup.js';
import { startStreaming } from '../scenery/materials/mipStreaming.js';
import { focusing } from '../scenery/textureFocus.js';
import { trackCardFacing } from '../scenery/materials/shadowEye.js';
import { isDriverCamera } from '../camera/driverCameras.js';
import { isFreeCameraMode, viewMoved } from '../scenery/streamView.js';
import { placeCarFrame } from '../cars/carParts.js';
import { sceneryClock } from '../scenery/materials/surfaceAnimation.js';
import type { CarMotion } from '../cars/carMotion.js';

/** What a scene shows on the circuit: the lap view's cars and lines, or the race replay's cars. */
export interface SceneContent {
  /** Everything it draws, in native coordinates (the world group mirrors them). */
  readonly root: Object3D;
  /** The car whose reflection the probe renders (around its body while it is visible). */
  readonly reflected: Object3D;
  /** Runs each frame before the draw, with its camera. */
  beforeDraw(camera: PerspectiveCamera | OrthographicCamera): void;
  /** Where the cars that cast the sun's shadow are this frame (world), after `beforeDraw`: the far cascades holding one draw the cars. */
  casters(): readonly Vector3[];
  /** The resident road changed: drape what lies on it again. */
  refreshHeights(): void;
  dispose(): void;
}

export interface SceneShellOptions {
  daylightClock?: ReplayDaylightClock;
  /** The view whose chunks stream first, before any content exists. */
  firstView: StreamView;
}

/** What the view showing the scene is told: a failure (the shell is then `broken`) and the load's progress. */
export interface SceneShellListener {
  onFailure: (message: string) => void;
  onProgress: (progress: SceneLoadProgress) => void;
}

/**
 * The 3D view without its content: the renderer, the circuit's scenery streaming around the view, the sky and its light, auto
 * exposure, the car reflection, the cameras and the draw loop. The lap view and the race replay each add their content (`start`,
 * then `show`): one shell serves both on a circuit, its canvas in the element of the view shown (`attach`).
 */
export interface SceneShell {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly rig: CameraRig;
  /** The scene origin in native metres: scene coordinates are native ones less it (z mirrored). */
  readonly origin: Vector3;
  /**
   * The camera as the last frame drew it: its eye after the ground and obstruction checks (the rig's camera keeps the eye it asked
   * for) and the matrices it drew with. What is under the pointer is what that frame showed.
   */
  readonly drawnView: DrawnCamera;
  /**
   * The size, CSS pixels, of the host the frame was drawn for: the box a pointer is measured in (from the host's top left corner),
   * as `pointerRay`, `surfaceWithin` and a pick's projection read it.
   */
  readonly drawnSize: {width: number; height: number};
  readonly surfaceHeight: SurfaceHeight;
  /** Car textures: from start files, sharpened (the interior's only once a driver camera is used). */
  readonly carTextures: CarTextures;
  /** The scene's parsed bodies, shared by every car loader of the scene. */
  readonly carTemplates: CarTemplates;
  /** The driven car the last view left, for the next view driving the same car. */
  readonly keptCar: KeptCar;
  /** Resolves once the environment and the car reflection exist: content programs compile against them. */
  readonly lit: Promise<void>;
  /** Resolves once the chunks under the first view are resident: content draped on the road waits for it. */
  underView(): Promise<void>;
  /**
   * Compiles and uploads an object, lit as it will be drawn: in turn with the chunks behind the loading screen, then at once (in
   * per-frame slices), so a car joining the shown scene does not wait for the scenery still streaming.
   */
  warm(object: Object3D): Promise<void>;
  /** The reflection probe's car, before the content shows (warm-up draws the first car by its own reflection). */
  reflectCar(car: Object3D): void;
  /** Another car near the reflected one, before it warms up: it reflects the same probe (`CarReflection.share`). */
  shareReflection(car: Object3D): void;
  report(change?: Partial<SceneLoadProgress>): void;
  /** The display's tone curve and gamma now: colours baked for the screen follow it. */
  exposureDisplay(): DisplayTransform;
  /** The lap distance the scenery streams around (with what is near the camera); undefined streams around the camera only. */
  station: number | undefined;
  /** Whether `start` has run: later content shows with `show`. */
  readonly started: boolean;
  /** Whether the shell failed (a scenery chunk, the graphics context): the next view makes a new one. */
  readonly broken: boolean;
  /** Puts the canvas (once started) in `host` and reports to `listener`, until `detach`. */
  attach(host: HTMLDivElement, listener: SceneShellListener): void;
  /** Whether `host`'s view holds the shell: a view that left while it loaded shows nothing. */
  isAttached(host: HTMLDivElement): boolean;
  /**
   * `host`'s view leaves (nothing happens if another view holds the shell by now): the canvas leaves its element and the content
   * leaves the scene (the view disposes it). Nothing draws until the next view attaches and shows its own.
   */
  detach(host: HTMLDivElement): void;
  /** Shows the first content behind the loading screen, compiles it and starts drawing. */
  start(content: SceneContent): Promise<void>;
  /** Replaces the content, its root taking the old one's place (the caller disposes the old one first). */
  show(content: SceneContent): void;
  /** Puts a car on a sampled pose: the body when the pose has a heading, else the plain pose marker; wheels and lights follow it. */
  placeCar(car: Object3D, pose: RenderPose, motion: CarMotion | null): void;
  /**
   * Runs `read` right after the next frame is drawn (asking for one), when the scene, `drawnView` and what the content placed are
   * what that frame shows: between frames the clock has moved the cars, whose drawn parts follow at the next frame. Rejects when
   * the shell is disposed first.
   */
  afterFrame<T>(read: () => T | Promise<T>): Promise<T>;
  /** The ray from the last frame's camera (`drawnView`) through a point of the host (`drawnSize`), in scene coordinates. */
  pointerRay(x: number, y: number): Ray;
  /**
   * Which of `spans` (stretches of `pointerRay(x, y)`) holds the nearest surface the last frame's camera draws there: the first such
   * span's index, -1 for none (`PointerSurface.within`: a frame or two later, without waiting on the GPU). Glass and a fence's
   * cut-outs show what is behind them, as in the frame.
   */
  surfaceWithin(x: number, y: number, spans: readonly RaySpan[]): Promise<number>;
  /** Switches the camera mode with its environment, shadows and exposure; false when it is the current one. */
  setMode(next: CameraMode): boolean;
  /**
   * Lights the scene by the sun and weather of `clock`'s moment (the session's published sun without one): the sky, haze, sun light
   * and shadow, clouds, venue capture and exposure. A sun within SUN_STEP_DEG of the shown one, under the same cloud, changes
   * nothing: each change redraws every shadow cascade and captures the venue again (a frame of a few tens of milliseconds). As the
   * camera moves under the clouds, the sun's visibility through them is measured again over a few frames (atmosphere/sunMeter.ts):
   * the sky, haze, sun light and exposure follow it, the shadows and the venue capture stay.
   */
  setDaylight(clock: ReplayDaylightClock | undefined): void;
  beforeFrame(hook: ((frameTime: number) => void) | null): void;
  invalidate(): void;
  dispose(): void;
}

/** How far the sun moves before `setDaylight` lights the scene again, degrees: a quarter of a degree is a minute of the day. */
export const SUN_STEP_DEG = 0.25;
/** How far the cloud cover or the sun's visibility through the clouds moves before `setDaylight` lights the scene again. */
const WEATHER_STEP = 0.01;

/** Each car's body and pose marker, which `placeCar` switches by whether the pose has a heading. */
const poseShapes = new WeakMap<Object3D, {body: Object3D; marker: Object3D}>();

export function createSceneShell(layout: SceneryLayoutResource, {daylightClock, firstView}: SceneShellOptions): SceneShell {
  /** The view's element the canvas is in, and what it is told; none between views. */
  let host: HTMLDivElement | null = null, listener: SceneShellListener | null = null, broken = false, started = false;
  const onFailure = (message: string) => { broken = true; listener?.onFailure(message); };
  const onProgress = (progress: SceneLoadProgress) => listener?.onProgress(progress);
  let renderer: WebGLRenderer;
  // No canvas multisampling: the scene renders into the auto-exposure target, which multisamples; the canvas gets one full-screen quad.
  try { renderer = new WebGLRenderer({antialias: false, alpha: false, reversedDepthBuffer: true}); }
  catch { throw Error('WebGL 2 is unavailable. Use the 2D map.'); }
  // Reading a program's error log waits for its link to finish: about 10 ms a program at the first frame. Production builds skip it.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  const {min, max} = layout.horizon.bounds, origin = new Vector3(...min).add(new Vector3(...max)).multiplyScalar(0.5);
  const loader = createChunkLoader(renderer, layout.textures), carStarts = new Map<string, TextureStartFile>(), startOf = (url: string) => carStarts.get(url);
  // Car textures load at the package's size (it stores outside-only parts small and the liveries larger).
  const carTextureLoader = new CachedKtx2Loader(renderer, {start: startOf});
  // Until the camera is placed, the clouds are seen from the scene origin.
  let sun = sceneSun(layout, origin.y, daylightClock, [origin.x, 0, origin.z]);
  // The exposure asks for frames of its own (`schedule`), which leave a frame quiet: it reads its state back only on quiet frames.
  const exposure = createAutoExposure(renderer, layout.camera, {rgb: sun.radiance.clone(), elevationDeg: sun.sunElevationDeg}, () => schedule(), exposureType('follow'),
    sun.weather.cloudCover, sun.weather.sunVisibility);
  // Wheel and line contact heights read the package's road height grid; off it, and for the camera checks, one ray tree per resident chunk.
  const ground = createSceneryGround(layout.roadHeightAt);
  const realRoad = createRealRoadSurface(layout.realRoadTable, layout.realRoad.elements);
  // Scenery chunks live in native coordinates under one group, shifted by the scene origin.
  const sceneryRoot = new Group(); sceneryRoot.position.copy(origin).negate();
  /** A chunk's box in the scene: native coordinates less the origin, z mirrored as the world group draws them. */
  const worldBox = ({min, max}: SceneryBounds) => new Box3(new Vector3(min[0], min[1], -max[2]), new Vector3(max[0], max[1], -min[2]))
    .translate(new Vector3(-origin.x, -origin.y, origin.z));
  // Each scenery material draws once across the chunks, sized from the layout's totals; a chunk's instances show while the chunk does.
  const batches = createSceneryBatches(sceneryRoot, layout.materials, renderer.capabilities.maxTextures);
  // What the car's probe draws in place of the scenery, chunk by chunk with it.
  const reflectionSet = createReflectionSet(layout, loader, origin);
  let content: SceneContent | null = null;
  let disposed = false, refreshTimer = 0, invalidate: () => void = () => {}, schedule: () => void = () => {};
  /** Something besides the exposure asked for a frame since the last one drew (or a resize drew it). */
  let asked = true;
  /** Resolves once the scene has its environment and the car's reflection: programs compiled before that would compile again. */
  let lit: Promise<void> = Promise.resolve();
  // Content is draped on the road: when the resident chunks change, drape it again (coalesced).
  let freezeScenery = () => {};
  /** The scenery's chunk roots and batches, frozen once they join: the frame's matrix update skips them. */
  const frozen = new WeakSet<Object3D>(), isFrozen = (object: Object3D) => frozen.has(object);
  const scheduleRefresh = () => {
    if (refreshTimer || !content) return;
    refreshTimer = window.setTimeout(() => { refreshTimer = 0; if (disposed) return; content?.refreshHeights(); invalidate(); }, 250);
  };
  // The scene and its cameras exist from the start, so the first view's chunks warm up as each arrives, while the others still load.
  const scene = new Scene(), rig = createCameraRig(renderer.domElement, origin, () => invalidate());
  /** The camera in the cloud field's frame: LMU local x and z, the height above the scene origin's. */
  const cloudEye = (): CloudEye => { const {x, y, z} = rig.camera.position; return [x + origin.x, y, origin.z - z]; };
  const sunMeter = (at: SceneSun, eye: CloudEye) => at.clouds.sheets
    ? createSunMeter(layout.shading.sunVisibility, layout.sky.clouds, at.clouds.sheets, cloudSun(at.lighting), eye) : null;
  let meter = sunMeter(sun, [origin.x, 0, origin.z]);
  /** The sun's visibility measured from where the camera is now: shown once it moved WEATHER_STEP. Before the frame renders. */
  const seeSun = (visibility: number) => {
    if (Math.abs(visibility - (sun.clouds.sunVisibility ?? 1)) < WEATHER_STEP) return;
    sun = sunSeenFrom(layout, sun, visibility);
    exposure.setSun({rgb: sun.radiance.clone(), elevationDeg: sun.sunElevationDeg}, sun.weather.cloudCover, sun.weather.sunVisibility);
    environment.setSunVisibility(sun);
  };
  // Each `render` call (main, shadow layers, probe, environment) would walk the whole graph: `draw` updates it once per frame.
  scene.matrixWorldAutoUpdate = false;
  const warmup = createSceneWarmup(renderer, scene, rig.perspective,
    () => { renderer.setRenderTarget(exposure.target); environment.applyHaze(); }, () => invalidate());
  // The loading screen's progress (the layout and cars were fetched before this ran), then the scenery still streaming in.
  const progress: SceneLoadProgress = {...NO_LOAD_PROGRESS, track: 1};
  let loading = true;
  const texturesChanged = () => {
    const {sharp, total} = warmup.sharpening();
    return sharp !== progress.textures.sharp || total !== progress.textures.total;
  };
  const report = (change: Partial<SceneLoadProgress> = {}) => {
    if (disposed) return;
    const circuit = stream.circuit(), textures = warmup.sharpening();
    // After the first frame a view's own steps and the streaming counts report; a chunk shown or hidden as the car moves does not.
    if (!loading && Object.keys(change).length === 0 && circuit.resident === progress.circuit.resident && circuit.total === progress.circuit.total
      && !texturesChanged()) return;
    Object.assign(progress, change, loading ? {scenery: stream.underView()} : {}, {circuit, textures});
    onProgress({...progress});
  };
  const stream = createSceneryStream(layout, sceneryRoot, {
    load: async (chunk, signal) => {
      // The ray tree needs only the geometry: it builds in a worker from the parsed chunk, while its textures download and the
      // chunk waits its turn to compile and upload (warm-ups stay one at a time). A chunk that fails leaves what it built (its ray
      // tree, its hidden batch instances) to the shell's disposal: the failure breaks the shell, and the next view makes a new one.
      let grounded: Promise<void> = Promise.resolve();
      const reflected = reflectionSet.load(chunk.id, signal);
      reflected.catch(() => {}); // Awaited below; the scenery's own failure may reject the load first.
      const root = await loader.load(chunk, signal, parsed => {
        grounded = ground.add(chunk.id, parsed, chunk.kind === 'horizon');
        grounded.catch(() => {}); // Awaited below; a texture failure may reject the load first.
      });
      realRoad.prepare(root);
      const created = batches.add(root);
      await lit; // A chunk's programs depend on the scene's environment.
      const reflection = await reflected;
      await Promise.all([warmup.queue(reflection ? [root, ...created, reflection] : [root, ...created], signal, worldBox(chunk.bounds)), grounded]);
      signal.throwIfAborted();
      if (reflection) reflectionSet.join(root, reflection);
      return root;
    },
    changed: () => { batches.sync(); reflectionSet.sync(); freezeScenery(); scheduleRefresh(); reflection.stale(); invalidate(); report(); },
    failed: (chunk, error) => { if (!disposed) onFailure(`3D scenery chunk ${chunk.id} failed: ${error.message}`); },
  });
  /** Frees what exists from the start; `dispose` adds what the finished scene owns. */
  const cleanup = () => {
    disposed = true; for (const waiting of afterFrames.splice(0)) waiting.fail(new Error('The scene was disposed.'));
    window.clearTimeout(refreshTimer); stream.dispose(); loader.dispose(); carTextureLoader.dispose(); exposure.dispose(); pointer.dispose();
    ground.dispose(); batches.dispose(); warmup.dispose(); rig.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
  // The interior's own copies stay on their reduced levels until a driver camera is used: only there is their full size seen.
  let driverCameraUsed = false;
  const carTextures: CarTextures = {
    load(path, start) {
      const url = `${VEHICLE_FILES}${path}`;
      if (start) carStarts.set(url, {url: `${VEHICLE_FILES}${start.path}`, skip: start.skip});
      return carTextureLoader.loadAsync(url);
    },
    copied(copy, original, interior, field) {
      const detail = carTextureLoader.detail(original);
      startStreaming(copy, detail, carTextureLoader.file(original));
      if (!detail) return; // Read whole: nothing to sharpen.
      if (interior && !driverCameraUsed) warmup.hold(copy); else warmup.sharpen(copy, field);
    },
  };
  // The first view's chunks are requested first, so their downloads overlap the lighting set up below: the sky's environment and
  // the car's reflection, built on the main thread, and the convolution program, linked off it.
  let streamView: StreamView | null = firstView; stream.update(firstView); report();
  // Both exist once `lit` resolves; nothing below reads them before.
  let environment!: ReturnType<typeof addSceneEnvironment>, reflection!: ReturnType<typeof createCarReflection>;
  const convolution = linkConvolution(renderer, layout.shading.convolution.kernels);
  lit = Promise.resolve().then(() => {
    environment = addSceneEnvironment(scene, renderer, layout, origin, shadowCascadeSet(rig.mode), rig.gameCamera?.shadow ?? null, sun);
    reflection = createCarReflection(renderer, scene, layout.shading, {set: reflectionSet.root, scenery: sceneryRoot});
  });
  lit.then(() => report({lighting: 1}), () => {}); // Awaited by the content.
  // Convert the native left-handed frame once, including meshes, car bodies and trails.
  // Camera targets/offsets use the same reflection. Mirroring only terrain misaligns poses.
  const world = new Group(); world.scale.z = -1; world.add(sceneryRoot);
  world.add(reflectionSet.root);
  const route = layout.routeLengthM;
  /** Stream scenery around the car (lap distance, plus what is near the camera) or, for the panned orbit and overhead cameras, around the camera. */
  const updateStream = () => {
    const {x, z} = rig.camera.position;
    const next: StreamView = isFreeCameraMode(rig.mode) || shell.station === undefined
      ? {kind: 'free', x: x + origin.x, z: origin.z - z}
      : {kind: 'lap', lapDistanceM: shell.station, x: x + origin.x, z: origin.z - z};
    if (!viewMoved(streamView, next, route)) return;
    streamView = next; stream.update(next);
  };
  const eyeRotation = new Quaternion(), desiredEye = new Vector3(), correctedEye = new Vector3(), probeCentre = new Vector3();
  const drawnCameras = {perspective: new PerspectiveCamera(), orthographic: new OrthographicCamera()};
  let drawnView: DrawnCamera = drawnCameras.perspective;
  const pointer = createPointerSurface(renderer);
  let frame = 0, frameHook: ((frameTime: number) => void) | null = null, probed = false;
  /** What waits for the next frame to be drawn (`afterFrame`). */
  const afterFrames: Array<{run: () => void; fail: (error: Error) => void}> = [];
  const NO_CASTERS: readonly Vector3[] = [];
  const draw = (frameTime?: number) => {
    // A started shell between views (the next one took the canvas, its content still building) draws the scenery alone.
    if (disposed || (!content && !started)) return;
    // First, while this frame has issued no draws: the fetch waits for every command before it.
    exposure.collect();
    if (frameTime !== undefined) frameHook?.(frameTime);
    updateStream();
    // Zoomed trackside views keep every resident instance (their distance scale follows the zoom), as do the free views.
    batches.cull(followsCar(rig.mode) ? rig.camera.position : null, rig.lodMultiplier);
    if (texturesChanged()) report(); // Textures sharpen a band per frame, each frame asking for the next.
    const camera = rig.camera;
    desiredEye.copy(camera.position);
    if (rig.checksGround) ground.resolve(desiredEye, rig.focus, origin, correctedEye);
    else correctedEye.copy(desiredEye);
    const corrected = !correctedEye.equals(desiredEye);
    if (corrected) {
      eyeRotation.copy(camera.quaternion);
      camera.position.copy(correctedEye);
      camera.lookAt(rig.focus);
    }
    try {
      sceneryClock.value = rig.timeSec;
      // A new primary car brings its own game cameras, whose shadow keys may differ.
      environment.setShadowCascades(shadowCascadeSet(rig.mode), rig.gameCamera?.shadow ?? null);
      underCarBaker.flush(renderer); // Bakes at most one car body's under-car shade per frame; every car of that body then shows it.
      content?.beforeDraw(camera);
      updateShownMatrices(scene, isFrozen);
      trackCardFacing(camera);
      // A measure of the sun through the clouds still running, or cached shadow cascades still due, ask for the next frame.
      const seen = meter?.step(cloudEye()) ?? null;
      if (seen !== null) seeSun(seen);
      if (meter?.running) invalidate();
      if (environment.update(content?.casters() ?? NO_CASTERS)) invalidate();
      if (focusing()) invalidate(); // A texture just sharpened still coming into focus.
      // The first probe completes before the first frame that shows the car, whose materials read it from their first draw.
      const car = content?.reflected;
      if (!probed && car?.visible) {
        probed = true; car.getWorldPosition(probeCentre);
        for (let pass = 0; pass < CAR_REFLECTION_STEPS && reflection.update(probeCentre); pass++);
      }
      exposure.render(scene, camera, !asked); asked = false;
      drawnView = camera instanceof PerspectiveCamera ? drawnCameras.perspective.copy(camera, false) : drawnCameras.orthographic.copy(camera, false);
      for (const waiting of afterFrames.splice(0)) waiting.run();
      // The car's reflection probe renders three faces after the frame (car/carReflection.ts), around the body's centre.
      if (car?.visible && reflection.update(car.getWorldPosition(probeCentre), environment.shadowsRedrawn)) invalidate();
    } finally {
      if (corrected) {
        camera.position.copy(desiredEye);
        camera.quaternion.copy(eyeRotation);
        camera.updateMatrixWorld();
      }
    }
  };
  /** Kept loaded behind the 2D map. */
  const hidden = () => !host || host.closest('[hidden]') !== null;
  let viewportWidth = 0, viewportHeight = 0;
  const resize = () => {
    if (disposed || hidden()) return; // Keep the size it had.
    const width = Math.max(1, host!.clientWidth), height = Math.max(1, host!.clientHeight);
    if (width === viewportWidth && height === viewportHeight) { invalidate(); return; } // Shown again at the same size.
    viewportWidth = width; viewportHeight = height;
    renderer.setSize(width, height, false); rig.resize(width / height);
    // ResizeObserver runs after animation callbacks, before paint. A canvas resize clears its pixels:
    // draw now, or the embedded map flashes black until next frame when a toolbar changes height.
    if (rig.placed) { asked = true; draw(); } else invalidate();
  };
  const contextLost = (event: Event) => { event.preventDefault(); onFailure('The 3D graphics context was lost. Retry or return to 2D.'); };
  const observer = new ResizeObserver(resize);
  const show = (next: SceneContent) => {
    if (content && content.root !== next.root) world.remove(content.root);
    content = next; world.add(next.root); environment.setDynamic([next.root]); reflection.setCar(next.reflected, next.root);
    assertHazed(scene);
  };
  /** Puts the canvas in the attached view's element. */
  const mount = () => {
    if (!host || renderer.domElement.parentElement === host) return;
    host.append(renderer.domElement);
    observer.observe(host);
    viewportWidth = 0; viewportHeight = 0; resize();
  };
  const keptCar = createKeptCar();
  const shell: SceneShell = {
    renderer, scene, rig, origin, get drawnView() { return drawnView; }, get drawnSize() { return {width: viewportWidth, height: viewportHeight}; }, surfaceHeight: ground.surfaceHeight, carTextures, carTemplates: createCarTemplates(), keptCar,
    get started() { return started; },
    get broken() { return broken; },
    attach(next, nextListener) {
      // The same element again (the view took the canvas early, then built its content) keeps the canvas where it is.
      if (host && host !== next) shell.detach(host);
      host = next; listener = nextListener;
      if (started) {
        mount();
        // A view coming to a shown circuit loads only its cars: the bar starts past the track, scenery and lighting.
        report({cars: 0, shaders: 0, carModels: {loaded: 0, total: 0}});
      }
    },
    isAttached: view => host === view,
    detach(view) {
      if (host !== view) return;
      observer.disconnect(); renderer.domElement.remove();
      host = null; listener = null; frameHook = null;
      if (content) { world.remove(content.root); content = null; }
    },
    lit,
    underView: () => stream.whenUnderView(),
    warm: object => (loading ? warmup.queue(object, new AbortController().signal) : warmup.warm(object, new AbortController().signal)),
    reflectCar: car => reflection.setCar(car, car),
    shareReflection: car => reflection.share(car),
    report,
    exposureDisplay: () => exposure.display(),
    station: undefined,
    async start(first) {
      scene.add(world);
      // Nothing under the scenery moves: a chunk's root or a batch freezes once, when it first joins (a batch that leaves and
      // returns keeps its matrices).
      const freeze = (object: Object3D) => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; };
      sceneryRoot.updateWorldMatrix(true, false); freeze(sceneryRoot);
      freezeScenery = () => {
        for (const joined of sceneryRoot.children) {
          if (frozen.has(joined)) continue;
          frozen.add(joined); joined.updateWorldMatrix(false, true); joined.traverse(freeze);
        }
      };
      freezeScenery();
      show(first); environment.setCamera(rig.camera);
      // The first view's chunks are warm: this compiles and uploads the content, behind the loading screen. The exposure passes
      // and the reflection convolution link meanwhile: each would otherwise link at its first draw.
      await Promise.all([warmup.warm(scene, new AbortController().signal), exposure.link(), convolution.ready]);
      report({shaders: 1}); loading = false;
      // The scenery around the first view is resident and compiled: capture the venue's light for the scene's environment.
      environment.captureVenue();
      warmup.shown();
      assertHazed(scene);
      schedule = () => {
        // Nor while kept hidden behind the 2D map: showing it again resizes, which draws.
        if (disposed || frame || document.hidden || hidden()) return;
        frame = requestAnimationFrame(now => { frame = 0; draw(now); });
      };
      invalidate = () => { asked = true; schedule(); };
      renderer.domElement.addEventListener('webglcontextlost', contextLost);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.domElement.className = 'h-full w-full';
      document.addEventListener('visibilitychange', invalidate);
      started = true; mount();
    },
    show,
    afterFrame<T>(read: () => T | Promise<T>) {
      if (disposed) return Promise.reject(new Error('The scene was disposed.'));
      return new Promise<T>((resolve, reject) => {
        afterFrames.push({run: () => { try { resolve(read()); } catch (error) { reject(error instanceof Error ? error : new Error(String(error))); } }, fail: reject});
        // A frame of its own while nothing else asks for one (a paused replay): the exposure reads it as a quiet frame.
        schedule();
      });
    },
    pointerRay: (x, y) => pointer.ray(drawnView, x, y, viewportWidth, viewportHeight),
    surfaceWithin: (x, y, spans) => pointer.within(scene, drawnView, x, y, viewportWidth, viewportHeight, spans),
    placeCar(car, pose, motion) {
      car.position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z);
      if (pose.orientation) car.quaternion.copy(pose.orientation); else car.quaternion.identity();
      placeCarFrame(car);
      motion?.update(pose);
      let shown = poseShapes.get(car);
      if (!shown) { shown = {body: car.getObjectByName('body-envelope')!, marker: car.getObjectByName('pose-marker')!}; poseShapes.set(car, shown); }
      shown.body.visible = pose.yaw !== undefined; shown.marker.visible = pose.yaw === undefined;
    },
    setMode(next) {
      if (!rig.setMode(next)) return false;
      if (isDriverCamera(next) && !driverCameraUsed) { driverCameraUsed = true; warmup.sharpenHeld(); }
      environment.setCamera(rig.camera); environment.setShadowCascades(shadowCascadeSet(next), rig.gameCamera?.shadow ?? null);
      exposure.setType(exposureType(next));
      return true;
    },
    setDaylight(clock) {
      const eye = cloudEye(), next = sceneSun(layout, origin.y, clock, eye), weather = (at: typeof sun) => [at.weather.cloudCover, at.clouds.sunVisibility ?? 1];
      const turnedDeg = MathUtils.radToDeg(next.lighting.sunDirection.angleTo(sun.lighting.sunDirection));
      const [cover, seen] = weather(next), [shownCover, shownSeen] = weather(sun);
      if (turnedDeg < SUN_STEP_DEG && Math.abs(cover - shownCover) < WEATHER_STEP && Math.abs(seen - shownSeen) < WEATHER_STEP) return;
      sun = next; meter = sunMeter(sun, eye);
      exposure.setSun({rgb: sun.radiance.clone(), elevationDeg: sun.sunElevationDeg}, sun.weather.cloudCover, sun.weather.sunVisibility);
      // Before the environment exists, it is made from this sun.
      if (environment) { environment.setSun(sun); invalidate(); }
    },
    beforeFrame(hook) { frameHook = hook; },
    invalidate: () => invalidate(),
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost); document.removeEventListener('visibilitychange', invalidate);
      // The stream takes its chunks out first (the chunk loader frees them) with their batches, then the content and sky go with the scene.
      stream.dispose(); batches.dispose(); keptCar.dispose(); disposeObjects(scene, true); environment.dispose(); reflection.dispose(); convolution.dispose();
      cleanup(); renderer.domElement.remove();
    },
  };
  return shell;
}
