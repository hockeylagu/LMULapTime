import { Group, Quaternion, Scene, Vector3, WebGLRenderer, Mesh, type Object3D } from 'three';
import type { SceneryLayoutResource } from '../../../../shared/types/scenes/scenery.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { VEHICLE_FILES } from '../../../api/vehicles/bodyApi.js';
import type { MapColorMode } from '../map/replayMapUtils.js';
import { ghostDistanceAt, type GhostSyncMode } from '../map/ghostSync.js';
import { sampleRenderPose, sampleStationPose, type RenderPose } from './replayPose.js';
import { nativeToScene } from './sceneFrame.js';
import { createLapLayerLoader, type LapCars, type LapLayer } from './laps/lapLayer.js';
import { disposeObjects } from './laps/disposeObjects.js';
import { setCameraDistance } from './sceneObjects.js';
import { exposureType, shadowCascadeSet, type CameraMode } from './cameraModes.js';
import { createCameraRig } from './cameraRig.js';
import { addSceneEnvironment, sceneSun, VENUE_PROBE_PX } from './sceneEnvironment.js';
import { linkPrefilters } from './prefilterLink.js';
import { linkConvolution } from './reflectionCube.js';
import { createAutoExposure } from './autoExposure.js';
import { CAR_REFLECTION_PX, createCarReflection } from './car/carReflection.js';
import { CachedKtx2Loader } from './scenery/cachedKtx2Loader.js';
import { createChunkLoader } from './scenery/chunkLoader.js';
import { createSceneryGround } from './scenery/sceneryGround.js';
import type { StreamView } from './scenery/residency.js';
import type { WheelAnimation } from './wheelAnimation.js';
import { createSceneryStream } from './scenery/sceneryStream.js';
import { createSceneWarmup } from './scenery/sceneWarmup.js';
import { startStreaming } from './scenery/materials/mipStreaming.js';
import { isDriverCamera } from './driverCameras.js';
import { isFreeCameraMode, stationAt, viewMoved } from './scenery/streamView.js';

export interface ReplaySceneHandle {
  wheelMotion: string;
  updateLaps(trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapCars, signal?: AbortSignal): Promise<boolean>;
  cursor(index: number, fraction: number): void;
  /** Runs at the start of each animation frame the scene draws, with the frame's time: playback advances its clock there, so the
   * pose drawn is always the frame's own (replayPlaybackCursor.ts). */
  beforeFrame(hook: ((frameTime: number) => void) | null): void;
  mode(mode: CameraMode): void;
  reset(): void;
  center(): void;
  zoom(direction: number): void;
  pan(horizontal: number, vertical: number): void;
  /** Recolour both racing lines with a 2D map heat-map mode. */
  colorLines(colorBy: MapColorMode): void;
  /** Fade either racing line (opacity 0–1), as the 2D map fades a line on request. */
  fadeLines(primaryOpacity: number, baselineOpacity: number): void;
  /** Place the ghost at the same distance, the same lap time, or the same time since marker A (as the 2D map). */
  syncGhost(mode: GhostSyncMode, anchorDistM: number | null): void;
  dispose(): void;
}

/**
 * Car textures load no larger than this on their longer side. On a 1080p view from outside the car the picture is the same as
 * with a larger file, for a third of the data. The interior's own textures are not capped: they stay on their start files
 * and reach their full size in the driver cameras.
 */
const CAR_TEXTURE_MAX_PX = 1024;

