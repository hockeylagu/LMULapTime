import React, { useMemo } from 'react';
import { buildTrackLineRuns, getHeatmapColor, MapColorMode, nearestRunVertex, ProjectedPoint, TrackLineRun } from '../replayMapUtils.js';

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

function isInDistRange(distM: number | undefined, range: { startDistM: number; endDistM: number } | null | undefined, dim: boolean): boolean {
  if (!dim || !range || distM === undefined) return true;
  return range.startDistM <= range.endDistM
    ? distM >= range.startDistM && distM <= range.endDistM
    : distM >= range.startDistM || distM <= range.endDistM;
}

/** The click position in the SVG's user space (null without layout, e.g. in jsdom). */
function toSvgCoords(e: React.MouseEvent<SVGPathElement>): { sx: number; sy: number } | null {
  const ctm = e.currentTarget.getScreenCTM?.();
  if (!ctm) return null;
  const inv = ctm.inverse();
  return { sx: inv.a * e.clientX + inv.c * e.clientY + inv.e, sy: inv.b * e.clientX + inv.d * e.clientY + inv.f };
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
  const primaryRuns = useMemo(() => buildTrackLineRuns(
    svgPoints,
    p => getHeatmapColor(p, colorBy, deltaByIdx ? deltaByIdx[p.idx] : undefined),
    p => isInDistRange(primaryDists?.[p.idx], highlightDistRange, dimNonSelectedTrack)
  ), [svgPoints, colorBy, deltaByIdx, primaryDists, highlightDistRange, dimNonSelectedTrack]);

  const baselineRuns = useMemo(() => buildTrackLineRuns(
    baselineSvgPoints,
    p => getHeatmapColor(p, colorBy, baselineDeltaByIdx ? baselineDeltaByIdx[p.idx] : undefined),
    p => isInDistRange(baselineDists?.[p.idx], highlightDistRange, dimNonSelectedTrack)
  ), [baselineSvgPoints, colorBy, baselineDeltaByIdx, baselineDists, highlightDistRange, dimNonSelectedTrack]);

  // Clicking the line jumps to the nearest sample of the clicked run.
  const selectNearest = (run: TrackLineRun, e: React.MouseEvent<SVGPathElement>) => {
    const at = toSvgCoords(e);
    if (!at || !onSelectIndex) return;
    onSelectIndex(svgPoints[nearestRunVertex(svgPoints, run.from, run.to, at.sx, at.sy)].idx);
  };

  return (
    <>
      {primaryRuns.map(run => (
        <path
          key={`primary-${run.from}`}
          d={run.d}
          fill="none"
          stroke={run.color}
          strokeWidth={run.isHighlighted ? (dimNonSelectedTrack ? '3.2' : '2') : '1.4'}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={run.isHighlighted ? primaryOpacity : 0.45 * primaryOpacity}
          vectorEffect="non-scaling-stroke"
          className="cursor-pointer"
          onClick={e => selectNearest(run, e)}
          data-track-line="primary"
        />
      ))}
      {baselineRuns.map(run => (
        <path
          key={`baseline-${run.from}`}
          d={run.d}
          fill="none"
          stroke={run.color}
          strokeWidth={run.isHighlighted ? (dimNonSelectedTrack ? '2.5' : '1.8') : '1.3'}
          strokeDasharray={run.isHighlighted ? '8 6' : '6 4'}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={run.isHighlighted ? 0.9 * baselineOpacity : 0.4 * baselineOpacity}
          vectorEffect="non-scaling-stroke"
          data-track-line="baseline"
        />
      ))}
    </>
  );
});
