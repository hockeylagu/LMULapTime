import React from 'react';
import { Trophy } from 'lucide-react';
import { formatTime } from '../../utils/formatters.js';
import { PaceBadge, SectorSplitsRow } from '../common';
import { PaceCategory } from '../../../server/types.js';

export interface TrackSummaryItem {
  trackVenue: string;
  sessionsCount: number;
  totalLaps: number;
  bestLapTime: number | null;
  bestLapDriver: string;
  bestLapCar: string;
  bestLapClass?: string;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  carsUsed: string[];
  lastSessionTimestamp?: number;
}

interface TrackSummaryCardProps {
  track: TrackSummaryItem;
  paceInfo: { category: PaceCategory; pct: number } | null;
  onSelectTrack: (trackName: string) => void;
}

export const TrackSummaryCard: React.FC<TrackSummaryCardProps> = ({
  track: t,
  paceInfo,
  onSelectTrack,
}) => {
  return (
    <div
      onClick={() => onSelectTrack(t.trackVenue)}
      className="glass-panel glass-panel-hover p-5 rounded-2xl cursor-pointer space-y-4 flex flex-col justify-between"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 mr-2">
            <h3 className="text-lg font-bold text-white tracking-wide truncate" title={t.trackVenue}>
              {t.trackVenue}
            </h3>
            <p className="text-xs text-lmu-muted mt-0.5 truncate">
              {t.sessionsCount} Sessions • {t.totalLaps} Total Laps
            </p>
          </div>
          <span className="p-2 rounded-xl bg-lmu-gold/10 text-lmu-gold border border-lmu-gold/20">
            <Trophy className="w-5 h-5" />
          </span>
        </div>

        {/* Best Lap vs Theoretical */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-lmu-border/60">
          <div className="bg-lmu-bg/60 p-3 rounded-xl border border-lmu-border/50 flex flex-col justify-between">
            <div>
              <p className="text-xs text-lmu-muted font-semibold uppercase">Session Best</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <h4 className="text-xl font-extrabold text-lmu-gold font-mono">
                  {formatTime(t.bestLapTime)}
                </h4>
                {paceInfo && (
                  <PaceBadge category={paceInfo.category} />
                )}
              </div>
              <p className="text-[11px] text-lmu-muted mt-1 truncate">
                {t.bestLapCar || 'Car'}
              </p>
            </div>
          </div>

          <div className="bg-lmu-bg/60 p-3 rounded-xl border border-lmu-border/50">
            <p className="text-xs text-lmu-muted font-semibold uppercase">Theoretical Best</p>
            <h4 className="text-xl font-extrabold text-lmu-green font-mono mt-0.5">
              {formatTime(t.theoreticalBest)}
            </h4>
            <p className="text-[11px] text-lmu-muted mt-1">
              Optimal S1 + S2 + S3
            </p>
          </div>
        </div>

        {/* Sector Splits */}
        <SectorSplitsRow s1={t.bestS1} s2={t.bestS2} s3={t.bestS3} />
      </div>

      {/* Cars driven */}
      {t.carsUsed.length > 0 && (
        <div className="pt-2 flex flex-wrap gap-1 border-t border-lmu-border/40">
          {t.carsUsed.slice(0, 4).map(car => (
            <span
              key={car}
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-lmu-card text-lmu-muted border border-lmu-border"
            >
              {car}
            </span>
          ))}
          {t.carsUsed.length > 4 && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-lmu-card text-lmu-muted">
              +{t.carsUsed.length - 4} more
            </span>
          )}
        </div>
      )}
    </div>
  );
};
