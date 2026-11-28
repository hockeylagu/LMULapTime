import { Box3, MathUtils, MOUSE, OrthographicCamera, PerspectiveCamera, Vector3, type Object3D } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE, flyCamera } from './cameraNavigation.js';
import type { CameraMode } from './cameraModes.js';
import { createChaseCameraTracker, trackCamera } from './cameraTracking.js';
import { driverCamera, driverPose, isDriverCamera, type DriverPose } from './driverCameras.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { setCockpitView } from '../cars/carParts.js';
import { createTracksideCameras, type TracksideSpots } from './tracksideCameras.js';
import type { TracksideState } from './tracksideSight.js';
import { nativeToScene } from '../scene/replayPose.js';
import { createHeldKeys, type HeldKey } from './heldKeys.js';

const DEFAULT_CHASE_DISTANCE_M = 7.8;
const DEFAULT_CHASE_HEIGHT_M = 2.2;
const CHASE_LOOK_ELEVATION_M = 0.5;
const DEFAULT_FOV_DEG = 48, DEFAULT_NEAR_M = 0.5, FAR_M = 15000;
/** Half the overhead view's height, metres. */
const OVERHEAD_HALF_M = 80;
const FOLLOW_POLAR_LIMIT = Math.PI * 0.49;
// OrbitControls uses 0.95 for a wheel delta of 100 at its default zoom speed.
const DOLLY_PER_STEP = 0.95;

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

/**
 * The car the cameras follow: its model (the game cameras ride on its body), its game cameras, and the samples around its pose
 * (the chase camera's look-ahead) with their lap distances (trackside spots; none leaves trackside where it stands).
 */
export interface RigCar {
  readonly primary: Object3D;
  readonly cameras: LoadedBody['descriptor']['cameras']['list'];
  /** The body's chase camera LOD multiplier (`cameras.chase.lodMultiplier`). */
  readonly chaseLodMultiplier: number;
  readonly trajectory: {readonly points: ReplayTrajectoryPoint[]};
  readonly primaryDistances: number[];
}

/** The overview's height above the horizon, degrees, and the room left round the lap (a share of its radius). */
const OVERVIEW_PITCH_DEG = 15, OVERVIEW_MARGIN = 1.1, UP_AXIS = new Vector3(0, 1, 0);

/** The cameras of the 3D view and how each mode moves them with the car. */
export interface CameraRig {
  /** The perspective camera: exists from the start, so the scenery warms up for it before the rig follows a car. */
  readonly perspective: PerspectiveCamera;
  /** The camera the frame is drawn with: the overhead one in top view, else the perspective one. */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly mode: CameraMode;
  /** The point the camera looks at (scene coordinates). */
  readonly focus: Vector3;
  /**
   * How far the camera is from the lap where it looks (the lap point nearest the middle of the view; the point it looks at without
   * one): the trace curtains' height step reads it (`curtainStep`).
   */
  readonly lapInViewM: number;
  /** Whether the first pose has placed the camera. */
  readonly placed: boolean;
  /** The replay time of the pose the camera last followed, in seconds. */
  readonly timeSec: number;
  /** The next pose places the camera again, as the first did: new content (lap or race) takes over the scene. */
  unplace(): void;
  /** In trackside view: the spots, the one showing and the place shown at each (`tracksideSight.ts` keeps them clear); else null. */
  readonly trackside: TracksideState | null;
  /**
   * The whole lap from the air at an angle (orbit view, keeping the compass direction the camera looks in): every trace curtain
   * at once. The caller switches the mode to orbit first, when there is a lap to frame (`hasLap`).
   */
  overview(): void;
  /** Whether a lap is placed (the followed car's): what the overview frames. */
  readonly hasLap: boolean;
  /** Free views (not on a car) keep the eye above the ground and out of walls; car-mounted and overhead views do not. */
  readonly checksGround: boolean;
  /** The primary car's game camera of a car-mounted view, null in the other views or before the first layer. */
  readonly gameCamera: LoadedBody['descriptor']['cameras']['list'][number] | null;
  /**
   * The factor the view scales every LOD distance by (the reference divides the distance by it): the primary car's game camera in a
   * car-mounted view, its chase camera's in the follow and chase views, 1 in the others.
   */
  readonly lodMultiplier: number;
  /** The lap's cars: trackside spots along its line, and the game cameras and cockpit mesh of its primary car. */
  setLayer(layer: RigCar): void;
  /** Moves the camera with the primary car's pose by the mode's rule (the first pose places it). */
  follow(pose: RigPose): void;
  /** Switches the mode; false when it is the current one. */
  setMode(next: CameraMode): boolean;
  reset(): void;
  /** Stands a free camera at `eye` looking at `look` (scene coordinates); the car moving on leaves it there. */
  frame(eye: Vector3, look: Vector3): void;
  center(): void;
  zoom(direction: number): void;
  /** A held camera key went down or up (`heldKeys.ts`); a move or zoom then runs each frame while held. */
  holdKey(key: HeldKey, down: boolean): void;
  /** Every held key stops (the window lost focus). */
  releaseKeys(): void;
  /** The frame's step (the shell calls it as each frame starts, `frameTime` in ms): moves the camera by the held keys; true while they move it. */
  step(frameTime: number): boolean;
  resize(aspect: number): void;
  dispose(): void;
}

