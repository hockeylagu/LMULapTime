import { useCallback, useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import type { RaceReplayOverview, RaceReplayProgress, ReplayDaylightClock } from '../../../../../shared/types/replay.js';
import { replayDaylightClock } from '../../../../../shared/domain/scenery/replayDaylightClock.js';
import { RACE_POSE_CHANNEL_COUNT, sampleRacePose, type RacePoseWindow } from '../../../../../shared/domain/raceReplay/poseWindow.js';
import { fetchSceneryLayout } from '../../../../api/sceneryApi.js';
import type { LoadedBody } from '../../../../api/vehicles/bodyApi.js';
import { createBodyStore, type BodyStore } from '../../../../api/vehicles/bodyStore.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import type { RaceClock } from '../../race/raceClock.js';
import type { RacePoseCache } from '../../race/racePoseCache.js';
import type { CameraMode } from '../camera/cameraModes.js';
import { NO_LOAD_PROGRESS } from '../scene/loadProgress.js';
import { useSceneHost, type SceneCreateContext } from '../scene/useSceneHost.js';
import { useSceneShells } from '../scene/sceneShells.js';
import { createRaceScene, type RaceSceneHandle } from './raceScene.js';
import type { RaceCockpitLap } from './useRaceCockpitLap.js';

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
  /** The followed car's lap its wheel and dash screens read (`useRaceCockpitLap`). */
  cockpitLap: RaceCockpitLap | null;
}
/**
 * Where a car is at `timeSec` (native x and z): on the track, else where it next appears (waiting in its garage), else where the
 * first car the window has on the track is.
 */
