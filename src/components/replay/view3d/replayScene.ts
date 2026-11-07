import { Group, OrthographicCamera, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer, Mesh, type Material, type Object3D, type Texture } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneryLayoutResource } from '../../../../shared/types/scenes/scenery.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { CAR_FILES } from '../../../api/vehicles/carApi.js';
import { createTracksideCameras } from './tracksideCameras.js';
import type { MapColorMode } from '../map/replayMapUtils.js';
import { ghostDistanceAt, type GhostSyncMode } from '../map/ghostSync.js';
import { sampleRenderPose, sampleStationPose } from './replayPose.js';
import { nativeToScene } from './sceneFrame.js';
import { createLapLayerLoader, type LapCars, type LapLayer } from './laps/lapLayer.js';
import { disposeObjects } from './laps/disposeObjects.js';
import { MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE, panCamera, zoomCamera } from './cameraNavigation.js';
import type { CameraMode } from './cameraModes.js';
import { createChaseCameraTracker, trackCamera } from './cameraTracking.js';
import { driverCamera, driverPose, isDriverCamera, type DriverPose } from './driverCameras.js';
import { addSceneEnvironment } from './sceneEnvironment.js';
import { setCockpitView } from './sceneObjects.js';
import { CachedKtx2Loader } from './scenery/cachedKtx2Loader.js';
import { createChunkLoader } from './scenery/chunkLoader.js';
import { createSceneryGround } from './scenery/sceneryGround.js';
import { surfaceTextureMaps } from './scenery/materials/configureSurfaceMaterial.js';
import { sharpenTexture } from './scenery/materials/textureSource.js';
import type { StreamView } from './scenery/residency.js';
import { createSceneryStream } from './scenery/sceneryStream.js';
import { createGeometryWarmup } from './scenery/geometryWarmup.js';
import { isFreeCameraMode, stationAt, viewMoved } from './scenery/streamView.js';

const DEFAULT_CHASE_DISTANCE_M = 7.8;
const DEFAULT_CHASE_HEIGHT_M = 2.2;
const CHASE_LOOK_ELEVATION_M = 0.5;
const DEFAULT_FOV_DEG = 48, DEFAULT_NEAR_M = 0.5;

