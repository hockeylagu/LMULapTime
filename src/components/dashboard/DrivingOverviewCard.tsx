import React from 'react';
import { Calendar } from 'lucide-react';
import { RankBadge } from '../common';

export interface DrivingOverviewCardProps {
  sessionsCount: number;
  totalLaps: number;
  totalDistanceKm: number;
  totalDrivingSeconds: number;
  uniqueCircuitsCount: number;
}

export const DrivingOverviewCard: React.FC<DrivingOverviewCardProps> = ({
  sessionsCount,
  totalLaps,
  totalDistanceKm,
  totalDrivingSeconds,
  uniqueCircuitsCount,
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
          <span>Driving Overview</span>
        </p>
        <span className="text-[10px] text-lmu-green font-mono font-bold">
          {sessionsCount.toLocaleString()} Sessions
        </span>
      </div>

      <div className="space-y-1.5 flex-1">
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
      </div>

      <div className="w-full text-center text-[10px] text-lmu-muted font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1">
        <span>Across {uniqueCircuitsCount} Unique Circuits</span>
      </div>
    </div>
  );
};
