import { isAbortError } from '../../../../api/apiClient.js';
import type { RealRoadSurface } from '../scenery/realRoad.js';

/** How far the session time moves (seconds) before the surface state is fetched again: a replay update blends in over 3 s. */
export const SURFACE_STEP_S = 5;

/** `elements` x 4 bytes of the session's surface state at `timeSec`; rejects when the session has none. */
export type SurfaceStateFetch = (sessionId: string, elements: number, timeSec: number, signal: AbortSignal) => Promise<Uint8Array>;

export interface SceneSurface {
  /** Draws the surface state of `sessionId` at `timeSec` once fetched: the newest request wins, one fetch at a time. */
  follow(sessionId: string, timeSec: number): void;
  /** Resolves once no fetch is outstanding (the state drawn is the last one asked for, or the assumed one where there is none). */
  settled(): Promise<void>;
  dispose(): void;
}

interface Moment { sessionId: string; timeSec: number }

/**
 * Keeps the scene's road surface on the session clock: the state of the time asked last, fetched again once the time moved
 * `SURFACE_STEP_S` or the session changed. A session whose state fails (its replay is gone) draws the assumed state and is not asked again.
 */
export function createSceneSurface(surface: Pick<RealRoadSurface, 'elements' | 'setState' | 'dispose'>, fetchState: SurfaceStateFetch, redraw: () => void): SceneSurface {
  let shown: Moment | null = null, wanted: Moment | null = null;
  let loading: AbortController | null = null, disposed = false;
  const failed = new Set<string>(), waiting: Array<() => void> = [];
  const due = (next: Moment) => !failed.has(next.sessionId)
    && (!shown || shown.sessionId !== next.sessionId || Math.abs(shown.timeSec - next.timeSec) >= SURFACE_STEP_S);
  const load = (target: Moment) => {
    const abort = loading = new AbortController();
    fetchState(target.sessionId, surface.elements, target.timeSec, abort.signal).then(state => {
      if (disposed) return;
      surface.setState(state); shown = target; redraw();
    }, (error: unknown) => {
      if (disposed || isAbortError(error)) return;
      failed.add(target.sessionId);
      if (shown?.sessionId !== target.sessionId) { surface.setState(null); shown = null; redraw(); }
    }).finally(() => {
      if (loading === abort) loading = null;
      if (disposed) return;
      if (wanted && due(wanted)) load(wanted);
      else for (const resolve of waiting.splice(0)) resolve();
    });
  };
  return {
    follow(sessionId, timeSec) {
      if (disposed) return;
      wanted = {sessionId, timeSec: Math.max(0, timeSec)};
      if (!loading && due(wanted)) load(wanted);
    },
    settled: () => (loading ? new Promise(resolve => { waiting.push(resolve); }) : Promise.resolve()),
    dispose() {
      disposed = true; loading?.abort(); loading = null;
      for (const resolve of waiting.splice(0)) resolve();
      surface.dispose();
    },
  };
}
