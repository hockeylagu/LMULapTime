import React, { useMemo } from 'react';
import {
  useTrackBoundaryGeometry,
  projectBoundaryPoints,
  computeTrackBoundaryPathD,
  TrackBoundaryGeometry,
} from '../replay/map/index.js';
import { CIRCUIT_SPECIFICATIONS, getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { CHART_COLORS } from '../../utils/themeColors.js';
import { getTrackOutlineUrl } from '../../api/trackGeometryApi.js';

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

function getActiveBounds(geometry: TrackBoundaryGeometry): TrackBoundaryGeometry['bounds'] {
  const points = geometry.centerline.length > 0
    ? geometry.centerline
    : geometry.leftBoundary.length > 0
      ? geometry.leftBoundary
      : geometry.rightBoundary;
  if (points.length === 0) return geometry.bounds;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    spanX: Math.max(maxX - minX, 1),
    spanZ: Math.max(maxZ - minZ, 1),
  };
}

function computePathD(geometry: TrackBoundaryGeometry | null | undefined): string {
  if (!geometry) return '';
  const bounds = getActiveBounds(geometry);
  const centerlineSvg = projectBoundaryPoints(geometry.centerline, bounds, VIEWBOX_SIZE, PADDING);
  const leftSvg = projectBoundaryPoints(geometry.leftBoundary, bounds, VIEWBOX_SIZE, PADDING);
  const rightSvg = projectBoundaryPoints(geometry.rightBoundary, bounds, VIEWBOX_SIZE, PADDING);
  return computeTrackBoundaryPathD(centerlineSvg, leftSvg, rightSvg) || '';
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
  const [outlineFailedLayoutKey, setOutlineFailedLayoutKey] = React.useState<string | null>(null);
  const useStaticOutline = !propGeometry && Boolean(resolvedKey && CIRCUIT_SPECIFICATIONS[resolvedKey]) && outlineFailedLayoutKey !== resolvedKey;
  const shouldFetch = propGeometry === undefined && !useStaticOutline;
  const { trackGeometry: fetchedGeometry, isLoading } = useTrackBoundaryGeometry(
    shouldFetch
      ? { trackVenue: trackName, trackCourse, layoutKey: resolvedKey }
      : { layoutKey: null, trackVenue: null, trackCourse: null }
  );

  const effectiveGeometry = propGeometry !== undefined ? propGeometry : fetchedGeometry;
  const staticOutlineUrl = useStaticOutline && resolvedKey ? getTrackOutlineUrl(resolvedKey) : null;

  const sizeClasses =
    size === 'header' ? 'relative min-h-[128px] w-[160px] self-stretch [&>svg]:absolute [&>svg]:inset-0 [&>img]:absolute [&>img]:inset-0'
    : size === 'card' ? 'h-[128px] w-[128px]'
    : size === 'session' ? 'h-[76px] w-[100px]'
    : 'h-[128px] w-[128px]';

  const interactiveClasses = onClick
    ? `cursor-pointer rounded hover:bg-lmu-card-hover transition-colors ${FOCUS_RING}`
    : 'pointer-events-none';

  const pathD = useMemo(() => computePathD(effectiveGeometry), [effectiveGeometry]);

  if (isLoading && shouldFetch && !pathD && !staticOutlineUrl) {
    return (
      <div
        data-testid="track-circuit-layout-loading"
        className={`${sizeClasses} shrink-0 flex items-center justify-center animate-pulse ${className}`}
      >
        <div className="w-6 h-6 rounded-lg bg-lmu-raised/40" />
      </div>
    );
  }

  if (!pathD && !staticOutlineUrl) {
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
      {staticOutlineUrl ? (
        <img
          src={staticOutlineUrl}
          alt=""
          className="w-full h-full object-contain drop-shadow-sm pointer-events-none"
          onError={() => setOutlineFailedLayoutKey(resolvedKey)}
        />
      ) : (
        <svg
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          className="w-full h-full drop-shadow-sm pointer-events-none"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <path
            d={pathD}
            stroke={CHART_COLORS.white}
            strokeWidth="24"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      )}
    </div>
  );
};
