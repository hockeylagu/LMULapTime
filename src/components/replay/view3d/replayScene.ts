import { Group, Quaternion, Scene, Vector3, WebGLRenderer, Mesh, type Object3D } from 'three';
import type { SceneryLayoutResource } from '../../../../shared/types/scenes/scenery.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { VEHICLE_FILES } from '../../../api/vehicles/bodyApi.js';
import type { MapColorMode } from '../map/replayMapUtils.js';
import { ghostDistanceAt, type GhostSyncMode } from '../map/ghostSync.js';
import { sampleRenderPose, sampleStationPose } from './replayPose.js';
import { nativeToScene } from './sceneFrame.js';
import { createLapLayerLoader, type LapCars, type LapLayer } from './laps/lapLayer.js';
import { disposeObjects } from './laps/disposeObjects.js';
import { exposureType, shadowCascadeSet, type CameraMode } from './cameraModes.js';
import { createCameraRig } from './cameraRig.js';
import { addSceneEnvironment, sceneClouds, sceneLighting } from './sceneEnvironment.js';
import { createAutoExposure } from './autoExposure.js';
import { sunRadiance } from './atmosphere/sunSamples.js';
import { createCarReflection } from './car/carReflection.js';
import { CachedKtx2Loader } from './scenery/cachedKtx2Loader.js';
import { createChunkLoader } from './scenery/chunkLoader.js';
import { createSceneryGround } from './scenery/sceneryGround.js';
import type { StreamView } from './scenery/residency.js';
import { createSceneryStream } from './scenery/sceneryStream.js';
import { createSceneWarmup } from './scenery/sceneWarmup.js';
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
  const {min, max} = layout.horizon.bounds, origin = new Vector3(...min).add(new Vector3(...max)).multiplyScalar(0.5);
  const loader = createChunkLoader(renderer), carTextures = new CachedKtx2Loader(renderer);
  const lighting = sceneLighting(layout.daylight, trajectory.daylightClock), sunElevationDeg = Math.asin(lighting.sunDirection.y) * 180 / Math.PI;
  const {cloudCover, sunVisibility} = sceneClouds(layout, lighting, origin.y, trajectory.daylightClock), sunRgb = sunRadiance(layout.sky.sun, sunElevationDeg, cloudCover);
  const exposure = createAutoExposure(renderer, layout.camera, {rgb: sunRgb, elevationDeg: sunElevationDeg}, () => invalidate(), exposureType('follow'), cloudCover, sunVisibility);
  // Wheel and line contact heights and the camera checks share one ray tree per resident chunk.
  const ground = createSceneryGround(), {surfaceHeight} = ground;
  // Scenery chunks live in native coordinates under one group, shifted by the scene origin.
  const sceneryRoot = new Group(); sceneryRoot.position.copy(origin).negate();
  let layer: LapLayer, layerReady = false;
  let syncMode: GhostSyncMode = 'distance', anchorDistM: number | null = null;
  let disposed = false, refreshTimer = 0, invalidate: () => void = () => {};
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
  const cleanup = () => {
    disposed = true; window.clearTimeout(refreshTimer); stream.dispose(); loader.dispose(); carTextures.dispose(); exposure.dispose();
    ground.dispose(); warmup.dispose(); rig.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
  const route = layout.routeLengthM;
  const firstStation = stationAt(trajectory.points, 0, 0, route);
  if (firstStation === undefined) { cleanup(); throw Error('This recording has no track stations. Use the 2D map.'); }
  let currentStation = firstStation, streamView: StreamView | null = null;
  const loadLaps = createLapLayerLoader(origin, surfaceHeight, path => carTextures.loadAsync(`${VEHICLE_FILES}${path}`), () => exposure.display(), layout.shading);
  // The first view's chunks and the car are requested first: the sky's environment and the car's reflection link their programs
  // on the main thread, which the downloads then overlap.
  streamView = {kind: 'lap', lapDistanceM: currentStation}; stream.update(streamView);
  loadLaps.preload(cars); // The car models and textures load alongside the scenery; only draping waits for the ground.
  let environment: ReturnType<typeof addSceneEnvironment>, reflection: ReturnType<typeof createCarReflection>;
  // The chunks under the first pose must be resident before cars and lines are draped on them.
  try {
    environment = addSceneEnvironment(scene, renderer, layout, origin, shadowCascadeSet(rig.mode), trajectory.daylightClock);
    reflection = createCarReflection(renderer, scene, layout.shading);
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
  try { await warmup.warm(scene, new AbortController().signal); } catch (error) { cleanup(); throw error; }
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
  const eyeRotation = new Quaternion(), desiredEye = new Vector3(), correctedEye = new Vector3(), probeCentre = new Vector3(), target = new Vector3();
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
      const {trajectory, baseline, primary, ghost, primaryWheels, ghostWheels, primaryDistances, baselineDistances, ghostClock} = layer;
      const pose = sampleRenderPose(trajectory.points, index, fraction);
      primary.visible = pose !== null;
      if (!pose) { invalidate(); return; }
      primary.position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z);
      if (pose.orientation) primary.quaternion.copy(pose.orientation); else primary.quaternion.identity();
      primaryWheels.update(pose);
      const sample = trajectory.points[pose.index], nextSample = trajectory.points[pose.index + 1];
      const timeSec = (sample.timeSec ?? pose.index / 40) + ((nextSample?.timeSec ?? sample.timeSec ?? 0) - (sample.timeSec ?? 0)) * pose.fraction;
      primary.getObjectByName('body-envelope')!.visible = pose.yaw !== undefined;
      primary.getObjectByName('pose-marker')!.visible = pose.yaw === undefined;

      const lapStation = stationAt(trajectory.points, pose.index, pose.fraction, route);
      if (lapStation !== undefined) currentStation = lapStation;
      const station = (primaryDistances[index] ?? 0) + ((primaryDistances[index + 1] ?? primaryDistances[index] ?? 0) - (primaryDistances[index] ?? 0)) * fraction;
      const ghostStation = ghostClock ? ghostDistanceAt(ghostClock, syncMode, station, anchorDistM) : station;
      const other = baseline ? sampleStationPose(baseline.points, baselineDistances, ghostStation) : null;
      ghost.visible = other !== null;
      if (other) {
        ghost.position.set(other.x - origin.x, other.y - origin.y, other.z - origin.z);
        if (other.orientation) ghost.quaternion.copy(other.orientation); else ghost.quaternion.identity();
        ghostWheels?.update(other);
        ghost.getObjectByName('body-envelope')!.visible = other.yaw !== undefined;
        ghost.getObjectByName('pose-marker')!.visible = other.yaw === undefined;
      }
      rig.follow({target: target.set(...nativeToScene(pose, origin)), yaw: pose.yaw ?? 0, timeSec, stationM: station, index, fraction});
      invalidate();
    },
    mode(next) {
      if (!rig.setMode(next)) return;
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
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); rig.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', invalidate); clearTimeout(refreshTimer); stream.dispose(); ground.dispose(); disposeObjects(scene, true); loader.dispose(); carTextures.dispose(); environment.dispose(); reflection.dispose(); exposure.dispose(); warmup.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
