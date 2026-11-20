import { useEffect, useState } from 'react';
import type { CornerTrendsResponse } from '../../../../shared/types/corners/cornerTrends.js';
import { isAbortError } from '../../../api/apiClient.js';
import { fetchCornerTrends, onSequenceMapsChanged } from '../../../api/cornerSequenceApi.js';
import { useSessionDataContext } from '../../../api/sessionDataContext.js';

export interface CornerTrendsState {
  trends: CornerTrendsResponse | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * The layout's corner trends for a class (and car model, '' for any): fetched again when sessions are stored, a
 * sequence map changes or the driver retries. Nothing is fetched without a layout or a class.
 */
export function useCornerTrends(layoutKey: string | null, carClass: string | null, carType: string): CornerTrendsState {
  const { revision } = useSessionDataContext();
  const [attempt, setAttempt] = useState(0);
  const [mapsChanged, setMapsChanged] = useState(0);
  useEffect(() => onSequenceMapsChanged(() => setMapsChanged(count => count + 1)), []);

  const scope = layoutKey && carClass ? `${layoutKey}|${carClass}|${carType}` : null;
  const key = scope ? `${scope}|${revision}|${attempt}|${mapsChanged}` : null;
  const [loaded, setLoaded] = useState<{ key: string; trends: CornerTrendsResponse | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!key || !layoutKey || !carClass) return;
    const controller = new AbortController();
    fetchCornerTrends(layoutKey, carClass, carType, controller.signal)
      .then(trends => {
        if (!controller.signal.aborted) setLoaded({ key, trends, error: null });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setLoaded({ key, trends: null, error: error instanceof Error ? error.message : 'Corner trends are unavailable.' });
      });
    return () => controller.abort();
  }, [key, layoutKey, carClass, carType]);

  const answered = key !== null && loaded?.key === key;
  // A refetch of the same layout, class and car (new sessions, a map change) keeps the rows shown until it answers.
  const sameScope = scope !== null && loaded?.key.startsWith(`${scope}|`) === true;
  return {
    trends: sameScope ? loaded?.trends ?? null : null,
    loading: key !== null && !answered,
    error: answered ? loaded.error : null,
    retry: () => setAttempt(count => count + 1),
  };
}
