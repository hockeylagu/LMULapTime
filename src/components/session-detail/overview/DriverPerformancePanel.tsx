import React, { useMemo } from 'react';
import { Timer } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { computeTopNLapAverage, computeConsistencyRating, selectCleanLapCandidates } from '../../../../shared/domain/lapComparison.js';
import { computeTheoreticalGap } from '../../../../shared/domain/formatters.js';
import { CarClassBadge } from '../../common/CarClassBadge.js';
import { CarLogo } from '../../vehicle/index.js';
import { DriverRaceStandingsRow } from '../standings/DriverRaceStandingsRow.js';
import { DriverTimingMetricsRow } from './DriverTimingMetricsRow.js';
import { BestLapBlock } from './BestLapBlock.js';
import { SectorsMetricBox } from './SectorsMetricBox.js';

export interface DriverPerformancePanelProps {
  session: DetailedSession;
  selectedDriver?: DriverData;
  isMultiClass: boolean;
  isCurrentSessionAllTimePB: boolean;
  allTimeCategoryTrackPB: number | null;
}

export const DriverPerformancePanel: React.FC<DriverPerformancePanelProps> = ({
  session,
  selectedDriver,
  isMultiClass,
  isCurrentSessionAllTimePB,
  allTimeCategoryTrackPB,
}) => {
  if (!selectedDriver) return null;

  const isRaceSession =
    session.sessionType === 'Race' ||
    (selectedDriver.gridPosition != null && selectedDriver.gridPosition > 0) ||
    selectedDriver.positionGain != null;

  const cleanLaps = useMemo(() => selectCleanLapCandidates(selectedDriver.laps || []), [selectedDriver.laps]);
  const hasMultipleLaps = (selectedDriver.laps || []).filter((l) => l.lapTime !== null && l.lapTime > 0).length > 1;

  const consistency = useMemo(() => {
    return computeConsistencyRating(selectedDriver.laps || []);
  }, [selectedDriver.laps]);

  const avgLapTime = consistency.avgLapTime;
  const lapStdDev = consistency.stdDev;
  const consistencyScore = consistency.consistencyScore;

  const deltaToBest = useMemo(() => {
    return avgLapTime !== null && selectedDriver.bestLapTime
      ? parseFloat((avgLapTime - selectedDriver.bestLapTime).toFixed(3))
      : null;
  }, [avgLapTime, selectedDriver.bestLapTime]);

  const top3Avg = useMemo(() => {
    return computeTopNLapAverage(selectedDriver.laps || [], 3);
  }, [selectedDriver.laps]);

  const top3DeltaToBest = useMemo(() => {
    return top3Avg !== null && selectedDriver.bestLapTime
      ? parseFloat((top3Avg - selectedDriver.bestLapTime).toFixed(3))
      : null;
  }, [top3Avg, selectedDriver.bestLapTime]);

  const theoGap = useMemo(() => {
    return computeTheoreticalGap(selectedDriver.bestLapTime, selectedDriver.theoreticalBest);
  }, [selectedDriver.bestLapTime, selectedDriver.theoreticalBest]);

  const s1Laps = useMemo(() => {
    return (selectedDriver.laps || []).filter(
      (l) => l.s1 !== null && l.s1 > 0 && cleanLaps.includes(l)
    );
  }, [selectedDriver.laps, cleanLaps]);

  const avgS1 = useMemo(() => {
    return s1Laps.length > 0 ? s1Laps.reduce((sum, l) => sum + (l.s1 || 0), 0) / s1Laps.length : null;
  }, [s1Laps]);

  const s2Laps = useMemo(() => {
    return (selectedDriver.laps || []).filter(
      (l) => l.s2 !== null && l.s2 > 0 && cleanLaps.includes(l)
    );
  }, [selectedDriver.laps, cleanLaps]);

  const avgS2 = useMemo(() => {
    return s2Laps.length > 0 ? s2Laps.reduce((sum, l) => sum + (l.s2 || 0), 0) / s2Laps.length : null;
  }, [s2Laps]);

  const s3Laps = useMemo(() => {
    return (selectedDriver.laps || []).filter(
      (l) => l.s3 !== null && l.s3 > 0 && cleanLaps.includes(l)
    );
  }, [selectedDriver.laps, cleanLaps]);

  const avgS3 = useMemo(() => {
    return s3Laps.length > 0 ? s3Laps.reduce((sum, l) => sum + (l.s3 || 0), 0) / s3Laps.length : null;
  }, [s3Laps]);

  const finishStatus = selectedDriver.finishStatus;
  const abnormalFinish = isRaceSession && finishStatus && !/^finished/i.test(finishStatus) ? finishStatus : null;

  return (
    <section aria-label="Session summary" className="bg-lmu-card rounded-2xl border border-lmu-border">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-lmu-border/60 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider shrink-0 flex items-center gap-2">
              <Timer className="w-4 h-4 text-lmu-accent-text" aria-hidden="true" />
              Session summary
            </h3>
            <span className="text-xs text-lmu-muted">·</span>
            <span className="text-xs text-lmu-text-soft font-semibold truncate flex items-center gap-1.5" title={selectedDriver.carType}>
              <CarLogo carType={selectedDriver.carType} size="xs" />
              <span className="truncate">{selectedDriver.carType}</span>
              <CarClassBadge carClass={selectedDriver.carClass} carType={selectedDriver.carType} size="xs" />
              <span className="text-lmu-muted font-normal">#{selectedDriver.carNumber}</span>
            </span>
          </div>
          {abnormalFinish && (
            <span className="px-2 py-0.5 rounded text-xs font-bold border bg-lmu-loss-deep/60 text-lmu-loss-soft border-lmu-loss-strong/40">
              {abnormalFinish}
            </span>
          )}
        </div>

        <div className="grid grid-cols-[240px_minmax(0,1fr)_400px] gap-x-6 gap-y-4 items-start">
          <BestLapBlock
            session={session}
            selectedDriver={selectedDriver}
            isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
            allTimeCategoryTrackPB={allTimeCategoryTrackPB}
          />
          <div className="min-w-0">
            <DriverTimingMetricsRow
              selectedDriver={selectedDriver}
              top3Avg={top3Avg}
              top3DeltaToBest={top3DeltaToBest}
              avgLapTime={avgLapTime}
              deltaToBest={deltaToBest}
              lapStdDev={lapStdDev}
              consistencyScore={consistencyScore}
              cleanLapsCount={consistency.sampleCount}
              consistencyGroups={consistency.conditionGroups}
              totalLapsCount={selectedDriver.laps?.length || 0}
              hasMultipleLaps={hasMultipleLaps}
              theoGap={theoGap}
            />
          </div>
          <SectorsMetricBox
            className={isRaceSession ? 'row-span-2 self-center' : 'self-center'}
            selectedDriver={selectedDriver}
            drivers={session.drivers ?? []}
            averages={{ s1: avgS1, s2: avgS2, s3: avgS3, lap: avgLapTime }}
          />
          {isRaceSession && <DriverRaceStandingsRow selectedDriver={selectedDriver} isMultiClass={isMultiClass} />}
        </div>
      </div>
    </section>
  );
};
