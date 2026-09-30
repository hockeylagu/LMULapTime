import { useCallback, useEffect, useRef, useState } from 'react';
import type { RivalStatus } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { LeaderboardRequest, loadRival, pinRival } from '../../../api/leaderboardApi.js';

export interface RivalState {
  status: RivalStatus | null;
  loading: boolean;
  /** The rival could not be loaded: there is no card to show. */
  error: string | null;
  /** A change (pinning a driver) failed: the card stays, with this message. */
  actionError: string | null;
  /** A change is on its way; further changes wait for it. */
  pending: boolean;
  /** Makes a driver ahead the rival. */
  pin: (driverName: string) => void;
  /** Loads the rival again after an error. */
  retry: () => void;
}

/** The player's rival on the selected board; null request while no board is selected. */
export function useRival(request: LeaderboardRequest | null): RivalState {
  const [status, setStatus] = useState<RivalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const layoutKey = request?.layoutKey ?? null;
  const carClass = request?.carClass ?? null;
  const carType = request?.carType ?? null;
  // The board a change was made on: its answer is dropped once another board is picked.
  const boardKey = `${layoutKey}|${carClass}|${carType}`;
  const boardKeyRef = useRef(boardKey);

  useEffect(() => {
    boardKeyRef.current = boardKey;
    setStatus(null);
    setError(null);
    setActionError(null);
    setPending(false);
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
  }, [layoutKey, carClass, carType, boardKey, attempt]);

  const act = useCallback((action: (r: LeaderboardRequest) => Promise<RivalStatus>) => {
    if (!layoutKey || !carClass || pending) return;
    const madeOn = boardKeyRef.current;
    setActionError(null);
    setPending(true);
    action({ layoutKey, carClass, carType })
      .then((next) => {
        if (boardKeyRef.current === madeOn) setStatus(next);
      })
      .catch((err) => {
        if (boardKeyRef.current === madeOn) setActionError(apiErrorMessage(err, 'Your rival could not be changed.'));
      })
      .finally(() => {
        if (boardKeyRef.current === madeOn) setPending(false);
      });
  }, [layoutKey, carClass, carType, pending]);

  const pin = useCallback((driverName: string) => act((r) => pinRival(r, driverName)), [act]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, loading, error, actionError, pending, pin, retry };
}
