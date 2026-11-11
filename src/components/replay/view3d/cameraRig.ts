import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE, panCamera, zoomCamera } from './cameraNavigation.js';
import type { CameraMode } from './cameraModes.js';
import { createChaseCameraTracker, trackCamera } from './cameraTracking.js';
import { driverCamera, driverPose, isDriverCamera, type DriverPose } from './driverCameras.js';
import type { LapLayer } from './laps/lapLayer.js';
import { setCockpitView } from './sceneObjects.js';
import { createTracksideCameras } from './tracksideCameras.js';

const DEFAULT_CHASE_DISTANCE_M = 7.8;
const DEFAULT_CHASE_HEIGHT_M = 2.2;
const CHASE_LOOK_ELEVATION_M = 0.5;
const DEFAULT_FOV_DEG = 48, DEFAULT_NEAR_M = 0.5, FAR_M = 15000;
/** Half the overhead view's height, metres. */
const OVERHEAD_HALF_M = 80;

/** Where the primary car is this frame, in scene coordinates, and what the chase camera follows it by. */
export interface RigPose {
  target: Vector3;
  yaw: number;
  timeSec: number;
  /** The lap distance of the pose (trackside spots) and the sample it lies at (the chase camera's look-ahead). */
  stationM: number;
  index: number;
  fraction: number;
}

/** The cameras of the 3D view and how each mode moves them with the car. */
export interface CameraRig {
  /** The perspective camera: exists from the start, so the scenery warms up for it before the rig follows a car. */
  readonly perspective: PerspectiveCamera;
  /** The camera the frame is drawn with: the overhead one in top view, else the perspective one. */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly mode: CameraMode;
  /** The point the camera looks at (scene coordinates). */
  readonly focus: Vector3;
  /** Whether the first pose has placed the camera. */
  readonly placed: boolean;
  /** Free views (not on a car) keep the eye above the ground and out of walls; car-mounted and overhead views do not. */
  readonly checksGround: boolean;
  /** The lap's cars: trackside spots along its line, and the game cameras and cockpit mesh of its primary car. */
  setLayer(layer: LapLayer): void;
  /** Moves the camera with the primary car's pose by the mode's rule (the first pose places it). */
  follow(pose: RigPose): void;
  /** Switches the mode; false when it is the current one. */
  setMode(next: CameraMode): boolean;
  reset(): void;
  center(): void;
  zoom(direction: number): void;
  pan(horizontal: number, vertical: number): void;
  resize(aspect: number): void;
  dispose(): void;
}

/**
 * Follow, chase, the car-mounted game cameras and trackside stay locked on the car; panning belongs to orbit and overhead. Pointer
 * input goes through OrbitControls on `element`; `changed` asks for a frame. `origin` is the scene origin in LMU local metres.
 */
