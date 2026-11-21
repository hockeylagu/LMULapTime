import { useEffect, useState } from 'react';
import type { SessionCornerAnalysis } from '../../../../../shared/types/corners/cornerAnalysis.js';
import { ApiError, apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';
import { fetchSessionCornerAnalysis, loadLayoutCorners, onSequenceMapsChanged } from '../../../../api/cornerSequenceApi.js';
import { cornerNumbering } from '../../../session-detail/debrief/drivingHabits.js';

export type SessionCornerAnalysisState =
  | { status: 'loading' }
  /** The session has no analysis: no replay passes, or too few dry flying laps. */
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  /** The session player's analysis, and the lap view's number of each of its corners. */
  | { status: 'ready'; analysis: SessionCornerAnalysis; cornerNumberOf: (cornerId: number) => number | null };

const LOADING: SessionCornerAnalysisState = { status: 'loading' };

/** A session's corner analysis for the lap view, read again when a sequence map changes; null without a session. */
export function useSessionCornerAnalysis(sessionId: string | undefined): SessionCornerAnalysisState | null {
  const [mapsChanged, setMapsChanged] = useState(0);
  useEffect(() => onSequenceMapsChanged(() => setMapsChanged(count => count + 1)), []);
  const key = sessionId ? `${sessionId}|${mapsChanged}` : null;
  const [loaded, setLoaded] = useState<{ key: string; state: SessionCornerAnalysisState } | null>(null);

  useEffect(() => {
    if (!sessionId || !key) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const analysis = await fetchSessionCornerAnalysis(sessionId, controller.signal);
        const layout = await loadLayoutCorners(analysis.layoutKey, analysis.carClass);
        if (controller.signal.aborted) return;
        setLoaded({ key, state: { status: 'ready', analysis, cornerNumberOf: cornerNumbering(layout) } });
      } catch (error: unknown) {
        if (isAbortError(error) || controller.signal.aborted) return;
        setLoaded({ key, state: error instanceof ApiError && error.status === 404
          ? { status: 'unavailable' }
          : { status: 'error', message: apiErrorMessage(error, 'Could not read the corner analysis') } });
      }
    })();
    return () => controller.abort();
  }, [sessionId, key]);

  if (!key) return null;
  return loaded?.key === key ? loaded.state : LOADING;
}
