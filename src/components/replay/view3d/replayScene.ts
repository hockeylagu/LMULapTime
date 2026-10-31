import {MeshoptDecoder} from 'meshoptimizer/decoder';
import { BufferGeometry, FrontSide, Group, Mesh, type Material, OrthographicCamera, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer, type Object3D } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { TrackSceneResource } from '../../../../shared/types/scenes/trackScene.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { createTracksideCameras } from './tracksideCameras.js';
import { applyKerbStripes } from './kerbStripes.js';
import type { MapColorMode } from '../map/replayMapUtils.js';
import { sampleRenderPose, sampleStationPose } from './replayPose.js';
import { nativeToScene } from './sceneFrame.js';
import { createLapLayerLoader, type LapVehicleModels } from './laps/lapLayer.js';
import { disposeObjects } from './laps/disposeObjects.js';
import type { SurfaceHeight } from './surfaceProjection.js';
import { prepareSurfaceLayers } from './surfaceProjection.js';
import { MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE, panCamera, zoomCamera } from './cameraNavigation.js';
import type { CameraMode } from './cameraModes.js';
import { computeCockpitPose, createChaseCameraTracker, trackCamera } from './cameraTracking.js';
import { addSceneEnvironment } from './sceneEnvironment.js';
import { makeBrakeBoards } from './brakeBoards.js';
import type { LoadedBrakeBoardArtwork } from '../../../api/scenes/brakeBoardArtworkApi.js';
import { activeRoadBounds, applyActiveRoad, rasterizeActiveRoad } from './activeRoad.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../../../shared/types/trackGeometry.js';
import { makeTrackLimits } from './trackLimits.js';

/** Eye height kept above the road, filler ground and horizon ground. */
const CAMERA_CLEARANCE_M = 1.2;
const DEFAULT_CHASE_DISTANCE_M = 7.8;
const DEFAULT_CHASE_HEIGHT_M = 2.2;
const CHASE_LOOK_ELEVATION_M = 0.5;

export interface ReplaySceneHandle {
  wheelMotion: string;
  updateLaps(trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, models: LapVehicleModels, signal?: AbortSignal): Promise<boolean>;
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

/** Barriers, pit wall, pit building and walls: structure, not ground, so they stay out of road heights. */
const BARRIER_KINDS = new Set(['barrier', 'tyreBarrier', 'tecpro', 'pitWall', 'building', 'wall', 'armco']);

export function detachBarriers(root: Object3D): Group {
  const barriers = new Group(); barriers.name = 'barriers';
  for (const child of root.children.filter(child => BARRIER_KINDS.has(child.name))) barriers.add(child);
  barriers.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object.geometry instanceof BufferGeometry && !object.geometry.getAttribute('normal')) {
      object.geometry.computeVertexNormals();
    }
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return barriers;
}

/**
 * Lowest eye height (scene frame) that keeps the sight line to `look` over the scanned surfaces between
 * them: past a banking's top, an eye below the road edge saw the car through the culled road.
 */
export function sightLineFloor(eye: Vector3, look: Vector3, origin: Vector3, surfaceHeight: SurfaceHeight): number {
  const CLEARANCE_M = 0.1, SAMPLES = 8;
  let floor = -Infinity;
  for (let k = 1; k < SAMPLES; k++) {
    const s = k / SAMPLES;
    const x = look.x + (eye.x - look.x) * s + origin.x, z = origin.z - (look.z + (eye.z - look.z) * s);
    const height = surfaceHeight({x, y: look.y + (eye.y - look.y) * s + origin.y + 3, z}, 400);
    if (height !== null) floor = Math.max(floor, look.y + (height - origin.y + CLEARANCE_M - look.y) / s);
  }
  return floor;
}

