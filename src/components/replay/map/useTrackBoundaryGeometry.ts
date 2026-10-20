import { useState, useEffect } from 'react';
import { loadTrackBoundaryGeometry } from '../../../api/trackGeometryApi.js';
import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';
import type { TrackBoundaryGeometry } from '../../../../shared/types/trackGeometry.js';

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
}

export function useTrackBoundaryGeometry(options: UseTrackBoundaryGeometryOptions) {
  const spec = getCircuitSpecification(
    options.trackVenue,
    options.trackCourse,
    null,
    null,
    options.layoutKey
  );
  const resolvedKey = spec.layoutKey !== 'unknown' ? spec.layoutKey : null;
  const cacheKey = resolvedKey ? `${resolvedKey}:${options.packageRevision || 'startup'}` : null;

  // The geometry shown is the one loaded for this key, else the shared cache's copy.
  const [loaded, setLoaded] = useState<{ key: string; geometry: TrackBoundaryGeometry | null } | null>(null);
  const loadedHere = !!cacheKey && loaded?.key === cacheKey;
  const trackGeometry = !cacheKey ? null : loadedHere ? loaded.geometry : geometryCache.get(cacheKey) ?? null;
  const isLoading = !!cacheKey && !loadedHere && !geometryCache.has(cacheKey);

  useEffect(() => {
    if (!resolvedKey || !cacheKey) return;

    const existing = geometryCache.get(cacheKey);
    if (existing) {
      // Refresh LRU order
      geometryCache.delete(cacheKey);
      geometryCache.set(cacheKey, existing);
      return;
    }

    let isMounted = true;
    let fetchPromise = inFlightRequests.get(cacheKey);
    if (!fetchPromise) {
      fetchPromise = loadTrackBoundaryGeometry(resolvedKey)
        .then((data) => {
          setGeometryCache(cacheKey, data);
          inFlightRequests.delete(cacheKey);
          return data;
        })
        .catch(err => {
          inFlightRequests.delete(cacheKey);
          if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
            console.warn(`[useTrackBoundaryGeometry] Could not fetch geometry for ${resolvedKey}:`, err);
          }
          return null;
        });
      inFlightRequests.set(cacheKey, fetchPromise);
    }

    void fetchPromise.then(geometry => {
      if (isMounted) setLoaded({ key: cacheKey, geometry });
    });

    return () => {
      isMounted = false;
    };
  }, [resolvedKey, cacheKey]);

  return { trackGeometry, layoutKey: resolvedKey, isLoading };
}
