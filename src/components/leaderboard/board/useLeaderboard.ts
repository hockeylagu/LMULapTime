import { useCallback, useEffect, useState } from 'react';
import type { Leaderboard } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { loadLeaderboard } from '../../../api/leaderboardApi.js';

export interface LeaderboardState {
  board: Leaderboard | null;
  loading: boolean;
  error: string | null;
  /** Loads the board again after an error. */
  retry: () => void;
}

/** The board of a layout and class (or one car), reloaded whenever the pick changes or on retry. */
export function useLeaderboard(layoutKey: string | null, carClass: string | null, carType: string | null): LeaderboardState {
  const [state, setState] = useState<Omit<LeaderboardState, 'retry'>>({ board: null, loading: false, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!layoutKey || !carClass) {
      setState({ board: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    // The previous board stays out of view: it belongs to another pick.
    setState({ board: null, loading: true, error: null });
    loadLeaderboard({ layoutKey, carClass, carType }, controller.signal)
      .then((board) => setState({ board, loading: false, error: null }))
      .catch((err) => {
        if (isAbortError(err)) return;
        setState({ board: null, loading: false, error: apiErrorMessage(err, 'The leaderboard could not be loaded.') });
      });
    return () => controller.abort();
  }, [layoutKey, carClass, carType, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
