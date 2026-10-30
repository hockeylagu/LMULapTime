import { BufferGeometry, Group, Mesh, type Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { LoadedVehicleMesh } from '../../../../api/vehicleMeshApi.js';
import { MAP_COLORS, TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../../utils/lapAlignment.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import { makeCar } from '../sceneObjects.js';
import { createWheelAnimation } from '../wheelAnimation.js';
import { BASELINE_LINE, colorRacingLine, makeRacingLine, racingLineColors } from '../racingLine.js';
import type { SurfaceHeight } from '../surfaceProjection.js';
import { disposeObjects } from './disposeObjects.js';

export interface LapVehicleModels {primary: LoadedVehicleMesh | null; baseline: LoadedVehicleMesh | null}

/** Lap objects own their geometry; replacing them cannot release the track's GPU buffers. */
export function createLapLayerLoader(origin: Vector3, surfaceHeight: SurfaceHeight) {
  // Only buffers retained by the bounded asset cache keep these parsed templates alive.
  const models = new WeakMap<ArrayBuffer, Promise<Group>>();
  const loadModel = (asset: LoadedVehicleMesh | null): Promise<Group | null> => {
    if (!asset) return Promise.resolve(null);
    let pending = models.get(asset.bytes);
    if (!pending) {
      pending = new GLTFLoader().parseAsync(asset.bytes, '').then(result => {
        result.scene.traverse(object => {
          if (object instanceof Mesh && object.geometry instanceof BufferGeometry) object.geometry.computeVertexNormals();
        });
        return result.scene;
      });
      models.set(asset.bytes, pending);
    }
    return pending;
  };
  return async (trajectory: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, assets: LapVehicleModels, colorBy: MapColorMode) => {
    const [primaryModel, baselineModel] = await Promise.all([loadModel(assets.primary), loadModel(assets.baseline)]);
    const primary = makeCar(trajectory, MAP_COLORS.carBody, false, primaryModel);
    const ghost = baseline ? makeCar(baseline, TELEMETRY_COLORS.baseline, true, baselineModel) : new Group();
    const primaryWheels = createWheelAnimation(primary, trajectory, surfaceHeight);
    const ghostWheels = baseline ? createWheelAnimation(ghost, baseline, surfaceHeight) : null;
    // Only the primary car casts a contact shadow, including its animated tyres.
    primary.traverse(object => { if (object instanceof Mesh) object.castShadow = true; });
    const colors = racingLineColors(trajectory, baseline, colorBy);
    const primaryLine = makeRacingLine(trajectory, origin, colors.primary, surfaceHeight);
    const baselineLine = baseline ? makeRacingLine(baseline, origin, colors.baseline, surfaceHeight, BASELINE_LINE.widthM, BASELINE_LINE.liftM) : null;
    const root = new Group(); root.add(primary, ghost, primaryLine); if (baselineLine) root.add(baselineLine);
    return {
      root, trajectory, baseline, primary, ghost, primaryWheels, ghostWheels,
      primaryDistances: getTrajectoryDistances(trajectory.points, trajectory.trackLengthM),
      baselineDistances: baseline ? getDistancesInReferenceFrame(baseline.points, trajectory.points, trajectory.trackLengthM) : [],
      colorLines(next: MapColorMode) {
        const nextColors = racingLineColors(trajectory, baseline, next);
        colorRacingLine(primaryLine, nextColors.primary); if (baselineLine) colorRacingLine(baselineLine, nextColors.baseline);
      },
      fadeLines(primaryOpacity: number, baselineOpacity: number) {
        primaryLine.material.opacity = primaryOpacity;
        if (baselineLine) baselineLine.material.opacity = baselineOpacity;
      },
      dispose() { root.removeFromParent(); disposeObjects(root); },
    };
  };
}