export async function createReplayScene(
  host: HTMLDivElement, bytes: ArrayBuffer, metadata: TrackSceneResource,
  trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null,
  onFailure: (message: string) => void,
  vehicleModels: LapVehicleModels,
  /** The 2D map's layout: white-line limits, plus display layers (brake boards, active road outline). */
  track: {geometry: TrackBoundaryGeometry; display: TrackMapDisplay | null} | null = null,
  colorBy: MapColorMode = 'default',
  boardArtwork: LoadedBrakeBoardArtwork[] = [],
): Promise<ReplaySceneHandle> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
  const origin = new Vector3(...metadata.bounds.min).add(new Vector3(...metadata.bounds.max)).multiplyScalar(0.5);
  const barriers = detachBarriers(gltf.scene);
  // Road heights exclude the filler ground and walls.
  const {fillerGround, surfaceHeight, groundHeight} = prepareSurfaceLayers(gltf.scene);
  const loadLaps = createLapLayerLoader(origin, surfaceHeight);
  let layer: Awaited<ReturnType<typeof loadLaps>>;
  try { layer = await loadLaps(trajectory, baseline, vehicleModels, colorBy); }
  catch (error) { disposeObjects(gltf.scene); disposeObjects(barriers); throw error; }
  let lineMode = colorBy, primaryOpacity = 1, baselineOpacity = 1, lapRequest = 0;
  let renderer: WebGLRenderer;
  try { renderer = new WebGLRenderer({antialias: true, alpha: false}); }
  catch { layer.dispose(); disposeObjects(gltf.scene); disposeObjects(barriers); throw Error('WebGL 2 is unavailable. Use the 2D map.'); }
  const scene = new Scene();
  const environment = addSceneEnvironment(scene, renderer, metadata.bounds.min[1] - origin.y);
  gltf.scene.position.copy(origin).negate(); barriers.position.copy(gltf.scene.position);
  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    // The filler ground sits just under the road: a car shadow on it would show through from below road level.
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
    mesh.receiveShadow = mesh !== fillerGround;
    // Raised kerbs throw a strip of shade on the road; flat sheets would only cost shadow-map time.
    mesh.castShadow = mesh.name === 'kerb' || mesh.name.startsWith('kerb-source-');
    // Ground sheets are one-sided (the package winds them face up): an underside seen past a hillside edge is never drawn.
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material.side = FrontSide;
      if (mesh === fillerGround) { material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1; }
    }
  });
  // Convert the native left-handed frame once, including meshes, car bodies and trails.
  // Camera targets/offsets use the same reflection. Mirroring only terrain misaligns poses.
  const world = new Group(); world.scale.z = -1; world.add(gltf.scene, barriers); scene.add(world);
  const display = track?.display ?? null, roadBounds = activeRoadBounds(display?.surfaces.road ?? [], metadata.bounds);
  const activeRoad = rasterizeActiveRoad(display?.surfaces.road ?? [], roadBounds);
  applyActiveRoad(gltf.scene, activeRoad, roadBounds);
  scene.add(makeBrakeBoards(display?.brakeMarkers ?? [], trajectory.points, origin, surfaceHeight, boardArtwork));
  if (track) world.add(makeTrackLimits([track.geometry.leftBoundary, track.geometry.rightBoundary], trajectory.points, origin, surfaceHeight));
  world.add(layer.root);
  const perspective = new PerspectiveCamera(48, 1, 0.5, 15000);
  const overhead = new OrthographicCamera(-80, 80, 80, -80, 0.5, 15000);
  let camera: PerspectiveCamera | OrthographicCamera = perspective;
  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, renderer.domElement);
  controls.enableDamping = false; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = MIN_CAMERA_DISTANCE; controls.maxDistance = MAX_CAMERA_DISTANCE;
  // Replay owns Left/Right; WASD camera pan is dispatched through the shared shortcut guard.
  let mode: CameraMode = 'follow', frame = 0, disposed = false, initialized = false, currentYaw = 0, currentTime = 0;
  const syncCockpitVisibility = () => {
    layer.primary.traverse(obj => {
      if (obj.name === 'cabin' || obj.name === 'glass') obj.visible = mode !== 'cockpit';
    });
  };
  syncCockpitVisibility();
  let currentOrientation: Quaternion | undefined;
  const target = new Vector3(), previousTarget = new Vector3();
  const chaseTracker = createChaseCameraTracker();
  applyKerbStripes(gltf.scene, trajectory.points, layer.primaryDistances);
  let trackside = createTracksideCameras(trajectory.points, layer.primaryDistances, origin);
  const ground = {x: 0, y: 0, z: 0};
  /** Lift a perspective eye that orbit, zoom or follow pushed below the road, hills or default ground. */
  const keepAboveGround = () => {
    if (camera !== perspective || mode === 'cockpit') return;
    const eye = camera.position;
    ground.x = eye.x + origin.x; ground.y = eye.y + origin.y + 60; ground.z = origin.z - eye.z;
    const surface = surfaceHeight(ground, 400), filler = groundHeight(ground, 400);
    const floor = Math.max(environment.groundY, ...[surface, filler].map(height => height === null ? -Infinity : height - origin.y)) + CAMERA_CLEARANCE_M;
    const lowest = Math.max(floor, sightLineFloor(eye, controls.target, origin, surfaceHeight));
    if (eye.y < lowest) { eye.y = lowest; camera.lookAt(controls.target); }
  };
  const draw = () => { if (!disposed) { keepAboveGround(); renderer.render(scene, camera); } };
  const invalidate = () => {
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
      const compatible = (lap: ReplayTrajectoryData) => lap.layoutKey === metadata.layoutKey && lap.geometryRevision === metadata.sourceGeometryRevision
        && lap.dataPluginRevision === trajectory.dataPluginRevision;
      if (!compatible(next) || (comparison && !compatible(comparison))) throw Error('Lap and 3D scene must use the same layout, geometry and package revision.');
      const request = ++lapRequest;
      const replacement = await loadLaps(next, comparison, assets, lineMode);
      if (disposed || signal?.aborted || request !== lapRequest) { replacement.dispose(); return false; }
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
      previousTarget.copy(target); target.set(...nativeToScene(pose, origin)); environment.follow(target);
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
      camera = mode === 'top' ? overhead : perspective; controls.object = camera;
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
      document.removeEventListener('visibilitychange', invalidate); disposeObjects(scene, true); activeRoad?.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
