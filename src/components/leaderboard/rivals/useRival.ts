import { useCallback, useMemo, useState } from 'react';
import type { Leaderboard, RivalStatus } from '../../../../shared/types/leaderboard.js';
import { apiErrorMessage } from '../../../api/apiClient.js';
import { useRequest } from '../../../api/useRequest.js';
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
  const layoutKey = request?.layoutKey ?? null;
  const carClass = request?.carClass ?? null;
  const carType = request?.carType ?? null;
  const boardRequest = useMemo(() => layoutKey && carClass ? { layoutKey, carClass, carType } : null, [layoutKey, carClass, carType]);
  const loaded = useRequest(boardRequest, loadLeaderboardWithRival);
  const board = loaded.data;
  // A change belongs to the board answer it was made on: another board, or a reload, shows none of it.
  const [change, setChange] = useState<{ board: Leaderboard; status: RivalStatus | null; error: string | null; pending: boolean } | null>(null);
  const current = board && change?.board === board ? change : null;
  const status = current ? current.status : board?.rivalStatus ?? null;
  const pending = current?.pending ?? false;

  const act = useCallback((action: (r: LeaderboardRequest) => Promise<RivalStatus>) => {
    if (!boardRequest || !board || pending) return;
    const madeOn = board;
    setChange({ board: madeOn, status, error: null, pending: true });
    const settle = (next: Partial<NonNullable<typeof change>>) =>
      setChange(previous => previous?.board === madeOn ? { ...previous, ...next, pending: false } : previous);
    action(boardRequest)
      .then(next => settle({ status: next }))
      .catch((err: unknown) => settle({ error: apiErrorMessage(err, 'Your rival could not be changed.') }));
  }, [boardRequest, board, pending, status]);

  const pin = useCallback((driverName: string) => act((r) => pinRival(r, driverName)), [act]);
  const { reload } = loaded;
  const retry = useCallback(() => reload(), [reload]);

  return {
    board, status, pending, pin, retry,
    loading: loaded.loading,
    error: loaded.error ? apiErrorMessage(loaded.error, 'The leaderboard could not be loaded.') : null,
    actionError: current?.error ?? null,
  };
}
