import React from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { PointComparison } from '../../../utils/replayComparison.js';
import { CornerSegmentComparison, StraightSegmentComparison } from '../../../utils/cornerAnalysis.js';
import { TelemetryChartPathsResult } from './telemetryChartPaths.js';
import { TelemetryStripToolbar } from './TelemetryStripToolbar.js';
import { TelemetrySpeedChannel } from './TelemetrySpeedChannel.js';
import { TelemetryDeltaChannel } from './TelemetryDeltaChannel.js';
import { TelemetryPedalsChannel } from './TelemetryPedalsChannel.js';
import { TelemetrySteerGearChannel } from './TelemetrySteerGearChannel.js';
import { TelemetryCornerStrip } from './TelemetryCornerStrip.js';

export interface TelemetryStripViewProps {
  points: ReplayTrajectoryPoint[];
  currentPoint?: ReplayTrajectoryPoint;
  safeIndex: number;
  viewStart: number;
  viewEnd: number;
  isCursorInView: boolean;
  cursorPct: number;
  currentComparison?: PointComparison | null;
  pointComparisons: PointComparison[];
  paths: TelemetryChartPathsResult;
  sectors?: { s1Frame: number; s2Frame: number };
  cornerSegments?: CornerSegmentComparison[];
  initialStraight?: StraightSegmentComparison | null;
  selectedCornerNumber?: number | null;
  onSelectCorner?: (cornerNumber: number | null) => void;
  onJumpToDistance?: (distM: number) => void;
  cumDists?: number[];
  currentDistM?: number;
  selectedCornerMarkers?: { cornerNumber: number; entryFrame: number; minFrame: number; exitFrame: number } | null;
  interactionMode: 'scrub' | 'zoom';
  setInteractionMode: (mode: 'scrub' | 'zoom') => void;
  isZoomed: boolean;
  onResetZoom: () => void;
  hasBaseline: boolean;
  baselineLabel?: string;
  telemetryResolution?: number;
  onChangeResolution?: (res: number) => void;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  isFullResolution?: boolean;
  currentTimeSec?: number;
  totalFrames?: number;
  headerContent?: React.ReactNode;
  dragSelection?: { startPct: number; currentPct: number; startX: number; currentX: number } | null;
  markerPcts: {
    s1Pct: number | null;
    s2Pct: number | null;
    cornerEntryPct: number | null;
    cornerMinPct: number | null;
    cornerExitPct: number | null;
  };
}

