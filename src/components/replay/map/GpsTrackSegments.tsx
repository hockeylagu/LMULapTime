import React, { useMemo } from 'react';
import { getHeatmapColor, MapColorMode, ProjectedPoint } from './replayMapUtils.js';

export interface GpsTrackSegmentsProps {
  svgPoints: ProjectedPoint[];
  baselineSvgPoints?: ProjectedPoint[];
  colorBy: MapColorMode;
  deltaByIdx?: number[] | null;
  baselineDeltaByIdx?: number[] | null;
  primaryOpacity?: number;
  baselineOpacity?: number;
  onSelectIndex?: (index: number) => void;
}

export const GpsTrackSegments: React.FC<GpsTrackSegmentsProps> = ({
  svgPoints,
  baselineSvgPoints = [],
  colorBy,
  deltaByIdx,
  baselineDeltaByIdx,
  primaryOpacity = 1,
  baselineOpacity = 1,
  onSelectIndex,
}) => {
  const baselineTrackSegments = useMemo(() => {
    return baselineSvgPoints.map((bp, i) => {
      if (i === 0) return null;
      const prev = baselineSvgPoints[i - 1];
      if (bp.isTeleport || Math.hypot(bp.x - prev.x, bp.z - prev.z) > 20 || Math.hypot(bp.sx - prev.sx, bp.sy - prev.sy) > 30) {
        return null;
      }
      return (
        <line
          key={`baseline-${i}`}
          x1={prev.sx}
          y1={prev.sy}
          x2={bp.sx}
          y2={bp.sy}
          stroke={getHeatmapColor(bp, colorBy, baselineDeltaByIdx ? baselineDeltaByIdx[bp.idx] : undefined)}
          strokeWidth="1.8"
          strokeDasharray="8 6"
          strokeLinecap="round"
          strokeOpacity={0.9 * baselineOpacity}
          vectorEffect="non-scaling-stroke"
          data-track-line="baseline"
        />
      );
    });
  }, [baselineSvgPoints, colorBy, baselineDeltaByIdx, baselineOpacity]);

  const primaryTrackSegments = useMemo(() => {
    return svgPoints.map((p, i) => {
      if (i === 0) return null;
      const prev = svgPoints[i - 1];
      if (p.isTeleport || Math.hypot(p.x - prev.x, p.z - prev.z) > 20 || Math.hypot(p.sx - prev.sx, p.sy - prev.sy) > 30) {
        return null;
      }
      return (
        <line
          key={i}
          x1={prev.sx}
          y1={prev.sy}
          x2={p.sx}
          y2={p.sy}
          stroke={getHeatmapColor(p, colorBy, deltaByIdx ? deltaByIdx[p.idx] : undefined)}
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity={primaryOpacity}
          vectorEffect="non-scaling-stroke"
          className="hover:stroke-white transition-colors cursor-pointer"
          onClick={() => onSelectIndex?.(p.idx)}
          data-track-line="primary"
        />
      );
    });
  }, [svgPoints, colorBy, deltaByIdx, primaryOpacity, onSelectIndex]);

  return (
    <>
      {primaryTrackSegments}
      {baselineTrackSegments}
    </>
  );
};