export async function createReplayScene(
  host: HTMLDivElement, layout: SceneryLayoutResource,
  trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null,
  onFailure: (message: string) => void,
  cars: LapCars,
  colorBy: MapColorMode = 'default',
): Promise<ReplaySceneHandle> {
  let renderer: WebGLRenderer;
  // No canvas multisampling: the scene renders into the auto-exposure target, which multisamples; the canvas gets one full-screen quad.
  try { renderer = new WebGLRenderer({antialias: false, alpha: false, reversedDepthBuffer: true}); }
  catch { throw Error('WebGL 2 is unavailable. Use the 2D map.'); }
  // Reading a program's error log waits for its link to finish: about 10 ms a program at the first frame. Production builds skip it.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  const {min, max} = layout.horizon.bounds, origin = new Vector3(...min).add(new Vector3(...max)).multiplyScalar(0.5);
  const loader = createChunkLoader(renderer, layout.textures), carStarts = new Map<string, string>(), startOf = (url: string) => carStarts.get(url);
  const carTextures = new CachedKtx2Loader(renderer, {maxPx: () => CAR_TEXTURE_MAX_PX, start: startOf}), interiorTextures = new CachedKtx2Loader(renderer, {start: startOf});
  const sun = sceneSun(layout, origin.y, trajectory.daylightClock);
  const exposure = createAutoExposure(renderer, layout.camera, {rgb: sun.radiance.clone(), elevationDeg: sun.sunElevationDeg}, () => invalidate(), exposureType('follow'),
    sun.weather.cloudCover, sun.weather.sunVisibility);
  // Wheel and line contact heights and the camera checks share one ray tree per resident chunk.
  const ground = createSceneryGround(), {surfaceHeight} = ground;
  // Scenery chunks live in native coordinates under one group, shifted by the scene origin.
  const sceneryRoot = new Group(); sceneryRoot.position.copy(origin).negate();
  let layer: LapLayer, layerReady = false;
  let syncMode: GhostSyncMode = 'distance', anchorDistM: number | null = null;
  let disposed = false, refreshTimer = 0, invalidate: () => void = () => {};
  /** Resolves once the scene has its environment and the car's reflection: programs compiled before that would compile again. */
  let lit: Promise<void> = Promise.resolve();
  // Lines are draped on the road: when the resident chunks change, re-drape them (coalesced).
  let freezeScenery = () => {};
  const scheduleRefresh = () => {
    if (refreshTimer || !layerReady) return;
    refreshTimer = window.setTimeout(() => { refreshTimer = 0; if (disposed) return; layer.refreshHeights(); invalidate(); }, 250);
  };
  // The scene and its cameras exist from the start, so the first view's chunks warm up as each arrives, while the others still load.
  const scene = new Scene(), rig = createCameraRig(renderer.domElement, origin, () => invalidate());
  const warmup = createSceneWarmup(renderer, scene, rig.perspective,
    () => { renderer.setRenderTarget(exposure.target); environment.applyHaze(); }, () => invalidate());
  const stream = createSceneryStream(layout, sceneryRoot, {
    load: async (chunk, signal) => {
      // The ray tree needs only the geometry: it builds in a worker from the parsed chunk, while its textures download and the
      // chunk waits its turn to compile and upload (warm-ups stay one at a time).
      const built: {parsed: Object3D | null; grounded: Promise<void>; root: Object3D | null} = {parsed: null, grounded: Promise.resolve(), root: null};
      try {
        const root = built.root = await loader.load(chunk, signal, parsed => {
          built.parsed = parsed; built.grounded = ground.add(chunk.id, parsed, chunk.kind === 'horizon');
          built.grounded.catch(() => {}); // Awaited below; a texture failure may reject the load first.
        });
        await lit; // A chunk's programs depend on the scene's environment.
        await Promise.all([warmup.queue(root, signal), built.grounded]); signal.throwIfAborted(); return root;
      } catch (error) {
        // The loader releases a chunk whose own load failed; one that failed after it is released here.
        if (built.parsed) ground.remove(chunk.id, built.parsed);
        if (built.root) loader.releaseChunk(built.root);
        throw error;
      }
    },
    prepare: (_chunk, root) => {
      // The filler ground sits just under the road: a car shadow on it would show through from below road level.
      root.traverse(object => { if (object instanceof Mesh) object.receiveShadow = !object.name.startsWith('FILLER_GROUND'); });
    },
    unload: (chunk, root) => { ground.remove(chunk.id, root); loader.releaseChunk(root); },
    changed: () => { freezeScenery(); scheduleRefresh(); reflection.stale(); invalidate(); },
    failed: (chunk, error) => { if (!disposed) onFailure(`3D scenery chunk ${chunk.id} failed: ${error.message}`); },
  });
  /** Frees what exists from the start; `dispose` adds what the finished scene owns. */
  const cleanup = () => {
    disposed = true; window.clearTimeout(refreshTimer); stream.dispose(); loader.dispose(); carTextures.dispose(); interiorTextures.dispose(); exposure.dispose();
    ground.dispose(); warmup.dispose(); rig.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
  const route = layout.routeLengthM;
  const firstStation = stationAt(trajectory.points, 0, 0, route);
  if (firstStation === undefined) { cleanup(); throw Error('This recording has no track stations. Use the 2D map.'); }
  let currentStation = firstStation, streamView: StreamView | null = null;
  // Interior textures stay on their reduced levels until a driver camera is used: only there is their full size seen.
  let driverCameraUsed = false;
  const loadLaps = createLapLayerLoader(origin, surfaceHeight, {
    load(path, interior, start) {
      const url = `${VEHICLE_FILES}${path}`;
      if (start) carStarts.set(url, `${VEHICLE_FILES}${start}`);
      return (interior ? interiorTextures : carTextures).loadAsync(url);
    },
    copied(copy, original, interior) {
      const detail = (interior ? interiorTextures : carTextures).detail(original);
      if (!detail) return;
      startStreaming(copy, renderer, detail);
      if (interior && !driverCameraUsed) warmup.hold(copy); else warmup.sharpen(copy);
    },
  }, () => exposure.display(), layout.shading);
  // The first view's chunks and the car are requested first: the sky's environment and the car's reflection link their programs
  // on the main thread, which the downloads then overlap.
  streamView = {kind: 'lap', lapDistanceM: currentStation}; stream.update(streamView);
  const carsBuilt = loadLaps.preload(cars); // The cars load and build alongside the scenery; only draping waits for the ground.
  carsBuilt.catch(() => {}); // Surfaces from the load below.
  // Both exist once `lit` resolves; nothing below reads them before.
  let environment!: ReturnType<typeof addSceneEnvironment>, reflection!: ReturnType<typeof createCarReflection>;
  // The environment and the car's reflection prefilter on creation: their programs link first, off the main thread.
  const prefilters = linkPrefilters(renderer, rig.perspective, [VENUE_PROBE_PX, CAR_REFLECTION_PX]);
  const convolution = linkConvolution(renderer, layout.shading.convolution.kernels);
  lit = prefilters.ready.then(() => {
    environment = addSceneEnvironment(scene, renderer, layout, origin, shadowCascadeSet(rig.mode), sun);
    reflection = createCarReflection(renderer, scene, layout.shading);
  }).finally(() => { prefilters.dispose(); });
  lit.catch(() => {}); // Awaited below.
  // The cars compile and upload in turn with the chunks, lit as they will be drawn: the first car by its own reflection.
  const carsWarm = Promise.all([carsBuilt, lit]).then(async ([built]) => {
    const signal = new AbortController().signal;
    reflection.setCar(built.primary, built.primary);
    await Promise.all([built.primary, built.ghost].flatMap(car => car ? [warmup.queue(car, signal)] : []));
  });
  carsWarm.catch(() => {}); // A failure here surfaces from the load or the scene's warm-up below.
  // The chunks under the first pose must be resident before cars and lines are draped on them.
  try {
    await lit;
    await stream.whenUnderView();
    layer = await loadLaps(trajectory, baseline, cars, colorBy); layerReady = true;
  } catch (error) { cleanup(); throw error; }
  let lineMode = colorBy, primaryOpacity = 1, baselineOpacity = 1, lapRequest = 0;
  // Convert the native left-handed frame once, including meshes, car bodies and trails.
  // Camera targets/offsets use the same reflection. Mirroring only terrain misaligns poses.
  const world = new Group(); world.scale.z = -1; world.add(sceneryRoot); scene.add(world);
  freezeScenery = () => {
    sceneryRoot.traverse(object => { object.matrixWorldAutoUpdate = true; });
    sceneryRoot.updateWorldMatrix(true, true);
    sceneryRoot.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
  };
  freezeScenery();
  const showLayer = () => { world.add(layer.root); environment.setDynamic([layer.root]); reflection.setCar(layer.primary, layer.root); rig.setLayer(layer); };
  showLayer(); environment.setCamera(rig.camera);
  // The first view's chunks are warm: this compiles and uploads the cars and lines, behind the loading screen.
  // The exposure passes and the reflection convolution link meanwhile: each would otherwise link at its first draw.
  try { await Promise.all([warmup.warm(scene, new AbortController().signal), exposure.link(), convolution.ready]); } catch (error) { cleanup(); throw error; }
  // The scenery around the first pose is resident and compiled: capture the venue's light for the scene's environment.
  environment.captureVenue();
  warmup.shown();
  /** Stream scenery around the car (lap distance, plus what is near the camera) or, for the panned orbit and overhead cameras, around the camera. */
  const updateStream = () => {
    const {x, z} = rig.camera.position;
    const next: StreamView = isFreeCameraMode(rig.mode)
      ? {kind: 'free', x: x + origin.x, z: origin.z - z}
      : {kind: 'lap', lapDistanceM: currentStation, x: x + origin.x, z: origin.z - z};
    if (!viewMoved(streamView, next, route)) return;
    streamView = next; stream.update(next);
  };
  const eyeRotation = new Quaternion(), desiredEye = new Vector3(), correctedEye = new Vector3(), probeCentre = new Vector3(), ghostCentre = new Vector3(), target = new Vector3();
  let frame = 0, frameHook: ((frameTime: number) => void) | null = null, probed = false;
  const draw = (frameTime?: number) => {
    if (disposed) return;
    if (frameTime !== undefined) frameHook?.(frameTime);
    updateStream();
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
      // Cached shadow cascades still due ask for the next frame.
      if (environment.update()) invalidate();
      // The first probe completes before the first frame that shows the car, whose materials read it from their first draw.
      if (!probed && layer.primary.visible) {
        probed = true; layer.primary.getWorldPosition(probeCentre);
        for (let pass = 0; pass < 6 && reflection.update(probeCentre); pass++);
      }
      // The car the cameras follow keeps every part at its full level, however far a zoomed camera stands; the other car's
      // parts follow the camera's distance.
      if (layer.ghost.visible) setCameraDistance(layer.ghost, camera.position.distanceTo(layer.ghost.getWorldPosition(ghostCentre)));
      exposure.render(scene, camera);
      // The car's reflection probe renders one face after the frame (car/carReflection.ts), around the body's centre.
      if (layer.primary.visible && reflection.update(layer.primary.getWorldPosition(probeCentre))) invalidate();
    } finally {
      if (corrected) {
        camera.position.copy(desiredEye);
        camera.quaternion.copy(eyeRotation);
        camera.updateMatrixWorld();
      }
    }
  };
  invalidate = () => {
    if (disposed || frame || document.hidden) return;
    frame = requestAnimationFrame(now => { frame = 0; draw(now); });
  };
  /** Puts a car on a sampled pose: the body when the pose has a heading, else the plain pose marker; wheels and lights follow it. */
  const placeCar = (car: Object3D, pose: RenderPose, wheels: WheelAnimation | null, lights: Array<{update(pose: RenderPose): void}>) => {
    car.position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z);
    if (pose.orientation) car.quaternion.copy(pose.orientation); else car.quaternion.identity();
    wheels?.update(pose); for (const light of lights) light.update(pose);
    car.getObjectByName('body-envelope')!.visible = pose.yaw !== undefined;
    car.getObjectByName('pose-marker')!.visible = pose.yaw === undefined;
  };
  let viewportWidth = 0, viewportHeight = 0;
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    if (width === viewportWidth && height === viewportHeight) return;
    viewportWidth = width; viewportHeight = height;
    renderer.setSize(width, height, false); rig.resize(width / height);
    // ResizeObserver runs after animation callbacks, before paint. A canvas resize clears its pixels:
    // draw now, or the embedded map flashes black until next frame when a toolbar changes height.
    if (rig.placed) draw(); else invalidate();
  };
  const contextLost = (event: Event) => { event.preventDefault(); onFailure('The 3D graphics context was lost. Retry or return to 2D.'); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.domElement.className = 'h-full w-full';
  host.append(renderer.domElement);
  const observer = new ResizeObserver(resize); observer.observe(host);
  document.addEventListener('visibilitychange', invalidate); resize();
  return {
    get wheelMotion() { return layer.primaryWheels.description; },
    async updateLaps(next, comparison, assets, signal) {
      if (disposed || signal?.aborted) return false;
      const compatible = (lap: ReplayTrajectoryData) => lap.layoutKey === layout.layoutKey && lap.geometryRevision === layout.sourceGeometryRevision
        && lap.dataPluginRevision === layout.packageRevision;
      if (!compatible(next) || (comparison && !compatible(comparison))) throw Error('Lap and 3D scene must use the same layout, geometry and package revision.');
      const request = ++lapRequest;
      const replacement = await loadLaps(next, comparison, assets, lineMode);
      if (disposed || signal?.aborted || request !== lapRequest) { replacement.dispose(); return false; }
      replacement.colorLines(lineMode); replacement.fadeLines(primaryOpacity, baselineOpacity);
      layer.dispose(); layer = replacement; showLayer();
      return true;
    },
    beforeFrame(hook) { frameHook = hook; },
    cursor(index, fraction) {
      const {trajectory, baseline, primary, ghost, primaryWheels, ghostWheels, primaryLights, ghostLights, primaryDistances, baselineDistances, ghostClock} = layer;
      const pose = sampleRenderPose(trajectory.points, index, fraction);
      primary.visible = pose !== null;
      if (!pose) { invalidate(); return; }
      placeCar(primary, pose, primaryWheels, primaryLights);
      const sample = trajectory.points[pose.index], nextSample = trajectory.points[pose.index + 1];
      const timeSec = (sample.timeSec ?? pose.index / 40) + ((nextSample?.timeSec ?? sample.timeSec ?? 0) - (sample.timeSec ?? 0)) * pose.fraction;

      const lapStation = stationAt(trajectory.points, pose.index, pose.fraction, route);
      if (lapStation !== undefined) currentStation = lapStation;
      const station = (primaryDistances[index] ?? 0) + ((primaryDistances[index + 1] ?? primaryDistances[index] ?? 0) - (primaryDistances[index] ?? 0)) * fraction;
      const ghostStation = ghostClock ? ghostDistanceAt(ghostClock, syncMode, station, anchorDistM) : station;
      const other = baseline ? sampleStationPose(baseline.points, baselineDistances, ghostStation) : null;
      ghost.visible = other !== null;
      if (other) placeCar(ghost, other, ghostWheels, ghostLights);
      rig.follow({target: target.set(...nativeToScene(pose, origin)), yaw: pose.yaw ?? 0, timeSec, stationM: station, index, fraction});
      invalidate();
    },
    mode(next) {
      if (!rig.setMode(next)) return;
      if (isDriverCamera(next) && !driverCameraUsed) { driverCameraUsed = true; warmup.sharpenHeld(); }
      environment.setCamera(rig.camera); environment.setShadowCascades(shadowCascadeSet(next));
      exposure.setType(exposureType(next)); layer.syncLines();
      invalidate();
    },
    reset: () => rig.reset(),
    center: () => rig.center(),
    zoom: direction => rig.zoom(direction),
    pan: (horizontal, vertical) => rig.pan(horizontal, vertical),
    colorLines(next) {
      lineMode = next; layer.colorLines(next);
      invalidate();
    },
    syncGhost(next, anchor) {
      syncMode = next; anchorDistM = anchor;
    },
    fadeLines(primary, comparison) {
      primaryOpacity = primary; baselineOpacity = comparison; layer.fadeLines(primary, comparison);
      invalidate();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost); document.removeEventListener('visibilitychange', invalidate);
      // The stream takes its chunks out first (the chunk loader frees them), then the cars, lines and sky go with the scene.
      stream.dispose(); disposeObjects(scene, true); environment.dispose(); reflection.dispose(); convolution.dispose();
      cleanup(); renderer.domElement.remove();
    },
  };
}
