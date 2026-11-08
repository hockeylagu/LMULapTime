import { useContext, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { fetchSceneryLayout } from '../../../../api/sceneryApi.js';
import { fetchCar, type LoadedCar } from '../../../../api/vehicles/carApi.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import { ReplayPlaybackCursorContext } from '../../inspector/replayPlaybackCursor.js';
import { createReplayScene, type ReplaySceneHandle } from '../replayScene.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import type { CameraMode } from '../cameraModes.js';
import type { GhostSyncMode } from '../../map/ghostSync.js';

interface Options {
  host: RefObject<HTMLDivElement | null>;
  trajectory: ReplayTrajectoryData;
  baseline: ReplayTrajectoryData | null;
  currentIndex: number;
  mode: CameraMode;
  colorBy: MapColorMode;
  fadedLine: 'none' | 'primary' | 'baseline';
  retry: number;
  syncMode?: GhostSyncMode;
  anchorDistM?: number | null;
}
interface SceneResult {key: string; error?: string; ready?: boolean; cars?: string; wheelMotion?: string}
interface Runtime {handle: ReplaySceneHandle; trajectory: ReplayTrajectoryData; baseline: ReplayTrajectoryData | null}

function validateLaps(lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) {
  if (!lap.layoutKey) throw Error('This recording has no resolved circuit layout. Use the 2D map.');
  const first = lap.points[0];
  if (!first || ![first.x, first.y, first.z, first.stationM].every(Number.isFinite)) throw Error('This recording has no usable spatial positions or track stations. Use the 2D map.');
  if (baseline && (baseline.layoutKey !== lap.layoutKey || baseline.geometryRevision !== lap.geometryRevision || baseline.dataPluginRevision !== lap.dataPluginRevision)) {
    throw Error('Comparison lap and 3D scene must use the same layout, geometry and package revision.');
  }
}

/** Track resources live for a layout/revision; lap objects live for the selected laps. */
export function useReplayScene({host, trajectory, baseline, currentIndex, mode, colorBy, fadedLine, retry, syncMode = 'distance', anchorDistM = null}: Options) {
  const scene = useRef<ReplaySceneHandle | null>(null);
  const cursor = useContext(ReplayPlaybackCursorContext);
  const key = `${trajectory.layoutKey ?? ''}:${trajectory.geometryRevision ?? ''}:${trajectory.dataPluginRevision ?? ''}:${retry}`;
  const [result, setResult] = useState<SceneResult | null>(null);
  const runtime = useRef<{key: string; ready: Promise<Runtime>; loadCar: (lap: ReplayTrajectoryData | null) => Promise<LoadedCar | null>} | null>(null);
  const latest = useEffectEvent(() => ({trajectory, baseline, mode, colorBy, fadedLine, syncMode, anchorDistM}));
  const tickCursor = useEffectEvent((frameTime: number) => { cursor?.tick(frameTime); });
  const drawCursor = useEffectEvent(() => {
    const position = cursor?.getSnapshot();
    scene.current?.cursor(position?.points === trajectory.points ? position.index : currentIndex, position?.points === trajectory.points ? position.fraction : 0);
  });
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const abort = new AbortController();
    let active = true, created: ReplaySceneHandle | null = null;
    const requests = new Map<string, Promise<LoadedCar>>();
    const loadCar = async (lap: ReplayTrajectoryData | null): Promise<LoadedCar | null> => {
      if (!lap) return null;
      const vehicleId = lap.vehicleIdentity?.vehicleId;
      if (!vehicleId) throw Error('This recording does not name its vehicle, so its car cannot be shown in 3D. Use the 2D map.');
      const requestKey = `${vehicleId}:${lap.dataPluginRevision ?? ''}`;
      let pending = requests.get(requestKey);
      if (!pending) pending = fetchCar(vehicleId, lap.dataPluginRevision, abort.signal);
      requests.delete(requestKey); requests.set(requestKey, pending);
      const oldest = requests.keys().next().value;
      if (requests.size > 4 && oldest !== undefined) requests.delete(oldest);
      return pending;
    };
    const initialize = async (): Promise<Runtime> => {
      const selected = latest();
      validateLaps(selected.trajectory, selected.baseline);
      const layoutKey = selected.trajectory.layoutKey!;
      const [layout, primary, comparison] = await Promise.all([
        fetchSceneryLayout(layoutKey, abort.signal), loadCar(selected.trajectory), loadCar(selected.baseline),
      ]);
      if (layout.sourceGeometryRevision !== selected.trajectory.geometryRevision) throw Error('3D scene and lap geometry revisions differ. Reload the recording with its matching package.');
      if (selected.trajectory.dataPluginRevision && layout.packageRevision !== selected.trajectory.dataPluginRevision) throw Error('3D scene and lap package revisions differ. Reload the recording with its matching package.');
      abort.signal.throwIfAborted();
      const handle = await createReplayScene(container, layout, selected.trajectory, selected.baseline,
        message => { if (active) setResult({key, error: message}); },
        {primary: primary!, baseline: comparison}, latest().colorBy);
      if (!active) { handle.dispose(); abort.signal.throwIfAborted(); }
      created = handle; scene.current = handle; handle.mode(latest().mode); handle.beforeFrame(frameTime => tickCursor(frameTime));
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
          if (!await current.handle.updateLaps(trajectory, baseline, {primary: primary!, baseline: comparison}, abort.signal)) return;
          current.trajectory = trajectory; current.baseline = baseline;
        }
        if (abort.signal.aborted) return;
        const settings = latest();
        current.handle.colorLines(settings.colorBy);
        current.handle.fadeLines(settings.fadedLine === 'primary' ? 0.12 : 1, settings.fadedLine === 'baseline' ? 0.12 : 1);
        current.handle.syncGhost(settings.syncMode, settings.anchorDistM);
        drawCursor();
        const label = (car: LoadedCar) => `Textured car ${car.vehicleId}`;
        setResult({key, ready: true, cars: `${label(primary!)}${comparison ? ` · Ghost: ${label(comparison)}` : ''}`, wheelMotion: current.handle.wheelMotion});
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
  useEffect(() => { scene.current?.syncGhost(syncMode, anchorDistM); drawCursor(); }, [syncMode, anchorDistM, scene]);
  useEffect(() => { scene.current?.fadeLines(fadedLine === 'primary' ? 0.12 : 1, fadedLine === 'baseline' ? 0.12 : 1); }, [fadedLine, scene]);
  return {scene, state: result?.key === key ? result : null};
}