export function createCameraRig(element: HTMLElement, origin: Vector3, changed: () => void): CameraRig {
  const perspective = new PerspectiveCamera(DEFAULT_FOV_DEG, 1, DEFAULT_NEAR_M, FAR_M);
  const overhead = new OrthographicCamera(-OVERHEAD_HALF_M, OVERHEAD_HALF_M, OVERHEAD_HALF_M, -OVERHEAD_HALF_M, 0.5, FAR_M);
  let camera: PerspectiveCamera | OrthographicCamera = perspective, mode: CameraMode = 'follow', layer: LapLayer | null = null;
  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, element);
  controls.enableDamping = false; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = MIN_CAMERA_DISTANCE; controls.maxDistance = MAX_CAMERA_DISTANCE;
  controls.addEventListener('change', changed);
  const target = new Vector3(), previousTarget = new Vector3(), chaseTracker = createChaseCameraTracker();
  let trackside: ReturnType<typeof createTracksideCameras> = () => null, placed = false, currentYaw = 0, currentTime = 0;
  /** Car-mounted views use the game camera's cockpit mesh variant, vertical FOV and near plane (the dash sits closer than 0.5 m). */
  const syncDriverCamera = () => {
    if (!layer) return;
    const game = isDriverCamera(mode) ? driverCamera(layer.cameras, mode) : null;
    setCockpitView(layer.primary, game?.cockpitView ?? 'out');
    const fov = game?.fov[1] ?? DEFAULT_FOV_DEG, near = game?.clipPlanes[0] ?? DEFAULT_NEAR_M;
    if (perspective.fov !== fov || perspective.near !== near) { perspective.fov = fov; perspective.near = near; perspective.updateProjectionMatrix(); }
  };
  const driver: DriverPose = {eye: new Vector3(), target: new Vector3(), up: new Vector3()};
  /** Puts the camera on the posed primary car's game camera. */
  const placeDriverCamera = () => {
    if (!layer || !isDriverCamera(mode)) return;
    const {eye, target: focus, up} = driverPose(layer.primary.getObjectByName('body-envelope')!, driverCamera(layer.cameras, mode), driver);
    camera.position.copy(eye); camera.up.copy(up); controls.target.copy(focus); camera.lookAt(focus);
  };
  const positionCamera = () => {
    if (isDriverCamera(mode)) { placeDriverCamera(); changed(); return; }
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
    camera.lookAt(target); controls.update(); changed();
  };
  const reset = () => {
    camera.zoom = 1; camera.updateProjectionMatrix();
    if (!isDriverCamera(mode)) camera.up.set(0, 1, 0);
    positionCamera();
  };
  return {
    perspective,
    get camera() { return camera; },
    get mode() { return mode; },
    focus: controls.target,
    get placed() { return placed; },
    get checksGround() { return camera === perspective && !isDriverCamera(mode); },
    setLayer(next) {
      layer = next;
      trackside = createTracksideCameras(next.trajectory.points, next.primaryDistances, origin);
      syncDriverCamera();
    },
    follow(pose) {
      currentYaw = pose.yaw; currentTime = pose.timeSec;
      previousTarget.copy(target); target.copy(pose.target);
      // The first pose places the camera; tracking from the zero previous target would shift it by the car's whole offset.
      if (!placed) { placed = true; reset(); return; }
      if (mode === 'trackside') {
        const spot = trackside(pose.stationM);
        if (spot) { camera.position.copy(spot); controls.target.copy(target); camera.lookAt(target); controls.update(); }
      } else if (mode === 'follow' || mode === 'top') {
        trackCamera(camera, controls.target, previousTarget, target, 0);
        controls.update();
      } else if (mode === 'chase') {
        chaseTracker.track(camera, controls.target, target, pose.yaw, layer!.trajectory.points, pose.index, pose.fraction, target.distanceTo(previousTarget) <= 15);
        controls.update();
      } else placeDriverCamera();
    },
    setMode(next) {
      if (next === mode) return false;
      const wasTop = mode === 'top', wasDriver = isDriverCamera(mode); mode = next;
      const driverView = isDriverCamera(mode);
      camera = mode === 'top' ? overhead : perspective; controls.object = camera;
      controls.enabled = !driverView;
      if (wasDriver && !driverView) camera.up.set(0, 1, 0);
      syncDriverCamera();
      controls.enablePan = mode === 'orbit' || mode === 'top';
      controls.enableRotate = mode !== 'top' && mode !== 'trackside' && !driverView;
      if (mode === 'top' || wasTop || mode === 'chase' || driverView || wasDriver) reset();
      else if (mode === 'follow') {
        camera.position.add(new Vector3().subVectors(target, controls.target)); controls.target.copy(target);
      }
      if (!driverView) controls.update();
      changed();
      return true;
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
      controls.update(); changed();
    },
    zoom(direction) {
      if (isDriverCamera(mode) && camera instanceof PerspectiveCamera) {
        camera.zoom = Math.max(0.6, Math.min(2.5, camera.zoom * Math.pow(1.2, direction)));
        camera.updateProjectionMatrix();
      } else {
        zoomCamera(camera, controls.target, direction);
        controls.update();
      }
      changed();
    },
    pan(horizontal, vertical) { panCamera(camera, controls.target, horizontal, vertical); controls.update(); changed(); },
    resize(aspect) {
      perspective.aspect = aspect; perspective.updateProjectionMatrix();
      overhead.left = -OVERHEAD_HALF_M * aspect; overhead.right = OVERHEAD_HALF_M * aspect; overhead.updateProjectionMatrix();
    },
    dispose() { controls.dispose(); },
  };
}