/**
 * Follow, chase, the car-mounted game cameras and trackside stay locked on the car; panning belongs to orbit and overhead. A drag
 * in trackside starts as an orbit or pan round the car, and the view hands it over to orbit (`Scene3DFrame`). Pointer input goes
 * through OrbitControls on `element`; `changed` asks for a frame. `origin` is the scene origin in LMU local metres.
 */
/**
 * `groundLift`: metres a point (scene frame) must rise to stand `clearanceM` above the ground (an eye's clearance by default),
 * `referenceY` a height above it to look down from; the fly keys slide along the ground with it,
 * as a game's free camera, rather than diving under it.
 */
export function createCameraRig(element: HTMLElement, origin: Vector3, changed: () => void, groundLift?: (point: Vector3, referenceY?: number, clearanceM?: number) => number): CameraRig {
  const perspective = new PerspectiveCamera(DEFAULT_FOV_DEG, 1, DEFAULT_NEAR_M, FAR_M);
  const overhead = new OrthographicCamera(-OVERHEAD_HALF_M, OVERHEAD_HALF_M, OVERHEAD_HALF_M, -OVERHEAD_HALF_M, 0.5, FAR_M);
  let camera: PerspectiveCamera | OrthographicCamera = perspective, mode: CameraMode = 'follow', layer: RigCar | null = null;
  const controls = new OrbitControls<PerspectiveCamera | OrthographicCamera>(camera, element);
  controls.enableDamping = false; controls.enablePan = false; controls.maxPolarAngle = FOLLOW_POLAR_LIMIT; controls.minDistance = MIN_CAMERA_DISTANCE; controls.maxDistance = MAX_CAMERA_DISTANCE;
  controls.minZoom = 0.1; controls.maxZoom = 40;
  const mapDragButtons = (event: PointerEvent) => {
    // OrbitControls interchanges rotate and pan for modifier drags. Keep Shift for camera speed.
    const shiftOnly = event.shiftKey && !event.ctrlKey && !event.metaKey;
    controls.mouseButtons.LEFT = shiftOnly ? MOUSE.PAN : MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = shiftOnly ? MOUSE.ROTATE : MOUSE.PAN;
  };
  element.addEventListener('pointerdown', mapDragButtons, true);
  const liftClearOfGround = () => {
    const rise = groundLift?.(camera.position, mode === 'orbit' ? controls.target.y : undefined) ?? 0;
    // Translate both points to preserve tilt and zoom when an orbit or descent meets the terrain.
    if (rise > 0) { camera.position.y += rise; controls.target.y += rise; }
  };
  /** The lap's points in the scene (built once per lap, on first use): the overview frames them, the fly keys' speed and the curtains' step read them. */
  let lapScene: Vector3[] | null = null;
  const lapPoints = () => (lapScene ??= (layer?.trajectory.points ?? []).map(point => new Vector3(...nativeToScene(point, origin))));
  /**
   * How far the camera is from the lap's nearest point (from the point it looks at without one): the fly keys' speed, so they slow as
   * the camera nears the circuit rather than following a look point out over the hills (driver, 2026-11-28).
   */
  const reachToLap = () => {
    let nearest = Infinity;
    for (const point of lapPoints()) nearest = Math.min(nearest, point.distanceToSquared(camera.position));
    return Number.isFinite(nearest) ? Math.sqrt(nearest) : camera.position.distanceTo(controls.target);
  };
  /** `CameraRig.lapInViewM`. Every frame reads it (the curtains' height step), so it is kept until the camera moves or turns. */
  const viewedFrom = new Vector3(NaN, NaN, NaN), viewedAlong = new Vector3(), toPoint = new Vector3();
  let viewed = 0;
  const lapInView = () => {
    const along = camera.getWorldDirection(toPoint);
    if (lapScene?.length && camera.position.equals(viewedFrom) && along.equals(viewedAlong)) return viewed;
    viewedFrom.copy(camera.position); viewedAlong.copy(along);
    let best = -Infinity;
    viewed = camera.position.distanceTo(controls.target);
    for (const point of lapPoints()) {
      const distance = toPoint.subVectors(point, camera.position).length(), facing = toPoint.dot(viewedAlong) / distance;
      if (distance > 0 && facing > best) { best = facing; viewed = distance; }
    }
    return viewed;
  };
  /** How far the point the camera looks at is under the ground (0 on or above it). */
  const sunk = () => groundLift?.(controls.target, camera.position.y, 0) ?? 0;
  controls.addEventListener('change', () => {
    if (mode === 'orbit') liftClearOfGround();
    changed();
  });
  const target = new Vector3(), previousTarget = new Vector3(), chaseTracker = createChaseCameraTracker();
  let spots: TracksideSpots | null = null, placed = false, currentYaw = 0, currentTime = 0;
  /** Trackside: the spot showing, and the place shown at each spot (0, the first, until the sight check picks another). */
  let spot = -1, places: number[] = [];
  const placeTrackside = () => {
    const eye = spots?.candidates(spot)[places[spot] ?? 0];
    if (!eye) return;
    camera.position.copy(eye); controls.target.copy(target); camera.lookAt(target); controls.update();
  };
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
    const {eye, target: focus, up} = driverPose(layer.primary, driverCamera(layer.cameras, mode), driver);
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
  const zoomBy = (direction: number) => {
    if (isDriverCamera(mode) && camera instanceof PerspectiveCamera) {
      camera.zoom = Math.max(0.6, Math.min(2.5, camera.zoom * Math.pow(1.2, direction)));
      camera.updateProjectionMatrix();
    } else {
      const scale = DOLLY_PER_STEP ** (Math.abs(direction) * controls.zoomSpeed);
      if (direction > 0) controls.dollyIn(scale);
      else controls.dollyOut(scale);
    }
  };
  const held = createHeldKeys();
  let lastStep: number | null = null;
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
    get lapInViewM() { return lapInView(); },
    get placed() { return placed; },
    get timeSec() { return currentTime; },
    unplace() { placed = false; },
    get trackside() {
      if (mode !== 'trackside' || !spots) return null;
      const shown = spots;
      const state: TracksideState = {
        // The spot showing when read, not when this was made: a sight check resolving later compares it.
        spots: shown, get spot() { return spot; },
        placeOf: at => places[at] ?? 0,
        choose(at, place) {
          if (shown !== spots || places[at] === place) return;
          places[at] = place;
          if (at === spot && mode === 'trackside') { placeTrackside(); changed(); }
        },
      };
      return state;
    },
    get hasLap() { return lapPoints().length > 0; },
    overview() {
      const scene = lapPoints();
      if (!scene.length || !(camera instanceof PerspectiveCamera)) return;
      const centre = new Box3().setFromPoints(scene).getCenter(new Vector3());
      // At 45° to the lap's long axis (its points' principal axis on the ground), so the lap runs away diagonally: along it, it bunches
      // up; across it, a low camera flattens it to a band (driver, 2026-11-28). Of the four diagonals, the nearest the way the camera
      // looks now; seen from OVERVIEW_PITCH_DEG above the horizon.
      let xx = 0, zz = 0, xz = 0;
      for (const point of scene) { const x = point.x - centre.x, z = point.z - centre.z; xx += x * x; zz += z * z; xz += x * z; }
      const axis = 0.5 * Math.atan2(2 * xz, xx - zz), now = camera.getWorldDirection(new Vector3());
      const heading = [1, 3, 5, 7].map(eighth => new Vector3(Math.cos(axis + eighth * Math.PI / 4), 0, Math.sin(axis + eighth * Math.PI / 4)))
        .reduce((best, each) => (each.dot(now) > best.dot(now) ? each : best));
      const pitch = MathUtils.degToRad(OVERVIEW_PITCH_DEG);
      const forward = heading.clone().multiplyScalar(Math.cos(pitch)).setY(-Math.sin(pitch));
      const right = new Vector3().crossVectors(forward, UP_AXIS).normalize(), up = new Vector3().crossVectors(right, forward);
      camera.zoom = 1; camera.updateProjectionMatrix();
      // The orientation is set, so the view holds a point when the eye stands far enough behind it along `forward`, within the view's
      // half-angles across: per axis, the outermost points bound the eye's offset across by its depth, and the depth that leaves one
      // offset is the closest that fits. The farther of the two axes' depths fits both, the margin leaving room round the lap.
      const tanV = Math.tan(MathUtils.degToRad(camera.fov) / 2) / OVERVIEW_MARGIN, tanH = tanV * camera.aspect;
      const bounds = (across: Vector3, tan: number) => {
        let low = -Infinity, high = Infinity;
        for (const point of scene) {
          const side = across.dot(point), depth = forward.dot(point);
          low = Math.max(low, side - tan * depth); high = Math.min(high, side + tan * depth);
        }
        return {low, high, depth: (high - low) / (2 * tan)};
      };
      const horizontal = bounds(right, tanH), vertical = bounds(up, tanV);
      const depth = Math.max(forward.dot(centre) - MAX_CAMERA_DISTANCE, Math.min(horizontal.depth, vertical.depth));
      // Within the offsets left at that depth, the one that centres the lap on screen: its nearest points loom, so the middle of the
      // offsets would not. The lap's two extremes move apart on screen as the offset does, so halving the range finds it.
      const centred = (across: Vector3, tan: number, {low, high}: {low: number; high: number}) => {
        let from = Math.min(low + tan * depth, high - tan * depth), to = Math.max(low + tan * depth, high - tan * depth);
        for (let step = 0; step < 40; step++) {
          const offset = (from + to) / 2;
          let least = Infinity, most = -Infinity;
          for (const point of scene) {
            const shown = (across.dot(point) - offset) / (forward.dot(point) - depth);
            least = Math.min(least, shown); most = Math.max(most, shown);
          }
          if (least + most > 0) from = offset; else to = offset;
        }
        return (from + to) / 2;
      };
      const eye = right.clone().multiplyScalar(centred(right, tanH, horizontal)).addScaledVector(up, centred(up, tanV, vertical))
        .addScaledVector(forward, depth);
      // The pivot on the view's axis by the lap point nearest it: the box's centre can lie inside a hill, and the ground check pulls
      // the eye in front of whatever stands between it and the pivot.
      const ahead = (point: Vector3) => forward.dot(point) - depth;
      const nearest = scene.reduce((best, point) => (ahead(point) / point.distanceTo(eye) > ahead(best) / best.distanceTo(eye) ? point : best));
      this.frame(eye, eye.clone().addScaledVector(forward, ahead(nearest)));
    },
    get checksGround() { return camera === perspective && !isDriverCamera(mode); },
    get gameCamera() { return layer && isDriverCamera(mode) ? driverCamera(layer.cameras, mode) : null; },
    get lodMultiplier() {
      if (!layer) return 1;
      if (isDriverCamera(mode)) return driverCamera(layer.cameras, mode).lodMultiplier;
      return mode === 'follow' || mode === 'chase' ? layer.chaseLodMultiplier : 1;
    },
    setLayer(next) {
      layer = next; lapScene = null; viewedFrom.set(NaN, NaN, NaN);
      spots = createTracksideCameras(next.trajectory.points, next.primaryDistances, origin); spot = -1; places = [];
      syncDriverCamera();
    },
    follow(pose) {
      currentYaw = pose.yaw; currentTime = pose.timeSec;
      previousTarget.copy(target); target.copy(pose.target);
      // The first pose places the camera; tracking from the zero previous target would shift it by the car's whole offset.
      if (!placed) { placed = true; reset(); return; }
      if (mode === 'trackside') {
        spot = spots?.indexAt(pose.stationM) ?? -1;
        placeTrackside();
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
      controls.enablePan = mode === 'orbit' || mode === 'top' || mode === 'trackside';
      controls.enableRotate = mode !== 'top' && !driverView;
      controls.maxPolarAngle = mode === 'orbit' ? Math.PI : FOLLOW_POLAR_LIMIT;
      if (mode === 'top' || wasTop || mode === 'chase' || driverView || wasDriver) reset();
      else if (mode === 'follow') {
        camera.position.add(new Vector3().subVectors(target, controls.target)); controls.target.copy(target);
      }
      if (!driverView) controls.update();
      changed();
      return true;
    },
    reset,
    frame(eye, look) {
      placed = true;
      camera.up.set(0, 1, 0); camera.position.copy(eye); controls.target.copy(look); camera.lookAt(look);
      controls.update(); changed();
    },
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
    zoom(direction) { zoomBy(direction); changed(); },
    holdKey(key, down) {
      if (!held.set(key, down)) return;
      if (down && key === 'in') zoomBy(1);
      if (down && key === 'out') zoomBy(-1);
      if (!held.moving) lastStep = null;
      if (held.moving) changed();
    },
    releaseKeys() { held.releaseAll(); lastStep = null; },
    step(frameTime) {
      const dt = lastStep === null ? 0 : (frameTime - lastStep) / 1000;
      const move = held.step(dt, reachToLap());
      lastStep = move ? frameTime : null;
      if (!move) return false;
      if (move.strafe || move.forward || move.lift) {
        const wasSunk = sunk();
        flyCamera(camera, controls.target, move);
        // The point it looks at rides the ground too: flown level into a hill it would sink under it, and the ground check, which
        // keeps the line from it to the eye clear, would pull the eye down onto the slope (driver, 2026-11-28). It rises by as much
        // as the ground under it did; a descent with Q still takes it under the road, keeping the view.
        const rise = Math.max(groundLift?.(camera.position, controls.target.y) ?? 0, sunk() - wasSunk + move.lift);
        if (rise > 0) { camera.position.y += rise; controls.target.y += rise; }
        camera.lookAt(controls.target); controls.update();
      }
      if (move.zoomSteps) zoomBy(move.zoomSteps);
      return held.moving;
    },
    resize(aspect) {
      perspective.aspect = aspect; perspective.updateProjectionMatrix();
      overhead.left = -OVERHEAD_HALF_M * aspect; overhead.right = OVERHEAD_HALF_M * aspect; overhead.updateProjectionMatrix();
    },
    dispose() {
      element.removeEventListener('pointerdown', mapDragButtons, true);
      controls.dispose();
    },
  };
}
