import { useEffect, useMemo, useState } from 'react';
import type { ComparableLap, ReplayDriverEntry, ReplayMetadata } from '../../../../../shared/types/index.js';
import { fetchJson, isAbortError } from '../../../../api/apiClient.js';
import { replayCompareScope } from './compareLapsQuery.js';

export interface SuggestionTarget {
  sessionId: string | null;
  metadata: ReplayMetadata | null;
  driver: ReplayDriverEntry | undefined;
  driverName: string | null;
  /** The lap on screen: never its own suggestion. */
  lapOrdinal: number | null | undefined;
  lapTime: number | null | undefined;
}

/**
 * The lap to compare against by default: the driver's fastest replay-backed, representative lap on
 * this layout and car class, in any car of the class, when it beats the lap on screen. The server picks it from the
 * whole history (the driver by exact name, the lap on screen left out), independent of the lap
 * picker's page and filters.
 */
export function useReferenceLapSuggestion(target: SuggestionTarget): ComparableLap | null {
  const { sessionId, metadata, driver, driverName, lapOrdinal, lapTime } = target;
  const [fetched, setFetched] = useState<ComparableLap | null>(null);
  const query = useMemo(() => {
    const scope = metadata && driverName && sessionId ? replayCompareScope(metadata, driver) : null;
    // Any car of the class, never across classes: without a class there is no suggestion.
    if (!scope?.has('carClass') || !driverName || !sessionId) return null;
    scope.set('telemetryOnly', 'true'); scope.set('representativeOnly', 'true'); scope.set('sort', 'lap');
    scope.set('driver', driverName); scope.set('driverExact', 'true');
    scope.set('playerOnly', String(driver?.isPlayer === true));
    if (lapOrdinal != null) { scope.set('excludeSessionId', sessionId); scope.set('excludeLapOrdinal', String(lapOrdinal)); }
    scope.set('pageSize', '1');
    return scope.toString();
  }, [sessionId, metadata, driver, driverName, lapOrdinal]);
  // The previous suggestion stays until the next one arrives; without a query there is none.
  const best = query ? fetched : null;

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetchJson<{ laps?: ComparableLap[] }>(`/api/compare/laps?${query}`, { signal: controller.signal })
      .then(data => setFetched(data.laps?.[0] ?? null))
      .catch((err: unknown) => { if (!isAbortError(err)) setFetched(null); });
    return () => controller.abort();
  }, [query]);

  return useMemo(() => {
    if (!sessionId || !best) return null;
    return typeof lapTime === 'number' && lapTime > 0 && (best.lapTime as number) >= lapTime ? null : best;
  }, [best, sessionId, lapTime]);
}
