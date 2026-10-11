import { useCallback, useEffect, useRef, useState } from 'react';
import type { Leaderboard, RivalStatus } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage, isAbortError } from '../../../api/apiClient.js';
import { LeaderboardRequest, loadLeaderboardWithRival, pinRival } from '../../../api/leaderboardApi.js';

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

/** Standings and rival share one request and selection lifecycle. */
export function useRival(request: LeaderboardRequest | null): RivalState & { board: Leaderboard | null } {
  const [board, setBoard] = useState<Leaderboard | null>(null);
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
    setBoard(null);
    setStatus(null);
    setError(null);
    setActionError(null);
    setPending(false);
    setLoading(false);
    if (!layoutKey || !carClass) return;
    const controller = new AbortController();
    setLoading(true);
    loadLeaderboardWithRival({ layoutKey, carClass, carType }, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setBoard(next);
        setStatus(next.rivalStatus);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setError(apiErrorMessage(err, 'The leaderboard could not be loaded.'));
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

  return { board, status, loading, error, actionError, pending, pin, retry };
}
