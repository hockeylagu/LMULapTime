import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  type LegendPayload,
} from 'recharts';
import { formatTime } from '../../../../shared/domain/formatters.js';
import { LMU_COLORS, PACE_CHART_COLORS } from '../../../utils/themeColors.js';
import { ImprovementMetric } from './ImprovementChartControls.js';
import { ImprovementPaceTooltip } from './ImprovementPaceTooltip.js';
import { ImprovementPaceSeries } from './ImprovementPaceSeries.js';
import type { ImprovementChartPoint } from './improvementChartTypes.js';

export type {
  ImprovementChartPoint,
  ImprovementTooltipPayloadEntry,
} from './improvementChartTypes.js';

export interface ImprovementPaceChartProps {
  chartData: ImprovementChartPoint[];
  metric: ImprovementMetric;
  minTime: number;
  maxTime: number;
  activeTrack: string;
  selectedCarClass: string;
  selectedCarModel: string;
  filterType: string;
  activeRange: string;
  onSelectSession?: (sessionId: string) => void;
}

interface PersonalBestLegendProps {
  gradient: string;
  hidden: boolean;
  onToggle: () => void;
}

const PersonalBestLegend: React.FC<PersonalBestLegendProps> = ({ gradient, hidden, onToggle }) => (
  <div className="flex justify-center pt-3">
    <button
      type="button"
      aria-pressed={!hidden}
      onClick={event => { event.stopPropagation(); onToggle(); }}
      title="Click to toggle Personal Best Over Time visibility"
      className={`inline-flex items-center gap-1.5 cursor-pointer select-none rounded-sm focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${
        hidden ? 'line-through text-lmu-faint' : 'font-semibold text-lmu-text-soft'
      }`}
    >
      <span aria-hidden="true" className="w-5 h-[3px] rounded-full" style={{ backgroundImage: gradient }} />
      <span>Personal Best Over Time</span>
    </button>
  </div>
);

interface SeriesLegendProps {
  payload?: readonly LegendPayload[];
  hiddenSeries: Record<string, boolean>;
  onToggle: (entry: LegendPayload) => void;
}

const SeriesLegend: React.FC<SeriesLegendProps> = ({ payload, hiddenSeries, onToggle }) => (
  <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-3 text-[11px]">
    {payload?.map(entry => {
      const key = typeof entry.dataKey === 'function' ? '' : String(entry.dataKey ?? '');
      const hidden = Boolean(hiddenSeries[key]);
      return (
        <button key={key} type="button" aria-pressed={!hidden}
          title={`Click to toggle ${entry.value} visibility`}
          onClick={event => { event.stopPropagation(); onToggle(entry); }}
          className={`inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-lmu-accent-text focus-visible:outline-offset-2 ${hidden ? 'line-through text-lmu-faint' : 'font-semibold text-lmu-text-soft'}`}>
          <span aria-hidden="true" className="w-4 h-0 border-t-2" style={{ borderColor: entry.color }} />
          {entry.value}
        </button>
      );
    })}
  </div>
);

export const ImprovementPaceChart: React.FC<ImprovementPaceChartProps> = ({
  chartData,
  metric,
  minTime,
  maxTime,
  activeTrack,
  selectedCarClass,
  selectedCarModel,
  filterType,
  activeRange,
  onSelectSession,
}) => {
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const personalBestLegendGradient = `linear-gradient(to right, ${chartData
    .map((point, index) => {
      const color = point.personalBestBenchmarkCategory
        ? PACE_CHART_COLORS[point.personalBestBenchmarkCategory]
        : PACE_CHART_COLORS.Offline;
      const offset = chartData.length > 1 ? (index / (chartData.length - 1)) * 100 : 0;
      return `${color} ${offset}%`;
    })
    .join(', ')})`;

  const handleLegendClick = (e: LegendPayload) => {
    if (!e || !e.dataKey) return;
    const key = typeof e.dataKey === 'function' ? '' : String(e.dataKey);
    if (!key) return;
    setHiddenSeries((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (chartData.length === 0) {
    return (
      <div role="status" className="py-16 text-center text-lmu-muted">
        No session data found for this track matching current filters.
      </div>
    );
  }

  return (
    <div className="w-full h-[330px] min-h-[300px] pt-2">
      <ResponsiveContainer width="100%" height="100%" minHeight={270}>
        <LineChart
          key={`${activeTrack}-${selectedCarClass}-${selectedCarModel}-${filterType}-${activeRange}-${chartData.length}-${metric}`}
          data={chartData}
          margin={{ top: 10, right: 25, left: 10, bottom: 0 }}
          onClick={(state) => {
            if (!state) return;
            const stateObj = state as unknown as Record<string, unknown>;
            let sId: string | undefined;
            if (Array.isArray(stateObj.activePayload) && stateObj.activePayload.length > 0) {
              const item = stateObj.activePayload[0] as { payload?: ImprovementChartPoint };
              sId = item?.payload?.sessionId;
            } else if (typeof state.activeTooltipIndex === 'number' && chartData[state.activeTooltipIndex]) {
              sId = chartData[state.activeTooltipIndex].sessionId;
            }
            if (sId && onSelectSession) {
              onSelectSession(sId);
            }
          }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={LMU_COLORS.border} />
          <XAxis
            dataKey="chartKey"
            axisLine={false}
            tickLine={false}
            stroke={LMU_COLORS.muted}
            tick={{ fill: LMU_COLORS.muted, fontSize: 11 }}
            interval={chartData.length > 10 ? 'preserveStartEnd' : 0}
            height={chartData.length > 5 ? 40 : 25}
            angle={chartData.length > 5 ? -18 : 0}
            textAnchor={chartData.length > 5 ? 'end' : 'middle'}
            dy={chartData.length > 5 ? 4 : 0}
            tickFormatter={(val) => {
              const item = chartData.find((c) => c.chartKey === val);
              return item ? item.axisLabel ?? item.shortSession : val;
            }}
          />
          <YAxis
            domain={[minTime, maxTime]}
            axisLine={false}
            tickLine={false}
            stroke={LMU_COLORS.muted}
            tick={{ fill: LMU_COLORS.muted, fontSize: 11 }}
            tickFormatter={(val) => (metric === 'consistency' ? `${val}%` : formatTime(val))}
          />
          <Tooltip content={<ImprovementPaceTooltip metric={metric} onSelectSession={onSelectSession} />} />
          <Legend
            content={
              metric === 'bestPr' ? (
                <PersonalBestLegend
                  gradient={personalBestLegendGradient}
                  hidden={Boolean(hiddenSeries['bestPr'])}
                  onToggle={() => handleLegendClick({ dataKey: 'bestPr' } as LegendPayload)}
                />
              ) : <SeriesLegend hiddenSeries={hiddenSeries} onToggle={handleLegendClick} />
            }
          />
          <ImprovementPaceSeries
            metric={metric}
            chartData={chartData}
            onSelectSession={onSelectSession}
            hiddenSeries={hiddenSeries}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
