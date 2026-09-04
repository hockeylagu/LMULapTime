import React from 'react';
import { Zap, ChevronDown } from 'lucide-react';
import { RankBadge } from '../common';
import { getPaceCategoryStyle } from '../../utils/paceCategory';
import { PaceCategory } from '../../../server/types';

export interface BestRefLapInfo {
  sessionId?: string;
  percentage: number;
  category: PaceCategory;
  lapTimeString: string;
  track: string;
  car: string;
}

export interface BenchmarkLapsSummaryCardProps {
  rankedRefLaps: BestRefLapInfo[];
  visibleRefLaps: BestRefLapInfo[];
  showMoreBenchmarks: boolean;
  setShowMoreBenchmarks: (val: boolean | ((prev: boolean) => boolean)) => void;
  onSelectSession: (id: string) => void;
}

export const BenchmarkLapsSummaryCard: React.FC<BenchmarkLapsSummaryCardProps> = ({
  rankedRefLaps,
  visibleRefLaps,
  showMoreBenchmarks,
  setShowMoreBenchmarks,
  onSelectSession,
}) => {
  return (
    <div className="glass-panel p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-2 mb-2">
        <p className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-purple-400" />
          <span>Benchmarks {rankedRefLaps.length > 3 && `(${visibleRefLaps.length}/${rankedRefLaps.length})`}</span>
        </p>
        {rankedRefLaps.length > 3 && (
          <button
            type="button"
            onClick={() => setShowMoreBenchmarks(!showMoreBenchmarks)}
            className="text-[10px] text-purple-300 hover:text-white font-semibold transition-colors flex items-center gap-0.5"
          >
            <span>{showMoreBenchmarks ? 'Show Less' : `+${rankedRefLaps.length - 3} More`}</span>
            <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreBenchmarks ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className={`space-y-1.5 flex-1 ${showMoreBenchmarks ? 'max-h-60 overflow-y-auto custom-scrollbar pr-0.5' : ''}`}>
        {visibleRefLaps.length > 0 ? (
          visibleRefLaps.map((item, idx) => (
            <div
              key={item.sessionId || item.track}
              onClick={() => {
                if (item.sessionId) onSelectSession(item.sessionId);
              }}
              className="flex items-center justify-between text-xs cursor-pointer hover:bg-lmu-card/60 p-1.5 rounded-lg transition-all group"
              title={`Open session details for ${item.track}`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <RankBadge
                  rank={idx + 1}
                  color={(r) =>
                    r === 1
                      ? 'text-purple-300'
                      : r === 2
                      ? 'text-purple-400'
                      : r === 3
                      ? 'text-purple-500'
                      : 'text-lmu-muted'
                  }
                />
                <span className="text-white font-medium truncate max-w-[110px] group-hover:text-purple-300 transition-colors">
                  {item.track}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-purple-300 font-mono font-bold text-[11px]">
                  {item.percentage.toFixed(1)}%
                </span>
                <span className="text-[10px]">{getPaceCategoryStyle(item.category).emoji}</span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-lmu-muted">No benchmark lap data</p>
        )}
      </div>

      {rankedRefLaps.length > 3 && (
        <button
          type="button"
          onClick={() => setShowMoreBenchmarks(!showMoreBenchmarks)}
          className="w-full text-center text-[10px] text-lmu-muted hover:text-purple-300 font-semibold pt-2 mt-1 border-t border-lmu-border/30 transition-colors flex items-center justify-center gap-1"
        >
          <span>{showMoreBenchmarks ? 'Show Top 3 Only' : `Show All ${rankedRefLaps.length} Benchmark Laps`}</span>
          <ChevronDown className={`w-3 h-3 transform transition-transform ${showMoreBenchmarks ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
};