export const TelemetryStripView: React.FC<TelemetryStripViewProps> = ({
  points,
  currentPoint,
  safeIndex,
  viewStart,
  viewEnd,
  isCursorInView,
  cursorPct,
  currentComparison,
  pointComparisons,
  paths,
  sectors,
  cornerSegments,
  initialStraight,
  selectedCornerNumber,
  onSelectCorner,
  onJumpToDistance,
  cumDists,
  currentDistM,
  selectedCornerMarkers,
  interactionMode,
  setInteractionMode,
  isZoomed,
  onResetZoom,
  hasBaseline,
  baselineLabel,
  telemetryResolution,
  onChangeResolution,
  rawPointsCount,
  rawSampleRateHz,
  isFullResolution,
  currentTimeSec,
  totalFrames,
  headerContent,
  dragSelection,
  markerPcts,
}) => {
  const { s1Pct, s2Pct, cornerEntryPct, cornerMinPct, cornerExitPct } = markerPcts;

  return (
    <>
      <TelemetryStripToolbar
        interactionMode={interactionMode}
        onChangeInteractionMode={setInteractionMode}
        isZoomed={isZoomed}
        viewStart={viewStart}
        viewEnd={viewEnd}
        spanTimeSec={points[viewStart]?.timeSec !== undefined && points[viewEnd]?.timeSec !== undefined ? (points[viewEnd].timeSec || 0) - (points[viewStart].timeSec || 0) : undefined}
        onResetZoom={onResetZoom}
        hasBaseline={hasBaseline}
        baselineLabel={baselineLabel}
        telemetryResolution={telemetryResolution}
        onChangeResolution={onChangeResolution}
        pointsCount={points.length}
        rawPointsCount={rawPointsCount}
        rawSampleRateHz={rawSampleRateHz}
        isFullResolution={isFullResolution}
        currentTimeSec={currentTimeSec}
        currentFrame={safeIndex + 1}
        totalFrames={totalFrames}
        headerContent={headerContent}
      />

      <div className="relative flex-1 min-h-0 h-full overflow-hidden bg-[#0a0e17] flex flex-col">
        <TelemetrySpeedChannel
          speedPath={paths.speedPath}
          baselineSpeedPath={paths.baselineSpeedPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />

        {pointComparisons.length > 0 && (
          <TelemetryDeltaChannel
            deltaTimePath={paths.deltaTimePath}
            deltaTimeArea={paths.deltaTimeArea}
            deltaGainArea={paths.deltaGainArea}
            deltaLossArea={paths.deltaLossArea}
            deltaGradientStops={paths.deltaGradientStops}
            maxDeltaSec={paths.maxDeltaSec}
            currentComparison={currentComparison}
            isCursorInView={isCursorInView}
            cursorPct={cursorPct}
          />
        )}

        <TelemetryPedalsChannel
          throttlePath={paths.throttlePath}
          throttleArea={paths.throttleArea}
          baselineThrottlePath={paths.baselineThrottlePath}
          brakePath={paths.brakePath}
          brakeArea={paths.brakeArea}
          baselineBrakePath={paths.baselineBrakePath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />

        <TelemetrySteerGearChannel
          steerPath={paths.steerPath}
          baselineSteerPath={paths.baselineSteerPath}
          gearPath={paths.gearPath}
          baselineGearPath={paths.baselineGearPath}
          currentPoint={currentPoint}
          currentComparison={currentComparison}
          isCursorInView={isCursorInView}
          cursorPct={cursorPct}
        />

        {((cornerSegments && cornerSegments.length > 0) || Boolean(initialStraight)) && (
          <TelemetryCornerStrip
            corners={cornerSegments || []}
            initialStraight={initialStraight}
            selectedCornerNumber={selectedCornerNumber}
            onSelectCorner={onSelectCorner}
            onJumpToDistance={onJumpToDistance}
            isCompareMode={hasBaseline}
            currentDistM={currentDistM}
            sectors={sectors}
            cumDists={cumDists}
          />
        )}

        {s1Pct !== null && (
          <div style={{ left: `${s1Pct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-lmu-gold/50 pointer-events-none z-10">
            <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-lmu-gold/20 text-lmu-gold text-[8px] font-mono font-bold">S1</span>
          </div>
        )}
        {s2Pct !== null && (
          <div style={{ left: `${s2Pct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-lmu-blue/50 pointer-events-none z-10">
            <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-lmu-blue/20 text-lmu-blue text-[8px] font-mono font-bold">S2</span>
          </div>
        )}

        {cornerEntryPct !== null && (
          <div style={{ left: `${cornerEntryPct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-cyan-400/60 pointer-events-none z-10 border-l border-dashed border-cyan-400/60">
            <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[8px] font-mono font-bold whitespace-nowrap">
              T{selectedCornerMarkers?.cornerNumber} IN
            </span>
          </div>
        )}
        {cornerMinPct !== null && (
          <div style={{ left: `${cornerMinPct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-rose-400/70 pointer-events-none z-10 border-l border-dashed border-rose-400/70">
            <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[8px] font-mono font-bold whitespace-nowrap">
              T{selectedCornerMarkers?.cornerNumber} APEX
            </span>
          </div>
        )}
        {cornerExitPct !== null && (
          <div style={{ left: `${cornerExitPct}%` }} className="absolute top-3.5 bottom-0 w-[1px] bg-emerald-400/60 pointer-events-none z-10 border-l border-dashed border-emerald-400/60">
            <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[8px] font-mono font-bold whitespace-nowrap">
              T{selectedCornerMarkers?.cornerNumber} OUT
            </span>
          </div>
        )}

        {isCursorInView && (
          <div style={{ left: `${cursorPct}%` }} className="absolute top-3.5 bottom-0 w-[1.5px] bg-white pointer-events-none z-30 shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
        )}

        {dragSelection && (
          <div
            style={{ left: `${Math.min(dragSelection.startPct, dragSelection.currentPct)}%`, width: `${Math.abs(dragSelection.currentPct - dragSelection.startPct)}%` }}
            className="absolute top-3.5 bottom-0 bg-sky-500/25 border-x-2 border-sky-400 pointer-events-none z-40 backdrop-blur-[1px]"
          />
        )}
      </div>
    </>
  );
};
