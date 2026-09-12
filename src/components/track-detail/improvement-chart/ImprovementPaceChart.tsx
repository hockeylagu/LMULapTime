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
import { formatTime } from '../../../utils/formatters.js';
import { ImprovementMetric } from './ImprovementChartControls.js';
import { ImprovementPaceTooltip } from './ImprovementPaceTooltip.js';
import { ImprovementPaceSeries } from './ImprovementPaceSeries.js';

export interface ImprovementChartPoint {
  chartKey: string;
  shortSession: string;
  fullDate: string;
  sessionId: string;
  session: string;
  car: string;
  weather?: string;
  bestLap: number | null;
  top3Avg: number | null;
  top3AvgStr: string | null;
  movingAvg: number | null;
  avgLap: number | null;
  theoretical: number | null;
  theoreticalGap: number | null;
  consistencyScore: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  lapStr: string;
  theoreticalStr: string;
  avgLapStr: string;
  cleanLaps: number;
  replay?: string;
}

export interface ImprovementTooltipPayloadEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
  payload: ImprovementChartPoint;
}

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
      <div className="py-16 text-center text-lmu-muted">
        No session data found for this track matching current filters.
      </div>
    );
  }

  return (
    <div className="w-full h-[360px] min-h-[330px] pt-2">
      <ResponsiveContainer width="100%" height="100%" minHeight={300}>
        <LineChart
          key={`${activeTrack}-${selectedCarClass}-${selectedCarModel}-${filterType}-${activeRange}-${chartData.length}-${metric}`}
          data={chartData}
          margin={{ top: 10, right: 25, left: 10, bottom: chartData.length > 5 ? 35 : 15 }}
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
          <CartesianGrid strokeDasharray="3 3" stroke="#232A36" />
          <XAxis
            dataKey="chartKey"
            stroke="#8D99AE"
            tick={{ fill: '#8D99AE', fontSize: 11 }}
            interval={chartData.length > 10 ? 'preserveStartEnd' : 0}
            height={chartData.length > 5 ? 40 : 25}
            angle={chartData.length > 5 ? -18 : 0}
            textAnchor={chartData.length > 5 ? 'end' : 'middle'}
            dy={chartData.length > 5 ? 4 : 0}
            tickFormatter={(val) => {
              const item = chartData.find((c) => c.chartKey === val);
              return item ? item.shortSession : val;
            }}
          />
          <YAxis
            domain={[minTime, maxTime]}
            stroke="#8D99AE"
            tick={{ fill: '#8D99AE', fontSize: 12 }}
            tickFormatter={(val) => (metric === 'consistency' ? `${val}%` : formatTime(val))}
          />
          <Tooltip content={<ImprovementPaceTooltip onSelectSession={onSelectSession} />} />
          <Legend
            onClick={handleLegendClick}
            wrapperStyle={{ paddingTop: '15px', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
            formatter={(value, entry: LegendPayload) => {
              const key = typeof entry.dataKey === 'function' ? '' : String(entry.dataKey || '');
              const isHidden = Boolean(hiddenSeries[key]);
              return (
                <span
                  className={`inline-flex items-center gap-1 cursor-pointer select-none transition-opacity ${
                    isHidden ? 'opacity-35 line-through text-lmu-muted' : 'opacity-100 font-semibold'
                  }`}
                  title={`Click to toggle ${value} visibility`}
                >
                  {value}
                </span>
              );
            }}
          />
          <ImprovementPaceSeries
            metric={metric}
            onSelectSession={onSelectSession}
            hiddenSeries={hiddenSeries}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
