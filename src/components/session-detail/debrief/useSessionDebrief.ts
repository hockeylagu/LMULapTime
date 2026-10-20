import { useEffect, useMemo, useState } from 'react';
import type { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { useSessionDataContext } from '../../../api/sessionDataContext.js';
import { DebriefUnavailableError, loadSessionDebrief, SessionDebrief } from './loadSessionDebrief.js';

export type SessionDebriefState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; debrief: SessionDebrief };

const IDLE: SessionDebriefState = { status: 'idle' };
const LOADING: SessionDebriefState = { status: 'loading' };

/**
 * The selected driver's debrief is built only after an explicit request. Requested results are
 * refreshed when session data changes, and unavailable results can recover after replay processing.
 */
export function useSessionDebrief(
  session: DetailedSession | null,
  driver: DriverData | undefined,
  attempt: number
): SessionDebriefState {
  const { revision, scan } = useSessionDataContext();
  const ingestionSettled = !scan || scan.allComplete === true;
  const key = session && driver ? `${session.id}|${driver.name}` : null;
  const requested = !!(session && driver && key && attempt !== 0);
  // Each request is one identity: a new attempt, revision or settled ingestion shows loading until it answers.
  const request = useMemo(() => ({ key, attempt, revision, ingestionSettled }), [key, attempt, revision, ingestionSettled]);
  const [result, setResult] = useState<{ request: typeof request; state: SessionDebriefState } | null>(null);
  const state = !requested ? IDLE : result?.request === request ? result.state : LOADING;

  useEffect(() => {
    // Acknowledge the request and clear stale results while ingestion settles. This prevents
    // repeated expensive restarts for each published batch.
    if (!requested || !session || !driver || !request.ingestionSettled) return;
    const controller = new AbortController();
    loadSessionDebrief(session, driver, controller.signal)
      .then((debrief) => {
        if (!controller.signal.aborted) setResult({ request, state: { status: 'ready', debrief } });
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        const next: SessionDebriefState = err instanceof DebriefUnavailableError
          ? { status: 'unavailable', reason: err.message }
          : { status: 'error', message: apiErrorMessage(err, 'Could not build the debrief') };
        setResult({ request, state: next });
      });
    return () => controller.abort();
  }, [request, requested, session, driver]);

  return state;
}
