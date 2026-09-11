import React, { useMemo } from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { computeCumulativeDistances, findIndexAtDistance } from '../../../utils/replayComparison.js';
import { projectTrajectoryPoints, buildContinuousSvgPath } from './replayMapUtils.js';

export interface MiniCornerMapProps {
  points: ReplayTrajectoryPoint[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; spanX: number; spanZ: number };
  highlightDistM: number;
  className?: string;
}

const VIEWBOX_SIZE = 100;
const PADDING = 12;

/**
 * Tiny read-only circuit outline with a single highlighted dot, so each corner's consistency
 * card shows where on the track that corner actually is without needing the full GPS map.
 */
export const MiniCornerMap: React.FC<MiniCornerMapProps> = ({ points, bounds, highlightDistM, className = '' }) => {
  const svgPoints = useMemo(() => projectTrajectoryPoints(points, bounds, VIEWBOX_SIZE, PADDING), [points, bounds]);
  const dists = useMemo(() => computeCumulativeDistances(points), [points]);
  const pathD = useMemo(() => buildContinuousSvgPath(svgPoints), [svgPoints]);
  const markerIdx = useMemo(() => findIndexAtDistance(dists, highlightDistM), [dists, highlightDistM]);
  const marker = svgPoints[Math.min(markerIdx, svgPoints.length - 1)];

  if (svgPoints.length === 0) return null;

  return (
    <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className={className}>
      <path d={pathD} fill="none" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathD} fill="none" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {marker && <circle cx={marker.sx} cy={marker.sy} r="5" fill="#f43f5e" stroke="#fff" strokeWidth="1.5" />}
    </svg>
  );
};
