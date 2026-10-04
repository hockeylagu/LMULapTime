import { useEffect, useState } from 'react';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../../../../shared/types/trackGeometry.js';
import { loadTrackMapDisplay } from '../../../../api/trackGeometryApi.js';
import { apiErrorMessage, isAbortError } from '../../../../api/apiClient.js';

export function useMapDisplay(geometry?: TrackBoundaryGeometry | null, supplied?: TrackMapDisplay | null) {
  const [result, setResult] = useState<{ key: string; display: TrackMapDisplay | null; error: string | null } | null>(null);
  const key = `${geometry?.layoutKey ?? ''}:${geometry?.geometryRevision ?? ''}`;
  useEffect(() => {
    if (supplied !== undefined || !geometry?.geometryRevision) return;
    const controller = new AbortController();
    const { layoutKey, geometryRevision } = geometry;
    loadTrackMapDisplay(layoutKey, geometryRevision, controller.signal).then(display => {
      if (!controller.signal.aborted) setResult({ key, display, error: null });
    }).catch(error => {
      if (!controller.signal.aborted && !isAbortError(error)) setResult({ key, display: null,
        error: apiErrorMessage(error, 'Map context could not be loaded.') });
    });
    return () => controller.abort();
  }, [key, geometry?.layoutKey, geometry?.geometryRevision, supplied]);
  return { display: supplied !== undefined ? supplied : result?.key === key ? result.display : null,
    error: supplied === undefined && result?.key === key ? result.error : null };
}
