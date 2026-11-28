import { Matrix4, OrthographicCamera, Vector3, type PerspectiveCamera } from 'three';
import type { HeldKey } from '../camera/heldKeys.js';
import type { SpotCar } from '../night/carSpots.js';
import { isBraking } from '../car/lampStates.js';
import type { SceneryLayoutResource } from '../../../../../shared/types/scenes/scenery.js';
import type { ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import { ghostDistanceAt, type GhostSyncMode } from '../../map/ghostSync.js';
import { nativeToScene, sampleRenderPose, sampleStationPose } from '../scene/replayPose.js';
import { createLapLayerLoader, type LapCars, type LapLayer } from './lapLayer.js';
import type { DrivingMark } from './drivingMarks.js';
import type { CursorAt, LapCurtains } from './curtainLayer.js';
import { clearSpan, pickStrip, pickStripFoot, type StripHit } from './tracePick.js';
import { metresPerPixel } from './traceCurtain.js';
import { findIndexAtDistance } from '../../../../utils/lapAlignment.js';
import { createCarSets } from '../cars/drawnCar.js';
import { setCameraDistance } from '../cars/carParts.js';
import { ghostFader } from '../cars/ghostFade.js';
import type { CameraMode } from '../camera/cameraModes.js';
import { cornerFraming } from '../camera/cornerFraming.js';
import type { SceneLoadProgress } from '../scene/loadProgress.js';
import { stationAt } from '../scenery/streamView.js';
import type { SceneContent, SceneShell } from '../scene/sceneShell.js';

/** How near the pointer a sample's foot picks it, in CSS pixels (`metresPerPixel` measures drawn ones). */
const FOOT_PICK_REACH_PX = 16;

export interface ReplaySceneHandle {
  wheelMotion: string;
  /** Shows other laps once their cars (`assets`, maybe still loading) are built; the scene's corner note counts them meanwhile. */
  updateLaps(trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapCars | Promise<LapCars>, signal?: AbortSignal): Promise<boolean>;
  cursor(index: number, fraction: number): void;
  /** Runs at the start of each animation frame the scene draws, with the frame's time: playback advances its clock there, so the
   * pose drawn is always the frame's own (replayPlaybackCursor.ts). */
  beforeFrame(hook: ((frameTime: number) => void) | null): void;
  mode(mode: CameraMode): void;
  reset(): void;
  /** The whole lap from the air at an angle, in orbit view: every trace curtain at once (`CameraRig.overview`). */
  overview(): void;
  /** Frames a lap's samples `start` to `end` (`points`) from the free camera, outside the turn at `apex` (orbit mode only). */
  frameStretch(points: ReplayTrajectoryPoint[], start: number, end: number, apex: number): void;
  center(): void;
  zoom(direction: number): void;
  /** A held camera key went down or up: the camera moves each frame while held (`heldKeys.ts`). */
  holdKey(key: HeldKey, down: boolean): void;
  releaseKeys(): void;
  /** Draws a corner's driving marks on each lap's line (null clears them); laps shown later keep them. */
  showMarks(marks: DrivingMark[] | null): void;
  /** Recolour both racing lines with a 2D map heat-map mode. */
  colorLines(colorBy: MapColorMode): void;
  /** Fade either racing line (opacity 0–1, 0 hides it), as the 2D map fades a line on request. */
  fadeLines(primaryOpacity: number, baselineOpacity: number): void;
  /**
   * Shows a trace curtain over each lap's line in place of the racing lines (null: the lines). `values` builds a channel's curtains for
   * the laps shown, and again for laps shown later.
   */
  showTrace(values: TraceValues | null): void;
  /**
   * The lap sample under the pointer (CSS pixels in the host) on a shown curtain or racing ribbon, the nearer lap's where both are;
   * null where none shows there or scenery in front hides it. Answers a frame or two later (the GPU tells what the frame drew).
   */
  pickTrace(x: number, y: number): Promise<TracePick | null>;
  /** Stands the hover line on the curtain at a picked sample (null: none); the car stays where it is. */
  hoverTrace(pick: TracePick | null): void;
  /** Place the ghost at the same distance, the same lap time, or the same time since marker A (as the 2D map). */
  syncGhost(mode: GhostSyncMode, anchorDistM: number | null): void;
  dispose(): void;
}

/** A channel's curtain values for a lap and its comparison lap; null when the lap has none of the channel. */
export type TraceValues = (lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) => LapCurtains | null;

/** A hover pick on a lap's curtain or ribbon: the lap hit, its own sample, and the lap's sample at the same lap distance. */
export interface TracePick {
  lap: 'primary' | 'baseline';
  /** The hit lap's sample. */
  index: number;
  /** The primary lap's sample at that lap distance (the cursor's index). */
  primaryIndex: number;
}

/** Where the lap view's scenery streams first: around the lap's first pose. */
export function lapFirstStation(trajectory: ReplayTrajectoryData, layout: SceneryLayoutResource): number {
  const station = stationAt(trajectory.points, 0, 0, layout.routeLengthM);
  if (station === undefined) throw Error('This recording has no track stations. Use the 2D map.');
  return station;
}

/**
 * The lap view's 3D scene: two laps' cars and racing lines in the shared scene shell (`shell`, of `layout`), its canvas in `host`.
 * Its `dispose` leaves the shell to the next view.
 */
export async function createReplayScene(
  shell: SceneShell, host: HTMLDivElement, layout: SceneryLayoutResource,
  trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null,
  onFailure: (message: string) => void,
  cars: LapCars,
  colorBy: MapColorMode = 'default',
  onProgress: (progress: SceneLoadProgress) => void = () => {},
): Promise<ReplaySceneHandle> {
  const route = layout.routeLengthM;
  const firstStation = lapFirstStation(trajectory, layout);
  shell.attach(host, {onFailure, onProgress});
  // A shell the race view left keeps the race's sun: the lap's own moment lights it (nothing changes on the shell it made).
  shell.setDaylight(trajectory.daylightClock);
  const {rig, origin} = shell;
  shell.station = firstStation;
  const loadLaps = createLapLayerLoader(origin, shell.surfaceHeight, createCarSets(shell.carTemplates, shell.carTextures, layout.shading, shell.surfaceHeight), shell.keptCar, () => shell.exposureDisplay());
  const carsBuilt = loadLaps.preload(cars); // The cars load and build alongside the scenery; only draping waits for the ground.
  carsBuilt.then(() => shell.report({cars: 1}), () => {}); // A failure surfaces from the load below.
  // The cars compile and upload in turn with the chunks, lit as they will be drawn: the first car by its own reflection.
  const carsWarm = Promise.all([carsBuilt, shell.lit]).then(async ([built]) => {
    shell.reflectCar(built.primary.car);
    await Promise.all([built.primary, built.ghost].flatMap(drawn => drawn ? [shell.warm(drawn.car)] : []));
  });
  carsWarm.catch(() => {}); // A failure here surfaces from the load or the scene's warm-up below.
  const ghostCentre = new Vector3(), primaryCentre = new Vector3();
  /** The lap sample the primary car was last placed at (its headlight bit), and the ghost's (null: not shown). */
  let primaryIndex = 0;
  /** Where each car stands between its samples, for the curtains' cursor lines. */
  const primaryAt: CursorAt = {index: 0, fraction: 0}, ghostAt: CursorAt = {index: 0, fraction: 0};
  /** Read only while a free camera shows a trace (`curtainStep`): it walks the lap's points when the camera moved. */
  const lapReach = () => shell.rig.lapReachM;
  /** The shell's content for a lap layer: the cars and lines, with the ghost's parts following the camera's distance. */
  const contentOf = (lap: LapLayer): SceneContent => {
    const fadeGhost = ghostFader(lap.ghost);
    const envelope = lap.primary.getObjectByName('body-envelope')!;
    const beams: SpotCar = {lights: lap.lights, frame: new Matrix4(), headlights: false, braking: false, box: lap.bounds};
    return {
      root: lap.root, reflected: lap.primary,
      beforeDraw(camera: PerspectiveCamera | OrthographicCamera) {
        lap.syncParts();
        lap.syncTrace(shell.rig.mode, camera, lapReach, lap.primary.visible ? primaryAt : null, lap.ghost.visible ? ghostAt : null);
        // The car the cameras follow keeps every part at its full level, however far a zoomed camera stands; the other car's
        // parts follow the camera's distance.
        if (lap.ghost.visible) {
          setCameraDistance(lap.ghost, camera.position.distanceTo(lap.ghost.getWorldPosition(ghostCentre)) / shell.rig.lodMultiplier);
          fadeGhost(camera);
        }
      },
      // The compared car casts none (`drawnCar`).
      casters: () => [lap.primary.getWorldPosition(primaryCentre)],
      headlights(out) {
        const point = lap.trajectory.points[primaryIndex];
        beams.headlights = point?.headlights === true; beams.braking = isBraking(point?.brake);
        if (!lap.primary.visible || (!beams.headlights && !beams.braking)) return;
        envelope.updateMatrix();
        beams.frame.multiplyMatrices(lap.primary.matrixWorld, envelope.matrix);
        out.push(beams);
      },
      refreshHeights: () => lap.refreshHeights(),
      dispose: () => lap.dispose(),
    };
  };
  let layer: LapLayer;
  if (shell.started) {
    // The shell already shows the circuit (the race view left it): the lap's cars take its place once compiled, the camera
    // placed on them afresh. The road under the lap streams in as the camera moves there; its lines re-drape on it.
    layer = await loadLaps(trajectory, baseline, cars, colorBy);
    await carsWarm;
    shell.report({shaders: 1});
    if (!shell.isAttached(host)) { layer.dispose(); throw new DOMException('The lap view left', 'AbortError'); }
    rig.unplace(); rig.setLayer(layer);
    shell.show(contentOf(layer));
    layer.ready();
  } else {
    // The chunks under the first pose must be resident before cars and lines are draped on them.
    await shell.lit;
    await shell.underView();
    layer = await loadLaps(trajectory, baseline, cars, colorBy);
    rig.setLayer(layer);
    await shell.start(contentOf(layer));
    layer.ready();
  }
  let syncMode: GhostSyncMode = 'distance', anchorDistM: number | null = null, disposed = false;
  let lineMode = colorBy, primaryOpacity = 1, baselineOpacity = 1, lapRequest = 0, shownMarks: DrivingMark[] | null = null;
  let shownTrace: TraceValues | null = null;
  const traceOf = (lap: LapLayer) => shownTrace?.(lap.trajectory, lap.baseline) ?? null;
  const target = new Vector3();
  return {
    get wheelMotion() { return layer.primaryMotion.wheels?.description ?? ''; },
    async updateLaps(next, comparison, assets, signal) {
      if (disposed || signal?.aborted) return false;
      const compatible = (lap: ReplayTrajectoryData) => lap.layoutKey === layout.layoutKey && lap.geometryRevision === layout.sourceGeometryRevision
        && lap.dataPluginRevision === layout.packageRevision;
      if (!compatible(next) || (comparison && !compatible(comparison))) throw Error('Lap and 3D scene must use the same layout, geometry and package revision.');
      const request = ++lapRequest, models = comparison ? 2 : 1;
      shell.report({carModels: {loaded: 0, total: models}});
      try {
        const replacement = await loadLaps(next, comparison, await assets, lineMode);
        if (disposed || signal?.aborted || request !== lapRequest) { replacement.dispose(); return false; }
        await shell.warm(replacement.root);
        if (disposed || signal?.aborted || request !== lapRequest) { replacement.dispose(); return false; }
        replacement.ready(); replacement.colorLines(lineMode); replacement.fadeLines(primaryOpacity, baselineOpacity); replacement.showMarks(shownMarks);
        replacement.showTrace(traceOf(replacement));
        layer.dispose(); layer = replacement; shell.show(contentOf(layer)); rig.setLayer(layer);
        shell.setDaylight(next.daylightClock);
        return true;
      } finally {
        // A newer request counts its own cars.
        if (request === lapRequest) shell.report({carModels: {loaded: models, total: models}});
      }
    },
    beforeFrame: hook => shell.beforeFrame(hook),
    cursor(index, fraction) {
      const {trajectory, baseline, primary, ghost, primaryMotion, ghostMotion, primaryDistances, baselineDistances, ghostClock} = layer;
      const pose = sampleRenderPose(trajectory.points, index, fraction);
      primary.visible = pose !== null;
      if (!pose) { shell.invalidate(); return; }
      shell.placeCar(primary, pose, primaryMotion);
      primaryIndex = primaryAt.index = pose.index; primaryAt.fraction = pose.fraction;
      const sample = trajectory.points[pose.index], nextSample = trajectory.points[pose.index + 1];
      const timeSec = (sample.timeSec ?? pose.index / 40) + ((nextSample?.timeSec ?? sample.timeSec ?? 0) - (sample.timeSec ?? 0)) * pose.fraction;

      const lapStation = stationAt(trajectory.points, pose.index, pose.fraction, route);
      if (lapStation !== undefined) shell.station = lapStation;
      const station = (primaryDistances[index] ?? 0) + ((primaryDistances[index + 1] ?? primaryDistances[index] ?? 0) - (primaryDistances[index] ?? 0)) * fraction;
      const ghostStation = ghostClock ? ghostDistanceAt(ghostClock, syncMode, station, anchorDistM) : station;
      const other = baseline ? sampleStationPose(baseline.points, baselineDistances, ghostStation) : null;
      ghost.visible = other !== null;
      if (other) { ghostAt.index = other.index; ghostAt.fraction = other.fraction; }
      if (other) shell.placeCar(ghost, other, ghostMotion);
      rig.follow({target: target.set(...nativeToScene(pose, origin)), yaw: pose.yaw ?? 0, timeSec, stationM: station, index, fraction});
      shell.invalidate();
    },
    mode(next) {
      if (!shell.setMode(next)) return;
      layer.syncLines();
      shell.invalidate();
    },
    reset: () => rig.reset(),
    overview() { if (shell.setMode('orbit')) layer.syncLines(); rig.overview(); shell.invalidate(); },
    frameStretch(points, start, end, apex) {
      const at = (index: number) => new Vector3(...nativeToScene(points[index], origin));
      const last = Math.min(end, points.length - 1);
      if (rig.mode !== 'orbit' || !points[start] || !points[apex] || start > last) return;
      const path: Vector3[] = [];
      for (let index = start; index <= last; index++) path.push(at(index));
      const {eye, look} = cornerFraming(path, at(apex), rig.perspective.fov, rig.perspective.aspect);
      rig.frame(eye, look);
    },
    center: () => rig.center(),
    zoom: direction => rig.zoom(direction),
    holdKey: (key, down) => rig.holdKey(key, down),
    releaseKeys: () => rig.releaseKeys(),
    showMarks(marks) {
      shownMarks = marks; layer.showMarks(marks);
      shell.invalidate();
    },
    colorLines(next) {
      lineMode = next; layer.colorLines(next);
      shell.invalidate();
    },
    pickTrace: (x, y) => shell.afterFrame(() => {
      const ray = shell.pointerRay(x, y);
      let best: (StripHit & {lap: TracePick['lap']}) | null = null;
      // A pointer a few pixels off the line still picks its nearest foot, past the near fade: overhead a curtain stands edge-on, from a
      // high orbit it is a thin sheet, and where the value is 0 only its line on the road is left.
      const camera = shell.rig.camera, px = FOOT_PICK_REACH_PX * shell.renderer.getPixelRatio();
      const reach = camera instanceof OrthographicCamera ? {fixedM: px * metresPerPixel(camera, ray.origin), perMetreM: 0}
        : {fixedM: 0, perMetreM: px * metresPerPixel(camera, ray.at(1, new Vector3()))};
      for (const {lap, mesh, count, lift} of layer.pickable()) {
        const hit = (shell.rig.mode === 'top' ? null : pickStrip(mesh, count, ray, lift)) ?? pickStripFoot(mesh, count, ray, {...reach, fromM: lift?.shownFromM});
        if (hit && (!best || hit.distance < best.distance)) best = {...hit, lap};
      }
      if (!best) return null;
      const {lap, index} = best, {primaryDistances, baselineDistances} = layer;
      const primaryIndex = lap === 'primary' ? index : findIndexAtDistance(primaryDistances, baselineDistances[index] ?? 0);
      // Shown only where the frame drew no opaque surface between the eye and the hit.
      return shell.surfaceWithin(x, y, [clearSpan(ray, best.point)]).then(hidden => (hidden === -1 ? {lap, index, primaryIndex} : null));
    }),
    hoverTrace(pick) {
      layer.hoverTrace(pick && {lap: pick.lap, index: pick.index});
      shell.invalidate();
    },
    showTrace(values) {
      shownTrace = values; layer.showTrace(traceOf(layer));
      shell.invalidate();
    },
    syncGhost(next, anchor) {
      syncMode = next; anchorDistM = anchor;
    },
    fadeLines(primary, comparison) {
      primaryOpacity = primary; baselineOpacity = comparison; layer.fadeLines(primary, comparison);
      shell.invalidate();
    },
    dispose() {
      disposed = true;
      shell.detach(host); layer.dispose();
    },
  };
}
