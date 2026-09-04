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

export interface ImprovementPaceChartProps {
  chartData: any[];
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      const seen = new Set<string>();
      const uniqueEntries = payload.filter((entry: any) => {
        if (entry.value === null || entry.value === undefined || isNaN(Number(entry.value))) {
          return false;
        }
        const key = String(entry.dataKey || entry.name || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return (
        <div className="bg-lmu-card/95 backdrop-blur-md border border-lmu-border p-3.5 rounded-xl shadow-xl space-y-2 text-xs min-w-[210px]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-white text-sm">{data.session}</span>
              {data.weather && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-lmu-bg border border-lmu-border/60 text-lmu-cyan">
                  {data.weather}
                </span>
              )}
            </div>
            <p className="text-[11px] text-lmu-muted mt-0.5">{data.fullDate}</p>
            <p className="text-xs text-lmu-gold font-medium mt-0.5 truncate max-w-[200px]" title={data.car}>
              {data.car}
            </p>
          </div>

          {uniqueEntries.length > 0 && (
            <div className="border-t border-lmu-border/60 pt-2 space-y-1">
              {uniqueEntries.map((entry: any, index: number) => (
                <div key={`item-${index}`} className="flex items-center justify-between text-xs font-mono">
                  <span style={{ color: entry.color }} className="font-sans font-medium text-[11px]">
                    {entry.name}:
                  </span>
                  <span className="font-bold text-white">
                    {entry.dataKey === 'consistencyScore'
                      ? `${Number(entry.value).toFixed(1)}%`
                      : formatTime(Number(entry.value))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px] text-lmu-muted border-t border-lmu-border/40 font-mono">
            {data.top3AvgStr && (
              <span title="Average of 3 fastest valid laps in session">
                Top 3: <strong className="text-cyan-300 font-mono">{data.top3AvgStr}</strong>
              </span>
            )}
            {data.theoreticalGap !== null && (
              <span title="Gap between actual PB and theoretical best">
                Opt Gap: <strong className="text-emerald-300 font-mono">+{data.theoreticalGap.toFixed(3)}s</strong>
              </span>
            )}
            {data.consistencyScore !== null && (
              <span title="Pace consistency rating">
                Consist: <strong className="text-emerald-300 font-mono">{data.consistencyScore.toFixed(1)}%</strong>
              </span>
            )}
          </div>

          {onSelectSession && (
            <p className="text-[10px] text-lmu-accent pt-1.5 border-t border-lmu-border/40 text-center font-semibold cursor-pointer hover:underline">
              Click dot to view session telemetry &rarr;
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[360px] min-h-[330px] pt-2">
      <ResponsiveContainer width="100%" height="100%" minHeight={300}>
        <LineChart
          key={`${activeTrack}-${selectedCarClass}-${selectedCarModel}-${filterType}-${activeRange}-${chartData.length}-${metric}`}
          data={chartData}
          margin={{ top: 10, right: 25, left: 10, bottom: chartData.length > 5 ? 35 : 15 }}
          onClick={(e: any) => {
            if (e && e.activePayload && e.activePayload.length > 0) {
              const sId = e.activePayload[0].payload.sessionId;
              if (sId && onSelectSession) {
                onSelectSession(sId);
              }
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
          <Tooltip content={<CustomTooltip />} />
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
