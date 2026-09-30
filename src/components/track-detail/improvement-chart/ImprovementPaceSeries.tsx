import React from 'react';
import { Line } from 'recharts';
import { LMU_COLORS, PACE_CHART_COLORS } from '../../../utils/themeColors.js';
import { ImprovementMetric } from './ImprovementChartControls.js';
import type { ImprovementChartPoint } from './improvementChartTypes.js';

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
    r={2}
    fill={payload?.personalBestBenchmarkCategory ? PACE_CHART_COLORS[payload.personalBestBenchmarkCategory] : PACE_CHART_COLORS.Offline}
    fillOpacity={payload?.personalBestImproved ? 1 : 0.25}
  />
);

const PersonalBestActiveDot: React.FC<PersonalBestDotProps> = ({ cx, cy, payload }) => {
  const color = payload?.personalBestBenchmarkCategory
    ? PACE_CHART_COLORS[payload.personalBestBenchmarkCategory]
    : PACE_CHART_COLORS.Offline;

  return <circle cx={cx} cy={cy} r={4} fill={color} stroke={color} strokeWidth={2} />;
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
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="bestLap"
          name="Best Lap Time"
          stroke={LMU_COLORS.accent}
          strokeWidth={2}
          dot={{ r: 2, fill: LMU_COLORS.accent, cursor: onSelectSession ? 'pointer' : 'default' }}
          activeDot={{ r: 4, cursor: onSelectSession ? 'pointer' : 'default' }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['bestLap'])}
        />
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="top3Avg"
          name="Top 3 Lap Avg (True Pace)"
          stroke={LMU_COLORS.blue}
          strokeWidth={2}
          dot={{ r: 2, fill: LMU_COLORS.blue, cursor: onSelectSession ? 'pointer' : 'default' }}
          activeDot={{ r: 4 }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['top3Avg'])}
        />
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="movingAvg"
          name="3-Session Moving Avg"
          stroke={LMU_COLORS.gold}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 2, fill: LMU_COLORS.gold }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['movingAvg'])}
        />
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="avgLap"
          name="Session Avg Lap"
          stroke={LMU_COLORS.cyan}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          dot={{ r: 2, fill: LMU_COLORS.cyan }}
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
        ? PACE_CHART_COLORS[point.personalBestBenchmarkCategory]
        : PACE_CHART_COLORS.Offline,
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
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="bestPr"
          name="Personal Best Over Time"
          stroke="url(#personalBestBenchmarkGradient)"
          strokeWidth={2}
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
      <Line isAnimationActive={false}
        type="monotone"
        dataKey="consistencyScore"
        name="Pace Consistency Rating (%)"
        stroke={LMU_COLORS.green}
        strokeWidth={2}
        dot={{ r: 2, fill: LMU_COLORS.green, cursor: onSelectSession ? 'pointer' : 'default' }}
        activeDot={{ r: 4 }}
        connectNulls={true}
        hide={Boolean(hiddenSeries['consistencyScore'])}
      />
    );
  }

  if (metric === 'sectors') {
    return (
      <>
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="s1"
          name="Sector 1"
          stroke={LMU_COLORS.gold}
          strokeWidth={2}
          dot={{ r: 2, fill: LMU_COLORS.gold }}
          activeDot={{ r: 4 }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['s1'])}
        />
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="s2"
          name="Sector 2"
          stroke={LMU_COLORS.blue}
          strokeWidth={2}
          dot={{ r: 2, fill: LMU_COLORS.blue }}
          activeDot={{ r: 4 }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['s2'])}
        />
        <Line isAnimationActive={false}
          type="monotone"
          dataKey="s3"
          name="Sector 3"
          stroke={LMU_COLORS.green}
          strokeWidth={2}
          dot={{ r: 2, fill: LMU_COLORS.green }}
          activeDot={{ r: 4 }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['s3'])}
        />
      </>
    );
  }

  return null;
};
