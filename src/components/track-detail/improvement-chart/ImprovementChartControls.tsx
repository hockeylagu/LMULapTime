import React from 'react';
import { TrendingUp, Calendar } from 'lucide-react';
import { Select } from '../../common/dropdown/Select.js';
export type TimeRangeFilter = 'all' | 'last-5' | 'last-10' | 'last-20' | 'week' | 'month' | 'year';

export type ImprovementMetric = 'bestLap' | 'sectors' | 'bestPr' | 'consistency';

export interface ImprovementChartControlsProps {
  activeTrack: string;
  totalSessionsCount: number;
  activeRange: TimeRangeFilter;
  setRange: (range: TimeRangeFilter) => void;
  metric: ImprovementMetric;
  setMetric: (metric: ImprovementMetric) => void;
  personalBestEnabled: boolean;
}

export const ImprovementChartControls: React.FC<ImprovementChartControlsProps> = ({
  activeTrack: _activeTrack,
  totalSessionsCount,
  activeRange,
  setRange,
  metric,
  setMetric,
  personalBestEnabled,
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-lmu-border/50">
      <div>
        <h3 className="text-base font-semibold text-lmu-text flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-lmu-muted" />
          <span>Progression Timeline</span>
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Range & Session Count Selector */}
        <Select<TimeRangeFilter>
          aria-label="Progression history"
          value={activeRange}
          onChange={setRange}
          icon={<Calendar aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-lmu-muted" />}
          caption="History:"
          className="shrink-0"
          options={[
            { group: 'Session Count', options: [
              { value: 'all', label: `All Sessions (${totalSessionsCount})` },
              { value: 'last-5', label: 'Last 5 Sessions' },
              { value: 'last-10', label: 'Last 10 Sessions' },
              { value: 'last-20', label: 'Last 20 Sessions' },
            ] },
            { group: 'Date Range', options: [
              { value: 'week', label: 'Last Week (7 Days)' },
              { value: 'month', label: 'Last Month (30 Days)' },
              { value: 'year', label: 'Last Year (365 Days)' },
            ] },
          ]}
        />

        {/* Metric Toggle */}
        <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-medium flex-wrap">
          <button
            type="button"
            aria-pressed={metric === 'bestLap'}
            onClick={() => setMetric('bestLap')}
            className={`px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${
              metric === 'bestLap' ? 'bg-lmu-raised text-lmu-text font-semibold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            Lap Pace (Best, Top 3 & Trends)
          </button>
          <button
            type="button"
            aria-pressed={metric === 'sectors'}
            onClick={() => setMetric('sectors')}
            className={`px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${
              metric === 'sectors' ? 'bg-lmu-raised text-lmu-text font-semibold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            Sectors
          </button>
          <button
            type="button"
            aria-pressed={metric === 'bestPr'}
            onClick={() => setMetric('bestPr')}
            disabled={!personalBestEnabled}
            className={`px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${
              metric === 'bestPr'
                ? 'bg-lmu-raised text-lmu-text font-semibold'
                : personalBestEnabled
                ? 'text-lmu-muted hover:text-white'
                : 'text-lmu-faint cursor-not-allowed'
            }`}
            title={personalBestEnabled ? undefined : 'Select a specific car class to view personal-best progression'}
          >
            Personal Best Over Time
          </button>
          <button
            type="button"
            aria-pressed={metric === 'consistency'}
            onClick={() => setMetric('consistency')}
            className={`px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${
              metric === 'consistency' ? 'bg-lmu-raised text-lmu-text font-semibold' : 'text-lmu-muted hover:text-white'
            }`}
          >
            Consistency Rating (%)
          </button>
        </div>
      </div>
    </div>
  );
};
