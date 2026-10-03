import React, { useMemo } from 'react';
import {
  useTrackBoundaryGeometry,
  projectBoundaryPoints,
  computeTrackBoundaryPathD,
  TrackBoundaryGeometry,
} from '../replay/map/index.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { CHART_COLORS } from '../../utils/themeColors.js';
import { GpsTrackSurfaceLayers } from '../replay/map/scene/GpsTrackSurfaceLayers.js';

export interface TrackCircuitLayoutProps {
  trackName: string;
  trackCourse?: string;
  layoutKey?: string;
  trackGeometry?: TrackBoundaryGeometry | null;
  className?: string;
  size?: 'detail' | 'card' | 'session' | 'header';
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

  // Detail and header views render native road, kerb and runoff surfaces (mapSurfaces).
  // Compact cards and session headers only need the outline path, so they skip fetching once cached.
  const wantsSurfaces = size === 'detail' || size === 'header';
  const shouldFetch = propGeometry === undefined && (!cachedD || wantsSurfaces);
  const { trackGeometry: fetchedGeometry, isLoading } = useTrackBoundaryGeometry(
    shouldFetch
      ? { trackVenue: trackName, trackCourse, layoutKey: resolvedKey }
      : { layoutKey: null, trackVenue: null, trackCourse: null }
  );

  const effectiveGeometry = propGeometry !== undefined ? propGeometry : fetchedGeometry;

  const sizeClasses =
    size === 'header' ? 'relative min-h-[128px] w-[160px] self-stretch [&>svg]:absolute [&>svg]:inset-0'
    : size === 'card' ? 'h-[128px] w-[128px]'
    : size === 'session' ? 'h-[76px] w-[100px]'
    : 'h-[128px] w-[128px]';

  const interactiveClasses = onClick
    ? `cursor-pointer rounded hover:bg-lmu-card-hover transition-colors ${FOCUS_RING}`
    : 'pointer-events-none';

  const pathD = useMemo(() => {
    if (cachedD) return cachedD;
    return getOrComputePathD(effectiveGeometry, resolvedKey || undefined);
  }, [cachedD, effectiveGeometry, resolvedKey]);

  const hasNativeSurfaces = Boolean(effectiveGeometry?.mapSurfaces?.road?.length);

  if (isLoading && shouldFetch && !cachedD) {
    return (
      <div
        data-testid="track-circuit-layout-loading"
        className={`${sizeClasses} shrink-0 flex items-center justify-center animate-pulse ${className}`}
      >
        <div className="w-6 h-6 rounded-lg bg-lmu-raised/40" />
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
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
        aria-label={onClick ? `Open ${trackName}` : undefined}
        className={`${sizeClasses} shrink-0 flex items-center justify-center text-lmu-faint ${interactiveClasses} ${className}`}
        title={trackName}
      >
        <svg
          viewBox="0 0 24 24"
          className={size === 'card' ? 'w-5 h-5 text-lmu-faint' : 'w-6 h-6 text-lmu-faint'}
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
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
        aria-label={onClick ? `Open ${trackName}` : undefined}
      className={`${sizeClasses} shrink-0 flex items-center justify-center relative ${interactiveClasses} ${className}`}
      title={`${trackName} Circuit Layout`}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="w-full h-full drop-shadow-sm pointer-events-none"
        preserveAspectRatio="xMidYMid meet"
      >
        {hasNativeSurfaces && effectiveGeometry?.bounds ? (
          <GpsTrackSurfaceLayers
            surfaces={effectiveGeometry.mapSurfaces!}
            bounds={effectiveGeometry.bounds}
            viewBoxSize={VIEWBOX_SIZE}
            padding={PADDING}
          />
        ) : (
          /* Crisp white circuit outline remains the fallback for legacy geometry. */
          <path
            d={pathD}
            stroke={CHART_COLORS.white}
            strokeWidth="24"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
};
