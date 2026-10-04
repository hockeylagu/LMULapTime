import { useState, useEffect } from 'react';
import { loadTrackBoundaryGeometry } from '../../../api/trackGeometryApi.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import type { TrackBoundaryGeometry } from '../../../../shared/types/trackGeometry.js';
export type {
  TimingGateGeometry,
  TrackSurfacePolygon,
  TrackMapSurfaces,
  TrackBoundaryGeometry,
} from '../../../../shared/types/trackGeometry.js';

// In-memory module cache to avoid redundant network requests across tab/lap switches.
// Capped with LRU eviction to keep memory low across 21 track geometries.
const MAX_GEOMETRY_CACHE = 3;
const geometryCache = new Map<string, TrackBoundaryGeometry>();
const inFlightRequests = new Map<string, Promise<TrackBoundaryGeometry | null>>();

function setGeometryCache(key: string, data: TrackBoundaryGeometry): void {
  if (geometryCache.size >= MAX_GEOMETRY_CACHE && !geometryCache.has(key)) {
    const oldestKey = geometryCache.keys().next().value;
    if (oldestKey !== undefined) geometryCache.delete(oldestKey);
  }
  geometryCache.set(key, data);
}

export interface UseTrackBoundaryGeometryOptions {
  layoutKey?: string | null;
  packageRevision?: string;
  trackVenue?: string | null;
  trackCourse?: string | null;
  replayName?: string | null;
}

export function useTrackBoundaryGeometry(options: UseTrackBoundaryGeometryOptions) {
  const spec = getCircuitSpecification(
    options.trackVenue,
    options.trackCourse,
    null,
    options.replayName,
    options.layoutKey
  );
  const resolvedKey = spec.layoutKey !== 'unknown' ? spec.layoutKey : null;
  const cacheKey = resolvedKey ? `${resolvedKey}:${options.packageRevision || 'startup'}` : null;

  const [trackGeometry, setTrackGeometry] = useState<TrackBoundaryGeometry | null>(
    resolvedKey ? geometryCache.get(cacheKey!) || null : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    Boolean(resolvedKey && !geometryCache.has(cacheKey!))
  );

  useEffect(() => {
    if (!resolvedKey) {
      setTrackGeometry(null);
      setIsLoading(false);
      return;
    }

    if (geometryCache.has(cacheKey!)) {
      const existing = geometryCache.get(cacheKey!)!;
      // Refresh LRU order
      geometryCache.delete(cacheKey!);
      geometryCache.set(cacheKey!, existing);
      setTrackGeometry(existing);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    let fetchPromise = inFlightRequests.get(cacheKey!);
    if (!fetchPromise) {
      fetchPromise = loadTrackBoundaryGeometry(resolvedKey)
        .then((data) => {
          setGeometryCache(cacheKey!, data);
          inFlightRequests.delete(cacheKey!);
          return data;
        })
        .catch(err => {
          inFlightRequests.delete(cacheKey!);
          if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
            console.warn(`[useTrackBoundaryGeometry] Could not fetch geometry for ${resolvedKey}:`, err);
          }
          return null;
        });
      inFlightRequests.set(cacheKey!, fetchPromise);
    }

    fetchPromise.then(data => {
      if (isMounted) {
        setTrackGeometry(data);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [resolvedKey, cacheKey]);

  return { trackGeometry, layoutKey: resolvedKey, isLoading };
}
