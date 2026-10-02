import { useEffect, useState } from 'react';
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
  const [stored, setStored] = useState<{ key: string | null; state: SessionDebriefState }>({ key, state: IDLE });
  const state = stored.key === key ? stored.state : IDLE;

  useEffect(() => {
    if (!session || !driver || !key || attempt === 0) {
      setStored({ key, state: IDLE });
      return;
    }
    setStored({ key, state: { status: 'loading' } });
    // Acknowledge the request and clear stale results while ingestion settles. This prevents
    // repeated expensive restarts for each published batch.
    if (!ingestionSettled) return;
    const controller = new AbortController();
    loadSessionDebrief(session, driver, controller.signal)
      .then((debrief) => {
        const next: SessionDebriefState = { status: 'ready', debrief };
        if (!controller.signal.aborted) setStored({ key, state: next });
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        const next: SessionDebriefState = err instanceof DebriefUnavailableError
          ? { status: 'unavailable', reason: err.message }
          : { status: 'error', message: apiErrorMessage(err, 'Could not build the debrief') };
        setStored({ key, state: next });
      });
    return () => controller.abort();
  }, [key, attempt, revision, ingestionSettled, session, driver]);

  return state;
}
