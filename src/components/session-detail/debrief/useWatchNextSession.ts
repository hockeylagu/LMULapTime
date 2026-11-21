import { useEffect, useState } from 'react';
import type { DetailedSession } from '../../../../shared/types/index.js';
import { ApiError, apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { fetchSessionCornerAnalysis, loadLayoutCorners, onSequenceMapsChanged, unpinHabitFocus } from '../../../api/cornerSequenceApi.js';
import { useSessionDataContext } from '../../../api/sessionDataContext.js';
import { cornerNumbering, watchNextSession, type WatchNextSession } from './watchNextSession.js';

export type WatchNextSessionState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; watch: WatchNextSession };

const LOADING: WatchNextSessionState = { status: 'loading' };

/**
 * The session player's "watch next session" lines, read when shown: fetched again when sessions are stored, a sequence
 * map changes or the driver retries. A session the analysis cannot read (no replay passes, too few laps) is unavailable.
 */
export function useWatchNextSession(session: DetailedSession, driverName: string, hasReplay: boolean): {
  state: WatchNextSessionState;
  retry: () => void;
  /** Unpins the corner holding the turn, then reads the focus again; null while nothing can be unpinned. */
  unpin: ((turnId: number) => void) | null;
} {
  const { revision } = useSessionDataContext();
  const [attempt, setAttempt] = useState(0);
  const [mapsChanged, setMapsChanged] = useState(0);
  useEffect(() => onSequenceMapsChanged(() => setMapsChanged(count => count + 1)), []);
  const key = `${session.id}|${driverName}|${revision}|${attempt}|${mapsChanged}`;
  const [loaded, setLoaded] = useState<{ key: string; state: WatchNextSessionState } | null>(null);

  useEffect(() => {
    if (!hasReplay) return;
    const controller = new AbortController();
    const lapNumberOf = (driverOrdinal: number) => (lapOrdinal: number) => session.drivers[driverOrdinal]?.laps[lapOrdinal]?.lapNumber ?? null;
    void (async () => {
      try {
        const analysis = await fetchSessionCornerAnalysis(session.id, controller.signal);
        const layout = await loadLayoutCorners(analysis.layoutKey, analysis.carClass);
        if (controller.signal.aborted) return;
        const watch = watchNextSession(analysis, driverName, cornerNumbering(layout), lapNumberOf(analysis.driverOrdinal));
        setLoaded({ key, state: { status: 'ready', watch } });
      } catch (error: unknown) {
        if (isAbortError(error) || controller.signal.aborted) return;
        setLoaded({ key, state: error instanceof ApiError && error.status === 404
          ? { status: 'unavailable', message: 'No corner analysis for this session. It needs a replay with enough dry flying laps.' }
          : { status: 'error', message: apiErrorMessage(error, 'Could not read the corner analysis') } });
      }
    })();
    return () => controller.abort();
  }, [key, session, driverName, hasReplay]);

  const state = hasReplay
    ? loaded?.key === key ? loaded.state : LOADING
    : { status: 'unavailable' as const, message: 'No replay linked to this session.' };
  const retry = () => setAttempt(count => count + 1);
  const pinScope = state.status === 'ready' ? state.watch.pinScope : null;
  // Read again either way: a failed unpin shows the corner still pinned.
  return { state, retry, unpin: pinScope && ((turnId) => { void unpinHabitFocus({ ...pinScope, turnId }).then(retry, retry); }) };
}
