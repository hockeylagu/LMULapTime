import { useEffect, useState } from 'react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { DebriefUnavailableError, loadSessionDebrief, SessionDebrief } from './loadSessionDebrief.js';

export type SessionDebriefState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; debrief: SessionDebrief };

const IDLE: SessionDebriefState = { status: 'idle' };

// Module-level so leaving and reopening a session does not refetch and re-time every lap.
const debriefCache = new Map<string, SessionDebriefState>();
const MAX_CACHE_ENTRIES = 10;

function remember(key: string, state: SessionDebriefState): void {
  debriefCache.delete(key);
  debriefCache.set(key, state);
  if (debriefCache.size > MAX_CACHE_ENTRIES) {
    const oldest = debriefCache.keys().next().value;
    if (oldest !== undefined) debriefCache.delete(oldest);
  }
}

/** Test hook: forget every cached debrief. */
export function clearSessionDebriefCache(): void {
  debriefCache.clear();
}

/**
 * The debrief of the selected driver's best lap in this session, built on demand: it stays idle
 * while `attempt` is 0, unless this session and driver were already debriefed. Raising `attempt`
 * again retries after an error.
 */
export function useSessionDebrief(
  session: DetailedSession | null,
  driver: DriverData | undefined,
  attempt: number
): SessionDebriefState {
  const key = session && driver ? `${session.id}|${driver.name}` : null;
  const [state, setState] = useState<SessionDebriefState>(() => (key && debriefCache.get(key)) || IDLE);

  useEffect(() => {
    if (!session || !driver || !key) return;
    const cached = debriefCache.get(key);
    if (cached) {
      setState(cached);
      return;
    }
    if (attempt === 0) {
      setState(IDLE);
      return;
    }
    setState({ status: 'loading' });
    const controller = new AbortController();
    loadSessionDebrief(session, driver, controller.signal)
      .then((debrief) => {
        const next: SessionDebriefState = { status: 'ready', debrief };
        remember(key, next);
        setState(next);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        const next: SessionDebriefState = err instanceof DebriefUnavailableError
          ? { status: 'unavailable', reason: err.message }
          : { status: 'error', message: apiErrorMessage(err, 'Could not build the debrief') };
        if (next.status === 'unavailable') remember(key, next);
        setState(next);
      });
    return () => controller.abort();
    // The key names the session and driver; the objects themselves change identity on refresh.
  }, [key, attempt]);

  return state;
}
