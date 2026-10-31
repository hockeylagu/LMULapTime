import { useContext, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { fetchTrackScene } from '../../../../api/trackSceneApi.js';
import { fetchBrakeBoardArtwork } from '../../../../api/scenes/brakeBoardArtworkApi.js';
import { fetchTrackTextures } from '../../../../api/scenes/trackTextureApi.js';
import { fetchVehicleMesh, type LoadedVehicleMesh } from '../../../../api/vehicles/vehicleMeshApi.js';
import { fetchVehicleLivery, type LoadedVehicleLivery } from '../../../../api/vehicles/vehicleLiveryApi.js';
import { fetchVehicleWheels, type LoadedVehicleWheels } from '../../../../api/vehicles/vehicleWheelApi.js';
import { loadTrackBoundaryGeometry, loadTrackMapDisplay } from '../../../../api/trackGeometryApi.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import { ReplayPlaybackCursorContext } from '../../inspector/replayPlaybackCursor.js';
import { createReplayScene, type ReplaySceneHandle } from '../replayScene.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import type { CameraMode } from '../cameraModes.js';

interface Options {
  host: RefObject<HTMLDivElement | null>;
  trajectory: ReplayTrajectoryData;
  baseline: ReplayTrajectoryData | null;
  currentIndex: number;
  mode: CameraMode;
  colorBy: MapColorMode;
  fadedLine: 'none' | 'primary' | 'baseline';
  retry: number;
}
interface SceneResult {key: string; error?: string; ready?: boolean; cars?: string; warning?: string; wheelMotion?: string}
interface CarAsset {mesh: LoadedVehicleMesh | null; livery: LoadedVehicleLivery | null; wheels: LoadedVehicleWheels | null; warning?: string}
interface Runtime {handle: ReplaySceneHandle; trajectory: ReplayTrajectoryData; baseline: ReplayTrajectoryData | null}

function isCustomLivery(livery?: string): boolean {
  return typeof livery === 'string' && /^[0-9a-f]{24}$/i.test(livery.trim());
}

function validateLaps(lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) {
  if (!lap.layoutKey) throw Error('This recording has no resolved circuit layout. Use the 2D map.');
  const first = lap.points[0];
  if (!first || ![first.x, first.y, first.z].every(Number.isFinite)) throw Error('This recording has no usable spatial positions. Use the 2D map.');
  if (baseline && (baseline.layoutKey !== lap.layoutKey || baseline.geometryRevision !== lap.geometryRevision || baseline.dataPluginRevision !== lap.dataPluginRevision)) {
    throw Error('Comparison lap and 3D scene must use the same layout, geometry and package revision.');
  }
}

/** Track resources live for a layout/revision; lap objects live for the selected laps. */
export function useReplayScene({host, trajectory, baseline, currentIndex, mode, colorBy, fadedLine, retry}: Options) {
  const scene = useRef<ReplaySceneHandle | null>(null);
  const cursor = useContext(ReplayPlaybackCursorContext);
  const key = `${trajectory.layoutKey ?? ''}:${trajectory.geometryRevision ?? ''}:${trajectory.dataPluginRevision ?? ''}:${retry}`;
  const [result, setResult] = useState<SceneResult | null>(null);
  const runtime = useRef<{key: string; ready: Promise<Runtime>; loadCar: (lap: ReplayTrajectoryData | null) => Promise<CarAsset>} | null>(null);
  const latest = useEffectEvent(() => ({trajectory, baseline, mode, colorBy, fadedLine}));
  const drawCursor = useEffectEvent(() => {
    const position = cursor?.getSnapshot();
    scene.current?.cursor(position?.points === trajectory.points ? position.index : currentIndex, position?.points === trajectory.points ? position.fraction : 0);
  });
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const abort = new AbortController();
    let active = true, created: ReplaySceneHandle | null = null;
    const requests = new Map<string, Promise<CarAsset>>();
    const loadCar = (lap: ReplayTrajectoryData | null): Promise<CarAsset> => {
      if (!lap) return Promise.resolve({mesh: null, livery: null, wheels: null});
      const id = lap.vehicleData?.id;
      const liveryId = !isCustomLivery(lap.vehicleIdentity?.livery) ? lap.vehicleIdentity?.vehicleId : undefined;
      const requestKey = `${id ?? 'none'}:${liveryId ?? 'none'}:${lap.dataPluginRevision ?? ''}`;
      let pending = requests.get(requestKey);
      if (!pending) {
        pending = (async () => {
          const [meshResult, liveryResult, wheelsResult] = await Promise.allSettled([
            id ? fetchVehicleMesh(id, lap.dataPluginRevision, abort.signal) : Promise.resolve(null),
            liveryId ? fetchVehicleLivery(liveryId, lap.dataPluginRevision, abort.signal) : Promise.resolve(null),
            id ? fetchVehicleWheels(id, lap.dataPluginRevision, abort.signal) : Promise.resolve(null),
          ]);
          if (abort.signal.aborted) throw new DOMException('Car asset request aborted', 'AbortError');
          const warnings: string[] = [];
          let mesh: LoadedVehicleMesh | null = null;
          if (meshResult.status === 'fulfilled') {
            mesh = meshResult.value;
          } else if (isAbortError(meshResult.reason)) {
            throw meshResult.reason;
          } else {
            warnings.push(apiErrorMessage(meshResult.reason, 'Vehicle mesh unavailable'));
          }
          let livery: LoadedVehicleLivery | null = null;
          if (liveryResult.status === 'fulfilled') {
            livery = liveryResult.value;
          } else if (isAbortError(liveryResult.reason)) {
            throw liveryResult.reason;
          } else {
            warnings.push(apiErrorMessage(liveryResult.reason, 'Vehicle livery unavailable'));
          }
          let wheels: LoadedVehicleWheels | null = null;
          if (wheelsResult.status === 'fulfilled') {
            wheels = wheelsResult.value;
          } else if (isAbortError(wheelsResult.reason)) {
            throw wheelsResult.reason;
          } else {
            warnings.push(apiErrorMessage(wheelsResult.reason, 'Vehicle wheels unavailable'));
          }
          const warning = warnings.length > 0 ? warnings.join('; ') : undefined;
          return {mesh, livery, wheels, ...(warning ? {warning} : {})};
        })();
      }
      requests.delete(requestKey); requests.set(requestKey, pending);
      const oldest = requests.keys().next().value;
      if (requests.size > 4 && oldest !== undefined) requests.delete(oldest);
      return pending;
    };
    const initialize = async (): Promise<Runtime> => {
      const selected = latest();
      validateLaps(selected.trajectory, selected.baseline);
      const layoutKey = selected.trajectory.layoutKey!;
      const track = loadTrackBoundaryGeometry(layoutKey).then(async geometry => {
        if (geometry.geometryRevision !== selected.trajectory.geometryRevision) return null;
        return {geometry, display: await loadTrackMapDisplay(geometry, abort.signal).catch((error: unknown) => { if (isAbortError(error)) throw error; return null; })};
      }).catch((error: unknown) => { if (isAbortError(error)) throw error; return null; });
      const [data, primary, comparison, boundaries] = await Promise.all([
        fetchTrackScene(layoutKey, abort.signal), loadCar(selected.trajectory), loadCar(selected.baseline), track,
      ]);
      if (data.metadata.sourceGeometryRevision !== selected.trajectory.geometryRevision) throw Error('3D scene and lap geometry revisions differ. Reload the recording with its matching package.');
      if (selected.trajectory.dataPluginRevision && data.metadata.packageRevision !== selected.trajectory.dataPluginRevision) throw Error('3D scene and lap package revisions differ. Reload the recording with its matching package.');
      const [artwork, textures] = await Promise.all([
        fetchBrakeBoardArtwork(layoutKey, data.metadata.sourceGeometryRevision, data.metadata.packageRevision, abort.signal)
          .catch((error: unknown) => { if (isAbortError(error)) throw error; return []; }),
        fetchTrackTextures(layoutKey, data.metadata.packageRevision, abort.signal)
          .catch((error: unknown) => { if (isAbortError(error)) throw error; return []; }),
      ]);
      abort.signal.throwIfAborted();
      const handle = await createReplayScene(container, data.bytes, data.metadata, selected.trajectory, selected.baseline,
        message => { if (active) setResult({key, error: message}); },
        {
          primary: primary.mesh,
          baseline: comparison.mesh,
          primaryLivery: primary.livery,
          baselineLivery: comparison.livery,
          primaryWheels: primary.wheels,
          baselineWheels: comparison.wheels,
        },
        boundaries, latest().colorBy, artwork, textures);
      if (!active) { handle.dispose(); abort.signal.throwIfAborted(); }
      created = handle; scene.current = handle; handle.mode(latest().mode);
      return {handle, trajectory: selected.trajectory, baseline: selected.baseline};
    };
    runtime.current = {key, ready: initialize(), loadCar};
    return () => {
      active = false; abort.abort(); created?.dispose();
      if (scene.current === created) scene.current = null;
    };
  }, [key, host, scene]);
  useEffect(() => {
    const owner = runtime.current;
    if (!owner || owner.key !== key) return;
    const abort = new AbortController();
    const update = async () => {
      try {
        const current = await owner.ready;
        if (abort.signal.aborted) return;
        validateLaps(trajectory, baseline);
        const [primary, comparison] = await Promise.all([owner.loadCar(trajectory), owner.loadCar(baseline)]);
        if (abort.signal.aborted) return;
        if (current.trajectory !== trajectory || current.baseline !== baseline) {
          if (!await current.handle.updateLaps(trajectory, baseline, {
            primary: primary.mesh,
            baseline: comparison.mesh,
            primaryLivery: primary.livery,
            baselineLivery: comparison.livery,
            primaryWheels: primary.wheels,
            baselineWheels: comparison.wheels,
          }, abort.signal)) return;
          current.trajectory = trajectory; current.baseline = baseline;
        }
        if (abort.signal.aborted) return;
        const settings = latest();
        current.handle.colorLines(settings.colorBy);
        current.handle.fadeLines(settings.fadedLine === 'primary' ? 0.12 : 1, settings.fadedLine === 'baseline' ? 0.12 : 1);
        drawCursor();
        const label = (car: CarAsset) => {
          const body = car.mesh ? (car.mesh.metadata.parts.includes('tyres') ? 'Game body + tyres' : 'Game body mesh') : 'Estimated body';
          return car.livery ? `${body} + livery` : body;
        };
        setResult({key, ready: true, cars: `${label(primary)}${baseline ? ` · Ghost: ${label(comparison)}` : ''}`,
          warning: [...new Set([primary.warning, comparison.warning].filter(Boolean))].join('; '), wheelMotion: current.handle.wheelMotion});
      } catch (error) {
        if (!abort.signal.aborted && !isAbortError(error)) setResult({key, error: apiErrorMessage(error, 'Unable to load 3D scene')});
      }
    };
    void update();
    return () => abort.abort();
  }, [key, trajectory, baseline]);
  useEffect(() => { drawCursor(); return cursor?.subscribe(() => drawCursor()); }, [cursor, currentIndex, trajectory]);
  useEffect(() => { scene.current?.mode(mode); drawCursor(); }, [mode, scene]);
  useEffect(() => { scene.current?.colorLines(colorBy); }, [colorBy, scene]);
  useEffect(() => { scene.current?.fadeLines(fadedLine === 'primary' ? 0.12 : 1, fadedLine === 'baseline' ? 0.12 : 1); }, [fadedLine, scene]);
  return {scene, state: result?.key === key ? result : null};
}
