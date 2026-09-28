import { useEffect, useState } from 'react';
import type { LeaderboardLayout } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { loadLeaderboardLayouts } from '../../../api/leaderboardApi.js';

export interface LeaderboardLayoutsState {
  layouts: LeaderboardLayout[];
  loading: boolean;
  error: string | null;
}

/** The layouts the player drove, newest first, loaded once per page visit. */
export function useLeaderboardLayouts(): LeaderboardLayoutsState {
  const [state, setState] = useState<LeaderboardLayoutsState>({ layouts: [], loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    loadLeaderboardLayouts(controller.signal)
      .then((layouts) => setState({ layouts, loading: false, error: null }))
      .catch((err) => {
        if (isAbortError(err)) return;
        setState({ layouts: [], loading: false, error: apiErrorMessage(err, 'Your tracks could not be loaded.') });
      });
    return () => controller.abort();
  }, []);

  return state;
}
