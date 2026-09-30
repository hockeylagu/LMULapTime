import React from 'react';
import { Line } from 'recharts';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { CHART_COLORS, LMU_COLORS, SECTOR_COLORS, TELEMETRY_COLORS, WHEEL_CORNER_COLORS } from '../../../utils/themeColors.js';

const SECTORS = [
  { key: 's1', avg: 'avgS1', name: 'Sector 1', avgValue: 's1' },
  { key: 's2', avg: 'avgS2', name: 'Sector 2', avgValue: 's2' },
  { key: 's3', avg: 'avgS3', name: 'Sector 3', avgValue: 's3' },
] as const;

/** Each tyre in its wheel-corner color, as in the replay telemetry. */
const TIRES = [
  { key: 'twFL', name: 'FL Tire', corner: 'fl' },
  { key: 'twFR', name: 'FR Tire', corner: 'fr' },
  { key: 'twRL', name: 'RL Tire', corner: 'rl' },
  { key: 'twRR', name: 'RR Tire', corner: 'rr' },
] as const;

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
  /** The driver whose legend name is hovered on the positions chart. */
  focusedSeries?: string | null;
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
  focusedSeries = null,
}) => {
  if (activeChartMetric === 'positions') {
    // You in red (identity), the field in one neutral line; a hovered legend name lifts that driver out of the field.
    return (
      <>
        {driversToPlot.map((d) => {
          const isPlayer = Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name));
          const isFocused = focusedSeries === d.name;
          const faded = focusedSeries !== null && !isFocused && !isPlayer;
          const color = isPlayer ? LMU_COLORS.accent : isFocused ? CHART_COLORS.white : LMU_COLORS.muted;
          return (
            <Line
              key={d.name}
              type="monotone"
              dataKey={d.name}
              name={isPlayer ? `${d.name} (You)` : d.name}
              stroke={color}
              strokeWidth={isPlayer ? 2.5 : isFocused ? 2 : 1.25}
              strokeOpacity={isPlayer || isFocused ? 1 : faded ? 0.15 : 0.45}
              dot={isPlayer ? { r: 2.5, fill: color, strokeWidth: 0 } : false}
              activeDot={isPlayer || isFocused ? { r: 4.5, fill: color, stroke: CHART_COLORS.white, strokeWidth: 1.5 } : false}
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
          stroke={LMU_COLORS.accent}
          strokeWidth={2}
          dot={{ r: 2.5, fill: LMU_COLORS.accent, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: LMU_COLORS.accent, stroke: CHART_COLORS.white, strokeWidth: 1.5 }}
          connectNulls={true}
          hide={Boolean(hiddenSeries['lapTime'])}
        />
        {avgLapTime !== null && (
          <Line
            type="monotone"
            dataKey="avgLapTime"
            name="Session Avg Lap"
            stroke={LMU_COLORS.muted}
            strokeWidth={1.5}
            strokeDasharray="4 4"
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
        {SECTORS.map(({ key, avg, name, avgValue }) => {
          const color = SECTOR_COLORS[key];
          const average = { s1: avgS1, s2: avgS2, s3: avgS3 }[avgValue];
          return (
            <React.Fragment key={key}>
              <Line type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={1.75} dot={{ r: 2, fill: color, strokeWidth: 0 }} activeDot={{ r: 4, fill: color, stroke: CHART_COLORS.white, strokeWidth: 1.5 }} connectNulls={true} hide={Boolean(hiddenSeries[key])} />
              {average !== null && (
                <Line type="monotone" dataKey={avg} name={`Avg ${key.toUpperCase()}`} stroke={color} strokeOpacity={0.6} strokeWidth={1} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={true} hide={Boolean(hiddenSeries[avg])} />
              )}
            </React.Fragment>
          );
        })}
      </>
    );
  }

  if (activeChartMetric === 'topSpeed') {
    return (
      <Line type="monotone" dataKey="topSpeed" name="Top Speed (km/h)" stroke={LMU_COLORS.accent} strokeWidth={2} dot={{ r: 2.5, fill: LMU_COLORS.accent, strokeWidth: 0 }} connectNulls={true} hide={Boolean(hiddenSeries['topSpeed'])} />
    );
  }

  if (activeChartMetric === 'tireWear') {
    return (
      <>
        {TIRES.map(({ key, name, corner }) => (
          <Line key={key} type="monotone" dataKey={key} name={name} stroke={WHEEL_CORNER_COLORS[corner]} strokeWidth={1.75} dot={{ r: 2, fill: WHEEL_CORNER_COLORS[corner], strokeWidth: 0 }} connectNulls={true} hide={Boolean(hiddenSeries[key])} />
        ))}
        <Line type="monotone" dataKey="twAvg" name="Avg Tread" stroke={LMU_COLORS.muted} strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={true} hide={Boolean(hiddenSeries['twAvg'])} />
      </>
    );
  }

  if (activeChartMetric === 'fuelEnergy') {
    return (
      <>
        <Line type="monotone" dataKey="fuel" name="Fuel Tank %" stroke={TELEMETRY_COLORS.fuel} strokeWidth={2} dot={{ r: 2, fill: TELEMETRY_COLORS.fuel, strokeWidth: 0 }} connectNulls={true} hide={Boolean(hiddenSeries['fuel'])} />
        {hasVirtualEnergyData && (
          <Line type="monotone" dataKey="virtualEnergy" name="Virtual Energy %" stroke={WHEEL_CORNER_COLORS.fl} strokeWidth={2} dot={{ r: 2, fill: WHEEL_CORNER_COLORS.fl, strokeWidth: 0 }} connectNulls={true} hide={Boolean(hiddenSeries['virtualEnergy'])} />
        )}
      </>
    );
  }

  return null;
};
