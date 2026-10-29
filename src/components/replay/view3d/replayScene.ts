import { BufferAttribute, BufferGeometry, FrontSide, Group, Mesh, Texture, type Material, OrthographicCamera, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Object3D } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { TrackSceneResource } from '../../../../shared/types/scenes/trackScene.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../utils/lapAlignment.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import { makeCar } from './sceneObjects.js';
import { createTracksideCameras } from './tracksideCameras.js';
import { applyKerbStripes } from './kerbStripes.js';
import { BASELINE_LINE, colorRacingLine, makeRacingLine, racingLineColors } from './racingLine.js';
import type { MapColorMode } from '../map/replayMapUtils.js';
import { sampleRenderPose, sampleStationPose } from './replayPose.js';
import { nativeToScene } from './sceneFrame.js';
import type { LoadedVehicleMesh } from '../../../api/vehicleMeshApi.js';
import { createSurfaceHeight } from './surfaceProjection.js';
import { MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE, panCamera, zoomCamera } from './cameraNavigation.js';
import type { CameraMode } from './cameraModes.js';
import { trackCamera } from './cameraTracking.js';
import { createWheelAnimation } from './wheelAnimation.js';
import { addSceneEnvironment, TERRAIN_COLOR } from './sceneEnvironment.js';
import { createDefaultTerrain } from './defaultTerrain.js';
import { makeBrakeBoards } from './brakeBoards.js';
import { applyActiveRoad, rasterizeActiveRoad } from './activeRoad.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../../../shared/types/trackGeometry.js';
import { makeTrackLimits } from './trackLimits.js';

/** Eye height kept above the road, scanned terrain and default ground. */
const CAMERA_CLEARANCE_M = 1.2;

export interface ReplaySceneHandle {
  wheelMotion: string;
  cursor(index: number, fraction: number): void;
  mode(mode: CameraMode): void;
  reset(): void;
  center(): void;
  zoom(direction: number): void;
  pan(horizontal: number, vertical: number): void;
  /** Recolour both racing lines with a 2D map heat-map mode. */
  colorLines(colorBy: MapColorMode): void;
  dispose(): void;
}

/** Native exports wind clockwise (left-handed). Turn every ground triangle to face up so normals light it from above. */
function faceUp(geometry: BufferGeometry): void {
  const index = geometry.index, position = geometry.getAttribute('position');
  if (!index) return;
  for (let i = 0; i + 2 < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const ux = position.getX(b) - position.getX(a), uz = position.getZ(b) - position.getZ(a);
    const vx = position.getX(c) - position.getX(a), vz = position.getZ(c) - position.getZ(a);
    if (uz * vx - ux * vz < 0) { index.setX(i + 1, c); index.setX(i + 2, b); }
  }
  index.needsUpdate = true;
}

/** Barriers, pit wall, pit building and walls: structure, not ground, so they stay out of road heights; the relief rises to their base. */
const BARRIER_KINDS = new Set(['barrier', 'tyreBarrier', 'tecpro', 'pitWall', 'building', 'wall', 'armco']);

export function detachBarriers(root: Object3D): Group {
  const barriers = new Group(); barriers.name = 'barriers';
  for (const child of root.children.filter(child => BARRIER_KINDS.has(child.name))) barriers.add(child);
  barriers.traverse(object => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  return barriers;
}

/**
 * Extends each structure down to the relief where the ground under it is lower, so no wall shows sky
 * beneath it. Base vertices are the lowest corner of a triangle that stands up (flat caps stay put).
 * `barriers` must still be in native coordinates; `groundAt` takes and returns native metres.
 */
export function groundBarriers(barriers: Object3D, groundAt: (x: number, z: number) => number): void {
  const BURY_M = 0.3, STANDING_M = 0.2;
  barriers.traverse(object => {
    if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
    const position: unknown = object.geometry.getAttribute('position'), index = object.geometry.index;
    if (!(position instanceof BufferAttribute)) return;
    const bases = new Set<number>(), count = index?.count ?? position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const corners = [0, 1, 2].map(c => index?.getX(t + c) ?? t + c), ys = corners.map(v => position.getY(v));
      if (Math.max(...ys) - Math.min(...ys) > STANDING_M) bases.add(corners[ys.indexOf(Math.min(...ys))]);
    }
    for (const v of bases) position.setY(v, Math.min(position.getY(v), groundAt(position.getX(v), position.getZ(v)) - BURY_M));
    if (bases.size) { position.needsUpdate = true; object.geometry.computeBoundingBox(); object.geometry.computeBoundingSphere(); }
  });
}

