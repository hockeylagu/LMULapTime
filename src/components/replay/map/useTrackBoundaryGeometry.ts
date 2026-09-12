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
}

import { resolveTrackLayoutKey } from '../../../utils/trackLayout.js';
export { resolveTrackLayoutKey };

// In-memory module cache to avoid redundant network requests across tab/lap switches
const geometryCache = new Map<string, TrackBoundaryGeometry>();
const inFlightRequests = new Map<string, Promise<TrackBoundaryGeometry | null>>();

export interface UseTrackBoundaryGeometryOptions {
  layoutKey?: string | null;
  trackVenue?: string | null;
  trackCourse?: string | null;
  replayName?: string | null;
}

export function useTrackBoundaryGeometry(options: UseTrackBoundaryGeometryOptions) {
  const resolvedKey = resolveTrackLayoutKey(
    options.trackVenue,
    options.trackCourse,
    options.replayName,
    options.layoutKey
  );

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
      setTrackGeometry(geometryCache.get(resolvedKey)!);
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
          geometryCache.set(resolvedKey, data);
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
