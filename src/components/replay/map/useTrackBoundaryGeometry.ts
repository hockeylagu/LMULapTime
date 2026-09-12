import { useState, useEffect } from 'react';

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
}

/**
 * Deterministically resolves the layoutKey from circuit venue, course, or replay filename.
 */
export function resolveTrackLayoutKey(
  venue?: string | null,
  course?: string | null,
  replayName?: string | null,
  explicitKey?: string | null
): string | null {
  if (explicitKey) return explicitKey;

  const combined = `${venue || ''} ${course || ''} ${replayName || ''}`.toLowerCase();
  if (!combined.trim()) return null;

  // Specific layout variants first to prevent false matching to full/GP layouts
  if (combined.includes('curva grande')) return 'monza_curvagrande';
  if (combined.includes('outer') && combined.includes('bahrain')) return 'bahrain_outer';
  if (combined.includes('paddock') && combined.includes('bahrain')) return 'bahrain_paddock';
  if (combined.includes('classic') && combined.includes('fuji')) return 'fuji_classic';
  if (combined.includes('school') && combined.includes('sebring')) return 'sebring_school';

  // Base tracks
  if (combined.includes('monza')) return 'monza_gp';
  if (combined.includes('spa')) return 'spa_gp';
  if (combined.includes('sarthe') || combined.includes('le mans')) return 'sarthe_full';
  if (combined.includes('americas') || combined.includes('cota')) return 'cota_gp';
  if (combined.includes('barcelona') || combined.includes('catalunya')) return 'barcelona_gp';
  if (combined.includes('interlagos') || combined.includes('carlos pace')) return 'interlagos_gp';
  if (combined.includes('silverstone')) return 'silverstone_wec';
  if (combined.includes('bahrain') || combined.includes('sakhir')) return 'bahrain_wec';
  if (combined.includes('imola') || combined.includes('enzo e dino')) return 'imola_gp';
  if (combined.includes('daytona')) return 'daytona_road_course';
  if (combined.includes('fuji')) return 'fuji_chicane';
  if (combined.includes('algarve') || combined.includes('portimao')) return 'portimao_wec';
  if (combined.includes('sebring')) return 'sebring_full';
  if (combined.includes('laguna')) return 'laguna_seca';
  if (combined.includes('lusail') || combined.includes('qatar')) return 'qatar_short';
  if (combined.includes('paul ricard') || combined.includes('ricard')) return 'paul_ricard_1a_v2_short';

  return null;
}

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
