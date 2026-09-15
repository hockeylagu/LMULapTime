import React from 'react';
import { Line } from 'recharts';
import type { PaceCategory } from '../../../../server/core/types.js';
import { ImprovementMetric } from './ImprovementChartControls.js';
import type { ImprovementChartPoint } from './ImprovementPaceChart.js';

export const BENCHMARK_COLORS: Record<PaceCategory, string> = {
  Alien: '#A855F7',
  Competitive: '#F59E0B',
  Good: '#10B981',
  Midpack: '#38BDF8',
  'Tail-ender': '#F97316',
  Offline: '#A1A1AA',
};

export interface ImprovementPaceSeriesProps {
  metric: ImprovementMetric;
  chartData: ImprovementChartPoint[];
  onSelectSession?: (sessionId: string) => void;
  hiddenSeries: Record<string, boolean>;
}

interface PersonalBestDotProps {
  cx?: number;
  cy?: number;
  payload?: ImprovementChartPoint;
}

const PersonalBestDot: React.FC<PersonalBestDotProps> = ({ cx, cy, payload }) => (
  <circle
    cx={cx}
    cy={cy}
    r={5}
    fill={payload?.personalBestBenchmarkCategory ? BENCHMARK_COLORS[payload.personalBestBenchmarkCategory] : BENCHMARK_COLORS.Offline}
    fillOpacity={payload?.personalBestImproved ? 1 : 0.25}
  />
);

const PersonalBestActiveDot: React.FC<PersonalBestDotProps> = ({ cx, cy, payload }) => {
  const color = payload?.personalBestBenchmarkCategory
    ? BENCHMARK_COLORS[payload.personalBestBenchmarkCategory]
    : BENCHMARK_COLORS.Offline;

  return <circle cx={cx} cy={cy} r={8} fill={color} stroke={color} strokeWidth={2} />;
};

export const ImprovementPaceSeries: React.FC<ImprovementPaceSeriesProps> = ({
  metric,
  chartData,
  onSelectSession,
  hiddenSeries,
}) => {
  if (metric === 'bestLap') {
    return (
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
          hide={Boolean(hiddenSeries['bestLap'])}
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
          hide={Boolean(hiddenSeries['top3Avg'])}
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
          hide={Boolean(hiddenSeries['movingAvg'])}
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
          hide={Boolean(hiddenSeries['avgLap'])}
        />
      </>
    );
  }

  if (metric === 'bestPr') {
    const gradientStops = chartData.map((point, index) => ({
      offset: `${chartData.length > 1 ? (index / (chartData.length - 1)) * 100 : 0}%`,
      color: point.personalBestBenchmarkCategory
        ? BENCHMARK_COLORS[point.personalBestBenchmarkCategory]
        : BENCHMARK_COLORS.Offline,
    }));

    return (
      <>
        <defs>
          <linearGradient id="personalBestBenchmarkGradient" x1="0" y1="0" x2="1" y2="0">
            {gradientStops.map((stop) => (
              <stop key={`${stop.offset}-${stop.color}`} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <Line
          type="monotone"
          dataKey="bestPr"
          name="Personal Best Over Time"
          stroke="url(#personalBestBenchmarkGradient)"
          strokeWidth={3}
          dot={<PersonalBestDot />}
          activeDot={<PersonalBestActiveDot />}
          connectNulls={true}
          hide={Boolean(hiddenSeries['bestPr'])}
        />
      </>
    );
  }

  if (metric === 'consistency') {
    return (
      <Line
        type="monotone"
        dataKey="consistencyScore"
        name="Pace Consistency Rating (%)"
        stroke="#10B981"
        strokeWidth={3}
        dot={{ r: 5, fill: '#10B981', cursor: onSelectSession ? 'pointer' : 'default' }}
        activeDot={{ r: 8 }}
        connectNulls={true}
        hide={Boolean(hiddenSeries['consistencyScore'])}
      />
    );
  }

  if (metric === 'sectors') {
    return (
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
          hide={Boolean(hiddenSeries['s1'])}
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
          hide={Boolean(hiddenSeries['s2'])}
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
          hide={Boolean(hiddenSeries['s3'])}
        />
      </>
    );
  }

  return null;
};
