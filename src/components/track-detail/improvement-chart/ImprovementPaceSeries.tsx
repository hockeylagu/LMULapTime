import React from 'react';
import { Line } from 'recharts';
import { ImprovementMetric } from './ImprovementChartControls.js';

export interface ImprovementPaceSeriesProps {
  metric: ImprovementMetric;
  onSelectSession?: (sessionId: string) => void;
  hiddenSeries: Record<string, boolean>;
}

export const ImprovementPaceSeries: React.FC<ImprovementPaceSeriesProps> = ({
  metric,
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

  if (metric === 'theoretical') {
    return (
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
          hide={Boolean(hiddenSeries['bestLap'])}
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
          hide={Boolean(hiddenSeries['movingAvg'])}
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
          hide={Boolean(hiddenSeries['theoretical'])}
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
