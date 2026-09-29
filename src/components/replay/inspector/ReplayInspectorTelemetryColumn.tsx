import React, { useMemo } from 'react';
import { ReplayLapSummary, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { CornerSegmentComparison, LapSegmentComparison, StraightSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
import { ReplayPerformanceHeader } from './ReplayPerformanceHeader.js';
import { TelemetryStripCharts } from '../telemetry/TelemetryStripCharts.js';
import { TelemetryResolution } from '../telemetry/telemetryResolution.js';

export interface ReplayInspectorTelemetryColumnProps {
  trajectory: ReplayTrajectoryData | null;
  baselineTrajectory: ReplayTrajectoryData | null | undefined;
  isCompareMode: boolean;
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  isLoading: boolean;
  currentLapSummary: ReplayLapSummary | null | undefined;
  bestSectors: { s1: number | null; s2: number | null; s3: number | null };
  lapDeltas: { lapDelta: number | null; s1Delta: number | null; s2Delta: number | null; s3Delta: number | null } | null;
  formatLapTime: (sec?: number | null) => string;
  chartZoomRange: { start: number; end: number } | null;
  setChartZoomRange: (range: { start: number; end: number } | null) => void;
  telemetryResolution: TelemetryResolution;
  handleChangeResolution: (res: TelemetryResolution) => void;
  selectedCornerMarkers: { cornerNumber: number; entryFrame: number; minFrame: number; exitFrame: number } | null;
  cornerSegments: CornerSegmentComparison[];
  lapSegments: LapSegmentComparison[];
  selectedCornerNumber: number | null;
  handleSelectCorner: (cornerNumber: number | null) => void;
  hasDuckDbTelemetry?: boolean;
  duckdbUnavailableReason?: string;
  onSelectSource?: (source: 'duckdb' | 'vcr') => void;
}

/** The strip-chart column of the replay inspector: the telemetry traces under the performance header. */
export const ReplayInspectorTelemetryColumn: React.FC<ReplayInspectorTelemetryColumnProps> = ({
  trajectory, baselineTrajectory, isCompareMode, currentIndex, setCurrentIndex, isLoading, currentLapSummary,
  bestSectors, lapDeltas, formatLapTime, chartZoomRange, setChartZoomRange, telemetryResolution, handleChangeResolution,
  selectedCornerMarkers, cornerSegments, lapSegments, selectedCornerNumber, handleSelectCorner,
  hasDuckDbTelemetry, duckdbUnavailableReason, onSelectSource,
}) => {
  const initialStraight = useMemo(() => {
    const first = lapSegments.find(s => s.type === 'straight' && s.entryDistM <= 50);
    return first && first.lengthM >= 30 ? (first as StraightSegmentComparison) : null;
  }, [lapSegments]);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-lmu-deep p-3 sm:p-4 gap-2.5 min-h-0 overflow-hidden border-r border-lmu-border">
      <div className="flex-1 min-h-0 w-full">
        <TelemetryStripCharts
          points={trajectory?.points || []}
          currentIndex={currentIndex}
          onSelectIndex={setCurrentIndex}
          isLoading={isLoading}
          sectors={trajectory?.sectors}
          className="w-full h-full"
          headerContent={
            <ReplayPerformanceHeader
              currentLap={trajectory?.currentLap ?? 1}
              currentLapSummary={currentLapSummary}
              bestS1Sec={bestSectors.s1}
              bestS2Sec={bestSectors.s2}
              bestS3Sec={bestSectors.s3}
              isCompareMode={isCompareMode}
              trajectory={trajectory}
              baselineTrajectory={baselineTrajectory ?? null}
              lapDeltas={lapDeltas}
              formatLapTime={formatLapTime}
            />
          }
          baselinePoints={isCompareMode && baselineTrajectory ? baselineTrajectory.points : undefined}
          zoomRange={chartZoomRange}
          onZoomRangeChange={setChartZoomRange}
          telemetryResolution={telemetryResolution}
          onChangeResolution={handleChangeResolution}
          rawPointsCount={trajectory?.rawPointsCount}
          rawSampleRateHz={trajectory?.rawSampleRateHz}
          vcrRawPointsCount={trajectory?.vcrRawPointsCount}
          vcrRawSampleRateHz={trajectory?.vcrRawSampleRateHz}
          duckdbRawPointsCount={trajectory?.duckdbRawPointsCount}
          duckdbRawSampleRateHz={trajectory?.duckdbRawSampleRateHz}
          isFullResolution={trajectory?.isFullResolution}
          selectedCornerMarkers={selectedCornerMarkers}
          cornerSegments={cornerSegments}
          initialStraight={initialStraight}
          selectedCornerNumber={selectedCornerNumber}
          onSelectCorner={handleSelectCorner}
          source={trajectory?.source}
          duckdbFilename={trajectory?.duckdbFilename}
          hasDuckDb={hasDuckDbTelemetry}
          duckdbUnavailableReason={duckdbUnavailableReason}
          onSelectSource={onSelectSource}
          trackLengthM={trajectory?.trackLengthM}
        />
      </div>
    </div>
  );
};
