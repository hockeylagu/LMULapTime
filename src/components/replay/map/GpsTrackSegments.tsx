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
  highlightDistRange?: { startDistM: number; endDistM: number } | null;
  primaryDists?: number[];
  baselineDists?: number[];
  dimNonSelectedTrack?: boolean;
}

export const GpsTrackSegments: React.FC<GpsTrackSegmentsProps> = React.memo(({
  svgPoints,
  baselineSvgPoints = [],
  colorBy,
  deltaByIdx,
  baselineDeltaByIdx,
  primaryOpacity = 1,
  baselineOpacity = 1,
  onSelectIndex,
  highlightDistRange,
  primaryDists,
  baselineDists,
  dimNonSelectedTrack = false,
}) => {
  const baselineTrackSegments = useMemo(() => {
    return baselineSvgPoints.map((bp, i) => {
      if (i === 0) return null;
      const prev = baselineSvgPoints[i - 1];
      if (bp.isTeleport || Math.hypot(bp.x - prev.x, bp.z - prev.z) > 20 || Math.hypot(bp.sx - prev.sx, bp.sy - prev.sy) > 30) {
        return null;
      }
      const distM = baselineDists ? baselineDists[bp.idx] : undefined;
      let isHighlighted = true;
      if (dimNonSelectedTrack && highlightDistRange && distM !== undefined) {
        if (highlightDistRange.startDistM <= highlightDistRange.endDistM) {
          isHighlighted = distM >= highlightDistRange.startDistM && distM <= highlightDistRange.endDistM;
        } else {
          isHighlighted = distM >= highlightDistRange.startDistM || distM <= highlightDistRange.endDistM;
        }
      }

      if (!isHighlighted) {
        return (
          <line
            key={`baseline-${i}`}
            x1={prev.sx}
            y1={prev.sy}
            x2={bp.sx}
            y2={bp.sy}
            stroke={getHeatmapColor(bp, colorBy, baselineDeltaByIdx ? baselineDeltaByIdx[bp.idx] : undefined)}
            strokeWidth="1.3"
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeOpacity={0.4 * baselineOpacity}
            vectorEffect="non-scaling-stroke"
            data-track-line="baseline"
          />
        );
      }

      return (
        <line
          key={`baseline-${i}`}
          x1={prev.sx}
          y1={prev.sy}
          x2={bp.sx}
          y2={bp.sy}
          stroke={getHeatmapColor(bp, colorBy, baselineDeltaByIdx ? baselineDeltaByIdx[bp.idx] : undefined)}
          strokeWidth={dimNonSelectedTrack ? '2.5' : '1.8'}
          strokeDasharray="8 6"
          strokeLinecap="round"
          strokeOpacity={0.9 * baselineOpacity}
          vectorEffect="non-scaling-stroke"
          data-track-line="baseline"
        />
      );
    });
  }, [baselineSvgPoints, colorBy, baselineDeltaByIdx, baselineOpacity, dimNonSelectedTrack, highlightDistRange, baselineDists]);

  const primaryTrackSegments = useMemo(() => {
    return svgPoints.map((p, i) => {
      if (i === 0) return null;
      const prev = svgPoints[i - 1];
      if (p.isTeleport || Math.hypot(p.x - prev.x, p.z - prev.z) > 20 || Math.hypot(p.sx - prev.sx, p.sy - prev.sy) > 30) {
        return null;
      }
      const distM = primaryDists ? primaryDists[p.idx] : undefined;
      let isHighlighted = true;
      if (dimNonSelectedTrack && highlightDistRange && distM !== undefined) {
        if (highlightDistRange.startDistM <= highlightDistRange.endDistM) {
          isHighlighted = distM >= highlightDistRange.startDistM && distM <= highlightDistRange.endDistM;
        } else {
          isHighlighted = distM >= highlightDistRange.startDistM || distM <= highlightDistRange.endDistM;
        }
      }

      if (!isHighlighted) {
        return (
          <line
            key={i}
            x1={prev.sx}
            y1={prev.sy}
            x2={p.sx}
            y2={p.sy}
            stroke={getHeatmapColor(p, colorBy, deltaByIdx ? deltaByIdx[p.idx] : undefined)}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeOpacity={0.45 * primaryOpacity}
            vectorEffect="non-scaling-stroke"
            className="hover:stroke-white transition-colors cursor-pointer"
            onClick={() => onSelectIndex?.(p.idx)}
            data-track-line="primary"
          />
        );
      }

      return (
        <line
          key={i}
          x1={prev.sx}
          y1={prev.sy}
          x2={p.sx}
          y2={p.sy}
          stroke={getHeatmapColor(p, colorBy, deltaByIdx ? deltaByIdx[p.idx] : undefined)}
          strokeWidth={dimNonSelectedTrack ? '3.2' : '2'}
          strokeLinecap="round"
          strokeOpacity={primaryOpacity}
          vectorEffect="non-scaling-stroke"
          className="hover:stroke-white transition-colors cursor-pointer"
          onClick={() => onSelectIndex?.(p.idx)}
          data-track-line="primary"
        />
      );
    });
  }, [svgPoints, colorBy, deltaByIdx, primaryOpacity, onSelectIndex, dimNonSelectedTrack, highlightDistRange, primaryDists]);

  return (
    <>
      {primaryTrackSegments}
      {baselineTrackSegments}
    </>
  );
});
