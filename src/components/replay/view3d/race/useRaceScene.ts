import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { RaceReplayOverview, RaceReplayProgress } from '../../../../../shared/types/replay.js';
import { RACE_POSE_CHANNEL_COUNT, sampleRacePose, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import { fetchSceneryLayout } from '../../../../api/sceneryApi.js';
import { fetchBody, type LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import type { RaceClock } from '../../race/raceClock.js';
import type { RacePoseCache } from '../../race/racePoseCache.js';
import type { CameraMode } from '../cameraModes.js';
import { NO_LOAD_PROGRESS, type SceneLoadProgress } from '../laps/loadProgress.js';
import { createRaceScene, type RaceSceneHandle } from './raceScene.js';

interface Options {
  host: RefObject<HTMLDivElement | null>;
  overview: RaceReplayOverview;
  clock: RaceClock;
  poses: RacePoseCache;
  followSlot: number | null;
  /** Every car's distance along the track: the scenery streams ahead of the followed car by it (null outside races or while it loads). */
  progress: RaceReplayProgress | null;
  mode: CameraMode;
  retry: number;
}
interface SceneState {key: string; error?: string; ready?: boolean; progress?: SceneLoadProgress}

/** Where a car is at `timeSec` (native x and z), or else the first car the window has on the track. */
function firstPlace(window: RacePoseWindow, slot: number | null, timeSec: number): {x: number; z: number} | null {
  const pose = new Float32Array(RACE_POSE_CHANNEL_COUNT), order = [window.slots.indexOf(slot ?? -1), ...window.slots.keys()];
  for (const car of order) if (car >= 0 && sampleRacePose(window, car, timeSec, pose)) return {x: pose[0], z: pose[2]};
  return null;
}

/** A car's track station at `timeSec` from the progress grid (its distance modulo the track length), or undefined off the track. */
export function trackStation(progress: RaceReplayProgress | null, slot: number | null, timeSec: number): number | undefined {
  const distances = progress?.cars.find(car => car.slot === slot)?.distances;
  if (!progress || !distances) return undefined;
  const at = (timeSec - progress.fromSec) * progress.hz, index = Math.floor(at), a = distances[index], b = distances[index + 1];
  if (a === null || a === undefined) return undefined;
  const distance = b === null || b === undefined ? a : a + (b - a) * (at - index), length = progress.trackLengthM;
  return ((distance % length) + length) % length;
}

/** The race replay's 3D scene for a layout: every car on the session clock, the followed one as its full model. */
export function useRaceScene({host, overview, clock, poses, followSlot, progress, mode, retry}: Options) {
  const scene = useRef<RaceSceneHandle | null>(null);
  const [state, setState] = useState<SceneState | null>(null);
  const key = `${overview.layoutKey ?? ''}:${retry}`;
  const window = poses.windowAt(clock.getState().timeSec);
  // Bodies outlive the scene's loads (a load cancelled by a re-render leaves its body to the next): they stop only on unmount.
  const bodies = useRef({cache: new Map<string, Promise<LoadedBody>>(), signal: AbortSignal.abort()});
  useEffect(() => {
    const controller = new AbortController(), owner = bodies.current;
    owner.signal = controller.signal;
    return () => { controller.abort(); owner.cache.clear(); };
  }, []);
  /** A car's body, once per livery (the scene parses each body once for all its liveries); null for a car the replay does not name. */
  const bodyOf = useEffectEvent((slot: number | null): Promise<LoadedBody | null> => {
    const vehicleId = overview.cars.find(car => car.slot === slot)?.vehicleId;
    if (!vehicleId) return Promise.resolve(null);
    const {cache, signal} = bodies.current;
    let pending = cache.get(vehicleId);
    if (!pending) {
      pending = fetchBody(vehicleId, undefined, signal);
      cache.set(vehicleId, pending);
      pending.catch(() => { if (cache.get(vehicleId) === pending) cache.delete(vehicleId); });
    }
    return pending;
  });
  const latest = useEffectEvent(() => ({followSlot, mode, window}));
  const drawAt = useEffectEvent(() => {
    const {timeSec} = clock.getState();
    scene.current?.time(timeSec, poses.windowAt(timeSec), trackStation(progress, followSlot, timeSec));
  });
  // The scene waits for the first pose window: its scenery streams first around the followed car.
  const hasWindow = window !== null;
  useEffect(() => {
    const container = host.current, layoutKey = overview.layoutKey;
    if (!container || !hasWindow) return;
    const abort = new AbortController();
    let active = true, created: RaceSceneHandle | null = null;
    const fail = (message: string) => { if (active) setState({key, error: message}); };
    const initialize = async () => {
      if (!layoutKey) throw Error('This replay has no resolved circuit layout. Use the 2D map.');
      const selected = latest();
      const place = selected.window && firstPlace(selected.window, selected.followSlot, clock.getState().timeSec);
      if (!place) throw Error('No car is on the track here. Use the 2D map.');
      setState({key, progress: NO_LOAD_PROGRESS});
      const showProgress = (progress: SceneLoadProgress) => { if (active) setState(current => current?.error ? current : {...(current?.key === key ? current : {key}), progress}); };
      const [layout, body] = await Promise.all([fetchSceneryLayout(layoutKey, abort.signal), bodyOf(selected.followSlot)]);
      abort.signal.throwIfAborted();
      const handle = await createRaceScene(container, layout, overview.cars, {slot: selected.followSlot, body, ...place}, slot => bodyOf(slot), fail, showProgress);
      if (!active) { handle.dispose(); return; }
      created = handle; scene.current = handle; handle.mode(latest().mode); drawAt();
      setState(current => ({key, ready: true, progress: current?.key === key ? current.progress : undefined}));
    };
    initialize().catch((error: unknown) => {
      if (active && !isAbortError(error)) fail(apiErrorMessage(error, 'Unable to load the 3D race scene'));
    });
    return () => {
      active = false; abort.abort(); created?.dispose();
      if (scene.current === created) scene.current = null;
    };
  }, [key, host, overview, clock, hasWindow]);
  // A newly followed car loads its body; the scene shows its box until then.
  useEffect(() => {
    const handle = scene.current;
    if (!handle) return;
    const abort = new AbortController();
    bodyOf(followSlot).then(body => handle.follow(followSlot, body, abort.signal)).catch((error: unknown) => {
      if (!abort.signal.aborted && !isAbortError(error)) setState({key, error: apiErrorMessage(error, 'Unable to load the followed car')});
    });
    return () => abort.abort();
  }, [followSlot, key, state?.ready]);
  useEffect(() => clock.subscribe(() => drawAt()), [clock]);
  useEffect(() => { drawAt(); }, [window, state?.ready, progress]);
  useEffect(() => { scene.current?.mode(mode); drawAt(); }, [mode]);
  return {scene, state: state?.key === key ? state : null};
}
