import React from 'react';
import { TrendingUp, Calendar } from 'lucide-react';
import { TimeRangeFilter } from '../ImprovementChart';

export type ImprovementMetric = 'bestLap' | 'sectors' | 'theoretical' | 'consistency';

export interface ImprovementChartControlsProps {
  activeTrack: string;
  displayedSessionsCount: number;
  totalSessionsCount: number;
  activeRange: TimeRangeFilter;
  setRange: (range: TimeRangeFilter) => void;
  metric: ImprovementMetric;
  setMetric: (metric: ImprovementMetric) => void;
}

export const ImprovementChartControls: React.FC<ImprovementChartControlsProps> = ({
  activeTrack,
  displayedSessionsCount,
  totalSessionsCount,
  activeRange,
  setRange,
  metric,
  setMetric,
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-lmu-border/50">
      <div>
        <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-lmu-accent" />
          <span>Progression Timeline — {activeTrack}</span>
        </h3>
        <span className="text-xs text-lmu-muted">
          Displaying {displayedSessionsCount} of {totalSessionsCount} recorded sessions
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Range & Session Count Selector */}
        <div className="flex items-center gap-1.5 bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white shrink-0">
          <Calendar className="w-3.5 h-3.5 text-lmu-accent" />
          <span className="text-lmu-muted font-medium">History:</span>
          <select
            value={activeRange}
            onChange={(e) => setRange(e.target.value as TimeRangeFilter)}
            className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
          >
            <optgroup label="Session Count" className="bg-lmu-card text-white font-semibold">
              <option value="all" className="bg-lmu-card text-white">All Sessions ({totalSessionsCount})</option>
              <option value="last-5" className="bg-lmu-card text-white">Last 5 Sessions</option>
              <option value="last-10" className="bg-lmu-card text-white">Last 10 Sessions</option>
              <option value="last-20" className="bg-lmu-card text-white">Last 20 Sessions</option>
            </optgroup>
            <optgroup label="Date Range" className="bg-lmu-card text-white font-semibold">
              <option value="week" className="bg-lmu-card text-white">Last Week (7 Days)</option>
              <option value="month" className="bg-lmu-card text-white">Last Month (30 Days)</option>
              <option value="year" className="bg-lmu-card text-white">Last Year (365 Days)</option>
            </optgroup>
          </select>
        </div>

        {/* Metric Toggle */}
        <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium flex-wrap">
          <button
            type="button"
            onClick={() => setMetric('bestLap')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              metric === 'bestLap' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            Lap Pace (Best, Top 3 & Trends)
          </button>
          <button
            type="button"
            onClick={() => setMetric('sectors')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              metric === 'sectors' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            Sectors (S1/S2/S3)
          </button>
          <button
            type="button"
            onClick={() => setMetric('theoretical')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              metric === 'theoretical' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            Theoretical Best
          </button>
          <button
            type="button"
            onClick={() => setMetric('consistency')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              metric === 'consistency' ? 'bg-lmu-accent text-white font-bold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            Consistency Rating (%)
          </button>
        </div>
      </div>
    </div>
  );
};
