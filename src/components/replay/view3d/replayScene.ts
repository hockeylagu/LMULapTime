import { Group, OrthographicCamera, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer, Mesh, type Material, type Object3D, type Texture } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneryLayoutResource } from '../../../../shared/types/scenes/scenery.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { CAR_FILES } from '../../../api/vehicles/carApi.js';
import { createTracksideCameras } from './tracksideCameras.js';
import type { MapColorMode } from '../map/replayMapUtils.js';
import { sampleRenderPose, sampleStationPose } from './replayPose.js';
import { nativeToScene } from './sceneFrame.js';
import { createLapLayerLoader, type LapCars, type LapLayer } from './laps/lapLayer.js';
import { disposeObjects } from './laps/disposeObjects.js';
import { MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE, panCamera, zoomCamera } from './cameraNavigation.js';
import type { CameraMode } from './cameraModes.js';
import { computeCockpitPose, createChaseCameraTracker, trackCamera } from './cameraTracking.js';
import { addSceneEnvironment } from './sceneEnvironment.js';
import { setCockpitView } from './sceneObjects.js';
import { CachedKtx2Loader } from './scenery/cachedKtx2Loader.js';
import { createChunkLoader } from './scenery/chunkLoader.js';
import { createSceneryHeights } from './scenery/sceneryHeights.js';
import {createCameraCollision} from './scenery/cameraCollision.js';
import { surfaceTextureMaps } from './scenery/materials/configureSurfaceMaterial.js';
import type { StreamView } from './scenery/residency.js';
import { createSceneryStream } from './scenery/sceneryStream.js';
import { createGeometryWarmup } from './scenery/geometryWarmup.js';
import { isFreeCameraMode, stationAt, viewMoved } from './scenery/streamView.js';

