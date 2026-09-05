import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { formatTime } from '../../utils/formatters';
import { ImprovementMetric } from './ImprovementChartControls';
import { ImprovementPaceTooltip } from './ImprovementPaceTooltip.js';

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
          <Legend wrapperStyle={{ paddingTop: '15px' }} />

          {metric === 'bestLap' && (
            <>
              <Line
                type="monotone"
                dataKey="bestLap"
                name="Best Lap Time"
                stroke="#E63946"
                strokeWidth={3}
                dot={{ r: 5, fill: '#E63946', cursor: onSelectSession ? 'pointer' : 'default' }}
                activeDot={{ r: 8, cursor: onSelectSession ? 'pointer' : 'default' }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="top3Avg"
                name="Top 3 Lap Avg (True Pace)"
                stroke="#06B6D4"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#06B6D4', cursor: onSelectSession ? 'pointer' : 'default' }}
                activeDot={{ r: 7 }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="movingAvg"
                name="3-Session Moving Avg"
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3.5, fill: '#F59E0B' }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="avgLap"
                name="Session Avg Lap"
                stroke="#8ECAE6"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={{ r: 3, fill: '#8ECAE6' }}
                connectNulls={true}
              />
            </>
          )}

          {metric === 'theoretical' && (
            <>
              <Line
                type="monotone"
                dataKey="bestLap"
                name="Actual Best Lap"
                stroke="#E63946"
                strokeWidth={3}
                dot={{ r: 5, cursor: onSelectSession ? 'pointer' : 'default' }}
                activeDot={{ r: 8, cursor: onSelectSession ? 'pointer' : 'default' }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="movingAvg"
                name="3-Session Moving Avg"
                stroke="#F59E0B"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 3.5, fill: '#F59E0B' }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="theoretical"
                name="Theoretical Best (S1+S2+S3)"
                stroke="#2A9D8F"
                strokeWidth={3}
                strokeDasharray="3 3"
                dot={{ r: 5, fill: '#2A9D8F' }}
                connectNulls={true}
              />
            </>
          )}

          {metric === 'consistency' && (
            <Line
              type="monotone"
              dataKey="consistencyScore"
              name="Pace Consistency Rating (%)"
              stroke="#10B981"
              strokeWidth={3}
              dot={{ r: 5, fill: '#10B981', cursor: onSelectSession ? 'pointer' : 'default' }}
              activeDot={{ r: 8 }}
              connectNulls={true}
            />
          )}

          {metric === 'sectors' && (
            <>
              <Line
                type="monotone"
                dataKey="s1"
                name="Sector 1"
                stroke="#FFB703"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#FFB703' }}
                activeDot={{ r: 7 }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="s2"
                name="Sector 2"
                stroke="#219EBC"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#219EBC' }}
                activeDot={{ r: 7 }}
                connectNulls={true}
              />
              <Line
                type="monotone"
                dataKey="s3"
                name="Sector 3"
                stroke="#2A9D8F"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#2A9D8F' }}
                activeDot={{ r: 7 }}
                connectNulls={true}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
