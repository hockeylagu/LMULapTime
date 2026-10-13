import { useEffect, useMemo, useState } from 'react';
import type { ComparableLap, ReplayDriverEntry, ReplayMetadata } from '../../../../../shared/types/index.js';
import { fetchJson, isAbortError } from '../../../../api/apiClient.js';
import { replayCompareScope } from './compareLapsQuery.js';

/** Fastest laps read, so that the lap on screen and look-alike driver names can be skipped. */
const CANDIDATES = 10;

export interface SuggestionTarget {
  sessionId: string | null;
  metadata: ReplayMetadata | null;
  driver: ReplayDriverEntry | undefined;
  driverName: string | null;
  /** The inspected driver's ordinal in the session, whose own laps name the car. */
  driverOrdinal: number | null | undefined;
  lapNumber: number | null | undefined;
  lapTime: number | null | undefined;
}

/**
 * The lap to compare against by default: the driver's fastest replay-backed, representative lap on
 * this layout, car class and car, when it beats the lap on screen. The server picks it from the
 * whole history, independent of the lap picker's page and filters.
 */
export function useReferenceLapSuggestion(target: SuggestionTarget): ComparableLap | null {
  const { sessionId, metadata, driver, driverName, driverOrdinal, lapNumber, lapTime } = target;
  const [candidates, setCandidates] = useState<ComparableLap[]>([]);

  // The fastest laps do not depend on the lap on screen: they are read once per driver and car.
  useEffect(() => {
    const query = metadata && driverName && sessionId && driverOrdinal != null ? replayCompareScope(metadata, driver) : null;
    if (!query || !driverName || !sessionId || driverOrdinal == null) { setCandidates([]); return; }
    const controller = new AbortController();
    const read = (params: URLSearchParams) => fetchJson<{ laps?: ComparableLap[] }>(`/api/compare/laps?${params.toString()}`, { signal: controller.signal });
    // The car is the session's own for this driver, as stored with the laps, never the replay roster's name for it.
    const own = new URLSearchParams({ sessionId, driverOrdinal: String(driverOrdinal), telemetryOnly: 'true', playerOnly: 'false', pageSize: '1' });
    read(own)
      .then(data => {
        const carType = data.laps?.[0]?.carType;
        if (!carType) return { laps: [] };
        query.set('telemetryOnly', 'true'); query.set('representativeOnly', 'true'); query.set('sort', 'lap');
        query.set('carType', carType); query.set('driver', driverName); query.set('playerOnly', String(driver?.isPlayer === true));
        query.set('pageSize', String(CANDIDATES));
        return read(query);
      })
      .then(data => setCandidates((data.laps ?? []).filter(lap => lap.driverName === driverName && Boolean(lap.matchingReplayFile) &&
        typeof lap.lapTime === 'number' && lap.lapTime > 0)))
      .catch((err: unknown) => { if (!isAbortError(err)) setCandidates([]); });
    return () => controller.abort();
  }, [sessionId, metadata, driver, driverName, driverOrdinal]);

  return useMemo(() => {
    if (!sessionId) return null;
    const best = candidates.find(lap => !(lap.sessionId === sessionId && lap.lapNumber === lapNumber));
    if (!best) return null;
    return typeof lapTime === 'number' && lapTime > 0 && (best.lapTime as number) >= lapTime ? null : best;
  }, [candidates, sessionId, lapNumber, lapTime]);
}
