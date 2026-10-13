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
 * this layout, car class and car, when it beats the lap on screen. The server picks it from the
 * whole history (the driver by exact name, the lap on screen left out), independent of the lap
 * picker's page and filters.
 */
export function useReferenceLapSuggestion(target: SuggestionTarget): ComparableLap | null {
  const { sessionId, metadata, driver, driverName, lapOrdinal, lapTime } = target;
  const [best, setBest] = useState<ComparableLap | null>(null);
  const carType = driver?.carType;

  useEffect(() => {
    const query = metadata && driverName && sessionId && carType ? replayCompareScope(metadata, driver) : null;
    if (!query || !driverName || !sessionId || !carType) { setBest(null); return; }
    const controller = new AbortController();
    // The roster names the car as the session log does, so it is the car the laps are stored with.
    query.set('telemetryOnly', 'true'); query.set('representativeOnly', 'true'); query.set('sort', 'lap');
    query.set('carType', carType); query.set('driver', driverName); query.set('driverExact', 'true');
    query.set('playerOnly', String(driver?.isPlayer === true));
    if (lapOrdinal != null) { query.set('excludeSessionId', sessionId); query.set('excludeLapOrdinal', String(lapOrdinal)); }
    query.set('pageSize', '1');
    fetchJson<{ laps?: ComparableLap[] }>(`/api/compare/laps?${query.toString()}`, { signal: controller.signal })
      .then(data => setBest(data.laps?.[0] ?? null))
      .catch((err: unknown) => { if (!isAbortError(err)) setBest(null); });
    return () => controller.abort();
  }, [sessionId, metadata, driver, driverName, carType, lapOrdinal]);

  return useMemo(() => {
    if (!sessionId || !best) return null;
    return typeof lapTime === 'number' && lapTime > 0 && (best.lapTime as number) >= lapTime ? null : best;
  }, [best, sessionId, lapTime]);
}
