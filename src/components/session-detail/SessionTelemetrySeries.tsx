import React from 'react';
import { Line } from 'recharts';
import { DetailedSession, DriverData } from '../../../server/types.js';
import { OPPONENT_COLORS, PLAYER_HIGHLIGHT_COLOR } from './sessionDetailHelpers.js';

export interface SessionTelemetrySeriesProps {
  activeChartMetric: 'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions';
  driversToPlot: DriverData[];
  session: DetailedSession;
  avgLapTime: number | null;
  avgS1: number | null;
  avgS2: number | null;
  avgS3: number | null;
  hasVirtualEnergyData: boolean;
  hiddenSeries: Record<string, boolean>;
}

export const SessionTelemetrySeries: React.FC<SessionTelemetrySeriesProps> = ({
  activeChartMetric,
  driversToPlot,
  session,
  avgLapTime,
  avgS1,
  avgS2,
  avgS3,
  hasVirtualEnergyData,
  hiddenSeries,
}) => {
  if (activeChartMetric === 'positions') {
    return (
      <>
        {driversToPlot.map((d, idx) => {
          const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
          const color = isPlayer ? PLAYER_HIGHLIGHT_COLOR : OPPONENT_COLORS[idx % OPPONENT_COLORS.length];
          return (
            <Line
              key={d.name}
              type="monotone"
              dataKey={d.name}
              name={isPlayer ? `${d.name} (You)` : d.name}
              stroke={color}
              strokeWidth={isPlayer ? 3.5 : 1.8}
              dot={isPlayer ? { r: 4, fill: color } : { r: 2.5, fill: color }}
              activeDot={{ r: isPlayer ? 6 : 4, stroke: '#fff', strokeWidth: 1.5 }}
              connectNulls={true}
              hide={Boolean(hiddenSeries[d.name])}
            />
          );
        })}
      </>
    );
  }

  if (activeChartMetric === 'lapTime') {
    return (
      <>
        <Line
          type="monotone"
          dataKey="lapTime"
          name="Lap Time"
          stroke="#E53E3E"
          strokeWidth={3}
          dot={{ r: 4, fill: '#E53E3E', strokeWidth: 2, stroke: '#FFFFFF' }}
          activeDot={{ r: 7 }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['lapTime'])}
        />
        {avgLapTime !== null && (
          <Line
            type="monotone"
            dataKey="avgLapTime"
            name="Session Avg Lap"
            stroke="#A78BFA"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls={true}
            hide={Boolean(hiddenSeries['avgLapTime'])}
          />
        )}
      </>
    );
  }

  if (activeChartMetric === 'sectors') {
    return (
      <>
        <Line type="monotone" dataKey="s1" name="Sector 1" stroke="#ECC94B" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} hide={Boolean(hiddenSeries['s1'])} />
        <Line type="monotone" dataKey="s2" name="Sector 2" stroke="#3182CE" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} hide={Boolean(hiddenSeries['s2'])} />
        <Line type="monotone" dataKey="s3" name="Sector 3" stroke="#38A169" strokeWidth={2} dot={{ r: 3 }} connectNulls={true} hide={Boolean(hiddenSeries['s3'])} />
        {avgS1 !== null && <Line type="monotone" dataKey="avgS1" name="Avg S1" stroke="#ECC94B" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls={true} hide={Boolean(hiddenSeries['avgS1'])} />}
        {avgS2 !== null && <Line type="monotone" dataKey="avgS2" name="Avg S2" stroke="#3182CE" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls={true} hide={Boolean(hiddenSeries['avgS2'])} />}
        {avgS3 !== null && <Line type="monotone" dataKey="avgS3" name="Avg S3" stroke="#38A169" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls={true} hide={Boolean(hiddenSeries['avgS3'])} />}
      </>
    );
  }

  if (activeChartMetric === 'topSpeed') {
    return (
      <Line type="monotone" dataKey="topSpeed" name="Top Speed (km/h)" stroke="#E53E3E" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={true} hide={Boolean(hiddenSeries['topSpeed'])} />
    );
  }

  if (activeChartMetric === 'tireWear') {
    return (
      <>
        <Line type="monotone" dataKey="twFL" name="FL Tire" stroke="#38BDF8" strokeWidth={2} dot={{ r: 2.5 }} connectNulls={true} hide={Boolean(hiddenSeries['twFL'])} />
        <Line type="monotone" dataKey="twFR" name="FR Tire" stroke="#818CF8" strokeWidth={2} dot={{ r: 2.5 }} connectNulls={true} hide={Boolean(hiddenSeries['twFR'])} />
        <Line type="monotone" dataKey="twRL" name="RL Tire" stroke="#FB923C" strokeWidth={2} dot={{ r: 2.5 }} connectNulls={true} hide={Boolean(hiddenSeries['twRL'])} />
        <Line type="monotone" dataKey="twRR" name="RR Tire" stroke="#F472B6" strokeWidth={2} dot={{ r: 2.5 }} connectNulls={true} hide={Boolean(hiddenSeries['twRR'])} />
        <Line type="monotone" dataKey="twAvg" name="Avg Tread" stroke="#4ADE80" strokeWidth={2.5} strokeDasharray="4 4" dot={{ r: 3 }} connectNulls={true} hide={Boolean(hiddenSeries['twAvg'])} />
      </>
    );
  }

  if (activeChartMetric === 'fuelEnergy') {
    return (
      <>
        <Line type="monotone" dataKey="fuel" name="Fuel Tank %" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={true} hide={Boolean(hiddenSeries['fuel'])} />
        {hasVirtualEnergyData && (
          <Line type="monotone" dataKey="virtualEnergy" name="Virtual Energy %" stroke="#8B5CF6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={true} hide={Boolean(hiddenSeries['virtualEnergy'])} />
        )}
      </>
    );
  }

  return null;
};
