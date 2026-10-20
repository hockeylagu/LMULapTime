import { useEffect, useEffectEvent, useState } from 'react';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../../../../shared/types/trackGeometry.js';
import { loadTrackMapDisplay } from '../../../../api/trackGeometryApi.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';

export function useMapDisplay(geometry?: TrackBoundaryGeometry | null, supplied?: TrackMapDisplay | null) {
  const [result, setResult] = useState<{ key: string; display: TrackMapDisplay | null; error: string | null } | null>(null);
  const key = `${geometry?.layoutKey ?? ''}:${geometry?.geometryRevision ?? ''}`;
  // Keyed on the layout and its revision: a new geometry object with the same revision must not refetch.
  const loadDisplay = useEffectEvent((signal: AbortSignal) => {
    if (!geometry?.geometryRevision) return;
    loadTrackMapDisplay(geometry, signal).then(display => {
      if (!signal.aborted) setResult({ key, display, error: null });
    }).catch(error => {
      if (!signal.aborted && !isAbortError(error)) setResult({ key, display: null,
        error: apiErrorMessage(error, 'Map context could not be loaded.') });
    });
  });
  useEffect(() => {
    if (supplied !== undefined) return;
    const controller = new AbortController();
    loadDisplay(controller.signal);
    return () => controller.abort();
  }, [key, supplied]);
  return { display: supplied !== undefined ? supplied : result?.key === key ? result.display : null,
    error: supplied === undefined && result?.key === key ? result.error : null };
}
