import React, { useMemo } from 'react';
import {
  useTrackBoundaryGeometry,
  projectBoundaryPoints,
  computeTrackBoundaryPathD,
  TrackBoundaryGeometry,
} from '../replay/map/index.js';
import { getCircuitSpecification } from '../../utils/circuitSpecs.js';

export interface TrackCircuitLayoutProps {
  trackName: string;
  trackCourse?: string;
  layoutKey?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
  className?: string;
  size?: 'detail' | 'card' | 'session';
  onClick?: () => void;
}

const VIEWBOX_SIZE = 800;
const PADDING = 45;
const pathDCache = new Map<string, string>();

function getOrComputePathD(
  geometry: TrackBoundaryGeometry | null | undefined,
  fallbackKey?: string
): string {
  if (!geometry?.bounds) return '';
  const cacheKey = geometry.layoutKey || fallbackKey || `${geometry.trackVenue}|${geometry.trackCourse}`;
  if (cacheKey && pathDCache.has(cacheKey)) {
    return pathDCache.get(cacheKey)!;
  }
  const centerlineSvg = geometry.centerline
    ? projectBoundaryPoints(geometry.centerline, geometry.bounds, VIEWBOX_SIZE, PADDING)
    : [];
  const leftSvg = geometry.leftBoundary
    ? projectBoundaryPoints(geometry.leftBoundary, geometry.bounds, VIEWBOX_SIZE, PADDING)
    : [];
  const rightSvg = geometry.rightBoundary
    ? projectBoundaryPoints(geometry.rightBoundary, geometry.bounds, VIEWBOX_SIZE, PADDING)
    : [];
  const d = computeTrackBoundaryPathD(centerlineSvg, leftSvg, rightSvg);
  if (cacheKey && d) {
    pathDCache.set(cacheKey, d);
  }
  if (fallbackKey && d && fallbackKey !== cacheKey) {
    pathDCache.set(fallbackKey, d);
  }
  return d || '';
}

export const TrackCircuitLayout: React.FC<TrackCircuitLayoutProps> = ({
  trackName,
  trackCourse,
  layoutKey,
  trackGeometry: propGeometry,
  className = '',
  size = 'detail',
  onClick,
}) => {
  const spec = getCircuitSpecification(trackName, trackCourse, null, null, layoutKey);
  const resolvedKey = spec.layoutKey !== 'unknown' ? spec.layoutKey : null;
  const cachedD =
    (resolvedKey ? pathDCache.get(resolvedKey) : undefined) ||
    (propGeometry ? getOrComputePathD(propGeometry, resolvedKey || undefined) : undefined);

  // If path is already cached in pathDCache or supplied by propGeometry, we do not need to fetch or retain raw geometry
  const shouldFetch = propGeometry === undefined && !cachedD;
  const { trackGeometry: fetchedGeometry, isLoading } = useTrackBoundaryGeometry(
    shouldFetch
      ? { trackVenue: trackName, trackCourse, layoutKey: resolvedKey }
      : { layoutKey: null, trackVenue: null, trackCourse: null }
  );

  const effectiveGeometry = propGeometry !== undefined ? propGeometry : fetchedGeometry;

  const sizeClasses =
    size === 'card' ? 'h-[46px] w-[62px]'
    : size === 'session' ? 'h-[76px] w-[100px]'
    : 'h-[54px] w-[72px]';

  const interactiveClasses = onClick
    ? 'cursor-pointer hover:scale-105 transition-transform'
    : 'pointer-events-none';

  const pathD = useMemo(() => {
    if (cachedD) return cachedD;
    return getOrComputePathD(effectiveGeometry, resolvedKey || undefined);
  }, [cachedD, effectiveGeometry, resolvedKey]);

  if (isLoading && shouldFetch) {
    return (
      <div
        data-testid="track-circuit-layout-loading"
        className={`${sizeClasses} shrink-0 flex items-center justify-center animate-pulse ${className}`}
      >
        <div className="w-6 h-6 rounded-lg bg-slate-800/40" />
      </div>
    );
  }

  if (!pathD) {
    return (
      <div
        data-testid="track-circuit-layout-fallback"
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
        className={`${sizeClasses} shrink-0 flex items-center justify-center text-slate-500 ${interactiveClasses} ${className}`}
        title={trackName}
      >
        <svg
          viewBox="0 0 24 24"
          className={size === 'card' ? 'w-5 h-5 text-slate-500' : 'w-6 h-6 text-slate-500'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8-8-3.6-8-8z" strokeDasharray="3 3" />
        </svg>
      </div>
    );
  }

  return (
    <div
      data-testid="track-circuit-layout"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={`${sizeClasses} shrink-0 flex items-center justify-center relative ${interactiveClasses} ${className}`}
      title={`${trackName} Circuit Layout`}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="w-full h-full drop-shadow-sm pointer-events-none"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Crisp white circuit outline */}
        <path
          d={pathD}
          stroke="#ffffff"
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
};
