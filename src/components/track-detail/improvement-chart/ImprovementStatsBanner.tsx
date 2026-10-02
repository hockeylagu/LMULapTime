import React from 'react';

import { formatTime } from '../../../../shared/domain/formatters.js';
import { PaceBadge } from '../../common/index.js';
import { PaceCategory } from '../../../../shared/types/index.js';

export interface ImprovementStatsBannerProps {
  trackDataCount: number;
  selectedCarModel: string;
  selectedCarClass: string;
  yourBest?: {
    timeStr: string;
    paceCat?: PaceCategory | null;
    pacePct?: number | null;
  };
  bestLapTimeInTrack: number | null;
  totalImprovement: number | null;
  firstValidSessionBestLap: number | null;
  sessionsWithValidLapsCount: number;
  top3Improvement: number | null;
  bestTop3: number | null;
  latestTheoreticalGap: number | null;
  qualifyingAveragePosition?: number | null;
  finishAveragePosition?: number | null;
}

function formatAveragePosition(position: number | null | undefined): string {
  if (position === null || position === undefined) return '--';
  return `P${Number.isInteger(position) ? position : position.toFixed(1)}`;
}

export const ImprovementStatsBanner: React.FC<ImprovementStatsBannerProps> = ({
  trackDataCount,
  selectedCarModel,
  selectedCarClass,
  yourBest,
  bestLapTimeInTrack,
  totalImprovement,
  firstValidSessionBestLap,
  sessionsWithValidLapsCount,
  top3Improvement,
  bestTop3,
  latestTheoreticalGap,
  qualifyingAveragePosition,
  finishAveragePosition,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="bg-lmu-card border border-lmu-border p-4 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Total Sessions</p>
          <p className="text-xl font-semibold text-lmu-text font-mono mt-0.5">{trackDataCount}</p>
          <p className="text-[11px] text-lmu-muted mt-0.5">
            {selectedCarModel !== 'All' ? `${selectedCarModel}` : `${selectedCarClass === 'All' ? 'All Classes' : selectedCarClass}`}
          </p>
        </div>
      </div>

      <div className="bg-lmu-card border border-lmu-border p-4 rounded-xl flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Positions</p>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Quali Avg Pos</p>
              <p className="text-xl font-semibold text-lmu-text-soft font-mono">
                {formatAveragePosition(qualifyingAveragePosition)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Finish Avg Pos</p>
              <p className="text-xl font-semibold text-lmu-text-soft font-mono">
                {formatAveragePosition(finishAveragePosition)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-lmu-card border border-lmu-border p-4 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">
            Your Best ({selectedCarModel !== 'All' ? selectedCarModel : selectedCarClass === 'All' ? 'Overall' : selectedCarClass})
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <p className="text-xl font-semibold text-lmu-personal-best font-mono">
              {yourBest?.timeStr || (bestLapTimeInTrack ? formatTime(bestLapTimeInTrack) : '--:--.---')}
            </p>
          </div>
          {yourBest?.paceCat && (
            <div className="mt-1">
              <PaceBadge
                category={yourBest.paceCat}
                percentage={yourBest.pacePct}
                showPercentage={true}
                size="xs"
              />
            </div>
          )}
        </div>
      </div>

      <div className="bg-lmu-card border border-lmu-border p-4 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Overall Pace Improvement</p>
          <p
            className={`text-xl font-semibold mt-0.5 font-mono ${
              totalImprovement !== null && totalImprovement > 0 ? 'text-lmu-gain' : 'text-white'
            }`}
          >
            {totalImprovement !== null
              ? `${totalImprovement > 0 ? '-' : '+'}${Math.abs(totalImprovement).toFixed(3)}s`
              : sessionsWithValidLapsCount === 1
              ? '0.000s'
              : 'N/A'}
          </p>
          <p className="text-[11px] text-lmu-muted mt-0.5">
            {sessionsWithValidLapsCount > 1 && totalImprovement !== null && totalImprovement > 0
              ? `Baseline ${formatTime(firstValidSessionBestLap)} → PB ${formatTime(bestLapTimeInTrack)}`
              : sessionsWithValidLapsCount === 1
              ? 'Initial baseline session recorded'
              : 'Session progression tracking'}
          </p>
        </div>
      </div>

      <div className="bg-lmu-card border border-lmu-border p-4 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">Top 3 Lap True Pace</p>
          <p
            className={`text-xl font-semibold mt-0.5 font-mono ${
              top3Improvement !== null && top3Improvement > 0 ? 'text-lmu-gain' : 'text-white'
            }`}
          >
            {top3Improvement !== null
              ? `${top3Improvement > 0 ? '-' : '+'}${Math.abs(top3Improvement).toFixed(3)}s`
              : bestTop3
              ? formatTime(bestTop3)
              : 'N/A'}
          </p>
          <p className="text-[11px] text-lmu-muted mt-0.5">
            {bestTop3
              ? `Best 3-Lap: ${formatTime(bestTop3)}${
                  latestTheoreticalGap !== null ? ` • Opt: +${latestTheoreticalGap.toFixed(3)}s` : ''
                }`
              : 'Multi-lap pace consistency'}
          </p>
        </div>
      </div>
    </div>
  );
};
