import { useContext, useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { fetchSceneryLayout } from '../../../../api/sceneryApi.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { createBodyStore } from '../../../../api/vehicles/bodyStore.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import { ReplayPlaybackCursorContext } from '../../inspector/replayPlaybackCursor.js';
import { createReplayScene, lapFirstStation, type ReplaySceneHandle } from './replayScene.js';
import type { MapColorMode } from '../../map/replayMapUtils.js';
import type { CameraMode } from '../camera/cameraModes.js';
import type { GhostSyncMode } from '../../map/ghostSync.js';
import { NO_LOAD_PROGRESS } from '../scene/loadProgress.js';
import { useSceneHost, type SceneCreateContext } from '../scene/useSceneHost.js';
import { useSceneShells } from '../scene/sceneShells.js';

interface Options {
  host: RefObject<HTMLDivElement | null>;
  trajectory: ReplayTrajectoryData;
  baseline: ReplayTrajectoryData | null;
  currentIndex: number;
  mode: CameraMode;
  colorBy: MapColorMode;
  fadedLine: 'none' | 'primary' | 'baseline';
  /** False hides the racing lines (the cars stay). */
  showLines?: boolean;
  retry: number;
  syncMode?: GhostSyncMode;
  anchorDistM?: number | null;
}
interface Extra {cars?: string; wheelMotion?: string}
interface Runtime {trajectory: ReplayTrajectoryData; baseline: ReplayTrajectoryData | null; loadCar: (lap: ReplayTrajectoryData | null) => Promise<LoadedBody | null>}

function validateLaps(lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null) {
  if (!lap.layoutKey) throw Error('This recording has no resolved circuit layout. Use the 2D map.');
  const first = lap.points[0];
  if (!first || ![first.x, first.y, first.z, first.stationM].every(Number.isFinite)) throw Error('This recording has no usable spatial positions or track stations. Use the 2D map.');
  if (baseline && (baseline.layoutKey !== lap.layoutKey || baseline.geometryRevision !== lap.geometryRevision || baseline.dataPluginRevision !== lap.dataPluginRevision)) {
    throw Error('Comparison lap and 3D scene must use the same layout, geometry and package revision.');
  }
}

/** Each line's opacity: faded to a trace, or hidden. */
function lineOpacities(fadedLine: Options['fadedLine'], showLines: boolean): [number, number] {
  if (!showLines) return [0, 0];
  return [fadedLine === 'primary' ? 0.12 : 1, fadedLine === 'baseline' ? 0.12 : 1];
}

/** Track resources live for a layout/revision; lap objects live for the selected laps. */
export function useReplayScene({host, trajectory, baseline, currentIndex, mode, colorBy, fadedLine, showLines = true, retry, syncMode = 'distance', anchorDistM = null}: Options) {
  const cursor = useContext(ReplayPlaybackCursorContext);
  const shells = useSceneShells();
  const key = `${trajectory.layoutKey ?? ''}:${trajectory.geometryRevision ?? ''}:${trajectory.dataPluginRevision ?? ''}:${retry}`;
  /** The scene's current laps and its car loader, for the key it was built under. */
  const runtime = useRef<(Runtime & {key: string}) | null>(null);
  const latest = useEffectEvent(() => ({trajectory, baseline, mode, colorBy, fadedLine, showLines, syncMode, anchorDistM}));
  // The scene's frame hook outlives renders: it ticks the cursor the page has now.
  const liveCursor = useRef(cursor);
  useEffect(() => { liveCursor.current = cursor; }, [cursor]);
  const create = async ({container, signal, showProgress, fail, onDispose}: SceneCreateContext): Promise<ReplaySceneHandle> => {
    // The laps shown and a few before: going back to a recent lap fetches nothing.
    const bodies = createBodyStore(4);
    onDispose(() => bodies.dispose());
    const loadCar = async (lap: ReplayTrajectoryData | null): Promise<LoadedBody | null> => {
      if (!lap) return null;
      const vehicleId = lap.vehicleIdentity?.vehicleId;
      if (!vehicleId) throw Error('This recording does not name its vehicle, so its car cannot be shown in 3D. Use the 2D map.');
      return bodies.body(vehicleId, lap.dataPluginRevision);
    };
    const selected = {trajectory, baseline};
    runtime.current = {key, trajectory: selected.trajectory, baseline: selected.baseline, loadCar};
    validateLaps(selected.trajectory, selected.baseline);
    const layoutKey = selected.trajectory.layoutKey!;
    showProgress(NO_LOAD_PROGRESS);
    const [layout, primary, comparison] = await Promise.all([
      fetchSceneryLayout(layoutKey, signal), loadCar(selected.trajectory), loadCar(selected.baseline),
    ]);
    if (layout.sourceGeometryRevision !== selected.trajectory.geometryRevision) throw Error('3D scene and lap geometry revisions differ. Reload the recording with its matching package.');
    if (selected.trajectory.dataPluginRevision && layout.packageRevision !== selected.trajectory.dataPluginRevision) throw Error('3D scene and lap package revisions differ. Reload the recording with its matching package.');
    signal.throwIfAborted();
    const firstView = {kind: 'lap' as const, lapDistanceM: lapFirstStation(selected.trajectory, layout)};
    const shell = shells.acquire(layout, {daylightClock: selected.trajectory.daylightClock, firstView});
    try {
      return await createReplayScene(shell, container, layout, selected.trajectory, selected.baseline, fail, {primary: primary!, baseline: comparison}, colorBy, showProgress);
    } catch (error) { shell.detach(container); shells.discardUnstarted(shell); throw error; }
  };
  const {scene, ready, state, setState} = useSceneHost<ReplaySceneHandle, Extra>({host, key, errorMessage: 'Unable to load 3D scene', create,
    onCreated: handle => { handle.mode(mode); handle.beforeFrame(frameTime => liveCursor.current?.tick(frameTime)); }});
  const drawCursor = useEffectEvent(() => {
    const position = cursor?.getSnapshot();
    scene.current?.cursor(position?.points === trajectory.points ? position.index : currentIndex, position?.points === trajectory.points ? position.fraction : 0);
  });
  useEffect(() => {
    const owner = ready.current, laps = runtime.current;
    if (!owner || owner.key !== key || laps?.key !== key) return;
    const abort = new AbortController();
    const update = async () => {
      try {
        const handle = await owner.scene;
        if (abort.signal.aborted) return;
        validateLaps(trajectory, baseline);
        const [primary, comparison] = await Promise.all([laps.loadCar(trajectory), laps.loadCar(baseline)]);
        if (abort.signal.aborted) return;
        if (laps.trajectory !== trajectory || laps.baseline !== baseline) {
          if (!await handle.updateLaps(trajectory, baseline, {primary: primary!, baseline: comparison}, abort.signal)) return;
          laps.trajectory = trajectory; laps.baseline = baseline;
        }
        if (abort.signal.aborted) return;
        const settings = latest();
        handle.colorLines(settings.colorBy);
        handle.fadeLines(...lineOpacities(settings.fadedLine, settings.showLines));
        handle.syncGhost(settings.syncMode, settings.anchorDistM);
        drawCursor();
        const label = (car: LoadedBody) => `Textured car ${car.vehicleId}`;
        const cars = `${label(primary!)}${comparison ? ` · Ghost: ${label(comparison)}` : ''}`;
        setState(previous => ({key, ready: true, cars, wheelMotion: handle.wheelMotion, progress: previous?.key === key ? previous.progress : undefined}));
      } catch (error) {
        if (!abort.signal.aborted && !isAbortError(error)) setState({key, error: apiErrorMessage(error, 'Unable to load 3D scene')});
      }
    };
    void update();
    return () => abort.abort();
  }, [key, trajectory, baseline, ready, setState]);
  useEffect(() => { drawCursor(); return cursor?.subscribe(() => drawCursor()); }, [cursor, currentIndex, trajectory]);
  useEffect(() => { scene.current?.mode(mode); drawCursor(); }, [mode, scene]);
  useEffect(() => { scene.current?.colorLines(colorBy); }, [colorBy, scene]);
  useEffect(() => { scene.current?.syncGhost(syncMode, anchorDistM); drawCursor(); }, [syncMode, anchorDistM, scene]);
  useEffect(() => { scene.current?.fadeLines(...lineOpacities(fadedLine, showLines)); }, [fadedLine, showLines, scene]);
  return {scene, state};
}
