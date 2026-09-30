import { useCallback, useEffect, useState } from 'react';
import type { LeaderboardLayout } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { loadLeaderboardLayouts } from '../../../api/leaderboardApi.js';

export interface LeaderboardLayoutsState {
  layouts: LeaderboardLayout[];
  loading: boolean;
  error: string | null;
  /** Loads the layouts again after an error. */
  retry: () => void;
}

/** The layouts the player drove, newest first, loaded once per page visit (and again on retry). */
export function useLeaderboardLayouts(): LeaderboardLayoutsState {
  const [state, setState] = useState<Omit<LeaderboardLayoutsState, 'retry'>>({ layouts: [], loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loadLeaderboardLayouts(controller.signal)
      .then((layouts) => setState({ layouts, loading: false, error: null }))
      .catch((err) => {
        if (isAbortError(err)) return;
        setState({ layouts: [], loading: false, error: apiErrorMessage(err, 'Your tracks could not be loaded.') });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
