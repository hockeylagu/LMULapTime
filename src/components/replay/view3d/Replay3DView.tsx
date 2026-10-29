import { useContext, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { fetchTrackScene } from '../../../api/trackSceneApi.js';
import { fetchVehicleMesh, type LoadedVehicleMesh } from '../../../api/vehicleMeshApi.js';
import { loadTrackBoundaryGeometry, loadTrackMapDisplay } from '../../../api/trackGeometryApi.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../../../shared/types/trackGeometry.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { ReplayPlaybackCursorContext } from '../inspector/replayPlaybackCursor.js';
import { MapFullscreenButton } from '../map/display/MapFullscreenButton.js';
import { Select } from '../../common/dropdown/Select.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { createReplayScene, type ReplaySceneHandle } from './replayScene.js';
import { CAMERA_MODES, useCameraModeShortcuts, type CameraMode } from './cameraModes.js';
import { useGpsMapShortcuts } from '../map/useGpsMapShortcuts.js';
import { ReplayShortcutHelp } from '../ReplayShortcutHelp.js';
import type { MapColorMode } from '../map/replayMapUtils.js';

interface Props {
  trajectory: ReplayTrajectoryData;
  baseline: ReplayTrajectoryData | null;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onReturnTo2D: () => void;
  /** The 2D map's line colouring, shared so both views show the same line. */
  colorBy?: MapColorMode;
  onChangeColorBy?: (mode: MapColorMode) => void;
}
const modes = CAMERA_MODES.map(option => ({...option, detail: option.shortcut}));
const LINE_COLORS: Array<{value: MapColorMode; label: string; compare?: boolean}> = [
  {value: 'default', label: 'Plain line'}, {value: 'pedal', label: 'Pedal'}, {value: 'speed', label: 'Speed'},
  {value: 'delta', label: 'Delta', compare: true}, {value: 'gainLoss', label: 'Gain / Loss', compare: true},
];

export default function Replay3DView({trajectory, baseline, currentIndex, onSelectIndex, isPlaying, onTogglePlay, onReturnTo2D, colorBy = 'default', onChangeColorBy}: Props) {
  const map = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const host = useRef<HTMLDivElement>(null), scene = useRef<ReplaySceneHandle | null>(null);
  const cursor = useContext(ReplayPlaybackCursorContext);
  const [mode, setMode] = useState<CameraMode>('follow'), [retry, setRetry] = useState(0);
  useCameraModeShortcuts(map, setMode);
  useGpsMapShortcuts({isExpanded, containerRef: map, points: trajectory.points, currentIndex, onSelectIndex,
    onZoomIn: () => scene.current?.zoom(1), onZoomOut: () => scene.current?.zoom(-1), onResetZoom: () => scene.current?.reset(),
    // Follow, chase and trackside stay locked on the car, so a keyboard pan hands the camera over to free orbit.
    onPan: (horizontal, vertical) => { if (mode === 'follow' || mode === 'chase' || mode === 'trackside') setMode('orbit'); scene.current?.pan(horizontal, vertical); },
    onCenter: () => scene.current?.center(),
    onToggleFollow: () => setMode(value => value === 'follow' || value === 'chase' ? 'orbit' : 'follow'),
    onTogglePlay, onToggleExpanded: () => setIsExpanded(value => !value)});
  useEffect(() => { map.current?.focus({preventScroll: true}); }, []);
  const [result, setResult] = useState<{key: string; trajectory: ReplayTrajectoryData; baseline: ReplayTrajectoryData | null; error?: string; ready?: boolean; cars?: string; warning?: string; wheelMotion?: string} | null>(null);
  const key = `${trajectory.layoutKey ?? ''}:${trajectory.dataPluginRevision ?? ''}:${retry}`;
  const latestIndex = useEffectEvent(() => currentIndex);
  const latestMode = useEffectEvent(() => mode);
  const latestColorBy = useEffectEvent(() => colorBy);
  const drawCursor = useEffectEvent(() => {
    const position = cursor?.getSnapshot();
    scene.current?.cursor(position?.points === trajectory.points ? position.index : currentIndex, position?.points === trajectory.points ? position.fraction : 0);
  });
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const abort = new AbortController(); let active = true;
    const load = async () => {
      try {
        if (!trajectory.layoutKey) throw Error('This recording has no resolved circuit layout. Use the 2D map.');
        const first = trajectory.points[0];
        if (!first || !trajectory.points.some(point => Math.hypot(point.x - first.x, point.z - first.z) > 1)) throw Error('Recorded spatial positions are unavailable. Use the 2D map.');
        if (baseline && (baseline.layoutKey !== trajectory.layoutKey || baseline.geometryRevision !== trajectory.geometryRevision)) throw Error('Comparison lap and 3D scene must use the same layout and geometry revision.');
        const requests = new Map<string, Promise<LoadedVehicleMesh | null>>();
        const warnings: string[] = [];
        const loadCar = (lap: ReplayTrajectoryData | null): Promise<LoadedVehicleMesh | null> => {
          const id = lap?.vehicleData?.id;
          if (!id || !lap) return Promise.resolve(null);
          const requestKey = `${id}:${lap.dataPluginRevision ?? ''}`;
          let pending = requests.get(requestKey);
          if (!pending) {
            pending = fetchVehicleMesh(id, lap.dataPluginRevision, abort.signal).catch(error => {
              if (isAbortError(error)) throw error;
              warnings.push(apiErrorMessage(error, 'Vehicle mesh unavailable')); return null;
            });
            requests.set(requestKey, pending);
          }
          return pending;
        };
        const layoutKey = trajectory.layoutKey;
        // The 2D layout (white lines, brake boards, active road outline) is optional: a missing or stale one never blocks the scene.
        const loadTrack = async (): Promise<{geometry: TrackBoundaryGeometry; display: TrackMapDisplay | null} | null> => {
          const geometry = await loadTrackBoundaryGeometry(layoutKey);
          if (geometry.geometryRevision !== trajectory.geometryRevision) return null;
          return {geometry, display: await loadTrackMapDisplay(geometry, abort.signal).catch((error: unknown) => { if (isAbortError(error)) throw error; return null; })};
        };
        const pendingTrack = loadTrack().catch((error: unknown) => { if (isAbortError(error)) throw error; return null; });
        const [data, primaryMesh, baselineMesh, track] = await Promise.all([fetchTrackScene(layoutKey, abort.signal), loadCar(trajectory), loadCar(baseline), pendingTrack]);
        if (!active) return;
        if (data.metadata.sourceGeometryRevision !== trajectory.geometryRevision) throw Error('3D scene and lap geometry revisions differ. Reload the recording with its matching package.');
        const handle = await createReplayScene(container, data.bytes, data.metadata, trajectory, baseline, message => setResult({key, trajectory, baseline, error: message}), {primary: primaryMesh, baseline: baselineMesh}, track, latestColorBy());
        if (!active) { handle.dispose(); return; }
        scene.current = handle; handle.cursor(latestIndex(), 0); handle.mode(latestMode()); drawCursor();
        const label = (mesh: LoadedVehicleMesh | null) => mesh ? (mesh.metadata.parts.includes('tyres') ? 'Game body + tyres' : 'Game body mesh') : 'Estimated body';
        setResult({key, trajectory, baseline, ready: true, cars: `${label(primaryMesh)}${baseline ? ` · Ghost: ${label(baselineMesh)}` : ''}`, warning: warnings.join('; '), wheelMotion: handle.wheelMotion});
      } catch (error) { if (active && !isAbortError(error)) setResult({key, trajectory, baseline, error: apiErrorMessage(error, 'Unable to load 3D scene')}); }
    };
    void load();
    return () => { active = false; abort.abort(); scene.current?.dispose(); scene.current = null; };
  }, [key, trajectory, baseline]);
  useEffect(() => { drawCursor(); return cursor?.subscribe(() => drawCursor()); }, [cursor, currentIndex, trajectory]);
  useEffect(() => { scene.current?.mode(mode); drawCursor(); }, [mode]);
  useEffect(() => { scene.current?.colorLines(colorBy); }, [colorBy]);
  const state = result?.key === key && result.trajectory === trajectory && result.baseline === baseline ? result : null;
  // What drives the car and wheels, for the curious: hover the title rather than read it under every frame.
  const sources = state?.ready ? [state.cars, state.wheelMotion, baseline ? 'Same-station ghost' : ''].filter(Boolean).join(' · ') : undefined;
  return <div ref={map} data-replay-surface="map" data-replay-view="3d" tabIndex={0}
    className={`relative flex flex-col w-full h-full min-h-[360px] bg-lmu-deep overflow-hidden [&[data-map-expanded]]:fixed [&[data-map-expanded]]:inset-0 [&[data-map-expanded]]:z-[1000] [&[data-map-expanded]]:w-screen [&[data-map-expanded]]:h-screen outline-none`}>
    <div className="flex items-center gap-2 px-3 py-2 border-b border-lmu-border text-xs shrink-0">
      <span className="font-semibold text-lmu-text mr-auto" title={sources}>3D racing line</span>
      {onChangeColorBy && <Select aria-label="Line colour" value={colorBy} onChange={onChangeColorBy} options={LINE_COLORS.filter(option => !option.compare || baseline)} size="compact" />}
      <Select aria-label="3D camera" value={mode} onChange={setMode} options={modes} size="compact" />
      <button type="button" onClick={() => scene.current?.reset()} aria-label="Reset 3D camera" title="Reset camera" className={`p-1.5 rounded hover:bg-lmu-raised ${FOCUS_RING}`}><RotateCcw size={15} /></button>
      {onTogglePlay && <button type="button" onClick={onTogglePlay} aria-label={isPlaying ? 'Pause replay' : 'Play replay'} className={`p-1.5 rounded hover:bg-lmu-raised ${FOCUS_RING}`}>{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>}
      <ReplayShortcutHelp view="3d" />
      <MapFullscreenButton isExpanded={isExpanded} onToggleExpanded={setIsExpanded} />
      <button type="button" onClick={onReturnTo2D} className={`px-2 py-1 rounded hover:bg-lmu-raised ${FOCUS_RING}`}>2D map</button>
    </div>
    <div ref={host} tabIndex={0} onPointerDown={event => event.currentTarget.focus({preventScroll: true})}
      aria-label="3D track. Drag to orbit, right drag to pan, scroll to zoom. Left/Right: step replay. WASD: pan camera." className="relative flex-1 min-h-0 outline-none" />
    {!state?.ready && <div className="absolute inset-x-0 top-1/3 px-8 text-center text-sm text-lmu-text-soft" role={state?.error ? 'alert' : 'status'}>
      <p>{state?.error ?? 'Loading 3D track surfaces…'}</p>
      {state?.error && <button type="button" onClick={() => setRetry(value => value + 1)} className={`mt-3 px-3 py-1.5 rounded bg-lmu-raised ${FOCUS_RING}`}>Retry 3D scene</button>}
    </div>}
    {state?.warning && <p role="status" className="px-3 pb-2 text-xs text-lmu-warn">Using estimated car geometry: {state.warning}</p>}
  </div>;
}