function disposeObjects(root: Object3D): void {
  const materials = new Set<import('three').Material>(), geometries = new Set<import('three').BufferGeometry>();
  root.traverse(object => {
    if (object instanceof Mesh || 'isLineSegments' in object) {
      const renderable = object as Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => { if ('map' in material && material.map instanceof Texture) material.map.dispose(); material.dispose(); });
}

export async function createReplayScene(
  host: HTMLDivElement, bytes: ArrayBuffer, metadata: TrackSceneResource,
  trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null,
  onFailure: (message: string) => void,
  vehicleModels: {primary: LoadedVehicleMesh | null; baseline: LoadedVehicleMesh | null},
  /** The 2D map's layout: white-line limits, plus display layers (brake boards, active road outline). */
  track: {geometry: TrackBoundaryGeometry; display: TrackMapDisplay | null} | null = null,
  colorBy: MapColorMode = 'default',
): Promise<ReplaySceneHandle> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const models = new Map<ArrayBuffer, Promise<Group>>();
  const loadModel = (asset: LoadedVehicleMesh | null): Promise<Group | null> => {
    if (!asset) return Promise.resolve(null);
    let pending = models.get(asset.bytes);
    if (!pending) {
      pending = new GLTFLoader().parseAsync(asset.bytes, '').then(result => {
        result.scene.traverse(object => { if (object instanceof Mesh && object.geometry instanceof BufferGeometry) object.geometry.computeVertexNormals(); });
        return result.scene;
      });
      models.set(asset.bytes, pending);
    }
    return pending;
  };
  const [primaryModel, baselineModel] = await Promise.all([loadModel(vehicleModels.primary), loadModel(vehicleModels.baseline)]);
  let renderer: WebGLRenderer;
  // Logarithmic depth: terrain sits 0.2 m under the road, which a linear 0.2 m–30 km buffer cannot separate past ~700 m.
  try { renderer = new WebGLRenderer({antialias: true, alpha: false, logarithmicDepthBuffer: true}); }
  catch { disposeObjects(gltf.scene); throw Error('WebGL 2 is unavailable. Use the 2D map.'); }
  const scene = new Scene();
  const origin = new Vector3(...metadata.bounds.min).add(new Vector3(...metadata.bounds.max)).multiplyScalar(0.5);
  const barriers = detachBarriers(gltf.scene);
  const surfaceHeight = createSurfaceHeight(gltf.scene);
  const terrain = createDefaultTerrain([gltf.scene, barriers], metadata.bounds, origin, metadata.bounds.min[1] - 0.6, TERRAIN_COLOR);
  groundBarriers(barriers, (x, z) => terrain.heightAt(x - origin.x, z - origin.z) + origin.y);
  gltf.scene.position.copy(origin).negate(); barriers.position.copy(gltf.scene.position);
  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh) || !(object.geometry instanceof BufferGeometry)) return;
    const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
    faceUp(mesh.geometry); mesh.geometry.computeVertexNormals(); mesh.receiveShadow = true;
    // Raised kerbs throw a strip of shade on the road; flat sheets would only cost shadow-map time.
    mesh.castShadow = mesh.name === 'kerb';
    // Ground sheets are one-sided: an underside seen past a hillside edge is never drawn.
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.side = FrontSide;
  });
  // Convert the native left-handed frame once, including meshes, car bodies and trails.
  // Camera targets/offsets use the same reflection. Mirroring only terrain misaligns poses.
  const world = new Group(); world.scale.z = -1; world.add(gltf.scene, barriers); scene.add(world);
  const environment = addSceneEnvironment(scene, renderer, metadata.bounds.min[1] - origin.y);
  world.add(terrain.mesh);
  const display = track?.display ?? null, activeRoad = rasterizeActiveRoad(display?.surfaces.road ?? [], metadata.bounds);
  applyActiveRoad(gltf.scene, activeRoad, metadata.bounds);
  scene.add(makeBrakeBoards(display?.brakeMarkers ?? [], trajectory.points, origin, surfaceHeight));
  const primary = makeCar(trajectory, TELEMETRY_COLORS.primary, false, primaryModel);
  const ghost = baseline ? makeCar(baseline, TELEMETRY_COLORS.baseline, true, baselineModel) : new Group();
  const primaryWheels = createWheelAnimation(primary, trajectory, surfaceHeight);
  // Only the primary car casts: its contact shadow is what grounds it; a translucent ghost shadow would read as a second car.
  // Set after the wheel rigs exist: their tyres must cast too, or the body's shadow floats beside them.
  primary.traverse(object => { if (object instanceof Mesh) object.castShadow = true; });
  const ghostWheels = baseline ? createWheelAnimation(ghost, baseline, surfaceHeight) : null;
  const initialColors = racingLineColors(trajectory, baseline, colorBy);
  const primaryLine = makeRacingLine(trajectory, origin, initialColors.primary, surfaceHeight);
  const baselineLine = baseline ? makeRacingLine(baseline, origin, initialColors.baseline, surfaceHeight, BASELINE_LINE.widthM, BASELINE_LINE.liftM) : null;
  if (track) world.add(makeTrackLimits([track.geometry.leftBoundary, track.geometry.rightBoundary], trajectory.points, origin, surfaceHeight));
  world.add(primary, ghost, primaryLine); if (baselineLine) world.add(baselineLine);
  const perspective = new PerspectiveCamera(48, 1, 0.2, 30000);
  const overhead = new OrthographicCamera(-80, 80, 80, -80, 0.2, 30000);
  let camera: PerspectiveCamera | OrthographicCamera = perspective;
  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, renderer.domElement);
  controls.enableDamping = false; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = MIN_CAMERA_DISTANCE; controls.maxDistance = MAX_CAMERA_DISTANCE;
  // Replay owns Left/Right; WASD camera pan is dispatched through the shared shortcut guard.
  let mode: CameraMode = 'follow', frame = 0, disposed = false, initialized = false, currentYaw = 0;
  const target = new Vector3(), previousTarget = new Vector3();
  const primaryDistances = getTrajectoryDistances(trajectory.points, trajectory.trackLengthM);
  applyKerbStripes(gltf.scene, trajectory.points, primaryDistances);
  const trackside = createTracksideCameras(trajectory.points, primaryDistances, origin);
  const baselineDistances = baseline ? getDistancesInReferenceFrame(baseline.points, trajectory.points, trajectory.trackLengthM) : [];
  const ground = {x: 0, y: 0, z: 0};
  /** Lift a perspective eye that orbit, zoom or follow pushed below the road, hills or default ground. */
  const keepAboveGround = () => {
    if (camera !== perspective) return;
    const eye = camera.position;
    ground.x = eye.x + origin.x; ground.y = eye.y + origin.y + 60; ground.z = origin.z - eye.z;
    const surface = surfaceHeight(ground, 400);
    const floor = Math.max(environment.groundY, terrain.heightAt(eye.x, -eye.z), surface === null ? -Infinity : surface - origin.y) + CAMERA_CLEARANCE_M;
    if (eye.y < floor) { eye.y = floor; camera.lookAt(controls.target); }
  };
  const invalidate = () => {
    if (disposed || frame || document.hidden) return;
    frame = requestAnimationFrame(() => { frame = 0; if (!disposed) { keepAboveGround(); renderer.render(scene, camera); } });
  };
  const resize = () => {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight), aspect = width / height;
    renderer.setSize(width, height, false); perspective.aspect = aspect; perspective.updateProjectionMatrix();
    overhead.left = -80 * aspect; overhead.right = 80 * aspect; overhead.updateProjectionMatrix(); invalidate();
  };
  const positionCamera = () => {
    controls.target.copy(target); camera.position.copy(target).add(new Vector3(24, mode === 'top' ? 180 : 22, 35));
    if (mode === 'top') camera.position.copy(target).add(new Vector3(0, 180, 0.01));
    if (mode === 'chase') camera.position.copy(target).add(new Vector3(17 * Math.sin(currentYaw), 6, -17 * Math.cos(currentYaw)));
    camera.lookAt(target); controls.update(); invalidate();
  };
  const reset = () => { camera.zoom = 1; camera.updateProjectionMatrix(); positionCamera(); };
  const contextLost = (event: Event) => { event.preventDefault(); onFailure('The 3D graphics context was lost. Retry or return to 2D.'); };
  controls.addEventListener('change', invalidate);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.domElement.className = 'h-full w-full';
  host.append(renderer.domElement);
  const observer = new ResizeObserver(resize); observer.observe(host);
  document.addEventListener('visibilitychange', invalidate); resize();
  return {
    wheelMotion: primaryWheels.description,
    cursor(index, fraction) {
      const pose = sampleRenderPose(trajectory.points, index, fraction);
      primary.visible = pose !== null;
      if (!pose) { invalidate(); return; }
      primary.position.set(pose.x - origin.x, pose.y - origin.y, pose.z - origin.z);
      if (pose.orientation) primary.quaternion.copy(pose.orientation); else primary.quaternion.identity();
      primaryWheels.update(pose);
      const previousYaw = currentYaw; currentYaw = pose.yaw ?? 0;
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
      } else if (mode === 'follow' || mode === 'top' || mode === 'chase') {
        trackCamera(camera, controls.target, previousTarget, target, mode === 'chase' ? currentYaw - previousYaw : 0);
        controls.update();
      }
      invalidate();
    },
    mode(next) {
      if (next === mode) return;
      const wasTop = mode === 'top'; mode = next;
      camera = mode === 'top' ? overhead : perspective; controls.object = camera;
      // Follow, chase and trackside stay locked on the car; panning belongs to orbit and overhead.
      controls.enablePan = mode === 'orbit' || mode === 'top';
      controls.enableRotate = mode !== 'top' && mode !== 'trackside';
      if (mode === 'top' || wasTop || mode === 'chase') reset();
      else if (mode === 'follow') {
        camera.position.add(new Vector3().subVectors(target, controls.target)); controls.target.copy(target);
      }
      controls.update(); invalidate();
    },
    reset,
    center() {
      camera.position.add(new Vector3().subVectors(target, controls.target));
      controls.target.copy(target); controls.update(); invalidate();
    },
    zoom(direction) {
      zoomCamera(camera, controls.target, direction);
      controls.update(); invalidate();
    },
    pan(horizontal, vertical) { panCamera(camera, controls.target, horizontal, vertical); controls.update(); invalidate(); },
    colorLines(next) {
      const colors = racingLineColors(trajectory, baseline, next);
      colorRacingLine(primaryLine, colors.primary); if (baselineLine) colorRacingLine(baselineLine, colors.baseline);
      invalidate();
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', invalidate); disposeObjects(scene); activeRoad?.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
