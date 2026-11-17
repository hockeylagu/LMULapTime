import { Group, type Vector3 } from 'three';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../../utils/lapAlignment.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import { createGhostClock } from '../../map/ghostSync.js';
import type { CarSets } from '../cars/drawnCar.js';
import { BASELINE_LINE, colorRacingLine, makeRacingLine, racingLineColors, refreshRacingLine, syncRacingLine } from './racingLine.js';
import { makeDrivingMarks, type DrivingMark } from './drivingMarks.js';
import type { SurfaceHeight } from '../scenery/sceneryGround.js';
import type { DisplayTransform } from '../autoExposure.js';
import { disposeObjects } from '../scene/disposeObjects.js';

export interface LapCars {
  primary: LoadedBody;
  baseline: LoadedBody | null;
}

/**
 * The lap view's content: the lap's car (the own car of `sets`) and its ghost, the racing lines and the ghost clock. Lap objects own their geometry; replacing them cannot release the track's GPU
 * buffers.
 */
export function createLapLayerLoader(origin: Vector3, surfaceHeight: SurfaceHeight, sets: CarSets, display: () => DisplayTransform) {
  const buildCars = async (assets: LapCars) => {
    const [primarySet, ghost] = await Promise.all([sets.build([assets.primary], {own: true}), assets.baseline ? sets.ghost(assets.baseline) : null]);
    return {primary: primarySet.cars[0], primarySet, ghost};
  };
  /** The cars `preload` built for the next load of the same `assets`: a load takes them, so no two layers share a car. */
  const preloaded = new WeakMap<LapCars, ReturnType<typeof buildCars>>();
  const load = async (trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapCars, colorBy: MapColorMode) => {
    const built = preloaded.get(assets) ?? buildCars(assets);
    preloaded.delete(assets);
    const cars = await built, drawnGhost = baseline ? cars.ghost : null;
    const primary = cars.primary.car, ghost = drawnGhost?.car ?? new Group();
    const primaryMotion = cars.primary.motion, ghostMotion = drawnGhost?.motion ?? null;
    primaryMotion.setTrack(trajectory, () => trajectory);
    if (baseline) ghostMotion?.setTrack(baseline, () => baseline);
    let colors = racingLineColors(trajectory, baseline, colorBy);
    const primaryLine = makeRacingLine(trajectory, origin, colors.primary, surfaceHeight, display);
    const baselineLine = baseline ? makeRacingLine(baseline, origin, colors.baseline, surfaceHeight, display, BASELINE_LINE.widthM, BASELINE_LINE.liftM) : null;
    const root = new Group(); root.add(primary, ghost, primaryLine); if (baselineLine) root.add(baselineLine);
    const primaryDistances = getTrajectoryDistances(trajectory.points, trajectory.trackLengthM);
    const baselineDistances = baseline ? getDistancesInReferenceFrame(baseline.points, trajectory.points, trajectory.trackLengthM) : [];
    const markedLaps = {primary: {points: trajectory.points, distances: primaryDistances}, baseline: baseline ? {points: baseline.points, distances: baselineDistances} : null};
    let marks: (ReturnType<typeof makeDrivingMarks> & {list: DrivingMark[]}) | null = null;
    const showMarks = (list: DrivingMark[] | null) => {
      if (marks) { marks.mesh.removeFromParent(); disposeObjects(marks.mesh); marks = null; }
      if (!list?.length) return;
      marks = {...makeDrivingMarks(list, markedLaps, origin, surfaceHeight, display), list};
      root.add(marks.mesh);
    };
    return {
      root, trajectory, baseline, primary, ghost, primaryMotion, ghostMotion,
      /** The primary car's game cameras (cockpit, hood and roof views). */
      cameras: assets.primary.descriptor.cameras.list, chaseLodMultiplier: assets.primary.descriptor.cameras.chase.lodMultiplier,
      primaryDistances, baselineDistances,
      /** Both laps' elapsed time against distance, for the time-synced ghost. */
      ghostClock: baseline ? createGhostClock(trajectory.points, primaryDistances, baseline.points, baselineDistances, trajectory.trackLengthM) : null,
      colorLines(next: MapColorMode) {
        colors = racingLineColors(trajectory, baseline, next);
        colorRacingLine(primaryLine, colors.primary); if (baselineLine) colorRacingLine(baselineLine, colors.baseline);
      },
      /** The camera type changed: re-bake the line colours for its display transform. */
      syncLines() { syncRacingLine(primaryLine); if (baselineLine) syncRacingLine(baselineLine); if (marks) syncRacingLine(marks.mesh); },
      /** Draws a corner's driving marks on the road (`drivingMarks.ts`), replacing any shown; null clears them. */
      showMarks,
      fadeLines(primaryOpacity: number, baselineOpacity: number) {
        // Opacity 0 hides a line: nothing to draw, and nothing for its transparent pass to sort.
        primaryLine.material.opacity = primaryOpacity; primaryLine.visible = primaryOpacity > 0;
        if (baselineLine) { baselineLine.material.opacity = baselineOpacity; baselineLine.visible = baselineOpacity > 0; }
      },
      /** Places both cars' parts at their pose, wheels, steering and shown levels: call before each frame is drawn. */
      syncParts() { cars.primary.parts.sync(); drawnGhost?.parts.sync(); },
      /** Once the primary car is warmed up: its batches each draw only while one of their parts shows. */
      ready() { cars.primarySet.ready(); },
      /** Scenery streams in after the lines were draped: re-drape them on the road that is resident now. */
      refreshHeights() {
        primaryMotion.refreshHeights(); ghostMotion?.refreshHeights();
        refreshRacingLine(primaryLine, trajectory, origin, colors.primary, surfaceHeight);
        if (baselineLine && baseline) refreshRacingLine(baselineLine, baseline, origin, colors.baseline, surfaceHeight, BASELINE_LINE.widthM, BASELINE_LINE.liftM);
        if (marks?.missing) showMarks(marks.list);
      },
      dispose() { root.removeFromParent(); cars.primarySet.dispose(); disposeObjects(root); },
    };
  };
  /**
   * Builds the lap's cars before the ground is ready: they need none, so the caller can compile and upload them while the scenery
   * loads. The next load of the same `assets` takes them; a failure surfaces from that load too.
   */
  const preload = (assets: LapCars) => {
    const built = buildCars(assets);
    preloaded.set(assets, built);
    return built;
  };
  return Object.assign(load, {preload});
}

export type LapLayer = Awaited<ReturnType<ReturnType<typeof createLapLayerLoader>>>;