export interface ReplaySceneHandle {
  wheelMotion: string;
  updateLaps(trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapCars, signal?: AbortSignal): Promise<boolean>;
  cursor(index: number, fraction: number): void;
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
  try { renderer = new WebGLRenderer({antialias: true, alpha: false}); }
  catch { throw Error('WebGL 2 is unavailable. Use the 2D map.'); }
  const {min, max} = layout.horizon.bounds, origin = new Vector3(...min).add(new Vector3(...max)).multiplyScalar(0.5);
  const loader = createChunkLoader(renderer), carTextures = new CachedKtx2Loader(renderer);
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
  // A chunk compiles its programs and uploads its textures before it joins the scene, a texture per frame, so its first draw does
  // not stall playback. Chunks loaded before the scene exists (the first view) are drawn behind the loading screen anyway.
  let warmTarget: {scene: Scene; camera?: PerspectiveCamera} | null = null;
  const UPLOAD_SLICE_MS = 1, LOADING_SLICE_MS = 50;
  const nextFrame = () => new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
  const nextTask = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });
  // Scenery textures join on their reduced levels; once the first frame is out, their full chains upload a few per frame.
  // The budget is bytes, not time: an upload call returns before the GPU has copied the data, so time does not bound its cost.
  const SHARPEN_BYTES_PER_FRAME = 4 * 1024 * 1024, blurry = new Set<Texture>();
  let sharpening = false, sharpenFrame = 0;
  const sharpen = () => {
    sharpenFrame = 0;
    if (disposed) return;
    let uploaded = 0;
    for (const texture of blurry) {
      blurry.delete(texture);
      uploaded += sharpenTexture(texture, renderer);
      if (uploaded >= SHARPEN_BYTES_PER_FRAME) break;
    }
    if (uploaded) invalidate();
    if (blurry.size) sharpenFrame = requestAnimationFrame(sharpen);
  };
  const queueSharpen = (textures: Iterable<Texture>) => {
    for (const texture of textures) blurry.add(texture);
    if (sharpening && !sharpenFrame && blurry.size) sharpenFrame = requestAnimationFrame(sharpen);
  };
  const geometryWarmup = createGeometryWarmup(renderer, nextFrame, UPLOAD_SLICE_MS);
  const warmUp = async (root: Object3D, signal: AbortSignal) => {
    const target = warmTarget;
    if (!target?.camera) return;
    await renderer.compileAsync(root, target.camera, target.scene);
    const textures = new Set<Texture>();
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const own = (object as Mesh).material, materials: Material[] = Array.isArray(own) ? own : [own];
      for (const material of materials) {
        for (const value of Object.values(material as unknown as Record<string, unknown>)) if (value && (value as Texture).isTexture) textures.add(value as Texture);
        for (const texture of surfaceTextureMaps.get(material) ?? []) textures.add(texture);
      }
    });
    // During playback, upload in per-frame slices: a whole chunk at once is the stall this avoids. Behind the loading screen
    // (the whole first view) nothing is drawn, so long slices only yield a task now and then to keep the page responsive.
    const loading = root === target.scene, uploadBudgetMs = loading ? LOADING_SLICE_MS : UPLOAD_SLICE_MS, pause = loading ? nextTask : nextFrame;
    let sliceEnd = performance.now() + uploadBudgetMs;
    for (const texture of textures) {
      signal.throwIfAborted();
      renderer.initTexture(texture);
      // eslint-disable-next-line no-await-in-loop -- yields between upload slices
      if (performance.now() >= sliceEnd) { await pause(); sliceEnd = performance.now() + uploadBudgetMs; }
    }
    await geometryWarmup.upload(root, target.camera, signal, uploadBudgetMs, pause);
    queueSharpen(textures);
  };
  let warming = Promise.resolve();
  const stream = createSceneryStream(layout, sceneryRoot, {
    load: async (chunk, signal) => {
      const root = await loader.load(chunk, signal);
      // The ray tree builds in a worker while the chunk waits its turn to compile and upload (warm-ups stay one at a time).
      const grounded = ground.add(chunk.id, root);
      const warmed = warming.then(async () => { signal.throwIfAborted(); await warmUp(root, signal); });
      warming = warmed.catch(() => {});
      try { await Promise.all([warmed, grounded]); signal.throwIfAborted(); return root; }
      catch (error) { ground.remove(chunk.id, root); loader.releaseChunk(root); throw error; }
    },
    prepare: (_chunk, root) => {
      // The filler ground sits just under the road: a car shadow on it would show through from below road level.
      root.traverse(object => { if (object instanceof Mesh) object.receiveShadow = !object.name.startsWith('FILLER_GROUND'); });
    },
    unload: (chunk, root) => { ground.remove(chunk.id, root); loader.releaseChunk(root); },
    releaseTexture: asset => loader.releaseTexture(asset),
    changed: () => { freezeScenery(); scheduleRefresh(); invalidate(); },
    failed: (chunk, error) => { if (!disposed) onFailure(`3D scenery chunk ${chunk.id} failed: ${error.message}`); },
  });
  const cleanup = () => {
    disposed = true; window.clearTimeout(refreshTimer); cancelAnimationFrame(sharpenFrame); stream.dispose(); loader.dispose(); carTextures.dispose();
    ground.dispose(); geometryWarmup.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
  const route = layout.routeLengthM;
  const firstStation = stationAt(trajectory.points, 0, 0, route);
  if (firstStation === undefined) { cleanup(); throw Error('This recording has no track stations. Use the 2D map.'); }
  let currentStation = firstStation, mode: CameraMode = 'follow', streamView: StreamView | null = null;
  const loadLaps = createLapLayerLoader(origin, surfaceHeight, path => carTextures.loadAsync(`${CAR_FILES}${path}`));
  // The sky's environment map compiles and renders now, while the scenery files download.
  const scene = new Scene();
  const environment = addSceneEnvironment(scene, renderer, layout.daylight);
  // The horizon and the chunks under the first pose must be resident before cars and lines are draped on them.
  try {
    streamView = {kind: 'lap', lapDistanceM: currentStation}; stream.update(streamView);
    loadLaps.preload(cars); // The car models and textures load alongside the scenery; only draping waits for the ground.
    await stream.whenUnderView();
    layer = await loadLaps(trajectory, baseline, cars, colorBy); layerReady = true;
  } catch (error) { cleanup(); throw error; }
  let lineMode = colorBy, primaryOpacity = 1, baselineOpacity = 1, lapRequest = 0;
  warmTarget = {scene};
  // Convert the native left-handed frame once, including meshes, car bodies and trails.
  // Camera targets/offsets use the same reflection. Mirroring only terrain misaligns poses.
  const world = new Group(); world.scale.z = -1; world.add(sceneryRoot); scene.add(world);
  freezeScenery = () => {
    sceneryRoot.traverse(object => { object.matrixWorldAutoUpdate = true; });
    sceneryRoot.updateWorldMatrix(true, true);
    sceneryRoot.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
  };
  freezeScenery();
  world.add(layer.root);
  const perspective = new PerspectiveCamera(DEFAULT_FOV_DEG, 1, DEFAULT_NEAR_M, 15000);
  warmTarget = {scene, camera: perspective};
  environment.setCamera(perspective);
  // The first view's chunks loaded before the camera existed: compile and upload them (and the cars) behind the loading screen.
  try { await warmUp(scene, new AbortController().signal); } catch (error) { cleanup(); throw error; }
  sharpening = true; queueSharpen([]);
  const overhead = new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000);
  let camera: PerspectiveCamera | OrthographicCamera = perspective;
  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, renderer.domElement);
  controls.enableDamping = false; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = MIN_CAMERA_DISTANCE; controls.maxDistance = MAX_CAMERA_DISTANCE;
  // Replay owns Left/Right; WASD camera pan is dispatched through the shared shortcut guard.
  let frame = 0, initialized = false, currentYaw = 0, currentTime = 0;
  /** Car-mounted views use the game camera's cockpit mesh variant, vertical FOV and near plane (the dash sits closer than 0.5 m). */
  const syncDriverCamera = () => {
    const game = isDriverCamera(mode) ? driverCamera(layer.cameras, mode) : null;
    setCockpitView(layer.primary, game?.cockpitView ?? 'out');
    const fov = game?.fov[1] ?? DEFAULT_FOV_DEG, near = game?.clipPlanes[0] ?? DEFAULT_NEAR_M;
    if (perspective.fov !== fov || perspective.near !== near) { perspective.fov = fov; perspective.near = near; perspective.updateProjectionMatrix(); }
  };
  syncDriverCamera();
  const driver: DriverPose = {eye: new Vector3(), target: new Vector3(), up: new Vector3()};
  /** Puts the camera on the posed primary car's game camera. */
  const placeDriverCamera = () => {
    if (!isDriverCamera(mode)) return;
    const {eye, target: focus, up} = driverPose(layer.primary.getObjectByName('body-envelope')!, driverCamera(layer.cameras, mode), driver);
    camera.position.copy(eye); camera.up.copy(up); controls.target.copy(focus); camera.lookAt(focus);
  };
  const target = new Vector3(), previousTarget = new Vector3();
  const chaseTracker = createChaseCameraTracker();
  let trackside = createTracksideCameras(trajectory.points, layer.primaryDistances, origin);
  /** Stream scenery around the car (lap distance) or, for the panned orbit and overhead cameras, around the camera. */
  const updateStream = () => {
    const next: StreamView = isFreeCameraMode(mode)
      ? {kind: 'free', x: camera.position.x + origin.x, z: origin.z - camera.position.z}
      : {kind: 'lap', lapDistanceM: currentStation};
    if (!viewMoved(streamView, next, route)) return;
    streamView = next; stream.update(next);
  };
  const eyeRotation = new Quaternion(), desiredEye = new Vector3(), correctedEye = new Vector3();
  const draw = () => {
    if (disposed) return;
    updateStream();
    desiredEye.copy(camera.position);
    if (camera === perspective && !isDriverCamera(mode)) ground.resolve(desiredEye, controls.target, origin, correctedEye);
    else correctedEye.copy(desiredEye);
    const corrected = !correctedEye.equals(desiredEye);
    if (corrected) {
      eyeRotation.copy(camera.quaternion);
      camera.position.copy(correctedEye);
      camera.lookAt(controls.target);
    }
    try {
      environment.update(controls.target); renderer.render(scene, camera);
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
    frame = requestAnimationFrame(() => { frame = 0; draw(); });
  };
  let viewportWidth = 0, viewportHeight = 0;
  const resize = () => {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight), aspect = width / height;
    if (width === viewportWidth && height === viewportHeight) return;
    viewportWidth = width; viewportHeight = height;
    renderer.setSize(width, height, false); perspective.aspect = aspect; perspective.updateProjectionMatrix();
    overhead.left = -80 * aspect; overhead.right = 80 * aspect; overhead.updateProjectionMatrix();
    // ResizeObserver runs after animation callbacks, before paint. A canvas resize clears its pixels:
    // draw now, or the embedded map flashes black until next frame when a toolbar changes height.
    if (initialized) draw(); else invalidate();
  };
  const positionCamera = () => {
    if (isDriverCamera(mode)) { placeDriverCamera(); invalidate(); return; }
    controls.target.copy(target); camera.position.copy(target).add(new Vector3(24, mode === 'top' ? 180 : 22, 35));
    if (mode === 'top') camera.position.copy(target).add(new Vector3(0, 180, 0.01));
    if (mode === 'chase') {
      chaseTracker.reset(target, currentYaw, currentTime);
      controls.target.copy(target).add(new Vector3(0, CHASE_LOOK_ELEVATION_M, 0));
      camera.position.copy(target).add(new Vector3(
        DEFAULT_CHASE_DISTANCE_M * Math.sin(currentYaw),
        DEFAULT_CHASE_HEIGHT_M,
        -DEFAULT_CHASE_DISTANCE_M * Math.cos(currentYaw),
      ));
    }
    camera.lookAt(target); controls.update(); invalidate();
  };
  const reset = () => {
    camera.zoom = 1; camera.updateProjectionMatrix();
    if (!isDriverCamera(mode)) camera.up.set(0, 1, 0);
    positionCamera();
  };
  const contextLost = (event: Event) => { event.preventDefault(); onFailure('The 3D graphics context was lost. Retry or return to 2D.'); };
  controls.addEventListener('change', invalidate);
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
      layer.dispose(); layer = replacement; world.add(layer.root);
      syncDriverCamera();
      trackside = createTracksideCameras(next.points, layer.primaryDistances, origin);
      return true;
    },
    cursor(index, fraction) {
      const {trajectory, baseline, primary, ghost, primaryWheels, ghostWheels, primaryDistances, baselineDistances, ghostClock} = layer;
      const pose = sampleRenderPose(trajectory.points, index, fraction);
      primary.visible = pose !== null;
      if (!pose) { invalidate(); return; }
      primary.position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z);
      if (pose.orientation) primary.quaternion.copy(pose.orientation); else primary.quaternion.identity();
      primaryWheels.update(pose);
      currentYaw = pose.yaw ?? 0;
      const sample = trajectory.points[pose.index], nextSample = trajectory.points[pose.index + 1];
      currentTime = (sample.timeSec ?? pose.index / 40) + ((nextSample?.timeSec ?? sample.timeSec ?? 0) - (sample.timeSec ?? 0)) * pose.fraction;
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
      previousTarget.copy(target); target.set(...nativeToScene(pose, origin));
      // The first pose places the camera; tracking from the zero previous target would shift it by the car's whole offset.
      if (!initialized) { initialized = true; reset(); }
      else if (mode === 'trackside') {
        const spot = trackside(station);
        if (spot) { camera.position.copy(spot); controls.target.copy(target); camera.lookAt(target); controls.update(); }
      } else if (mode === 'follow' || mode === 'top') {
        trackCamera(camera, controls.target, previousTarget, target, 0);
        controls.update();
      } else if (mode === 'chase') {
        const continuous = initialized && target.distanceTo(previousTarget) <= 15;
        chaseTracker.track(camera, controls.target, target, currentYaw, trajectory.points, index, fraction, continuous);
        controls.update();
      } else if (isDriverCamera(mode)) placeDriverCamera();
      invalidate();
    },
    mode(next) {
      if (next === mode) return;
      const wasTop = mode === 'top', wasDriver = isDriverCamera(mode); mode = next;
      const driverView = isDriverCamera(mode);
      camera = mode === 'top' ? overhead : perspective; controls.object = camera; environment.setCamera(camera);
      controls.enabled = !driverView;
      if (wasDriver && !driverView) camera.up.set(0, 1, 0);
      syncDriverCamera();

      // Follow, chase, the car-mounted game cameras and trackside stay locked on the car; panning belongs to orbit and overhead.
      controls.enablePan = mode === 'orbit' || mode === 'top';
      controls.enableRotate = mode !== 'top' && mode !== 'trackside' && !driverView;
      if (mode === 'top' || wasTop || mode === 'chase' || driverView || wasDriver) reset();
      else if (mode === 'follow') {
        camera.position.add(new Vector3().subVectors(target, controls.target)); controls.target.copy(target);
      }
      if (!driverView) controls.update();
      invalidate();
    },
    reset,
    center() {
      if (isDriverCamera(mode)) { reset(); return; }
      camera.position.add(new Vector3().subVectors(target, controls.target));
      controls.target.copy(target);
      if (mode === 'chase') {
        controls.target.add(new Vector3(0, CHASE_LOOK_ELEVATION_M, 0));
        chaseTracker.reset(target, currentYaw, currentTime);
      }
      controls.update(); invalidate();
    },
    zoom(direction) {
      if (isDriverCamera(mode) && camera instanceof PerspectiveCamera) {
        const factor = Math.pow(1.2, direction);
        camera.zoom = Math.max(0.6, Math.min(2.5, camera.zoom * factor));
        camera.updateProjectionMatrix();
      } else {
        zoomCamera(camera, controls.target, direction);
        controls.update();
      }
      invalidate();
    },
    pan(horizontal, vertical) { panCamera(camera, controls.target, horizontal, vertical); controls.update(); invalidate(); },
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
      disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(sharpenFrame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', invalidate); clearTimeout(refreshTimer); stream.dispose(); ground.dispose(); disposeObjects(scene, true); loader.dispose(); carTextures.dispose(); environment.dispose(); geometryWarmup.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
