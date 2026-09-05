import React, { useMemo } from 'react';
import { Trophy, Gauge } from 'lucide-react';
import { DetailedSession, DriverData } from '../../../server/types.js';
import { DriverRaceStandingsRow } from './DriverRaceStandingsRow.js';
import { DriverTimingMetricsRow } from './DriverTimingMetricsRow.js';

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
    selectedDriver.gridPosition !== null ||
    selectedDriver.positionGain !== null;

  const completedLaps = useMemo(() => {
    return (selectedDriver.laps || []).filter((l) => l.lapTime !== null && l.lapTime > 0);
  }, [selectedDriver.laps]);

  const hasMultipleLaps = completedLaps.length > 1;

  const validFlyingLaps = useMemo(() => {
    return completedLaps.filter((l, idx, arr) => {
      const prevLap = idx > 0 ? arr[idx - 1] : null;
      const prevIsValidPitStop = Boolean(
        prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0
      );
      const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
      return l.isValid && !l.isPitStop && !isOut && (!hasMultipleLaps || l.lapNum > 1);
    });
  }, [completedLaps, hasMultipleLaps]);

  const cleanLapsForAvg = useMemo(() => {
    if (validFlyingLaps.length > 0) return validFlyingLaps;
    const fallbackWithoutPit = completedLaps.filter((l, idx, arr) => {
      const prevLap = idx > 0 ? arr[idx - 1] : null;
      const prevIsValidPitStop = Boolean(
        prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0
      );
      const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
      return !l.isPitStop && !isOut && (!hasMultipleLaps || l.lapNum > 1);
    });
    return fallbackWithoutPit.length > 0 ? fallbackWithoutPit : completedLaps;
  }, [validFlyingLaps, completedLaps, hasMultipleLaps]);

  const avgLapTime = useMemo(() => {
    return cleanLapsForAvg.length > 0
      ? cleanLapsForAvg.reduce((sum, l) => sum + (l.lapTime || 0), 0) / cleanLapsForAvg.length
      : null;
  }, [cleanLapsForAvg]);

  const deltaToBest = useMemo(() => {
    return avgLapTime !== null && selectedDriver.bestLapTime
      ? avgLapTime - selectedDriver.bestLapTime
      : null;
  }, [avgLapTime, selectedDriver.bestLapTime]);

  const lapStdDev = useMemo(() => {
    return avgLapTime !== null && cleanLapsForAvg.length > 1
      ? Math.sqrt(
          cleanLapsForAvg.reduce((sum, l) => sum + Math.pow((l.lapTime || 0) - avgLapTime, 2), 0) /
            cleanLapsForAvg.length
        )
      : null;
  }, [avgLapTime, cleanLapsForAvg]);

  const consistencyScore = useMemo(() => {
    return avgLapTime !== null && lapStdDev !== null && avgLapTime > 0
      ? Math.max(0, Math.min(100, (1 - lapStdDev / avgLapTime) * 100))
      : null;
  }, [avgLapTime, lapStdDev]);

  const sortedCleanLaps = useMemo(() => {
    return [...cleanLapsForAvg]
      .filter((l) => l.lapTime !== null && l.lapTime > 0)
      .sort((a, b) => (a.lapTime || 0) - (b.lapTime || 0));
  }, [cleanLapsForAvg]);

  const top3Avg = useMemo(() => {
    const top3Slice = sortedCleanLaps.slice(0, 3);
    return top3Slice.length > 0
      ? parseFloat((top3Slice.reduce((sum, l) => sum + (l.lapTime || 0), 0) / top3Slice.length).toFixed(3))
      : null;
  }, [sortedCleanLaps]);

  const top3DeltaToBest = useMemo(() => {
    return top3Avg !== null && selectedDriver.bestLapTime
      ? parseFloat((top3Avg - selectedDriver.bestLapTime).toFixed(3))
      : null;
  }, [top3Avg, selectedDriver.bestLapTime]);

  const theoGap = useMemo(() => {
    return selectedDriver.bestLapTime && selectedDriver.theoreticalBest
      ? parseFloat((selectedDriver.bestLapTime - selectedDriver.theoreticalBest).toFixed(3))
      : null;
  }, [selectedDriver.bestLapTime, selectedDriver.theoreticalBest]);

  const s1Laps = useMemo(() => {
    return (selectedDriver.laps || []).filter(
      (l) => l.s1 !== null && l.s1 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
    );
  }, [selectedDriver.laps, hasMultipleLaps, validFlyingLaps]);

  const avgS1 = useMemo(() => {
    return s1Laps.length > 0 ? s1Laps.reduce((sum, l) => sum + (l.s1 || 0), 0) / s1Laps.length : null;
  }, [s1Laps]);

  const s2Laps = useMemo(() => {
    return (selectedDriver.laps || []).filter(
      (l) => l.s2 !== null && l.s2 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
    );
  }, [selectedDriver.laps, hasMultipleLaps, validFlyingLaps]);

  const avgS2 = useMemo(() => {
    return s2Laps.length > 0 ? s2Laps.reduce((sum, l) => sum + (l.s2 || 0), 0) / s2Laps.length : null;
  }, [s2Laps]);

  const s3Laps = useMemo(() => {
    return (selectedDriver.laps || []).filter(
      (l) => l.s3 !== null && l.s3 > 0 && (!hasMultipleLaps || l.lapNum > 1) && (l.isValid || validFlyingLaps.length === 0)
    );
  }, [selectedDriver.laps, hasMultipleLaps, validFlyingLaps]);

  const avgS3 = useMemo(() => {
    return s3Laps.length > 0 ? s3Laps.reduce((sum, l) => sum + (l.s3 || 0), 0) / s3Laps.length : null;
  }, [s3Laps]);

  return (
    <div className="glass-panel p-4 rounded-xl border border-lmu-border/70 space-y-3">
      {/* Header: Title / Car Info / Finish Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-lmu-border/50 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {isRaceSession ? (
              <Trophy className="w-4 h-4 text-lmu-gold" />
            ) : (
              <Gauge className="w-4 h-4 text-lmu-cyan" />
            )}
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {isRaceSession ? 'Race Standings & Position Deltas' : 'Driver Performance & Session Overview'}
            </h3>
          </div>
          <span className="text-xs text-lmu-muted hidden sm:inline">•</span>
          <span className="text-xs text-slate-200 font-semibold truncate max-w-xs" title={selectedDriver.carType}>
            {selectedDriver.carType}{' '}
            <span className="text-lmu-muted font-normal">
              ({selectedDriver.carClass || 'Class'} • #{selectedDriver.carNumber})
            </span>
          </span>
        </div>

        {isRaceSession && selectedDriver.finishStatus && (
          <span
            className={`px-2.5 py-0.5 rounded text-xs font-bold ${
              selectedDriver.finishStatus.toLowerCase().includes('dnf')
                ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                : selectedDriver.classPosition === 1 || selectedDriver.position === 1
                ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            🏁 {selectedDriver.finishStatus}
          </span>
        )}
      </div>

      {isRaceSession && (
        <DriverRaceStandingsRow selectedDriver={selectedDriver} isMultiClass={isMultiClass} />
      )}

      <DriverTimingMetricsRow
        session={session}
        selectedDriver={selectedDriver}
        isRaceSession={isRaceSession}
        isCurrentSessionAllTimePB={isCurrentSessionAllTimePB}
        allTimeCategoryTrackPB={allTimeCategoryTrackPB}
        top3Avg={top3Avg}
        top3DeltaToBest={top3DeltaToBest}
        avgLapTime={avgLapTime}
        deltaToBest={deltaToBest}
        lapStdDev={lapStdDev}
        consistencyScore={consistencyScore}
        cleanLapsCount={cleanLapsForAvg.length}
        totalLapsCount={selectedDriver.laps?.length || 0}
        hasMultipleLaps={hasMultipleLaps}
        theoGap={theoGap}
        avgS1={avgS1}
        avgS2={avgS2}
        avgS3={avgS3}
      />
    </div>
  );
};
