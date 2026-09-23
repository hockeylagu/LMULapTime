import React from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { RankBadge } from '../common';
import { getPaceCategoryStyle } from '../../utils/paceCategory';
import { PaceCategory } from '../../../server/core/types';

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
  const formatTotalDrivingTime = (totalSec: number): string => {
    if (!totalSec || totalSec <= 0) return '0h 00m';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    }
    return `${minutes}m ${Math.floor(totalSec % 60)}s`;
  };

  return (
    <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
        <p className="text-xs font-bold text-lmu-green uppercase tracking-wider flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-lmu-green" />
          <span>Driving Overview {showMore && '(9 Stats)'}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-lmu-green font-mono font-bold">
            {sessionsCount.toLocaleString()} Sessions
          </span>
        </div>
      </div>

      <div className={`space-y-1.5 flex-1 ${showMore ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
        {/* #1 Total Laps */}
        <div className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group">
          <div className="flex items-center gap-1.5 truncate">
            <RankBadge rank={1} firstPlaceColor="text-lmu-green" />
            <span className="text-white font-medium truncate group-hover:text-lmu-green transition-colors">
              Total Laps Driven
            </span>
          </div>
          <span className="text-lmu-green font-mono font-bold text-[11px] shrink-0">
            {totalLaps.toLocaleString()} laps
          </span>
        </div>

        {/* #2 Distance Driven */}
        <div className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group">
          <div className="flex items-center gap-1.5 truncate">
            <RankBadge rank={2} />
            <span className="text-white font-medium truncate group-hover:text-lmu-cyan transition-colors">
              Distance Driven
            </span>
          </div>
          <span className="text-lmu-muted font-mono text-[11px] shrink-0">
            {Math.round(totalDistanceKm).toLocaleString()} km
          </span>
        </div>

        {/* #3 Driving Time */}
        <div className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group">
          <div className="flex items-center gap-1.5 truncate">
            <RankBadge rank={3} />
            <span className="text-white font-medium truncate group-hover:text-lmu-gold transition-colors">
              Driving Time
            </span>
          </div>
          <span className="text-lmu-muted font-mono text-[11px] shrink-0">
            {formatTotalDrivingTime(totalDrivingSeconds)}
          </span>
        </div>

        {/* Additional metrics shown in expanded mode */}
        {showMore && (
          <>
            {/* #4 Clean Flying Laps */}
            <div
              className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={`${(cleanLaps ?? 0).toLocaleString()} valid laps out of ${totalLaps.toLocaleString()} total laps`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={4} />
                <span className="text-white font-medium truncate group-hover:text-emerald-400 transition-colors">
                  Clean Flying Laps
                </span>
              </div>
              <span className="text-emerald-400 font-mono text-[11px] shrink-0 font-semibold">
                {(cleanLaps ?? 0).toLocaleString()} ({cleanLapsPercentage ?? 0}%)
              </span>
            </div>

            {/* #5 Top Speed */}
            <div
              className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={maxTopSpeedTrack ? `Set at ${maxTopSpeedTrack}` : undefined}
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={5} />
                <span className="text-white font-medium truncate group-hover:text-sky-400 transition-colors">
                  Top Speed Recorded
                </span>
              </div>
              <span className="text-sky-400 font-mono text-[11px] shrink-0 font-semibold">
                {maxTopSpeed && maxTopSpeed > 0 ? `${maxTopSpeed.toFixed(1)} km/h` : 'N/A'}
              </span>
            </div>

            {/* #6 Average Benchmark Pace */}
            <div
              className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title="Average benchmark pace percentage across your best laps"
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={6} />
                <span className="text-white font-medium truncate group-hover:text-slate-300 transition-colors">
                  Avg Benchmark Pace
                </span>
              </div>
              {averageBenchmarkPacePercentage ? (
                <span className={`${getPaceCategoryStyle(averageBenchmarkPaceCategory).textClass} font-mono text-[11px] shrink-0 font-semibold`}>
                  {averageBenchmarkPacePercentage.toFixed(1)}% {getPaceCategoryStyle(averageBenchmarkPaceCategory).emoji}
                </span>
              ) : (
                <span className="text-slate-300 font-mono text-[11px] shrink-0">N/A</span>
              )}
            </div>

            {/* #7 Race Podiums & Wins */}
            <div
              className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={`${raceWinsCount ?? 0} Wins, ${racePodiumsCount ?? 0} Podiums across ${raceSessionsCount ?? 0} Races`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={7} />
                <span className="text-white font-medium truncate group-hover:text-lmu-gold transition-colors">
                  Race Podiums & Wins
                </span>
              </div>
              <span className="text-lmu-gold font-mono text-[11px] shrink-0 font-semibold">
                {raceWinsCount ?? 0}W • {racePodiumsCount ?? 0}P
              </span>
            </div>

            {/* #8 Session Types */}
            <div
              className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={`${practiceSessionsCount ?? 0} Practice, ${qualifyingSessionsCount ?? 0} Qualifying, ${raceSessionsCount ?? 0} Race`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={8} />
                <span className="text-white font-medium truncate group-hover:text-slate-300 transition-colors">
                  Session Breakdown
                </span>
              </div>
              <span className="text-slate-300 font-mono text-[11px] shrink-0">
                {practiceSessionsCount ?? 0}P • {qualifyingSessionsCount ?? 0}Q • {raceSessionsCount ?? 0}R
              </span>
            </div>

            {/* #9 Pit Stops */}
            <div
              className="flex items-center justify-between text-xs hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title="Total in-laps and pit stops serviced"
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge rank={9} />
                <span className="text-white font-medium truncate group-hover:text-slate-300 transition-colors">
                  Pit Stops Serviced
                </span>
              </div>
              <span className="text-slate-300 font-mono text-[11px] shrink-0">
                {(totalPitStops ?? 0).toLocaleString()} stops
              </span>
            </div>
          </>
        )}
      </div>

      {setShowMore && (
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="w-full text-center text-[10px] text-lmu-muted hover:text-lmu-green font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
        >
          <span>{showMore ? 'Show Top 3 Only' : 'Show All Driving Stats'}</span>
          <ChevronDown className={`w-3 h-3 transform transition-transform ${showMore ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};