async function firstPlace(window: RacePoseWindow, poses: RacePoseCache, slot: number | null, timeSec: number): Promise<{x: number; z: number} | null> {
  const pose = new Float32Array(RACE_POSE_CHANNEL_COUNT), own = window.slots.indexOf(slot ?? -1);
  if (own >= 0 && sampleRacePose(window, own, timeSec, pose)) return {x: pose[0], z: pose[2]};
  const next = slot === null ? null : await poses.nextPose(slot, timeSec);
  if (next && sampleRacePose(next.window, next.carIndex, next.timeSec, pose)) return {x: pose[0], z: pose[2]};
  for (const car of window.slots.keys()) if (sampleRacePose(window, car, timeSec, pose)) return {x: pose[0], z: pose[2]};
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

/** The in-game clock at replay time `timeSec` (replay time is session time). */
export function raceDaylightClock(overview: RaceReplayOverview, timeSec: number): ReplayDaylightClock {
  const {sessionStartMinute, cloudCover, cloudField, cloudVariants} = overview.daylight;
  return replayDaylightClock(overview.sessionType, sessionStartMinute, timeSec, cloudCover, cloudField, cloudVariants, overview.sceneDesc);
}

/** How often the sun follows the session clock, ms of wall time: a light change redraws every shadow cascade. */
const DAYLIGHT_MS = 1000;

/** Draws the session clock's moment: every car's pose, and the track station the scenery streams towards. */
function drawScene(handle: RaceSceneHandle, clock: RaceClock, poses: RacePoseCache, progress: RaceReplayProgress | null, followSlot: number | null) {
  const {timeSec} = clock.getState();
  handle.time(timeSec, poses.windowAt(timeSec), trackStation(progress, followSlot, timeSec));
}

/** The race replay's 3D scene for a layout: every car on the session clock, the followed one as its full model. */
export function useRaceScene({host, overview, clock, poses, followSlot, progress, mode, retry, cockpitLap}: Options) {
  const key = `${overview.replayName}:${overview.layoutKey ?? ''}:${retry}`;
  const shells = useSceneShells();
  const window = poses.windowAt(clock.getState().timeSec);
  // Bodies outlive the scene's loads (a load cancelled by a re-render leaves its body to the next): they stop only on unmount.
  // Made on mount (a remount gets a new one: a disposed store's fetches stay aborted).
  const bodies = useRef<BodyStore | null>(null);
  useEffect(() => {
    const store = createBodyStore();
    bodies.current = store;
    return () => { store.dispose(); if (bodies.current === store) bodies.current = null; };
  }, []);
  /** The scene's package revision once its layout is in: every body after it is checked against it. */
  const revision = useRef<string | undefined>(undefined);
  /** A car's body, once per livery (the scene parses each body once for all its liveries); null for a car the replay does not name. */
  const bodyOf = useCallback((slot: number | null): Promise<LoadedBody | null> => {
    const vehicleId = overview.cars.find(car => car.slot === slot)?.vehicleId;
    if (!vehicleId) return Promise.resolve(null);
    if (!bodies.current) return Promise.reject(new DOMException('The race view is unmounted', 'AbortError'));
    return bodies.current.body(vehicleId, revision.current);
  }, [overview.cars]);
  const create = async ({container, signal, showProgress, fail}: SceneCreateContext): Promise<RaceSceneHandle> => {
    const layoutKey = overview.layoutKey;
    if (!layoutKey) throw Error('This replay has no resolved circuit layout. Use the 2D map.');
    const place = window && await firstPlace(window, poses, followSlot, clock.getState().timeSec);
    signal.throwIfAborted();
    if (!place) throw Error('No car is on the track here. Use the 2D map.');
    showProgress(NO_LOAD_PROGRESS);
    const [layout, body] = await Promise.all([fetchSceneryLayout(layoutKey, signal), bodyOf(followSlot)]);
    signal.throwIfAborted();
    revision.current = layout.packageRevision;
    if (body && body.resource.packageRevision !== layout.packageRevision) throw Error('Body package revision differs from the 3D scene');
    const daylight = raceDaylightClock(overview, clock.getState().timeSec);
    return shells.startWith(layout, {daylightClock: daylight, firstView: {kind: 'free', x: place.x, z: place.z}}, container, shell =>
      createRaceScene(shell, container, layout, overview.cars, {slot: followSlot, body, daylight}, slot => bodyOf(slot),
        (slot, timeSec) => poses.nextPose(slot, timeSec), fail, showProgress));
  };
  // The scene waits for the first pose window: its scenery streams first around the followed car.
  // Coming from the lap view on this circuit, its scene shows at once while the race's cars build.
  const {scene, state, setState} = useSceneHost<RaceSceneHandle>({host, key, enabled: window !== null, errorMessage: 'Unable to load the 3D race scene', create,
    showEarly: (container, listener) => shells.attachShown(overview.layoutKey, container, listener),
    onCreated: handle => {
      handle.mode(mode); drawScene(handle, clock, poses, progress, followSlot);
      setState(current => ({key, ready: true, progress: current?.key === key ? current.progress : undefined}));
    }});
  /** When the sun last followed the clock, and the pending catch-up (a paused seek inside the interval still moves the sun). */
  const daylight = useRef<{at: number; timer: ReturnType<typeof setTimeout> | undefined}>({at: -Infinity, timer: undefined});
  const applyDaylight = useEffectEvent(() => {
    const handle = scene.current;
    if (!handle) return;
    daylight.current.at = performance.now();
    const {timeSec} = clock.getState();
    handle.daylight(raceDaylightClock(overview, timeSec));
  });
  const followDaylight = useEffectEvent(() => {
    const state = daylight.current, wait = state.at + DAYLIGHT_MS - performance.now();
    if (state.timer) return;
    if (wait > 0) state.timer = globalThis.setTimeout(() => { state.timer = undefined; applyDaylight(); }, wait);
    else applyDaylight();
  });
  useEffect(() => {
    const state = daylight.current;
    return () => globalThis.clearTimeout(state.timer);
  }, []);
  const drawAt = useEffectEvent(() => {
    if (!scene.current) return;
    drawScene(scene.current, clock, poses, progress, followSlot);
    followDaylight();
  });
  // A newly followed car loads its body; the scene shows its stand-in until then.
  useEffect(() => {
    const handle = scene.current;
    if (!handle) return;
    const abort = new AbortController();
    bodyOf(followSlot).then(body => handle.follow(followSlot, body, abort.signal)).catch((error: unknown) => {
      if (!abort.signal.aborted && !isAbortError(error)) setState({key, error: apiErrorMessage(error, 'Unable to load the followed car')});
    });
    return () => abort.abort();
  }, [followSlot, key, state?.ready, scene, setState, bodyOf]);
  useEffect(() => clock.subscribe(() => drawAt()), [clock]);
  useEffect(() => { drawAt(); }, [window, state?.ready, progress]);
  useEffect(() => { scene.current?.mode(mode); drawAt(); }, [mode, scene]);
  useEffect(() => { scene.current?.cockpitLap(cockpitLap); }, [cockpitLap, scene, state?.ready]);
  return {scene, state};
}
