import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReplayCacheSummary,
  ReplayScanStatus,
  ReplayUpgradeStatus,
  ScanStatus,
} from '../../../../shared/types/index.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../../api/apiClient.js';
import { countReplays, ReplayCounts } from './replayModel.js';

export interface ReplayUpgradeOverview {
  status: ReplayUpgradeStatus;
  pendingReplays: number;
  pendingDrivers: number;
  /** The replay cache version an on-disk replay must be at (absent from older servers). */
  currentVersion?: string;
}

function isUpgradeOverview(value: unknown): value is ReplayUpgradeOverview {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReplayUpgradeOverview>;
  return typeof candidate.pendingReplays === 'number' && typeof candidate.pendingDrivers === 'number' && !!candidate.status;
}

const UPGRADE_POLL_MS = 3000;

export interface ReplayCacheState {
  /** null until the first load finishes (or fails). */
  replays: ReplayCacheSummary[] | null;
  counts: ReplayCounts | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
  /** The version an on-disk replay should be at; null until the server has said. */
  currentVersion: string | null;
  /** The replay upgrade while it runs, from the scan status or the polled endpoint. */
  activeUpgrade: ReplayUpgradeStatus | null;
  upgradeError: string | null;
  /** On-disk replays the upgrade still has to decode; null until the server has said. */
  pendingUpgrade: number | null;
  isScanRunning: boolean;
}

/** Loads the cached replay list and the upgrade status, and reloads both when a scan or upgrade ends. */
export function useReplayCache(replayScanStatus?: ScanStatus | ReplayScanStatus | null): ReplayCacheState {
  const [replays, setReplays] = useState<ReplayCacheSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOverview, setUpgradeOverview] = useState<ReplayUpgradeOverview | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const upgradeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lifetime = useRef<AbortController | null>(null);
  // Only the newest request of each kind may write state: a slow older answer is dropped.
  const replaysRequest = useRef(0);
  const upgradeRequest = useRef(0);

  const loadReplays = useCallback(() => {
    const id = ++replaysRequest.current;
    const isCurrent = () => id === replaysRequest.current && !lifetime.current?.signal.aborted;
    setIsLoading(true);
    setError(null);
    fetchJson<ReplayCacheSummary[]>('/api/replays/cache', { signal: lifetime.current?.signal })
      .then((data) => { if (isCurrent()) setReplays(Array.isArray(data) ? data : []); })
      .catch((err: unknown) => {
        if (isAbortError(err) || !isCurrent()) return;
        setError(apiErrorMessage(err, 'Unable to load the cached replays.'));
      })
      .finally(() => {
        if (isCurrent()) setIsLoading(false);
      });
  }, []);

  const loadUpgrade = useCallback(() => {
    if (upgradeTimer.current) clearTimeout(upgradeTimer.current);
    const id = ++upgradeRequest.current;
    const isCurrent = () => id === upgradeRequest.current && !lifetime.current?.signal.aborted;
    fetchJson<unknown>('/api/replays/upgrade', { signal: lifetime.current?.signal })
      .then((data) => {
        if (!isCurrent() || !isUpgradeOverview(data)) return;
        setUpgradeError(null);
        setUpgradeOverview(data);
        if (data.status.running) upgradeTimer.current = setTimeout(loadUpgrade, UPGRADE_POLL_MS);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || !isCurrent()) return;
        // Polling stops with the server out of reach, and the bar for an upgrade we can no longer see goes too.
        setUpgradeOverview((previous) => (previous ? { ...previous, status: { ...previous.status, running: false } } : previous));
        setUpgradeError(apiErrorMessage(err, 'Upgrade status unavailable.'));
      });
  }, []);

  const reload = useCallback(() => {
    loadReplays();
    loadUpgrade();
  }, [loadReplays, loadUpgrade]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    loadReplays();
    loadUpgrade();
    return () => {
      controller.abort();
      if (upgradeTimer.current) clearTimeout(upgradeTimer.current);
    };
  }, [loadReplays, loadUpgrade]);

  const isScanRunning = !!replayScanStatus?.running;
  const wasScanRunning = useRef(isScanRunning);
  useEffect(() => {
    if (wasScanRunning.current && !isScanRunning) {
      loadReplays();
      loadUpgrade();
    }
    wasScanRunning.current = isScanRunning;
  }, [isScanRunning, loadReplays, loadUpgrade]);

  const scanUpgrade = replayScanStatus && 'replayUpgrade' in replayScanStatus ? replayScanStatus.replayUpgrade : null;
  const activeUpgrade =
    (scanUpgrade?.running ? scanUpgrade : null) ??
    (upgradeOverview?.status?.running ? upgradeOverview.status : null);
  const isUpgradeRunning = !!activeUpgrade?.running;

  const wasUpgradeRunning = useRef(isUpgradeRunning);
  useEffect(() => {
    if (wasUpgradeRunning.current && !isUpgradeRunning) loadReplays();
    wasUpgradeRunning.current = isUpgradeRunning;
  }, [isUpgradeRunning, loadReplays]);

  const currentVersion = upgradeOverview?.currentVersion ?? null;
  const counts = useMemo(() => (replays ? countReplays(replays, currentVersion) : null), [replays, currentVersion]);

  return {
    replays,
    counts,
    isLoading,
    error,
    reload,
    currentVersion,
    activeUpgrade,
    upgradeError,
    pendingUpgrade: upgradeOverview?.pendingReplays ?? null,
    isScanRunning,
  };
}
