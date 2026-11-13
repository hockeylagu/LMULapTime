import type { RacePoseWindow } from '../../../../shared/domain/raceReplay/poseWindow.js';

type FetchWindow = (index: number, signal: AbortSignal) => Promise<RacePoseWindow>;

/** Windows kept around the clock: the current one, the next (fetched ahead) and a few behind. */
const KEEP_WINDOWS = 6;

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

  return {
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
