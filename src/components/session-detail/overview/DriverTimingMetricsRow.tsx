import React from 'react';
import { DriverData } from '../../../../shared/types/index.js';
import type { ConsistencyRating } from '../../../../shared/domain/lapComparison.js';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { SummaryStat } from './SummaryStat.js';

export interface DriverTimingMetricsRowProps {
  selectedDriver: DriverData;
  top3Avg: number | null;
  top3DeltaToBest: number | null;
  avgLapTime: number | null;
  deltaToBest: number | null;
  lapStdDev: number | null;
  consistencyScore: number | null;
  cleanLapsCount: number;
  /** Clean laps per condition, when the session mixes dry and wet laps. */
  consistencyGroups?: ConsistencyRating['conditionGroups'];
  totalLapsCount: number;
  hasMultipleLaps: boolean;
  theoGap: number | null;
}

/** Consistency keeps a signal only at its ends: gain when very steady, warn and loss when scattered. */
const consistencyClass = (score: number) =>
  score >= 99 ? 'text-lmu-gain' : score >= 97 ? 'text-white' : score >= 94 ? 'text-lmu-warn' : 'text-lmu-loss';

const gap = (value: number | null) => (value !== null ? `+${value.toFixed(3)}` : '--');

/** The pace behind the best lap, in six figures: true pace, average, spread, consistency, theoretical best and clean laps. */
export const DriverTimingMetricsRow: React.FC<DriverTimingMetricsRowProps> = ({
  selectedDriver,
  top3Avg,
  top3DeltaToBest,
  avgLapTime,
  deltaToBest,
  lapStdDev,
  consistencyScore,
  cleanLapsCount,
  consistencyGroups,
  totalLapsCount,
  hasMultipleLaps,
  theoGap,
}) => {
  const groupsText = consistencyGroups?.map((g) => `${g.group} ${g.laps}`).join(' · ');

  return (
    <div className="grid grid-cols-6 gap-4">
      <SummaryStat
        label="True pace"
        value={top3Avg ? formatTime(top3Avg) : '--:--.---'}
        hint={`${gap(top3DeltaToBest)} to best`}
        title="Average of the 3 fastest clean flying laps"
      />
      <SummaryStat
        label="Average"
        value={avgLapTime ? formatTime(avgLapTime) : '--:--.---'}
        hint={`${gap(deltaToBest)} to best`}
        title="Average of clean flying laps"
      />
      <SummaryStat
        label="Spread"
        value={lapStdDev !== null ? `±${lapStdDev.toFixed(3)}` : '--'}
        hint="std dev"
        title={groupsText
          ? `Standard deviation of clean flying laps, measured within each condition (${groupsText})`
          : 'Standard deviation of clean flying laps'}
      />
      <SummaryStat
        label="Consistency"
        value={consistencyScore !== null ? `${consistencyScore.toFixed(1)}%` : '--'}
        valueClass={consistencyScore !== null ? consistencyClass(consistencyScore) : 'text-lmu-muted'}
        hint={groupsText ? <span data-testid="consistency-groups">Per condition: {groupsText}</span> : 'of clean laps'}
        title={groupsText
          ? `Pace consistency within each condition (${groupsText} clean laps): a change of conditions is not held against it`
          : 'Pace consistency rating based on clean lap standard deviation'}
      />
      <SummaryStat
        label="Theoretical"
        value={selectedDriver.theoreticalBestString}
        hint={<><span className="font-mono text-lmu-gain">{theoGap !== null && theoGap > 0 ? `-${theoGap.toFixed(3)}` : '0.000'}</span> potential</>}
        title="Best three sectors combined"
      />
      <SummaryStat
        label="Clean laps"
        value={<>{cleanLapsCount}<span className="text-lmu-muted font-normal"> / {totalLapsCount}</span></>}
        hint={hasMultipleLaps ? 'lap 1 excluded' : undefined}
        title={hasMultipleLaps ? 'Lap 1 (start or out-lap) is excluded from flying averages' : undefined}
      />
    </div>
  );
};