const DEFAULT_CHASE_DISTANCE_M = 7.8;
const DEFAULT_CHASE_HEIGHT_M = 2.2;
const CHASE_LOOK_ELEVATION_M = 0.5;

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
  const loader = createChunkLoader(renderer), carTextures = new CachedKtx2Loader(renderer), heights = createSceneryHeights(() => { scheduleRefresh(); invalidate(); });
  const {surfaceHeight} = heights;
  const collision = createCameraCollision();
  // Scenery chunks live in native coordinates under one group, shifted by the scene origin.
  const sceneryRoot = new Group(); sceneryRoot.position.copy(origin).negate();
  let layer: LapLayer, layerReady = false;
  let disposed = false, refreshTimer = 0, invalidate: () => void = () => {};
  // Lines are draped on the road: when the resident chunks change, re-drape them (coalesced).
  let freezeScenery = () => {};
  let prepareShadows = (_root: Object3D) => {};
  const scheduleRefresh = () => {
    if (refreshTimer || !layerReady) return;
    refreshTimer = window.setTimeout(() => { refreshTimer = 0; if (disposed) return; layer.refreshHeights(); invalidate(); }, 250);
  };
  // A chunk compiles its programs and uploads its textures before it joins the scene, a texture per frame, so its first draw does
  // not stall playback. Chunks loaded before the scene exists (the first view) are drawn behind the loading screen anyway.
  let warmTarget: {scene: Scene; camera?: PerspectiveCamera} | null = null;
  const UPLOAD_SLICE_MS = 1;
  const nextFrame = () => new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
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
    // Upload in per-frame slices: a whole chunk at once is the stall this avoids.
    const uploadBudgetMs = root === target.scene ? 12 : UPLOAD_SLICE_MS;
    let sliceEnd = performance.now() + uploadBudgetMs;
    for (const texture of textures) {
      signal.throwIfAborted();
      renderer.initTexture(texture);
      // eslint-disable-next-line no-await-in-loop -- yields a frame between upload slices
      if (performance.now() >= sliceEnd) { await nextFrame(); sliceEnd = performance.now() + uploadBudgetMs; }
    }
    await geometryWarmup.upload(root, target.camera, signal, uploadBudgetMs);
  };
  let warming = Promise.resolve();
  const stream = createSceneryStream(layout, sceneryRoot, {
    load: async (chunk, signal) => {
      const root = await loader.load(chunk, signal);
      const ready = warming.then(async () => { signal.throwIfAborted(); prepareShadows(root); await warmUp(root, signal); await collision.add(chunk.id, root); signal.throwIfAborted(); });
      warming = ready.catch(() => {});
      try { await ready; return root; }
      catch (error) { collision.remove(chunk.id); loader.releaseChunk(root); throw error; }
    },
    prepare: (chunk, root) => {
      // The filler ground sits just under the road: a car shadow on it would show through from below road level.
      root.traverse(object => { if (object instanceof Mesh) object.receiveShadow = !object.name.startsWith('FILLER_GROUND'); });
      heights.add(chunk.id, root, chunk.bounds);
    },
    unload: (chunk, root) => { heights.remove(chunk.id); collision.remove(chunk.id); loader.releaseChunk(root); },
    releaseTexture: asset => loader.releaseTexture(asset),
    changed: () => { freezeScenery(); scheduleRefresh(); invalidate(); },
    failed: (chunk, error) => { if (!disposed) onFailure(`3D scenery chunk ${chunk.id} failed: ${error.message}`); },
  });
  const cleanup = () => {
    disposed = true; window.clearTimeout(refreshTimer); heights.dispose(); stream.dispose(); loader.dispose(); carTextures.dispose();
    collision.dispose(); geometryWarmup.dispose(); renderer.dispose(); renderer.forceContextLoss();
  };
  const route = layout.routeLengthM;
  const firstStation = stationAt(trajectory.points, 0, 0, route);
  if (firstStation === undefined) { cleanup(); throw Error('This recording has no track stations. Use the 2D map.'); }
  let currentStation = firstStation, mode: CameraMode = 'follow', streamView: StreamView | null = null;
  const loadLaps = createLapLayerLoader(origin, surfaceHeight, path => carTextures.loadAsync(`${CAR_FILES}${path}`));
  // The horizon and the chunks under the first pose must be resident before cars and lines are draped on them.
  try {
    streamView = {kind: 'lap', lapDistanceM: currentStation}; stream.update(streamView);
    await stream.whenUnderView();
    await heights.whenReady();
    layer = await loadLaps(trajectory, baseline, cars, colorBy); layerReady = true;
  } catch (error) { cleanup(); throw error; }
  let lineMode = colorBy, primaryOpacity = 1, baselineOpacity = 1, lapRequest = 0;
  const scene = new Scene();
  warmTarget = {scene};
  const environment = addSceneEnvironment(scene, renderer, layout.daylight);
  prepareShadows = root => environment.prepareObject(root);
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
  const perspective = new PerspectiveCamera(48, 1, 0.5, 15000);
  warmTarget = {scene, camera: perspective};
  environment.setCamera(perspective);
  // The first view's chunks loaded before the camera existed: compile and upload them (and the cars) behind the loading screen.
  try { await warmUp(scene, new AbortController().signal); } catch (error) { cleanup(); throw error; }
  const overhead = new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000);
  let camera: PerspectiveCamera | OrthographicCamera = perspective;
  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, renderer.domElement);
  controls.enableDamping = false; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = MIN_CAMERA_DISTANCE; controls.maxDistance = MAX_CAMERA_DISTANCE;
  // Replay owns Left/Right; WASD camera pan is dispatched through the shared shortcut guard.
  let frame = 0, initialized = false, currentYaw = 0, currentTime = 0;
  const syncCockpitVisibility = () => {
    setCockpitView(layer.primary, mode === 'cockpit' ? 'in' : 'out');
  };
  syncCockpitVisibility();
  let currentOrientation: Quaternion | undefined;
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
    if (camera === perspective && mode !== 'cockpit') collision.resolve(desiredEye, controls.target, origin, correctedEye);
    else correctedEye.copy(desiredEye);
    const corrected = !correctedEye.equals(desiredEye);
    if (corrected) {
      eyeRotation.copy(camera.quaternion);
      camera.position.copy(correctedEye);
      camera.lookAt(controls.target);
    }
    try {
      environment.update(); renderer.render(scene, camera);
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
    if (mode === 'cockpit') {
      const modelOffset = layer.primary.getObjectByName('body-envelope')!.position;
      const { eye, target: focusTarget, up } = computeCockpitPose(target, currentOrientation, currentYaw, modelOffset);
      camera.position.copy(eye);
      camera.up.copy(up);
      controls.target.copy(focusTarget);
      camera.lookAt(focusTarget);
      invalidate();
      return;
    }
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
    if (mode !== 'cockpit') camera.up.set(0, 1, 0);
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
      environment.prepareObject(replacement.root);
      replacement.colorLines(lineMode); replacement.fadeLines(primaryOpacity, baselineOpacity);
      layer.dispose(); layer = replacement; world.add(layer.root);
      syncCockpitVisibility();
      trackside = createTracksideCameras(next.points, layer.primaryDistances, origin);
      return true;
    },
    cursor(index, fraction) {
      const {trajectory, baseline, primary, ghost, primaryWheels, ghostWheels, primaryDistances, baselineDistances} = layer;
      const pose = sampleRenderPose(trajectory.points, index, fraction);
      primary.visible = pose !== null;
      if (!pose) { invalidate(); return; }
      primary.position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z);
      if (pose.orientation) primary.quaternion.copy(pose.orientation); else primary.quaternion.identity();
      primaryWheels.update(pose);
      currentYaw = pose.yaw ?? 0;
      currentOrientation = pose.orientation;
      const sample = trajectory.points[pose.index], nextSample = trajectory.points[pose.index + 1];
      currentTime = (sample.timeSec ?? pose.index / 40) + ((nextSample?.timeSec ?? sample.timeSec ?? 0) - (sample.timeSec ?? 0)) * pose.fraction;
      primary.getObjectByName('body-envelope')!.visible = pose.yaw !== undefined;
      primary.getObjectByName('pose-marker')!.visible = pose.yaw === undefined;

      const lapStation = stationAt(trajectory.points, pose.index, pose.fraction, route);
      if (lapStation !== undefined) currentStation = lapStation;
      const station = (primaryDistances[index] ?? 0) + ((primaryDistances[index + 1] ?? primaryDistances[index] ?? 0) - (primaryDistances[index] ?? 0)) * fraction;
      const other = baseline ? sampleStationPose(baseline.points, baselineDistances, station) : null;
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
      } else if (mode === 'cockpit') {
        const modelOffset = primary.getObjectByName('body-envelope')!.position;
        const { eye, target: focusTarget, up } = computeCockpitPose(target, pose.orientation, currentYaw, modelOffset);
        camera.position.copy(eye);
        camera.up.copy(up);
        controls.target.copy(focusTarget);
        camera.lookAt(focusTarget);
      }
      invalidate();
    },
    mode(next) {
      if (next === mode) return;
      const wasTop = mode === 'top', wasCockpit = mode === 'cockpit'; mode = next;
      camera = mode === 'top' ? overhead : perspective; controls.object = camera; environment.setCamera(camera);
      controls.enabled = mode !== 'cockpit';
      if (wasCockpit && mode !== 'cockpit') camera.up.set(0, 1, 0);
      syncCockpitVisibility();

      // Follow, chase, cockpit and trackside stay locked on the car; panning belongs to orbit and overhead.
      controls.enablePan = mode === 'orbit' || mode === 'top';
      controls.enableRotate = mode !== 'top' && mode !== 'trackside' && mode !== 'cockpit';
      if (mode === 'top' || wasTop || mode === 'chase' || mode === 'cockpit' || wasCockpit) reset();
      else if (mode === 'follow') {
        camera.position.add(new Vector3().subVectors(target, controls.target)); controls.target.copy(target);
      }
      if (mode !== 'cockpit') controls.update();
      invalidate();
    },
    reset,
    center() {
      if (mode === 'cockpit') { reset(); return; }
      camera.position.add(new Vector3().subVectors(target, controls.target));
      controls.target.copy(target);
      if (mode === 'chase') {
        controls.target.add(new Vector3(0, CHASE_LOOK_ELEVATION_M, 0));
        chaseTracker.reset(target, currentYaw, currentTime);
      }
      controls.update(); invalidate();
    },
    zoom(direction) {
      if (mode === 'cockpit' && camera instanceof PerspectiveCamera) {
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
    fadeLines(primary, comparison) {
      primaryOpacity = primary; baselineOpacity = comparison; layer.fadeLines(primary, comparison);
      invalidate();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', invalidate); clearTimeout(refreshTimer); heights.dispose(); stream.dispose(); collision.dispose(); disposeObjects(scene, true); loader.dispose(); carTextures.dispose(); environment.dispose(); geometryWarmup.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
