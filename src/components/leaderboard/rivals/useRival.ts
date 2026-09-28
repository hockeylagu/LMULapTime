import { useCallback, useEffect, useState } from 'react';
import type { RivalStatus } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { LeaderboardRequest, loadRival, pinRival } from '../../../api/leaderboardApi.js';

export interface RivalState {
  status: RivalStatus | null;
  loading: boolean;
  error: string | null;
  /** Makes a driver ahead the rival. */
  pin: (driverName: string) => void;
}

/** The player's rival on the selected board; null request while no board is selected. */
export function useRival(request: LeaderboardRequest | null): RivalState {
  const [status, setStatus] = useState<RivalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layoutKey = request?.layoutKey ?? null;
  const carClass = request?.carClass ?? null;
  const carType = request?.carType ?? null;

  useEffect(() => {
    setStatus(null);
    setError(null);
    if (!layoutKey || !carClass) return;
    const controller = new AbortController();
    setLoading(true);
    loadRival({ layoutKey, carClass, carType }, controller.signal)
      .then((next) => { setStatus(next); setLoading(false); })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, 'Your rival could not be loaded.'));
        setLoading(false);
      });
    return () => controller.abort();
  }, [layoutKey, carClass, carType]);

  const act = useCallback((action: (r: LeaderboardRequest) => Promise<RivalStatus>) => {
    if (!layoutKey || !carClass) return;
    setError(null);
    action({ layoutKey, carClass, carType })
      .then(setStatus)
      .catch((err) => setError(apiErrorMessage(err, 'Your rival could not be changed.')));
  }, [layoutKey, carClass, carType]);

  const pin = useCallback((driverName: string) => act((r) => pinRival(r, driverName)), [act]);

  return { status, loading, error, pin };
}
