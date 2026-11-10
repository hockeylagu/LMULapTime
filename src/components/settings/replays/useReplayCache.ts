import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReplayCacheSummary,
  ReplayScanStatus,
  ScanStatus,
} from '../../../../shared/types/index.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../../api/apiClient.js';
import { countReplays, ReplayCounts } from './replayModel.js';

export interface ReplayCacheState {
  /** null until the first load finishes (or fails). */
  replays: ReplayCacheSummary[] | null;
  counts: ReplayCounts | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
  isScanRunning: boolean;
}

/** Loads the cached replay list and reloads it when a scan ends. */
export function useReplayCache(replayScanStatus?: ScanStatus | ReplayScanStatus | null): ReplayCacheState {
  const [replays, setReplays] = useState<ReplayCacheSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  // Only the newest request may write state: a slow older answer is dropped.
  const replaysRequest = useRef(0);

  // The first load starts in the loading state and reload enters it; refreshes after a scan stay quiet.
  const loadReplays = useCallback(() => {
    const id = ++replaysRequest.current;
    const isCurrent = () => id === replaysRequest.current && !lifetime.current?.signal.aborted;
    fetchJson<ReplayCacheSummary[]>('/api/replays/cache', { signal: lifetime.current?.signal })
      .then((data) => {
        if (!isCurrent()) return;
        setReplays(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || !isCurrent()) return;
        setError(apiErrorMessage(err, 'Unable to load the cached replays.'));
      })
      .finally(() => {
        if (isCurrent()) setIsLoading(false);
      });
  }, []);

  const reload = useCallback(() => {
    setIsLoading(true);
    setError(null);
    loadReplays();
  }, [loadReplays]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    loadReplays();
    return () => {
      controller.abort();
    };
  }, [loadReplays]);

  const isScanRunning = !!replayScanStatus?.running;
  const wasScanRunning = useRef(isScanRunning);
  useEffect(() => {
    if (wasScanRunning.current && !isScanRunning) loadReplays();
    wasScanRunning.current = isScanRunning;
  }, [isScanRunning, loadReplays]);

  const counts = useMemo(() => (replays ? countReplays(replays) : null), [replays]);

  return { replays, counts, isLoading, error, reload, isScanRunning };
}
