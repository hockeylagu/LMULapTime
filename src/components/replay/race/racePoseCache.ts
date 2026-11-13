import { RACE_POSE_CHANNEL_COUNT, type RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';

type FetchWindow = (index: number, signal: AbortSignal) => Promise<RacePoseWindow>;

/** Windows kept around the clock: the current one, the next (fetched ahead) and a few behind. */
const KEEP_WINDOWS = 6;
/** Windows a car's next pose is looked for in, from the clock's: a car out of the replay longer than this has none. */
const NEXT_POSE_WINDOWS = 30;

/** A car's next sample with a pose: the window holding it, the car's index in it and the sample's time. */
export interface NextPose { window: RacePoseWindow; carIndex: number; timeSec: number }

/**
 * The race replay's pose windows on the client: loads the window under the clock, fetches the
 * next one once the clock is past half of it, and drops windows far from the clock.
 */
export function createRacePoseCache(windowSec: number, fetchWindow: FetchWindow, onChange: () => void) {
  const windows = new Map<number, RacePoseWindow>();
  const loading = new Map<number, AbortController>();
  const failed = new Map<number, string>();

  const load = (index: number) => {
    if (index < 0 || windows.has(index) || loading.has(index) || failed.has(index)) return;
    const controller = new AbortController();
    loading.set(index, controller);
    fetchWindow(index, controller.signal).then(
      (window) => { windows.set(index, window); },
      (error: unknown) => { if (!controller.signal.aborted) failed.set(index, error instanceof Error ? error.message : String(error)); },
    ).finally(() => {
      if (loading.get(index) === controller) loading.delete(index);
      if (!controller.signal.aborted) onChange();
    });
  };

  const evict = (current: number) => {
    const far = [...windows.keys()].sort((a, b) => Math.abs(b - current) - Math.abs(a - current));
    while (windows.size > KEEP_WINDOWS && far.length) windows.delete(far.shift()!);
    for (const [index, controller] of loading) {
      if (index < current - 1 || index > current + 1) { controller.abort(); loading.delete(index); }
    }
  };

  /** Each car's next pose by slot and window index, found once. */
  const nextPoses = new Map<string, Promise<NextPose | null>>();
  /** One window after another (the first with a pose ends the search), from `index`. */
  const findNextPose = async (slot: number, timeSec: number, index: number, last: number): Promise<NextPose | null> => {
    if (index > last) return null;
    // A window past the replay's end does not load: the car has no pose ahead.
    const window = windows.get(index) ?? await fetchWindow(index, new AbortController().signal).catch(() => null);
    if (!window) return null;
    const carIndex = window.slots.indexOf(slot);
    if (carIndex >= 0) {
      const from = Math.max(0, Math.ceil((timeSec - window.fromSec) * window.hz));
      for (let sample = from; sample < window.count; sample++) {
        if (Number.isFinite(window.data[(carIndex * window.count + sample) * RACE_POSE_CHANNEL_COUNT])) return {window, carIndex, timeSec: window.fromSec + sample / window.hz};
      }
    }
    return findNextPose(slot, timeSec, index + 1, last);
  };

  return {
    /**
     * The car's first pose at or after `timeSec`, looked for in the windows ahead (not kept), or null if it has none in the next
     * `NEXT_POSE_WINDOWS`: where a car out of the replay (in its garage) appears.
     */
    nextPose(slot: number, timeSec: number): Promise<NextPose | null> {
      const index = Math.max(0, Math.floor(timeSec / windowSec)), key = `${slot}:${index}`;
      let found = nextPoses.get(key);
      if (!found) { found = findNextPose(slot, timeSec, index, index + NEXT_POSE_WINDOWS - 1); nextPoses.set(key, found); }
      return found;
    },
    /** The window holding `timeSec`, or null while it loads; starts the loads it needs. */
    windowAt(timeSec: number): RacePoseWindow | null {
      const index = Math.max(0, Math.floor(timeSec / windowSec));
      load(index);
      if (timeSec - index * windowSec > windowSec / 2) load(index + 1);
      evict(index);
      return windows.get(index) ?? null;
    },
    /** Why the window holding `timeSec` could not load, if it failed. */
    errorAt: (timeSec: number) => failed.get(Math.max(0, Math.floor(timeSec / windowSec))) ?? null,
    isLoading: (timeSec: number) => loading.has(Math.max(0, Math.floor(timeSec / windowSec))),
    retry: () => { failed.clear(); onChange(); },
    dispose: () => { loading.forEach(controller => controller.abort()); loading.clear(); windows.clear(); },
  };
}

export type RacePoseCache = ReturnType<typeof createRacePoseCache>;
