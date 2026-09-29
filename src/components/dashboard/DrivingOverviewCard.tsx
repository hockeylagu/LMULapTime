import React from 'react';
import { Calendar } from 'lucide-react';
import { getPaceCategoryStyle } from '../../utils/paceCategoryStyles.js';
import { PaceCategory } from '../../../shared/types/index.js';
import { SummaryCard, LEADER_VALUE } from './DashboardSummaryParts.js';

export interface DrivingOverviewCardProps {
  sessionsCount: number;
  totalLaps: number;
  totalDistanceKm: number;
  totalDrivingSeconds: number;
  uniqueCircuitsCount?: number;
  cleanLaps?: number;
  cleanLapsPercentage?: number;
  maxTopSpeed?: number;
  maxTopSpeedTrack?: string;
  averageBenchmarkPacePercentage?: number | null;
  averageBenchmarkPaceCategory?: PaceCategory | null;
  practiceSessionsCount?: number;
  qualifyingSessionsCount?: number;
  raceSessionsCount?: number;
  raceWinsCount?: number;
  racePodiumsCount?: number;
  totalPitStops?: number;
  showMore?: boolean;
  setShowMore?: (val: boolean | ((prev: boolean) => boolean)) => void;
}

/** Equator length, for the distance fun fact. */
const EARTH_CIRCUMFERENCE_KM = 40075;

const formatDrivingHours = (totalSec: number): string => {
  if (!totalSec || totalSec <= 0) return '0h';
  const hours = Math.floor(totalSec / 3600);
  return hours > 0 ? `${hours.toLocaleString()}h` : `${Math.floor(totalSec / 60)}m`;
};

/** Distance against a lap of the Earth: a share below one lap, a multiple above. */
export const earthFact = (km: number): string | null => {
  if (km < 100) return null;
  const laps = km / EARTH_CIRCUMFERENCE_KM;
  return laps < 1 ? `${Math.round(laps * 100)}%` : `${laps.toFixed(1)}×`;
};

const Figure: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="min-w-0">
    <div className={`${LEADER_VALUE} truncate`}>{value}</div>
    <div className="text-[10px] leading-5 uppercase tracking-wider text-lmu-text-soft font-semibold">{label}</div>
  </div>
);

/** One line of the card, laid out like the runner-up rows of the ranked cards so the four lists line up. */
const Row: React.FC<{ label: React.ReactNode; title?: string; children: React.ReactNode }> = ({ label, title, children }) => (
  <div className="flex items-center justify-between gap-2 text-xs py-1" title={title}>
    <span className="text-lmu-text-soft truncate min-w-0">{label}</span>
    <span className="font-mono text-[11px] text-lmu-text-soft tabular-nums shrink-0">{children}</span>
  </div>
);

export const DrivingOverviewCard: React.FC<DrivingOverviewCardProps> = ({
  sessionsCount,
  totalLaps,
  totalDistanceKm,
  totalDrivingSeconds,
  cleanLaps,
  cleanLapsPercentage,
  maxTopSpeed,
  maxTopSpeedTrack,
  averageBenchmarkPacePercentage,
  averageBenchmarkPaceCategory,
  practiceSessionsCount,
  qualifyingSessionsCount,
  raceSessionsCount,
  raceWinsCount,
  racePodiumsCount,
  totalPitStops,
  showMore = false,
  setShowMore,
}) => {
  const earth = earthFact(totalDistanceKm);
  const pace = getPaceCategoryStyle(averageBenchmarkPaceCategory);

  return (
    <SummaryCard
      icon={Calendar}
      title="Totals"
      footer={setShowMore ? { expanded: showMore, showAllLabel: 'Show All Driving Stats', onToggle: () => setShowMore(!showMore) } : null}
    >
      <div className="py-1">
        <div className="grid grid-cols-3 gap-3">
          <Figure value={totalLaps.toLocaleString()} label="Laps" />
          <Figure value={Math.round(totalDistanceKm).toLocaleString()} label="Km" />
          <Figure value={formatDrivingHours(totalDrivingSeconds)} label="Driving" />
        </div>
        <div className="text-[11px] leading-4 text-lmu-muted">{sessionsCount.toLocaleString()} sessions</div>
      </div>

      <div className="mt-2 border-t border-lmu-border/60 pt-1.5" data-testid="overview-fun-facts">
        {earth && <Row label="Around the Earth" title={`${Math.round(totalDistanceKm).toLocaleString()} km against a 40,075 km equator`}>{earth}</Row>}
        {maxTopSpeed && maxTopSpeed > 0 ? (
          <Row label={<>Top speed{maxTopSpeedTrack && <span className="text-lmu-muted"> · {maxTopSpeedTrack}</span>}</>} title={maxTopSpeedTrack}>
            {maxTopSpeed.toFixed(1)} <span className="text-lmu-muted">km/h</span>
          </Row>
        ) : null}
        {showMore && (
          <div className="max-h-48 overflow-y-auto custom-scrollbar pr-0.5">
            <Row label="Clean flying laps" title={`${(cleanLaps ?? 0).toLocaleString()} valid laps out of ${totalLaps.toLocaleString()} total laps`}>
              {(cleanLaps ?? 0).toLocaleString()} ({cleanLapsPercentage ?? 0}%)
            </Row>
            <Row label="Avg benchmark pace" title="Average benchmark pace percentage across your best laps">
              {averageBenchmarkPacePercentage ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className={pace.textClass} title={pace.label}>
                    <span className="block w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                  </span>
                  {averageBenchmarkPacePercentage.toFixed(1)}%
                </span>
              ) : 'N/A'}
            </Row>
            <Row label="Race wins · podiums" title={`${raceWinsCount ?? 0} Wins, ${racePodiumsCount ?? 0} Podiums across ${raceSessionsCount ?? 0} Races`}>
              {raceWinsCount ?? 0}W · {racePodiumsCount ?? 0}P
            </Row>
            <Row label="Sessions" title={`${practiceSessionsCount ?? 0} Practice, ${qualifyingSessionsCount ?? 0} Qualifying, ${raceSessionsCount ?? 0} Race`}>
              {practiceSessionsCount ?? 0}P · {qualifyingSessionsCount ?? 0}Q · {raceSessionsCount ?? 0}R
            </Row>
            <Row label="Pit stops" title="Total in-laps and pit stops serviced">
              {(totalPitStops ?? 0).toLocaleString()}
            </Row>
          </div>
        )}
      </div>
    </SummaryCard>
  );
};
