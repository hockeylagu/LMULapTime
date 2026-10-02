import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import type { AppStatus, DetailedSession, ScanStatus, SessionProgressionPoint } from '../../shared/types/index.js';
import { fetchJson, postJson, isAbortError, apiErrorMessage } from './apiClient.js';
import { invalidateReferenceLaptimes } from './referenceApi.js';

const SERVER_RETRY_MS = 2000;
/** An unreachable server is asked less and less often, down to once every 15 seconds. */
const SERVER_RETRY_MAX_MS = 15000;

const REFERENCE_SEEN_KEY = 'lmu.referenceUpdateSeen';

function readSeenReference(): string | null {
  try { return localStorage.getItem(REFERENCE_SEEN_KEY); } catch { return null; }
}

function writeSeenReference(completedAt: string): void {
  try { localStorage.setItem(REFERENCE_SEEN_KEY, completedAt); } catch { /* storage unavailable: the toast may show again */ }
}

export function serverRetryDelay(failures: number): number {
  return Math.min(SERVER_RETRY_MS * 2 ** Math.max(0, failures - 1), SERVER_RETRY_MAX_MS);
}

// Completion timestamps catch scans that start and finish between polls. Revisions also catch
// metadata and rain updates inside a replay, before the whole library finishes processing.
function snapshotKey(scan: ScanStatus): string {
  return JSON.stringify([scan.dataRevision, scan.finishedAt, scan.sessionScan?.finishedAt,
    scan.telemetryScan?.finishedAt, scan.replayUpgrade?.finishedAt,
    scan.replayUpgrade?.driversDone, scan.referenceLaptimes?.completedAt]);
}

export function useAppData() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [sessions, setSessions] = useState<DetailedSession[]>([]);
  const [progression, setProgression] = useState<SessionProgressionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [replayScanStatus, setReplayScanStatus] = useState<ScanStatus | null>(null);
  const [referenceUpdateCount, setReferenceUpdateCount] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [dataError, setDataError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const mounted = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dataAbort = useRef<AbortController | null>(null);
  const scanAbort = useRef<AbortController | null>(null);
  const refreshAbort = useRef<AbortController | null>(null);
  const pollGeneration = useRef(0);
  const pollFailures = useRef(0);
  const loaded = useRef(false);
  const loadedKey = useRef<string | null>(null);
  const referenceHandled = useRef<string | null>(null);

  const fetchData = useCallback(async (): Promise<boolean> => {
    dataAbort.current?.abort();
    const controller = new AbortController();
    dataAbort.current = controller;
    try {
      const [statusData, snapshot] = await Promise.all([
        fetchJson<AppStatus>('/api/status', { signal: controller.signal }),
        fetchJson<{ sessions: DetailedSession[]; progression: SessionProgressionPoint[]; revision?: string }>('/api/session-snapshot', { signal: controller.signal }),
      ]);
      if (!mounted.current || controller.signal.aborted) return false;
      setStatus({ ...statusData, sessionsCount: snapshot.sessions.length });
      setSessions(snapshot.sessions);
      setProgression(snapshot.progression);
      setRevision(value => value + 1);
      setDataError(null);
      loaded.current = true;
      startTransition(() => setLoading(false));
      return true;
    } catch (err: unknown) {
      if (mounted.current && !isAbortError(err) && !controller.signal.aborted) {
        setDataError(apiErrorMessage(err, 'Unable to refresh session data.'));
      }
      return false;
    }
  }, []);

  const startScanPolling = useCallback(() => {
    clearTimeout(pollTimer.current);
    scanAbort.current?.abort();
    dataAbort.current?.abort();
    const generation = ++pollGeneration.current;
    const poll = async (): Promise<void> => {
      if (!mounted.current || generation !== pollGeneration.current) return;
      const controller = new AbortController();
      scanAbort.current = controller;
      let retry = false;
      try {
        const scan = await fetchJson<ScanStatus>('/api/scan/status', { signal: controller.signal });
        if (!mounted.current || generation !== pollGeneration.current) return;
        pollFailures.current = 0;
        setReplayScanStatus(scan);
        setStatusError(null);
        const reference = scan.referenceLaptimes;
        if (reference?.checked && reference.completedAt && reference.completedAt !== referenceHandled.current) {
          referenceHandled.current = reference.completedAt;
          if (reference.refreshed) invalidateReferenceLaptimes();
          if (reference.updatedCount > 0 && readSeenReference() !== reference.completedAt) {
            writeSeenReference(reference.completedAt);
            setReferenceUpdateCount(reference.updatedCount);
          }
        }
        const key = snapshotKey(scan);
        if (!loaded.current || key !== loadedKey.current) {
          const success = await fetchData();
          if (generation !== pollGeneration.current || !mounted.current) return;
          if (success) loadedKey.current = key;
          else retry = true;
        }
        const active = scan.refreshQueued || scan.running || scan.sessionScan?.running || scan.telemetryScan?.running ||
          scan.replayUpgrade?.running || (reference?.started && !reference.checked);
        if (active || retry) pollTimer.current = setTimeout(() => { void poll(); }, retry ? SERVER_RETRY_MS : 1000);
      } catch (err: unknown) {
        if (!mounted.current || generation !== pollGeneration.current || isAbortError(err)) return;
        pollFailures.current += 1;
        // The last progress we saw is out of date once the server stops answering (a restart ends every scan).
        setReplayScanStatus(null);
        setStatusError(apiErrorMessage(err, 'Unable to check processing progress.'));
        pollTimer.current = setTimeout(() => { void poll(); }, serverRetryDelay(pollFailures.current));
      }
    };
    void poll();
  }, [fetchData]);

  const refresh = useCallback(async (forceRefresh = false): Promise<void> => {
    if (!mounted.current) return;
    setIsRefreshing(true);
    // Supersede an in-flight poll before triggering a refresh; old responses cannot win.
    const generation = ++pollGeneration.current;
    refreshAbort.current?.abort();
    const controller = new AbortController();
    refreshAbort.current = controller;
    let acknowledged = false;
    clearTimeout(pollTimer.current);
    scanAbort.current?.abort();
    dataAbort.current?.abort();
    try {
      if (forceRefresh) await postJson('/api/scan', {}, { signal: controller.signal });
      acknowledged = true;
      loadedKey.current = null;
    } catch (err: unknown) {
      if (mounted.current && !isAbortError(err)) setDataError(apiErrorMessage(err, 'Unable to start the directory refresh.'));
    } finally {
      if (mounted.current && generation === pollGeneration.current) {
        setIsRefreshing(false);
        if (acknowledged) startScanPolling();
        else pollTimer.current = setTimeout(() => { void refresh(forceRefresh); }, SERVER_RETRY_MS);
      }
    }
  }, [startScanPolling]);

  useEffect(() => {
    mounted.current = true;
    startScanPolling();
    return () => {
      mounted.current = false;
      ++pollGeneration.current;
      clearTimeout(pollTimer.current);
      scanAbort.current?.abort();
      dataAbort.current?.abort();
      refreshAbort.current?.abort();
    };
  }, [startScanPolling]);

  return { status, sessions, progression, loading, isRefreshing, replayScanStatus,
    referenceUpdateCount, setReferenceUpdateCount, revision, error: statusError ?? dataError,
    fetchData: refresh, refreshReplayScanStatus: startScanPolling };
}
