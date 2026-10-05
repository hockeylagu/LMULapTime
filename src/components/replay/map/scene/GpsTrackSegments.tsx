import React, { useMemo, useState } from 'react';
import {
  buildTrackLineRuns,
  getHeatmapColor,
  isRunInViewBox,
  MapColorMode,
  nearestRunVertex,
  parseViewBox,
  ProjectedPoint,
  TrackLineRun,
} from '../replayMapUtils.js';
import { GpsTrackHoverTooltip } from '../display/GpsTrackHoverTooltip.js';

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
  markerScale?: number;
  viewBox?: string;
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
  markerScale = 1,
  viewBox,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<ProjectedPoint | null>(null);

  const viewBoxRect = useMemo(() => parseViewBox(viewBox), [viewBox]);

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

  // Hit testing needs geometry, not a duplicate of every heatmap colour run.
  // Keep gaps separate while sharing one wide target along each continuous section.
  const hitRuns = useMemo(() => buildTrackLineRuns(svgPoints, () => '', () => true), [svgPoints]);

  const visiblePrimaryRuns = useMemo(
    () => (viewBoxRect ? primaryRuns.filter(r => isRunInViewBox(r, viewBoxRect)) : primaryRuns),
    [primaryRuns, viewBoxRect]
  );
  const visibleBaselineRuns = useMemo(
    () => (viewBoxRect ? baselineRuns.filter(r => isRunInViewBox(r, viewBoxRect)) : baselineRuns),
    [baselineRuns, viewBoxRect]
  );
  const visibleHitRuns = useMemo(
    () => (viewBoxRect ? hitRuns.filter(r => isRunInViewBox(r, viewBoxRect)) : hitRuns),
    [hitRuns, viewBoxRect]
  );

  const selectNearest = (run: TrackLineRun, e: React.MouseEvent<SVGPathElement>) => {
    const at = toSvgCoords(e);
    if (!at || !onSelectIndex) return;
    onSelectIndex(svgPoints[nearestRunVertex(svgPoints, run.from, run.to, at.sx, at.sy)].idx);
  };

  const handlePointerHover = (run: TrackLineRun, e: React.PointerEvent<SVGPathElement>) => {
    const at = toSvgCoords(e as unknown as React.MouseEvent<SVGPathElement>);
    if (!at) return;
    setHoveredPoint(svgPoints[nearestRunVertex(svgPoints, run.from, run.to, at.sx, at.sy)]);
  };

  return (
    <>
      {visiblePrimaryRuns.map(run => (
        <path
          key={`primary-${run.from}`}
          d={run.d}
          fill="none"
          stroke={run.color}
          strokeWidth={run.isHighlighted ? (dimNonSelectedTrack ? '3.2' : '2.5') : '1.8'}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={run.isHighlighted ? primaryOpacity : 0.45 * primaryOpacity}
          vectorEffect="non-scaling-stroke"
          className="cursor-pointer"
          onClick={e => selectNearest(run, e)}
          data-track-line="primary"
        />
      ))}
      {visibleBaselineRuns.map(run => (
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
          pointerEvents="none"
        />
      ))}
      {onSelectIndex && visibleHitRuns.map(run => (
        <path
          key={`hit-${run.from}`}
          d={run.d}
          fill="none"
          stroke="transparent"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="stroke"
          className="cursor-pointer stroke-[28px] pointer-coarse:stroke-[44px]"
          onClick={e => selectNearest(run, e)}
          onPointerMove={e => handlePointerHover(run, e)}
          onPointerLeave={() => setHoveredPoint(null)}
          data-track-line="hit-target"
          aria-hidden="true"
        />
      ))}
      {hoveredPoint && (
        <GpsTrackHoverTooltip
          point={hoveredPoint}
          markerScale={markerScale}
          deltaTimeSec={deltaByIdx ? deltaByIdx[hoveredPoint.idx] : null}
          distM={primaryDists ? primaryDists[hoveredPoint.idx] : undefined}
        />
      )}
    </>
  );
});
