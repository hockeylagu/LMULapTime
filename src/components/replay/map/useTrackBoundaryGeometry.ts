import { useState, useEffect } from 'react';

export interface TimingGateGeometry {
  name: string;
  center: [number, number];
  left: [number, number];
  right: [number, number];
  stationM: number;
}

export interface TrackBoundaryGeometry {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  lengthM: number;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    spanX: number;
    spanZ: number;
  };
  leftBoundary: Array<[number, number]>;
  rightBoundary: Array<[number, number]>;
  centerline: Array<[number, number]>;
  nominalWidthM?: number;
  startFinish?: [number, number];
  timingGates?: {
    startFinish: TimingGateGeometry;
    sector1?: TimingGateGeometry;
    sector2?: TimingGateGeometry;
  };
  elevationProfile?: number[];
  pitLane?: {
    centerline: Array<[number, number]>;
    elevation?: number[];
  };
  pitStalls?: Array<{
    id: number;
    center: [number, number];
    widthM: number;
    angleDeg?: number;
  }>;
  gridSlots?: Array<{
    slot: number;
    center: [number, number];
  }>;
}

import { getCircuitSpecification } from '../../../../shared/domain/circuitSpecs.js';

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

  const [trackGeometry, setTrackGeometry] = useState<TrackBoundaryGeometry | null>(
    resolvedKey ? geometryCache.get(resolvedKey) || null : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    Boolean(resolvedKey && !geometryCache.has(resolvedKey))
  );

  useEffect(() => {
    if (!resolvedKey) {
      setTrackGeometry(null);
      setIsLoading(false);
      return;
    }

    if (geometryCache.has(resolvedKey)) {
      const existing = geometryCache.get(resolvedKey)!;
      // Refresh LRU order
      geometryCache.delete(resolvedKey);
      geometryCache.set(resolvedKey, existing);
      setTrackGeometry(existing);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    let fetchPromise = inFlightRequests.get(resolvedKey);
    if (!fetchPromise) {
      fetchPromise = fetch(`/tracks/${resolvedKey}.json`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`Failed to load track geometry: ${res.status}`);
          }
          return res.json();
        })
        .then((data: TrackBoundaryGeometry) => {
          setGeometryCache(resolvedKey, data);
          inFlightRequests.delete(resolvedKey);
          return data;
        })
        .catch(err => {
          inFlightRequests.delete(resolvedKey);
          if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test') {
            console.warn(`[useTrackBoundaryGeometry] Could not fetch geometry for ${resolvedKey}:`, err);
          }
          return null;
        });
      inFlightRequests.set(resolvedKey, fetchPromise);
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
  }, [resolvedKey]);

  return { trackGeometry, layoutKey: resolvedKey, isLoading };
}
