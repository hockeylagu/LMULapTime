import React from 'react';
import { DetailedSession, DriverData } from '../../../../shared/types/index.js';
import { LapStatusBadge } from '../../common/index.js';
import { LMU_COLORS, SECTOR_COLORS, TELEMETRY_COLORS, WHEEL_CORNER_COLORS } from '../../../utils/themeColors.js';

/** The series' line color as a short stroke before its value; the text stays white so it reads on the dark card. */
const Swatch: React.FC<{ color: string; dashed?: boolean }> = ({ color, dashed }) => (
  <span
    aria-hidden="true"
    className="inline-block w-2.5 mr-1.5 align-middle border-t-2"
    style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}
  />
);

export interface SessionTelemetryPointData {
  lapNum?: string;
  isPitStop?: boolean;
  isOutLap?: boolean;
  isValid?: boolean;
  isInferred?: boolean;
  lapTimeString?: string;
  avgLapTime?: number;
  avgLapTimeString?: string;
  s1String?: string;
  s2String?: string;
  s3String?: string;
  topSpeed?: number | null;
  twFL?: number | null;
  twFR?: number | null;
  twRL?: number | null;
  twRR?: number | null;
  twAvg?: number | null;
  fuel?: number | null;
  virtualEnergy?: number | null;
  [key: string]: unknown;
}

export interface SessionTelemetryTooltipEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
  payload: SessionTelemetryPointData;
}

export interface SessionTelemetryTooltipProps {
  active?: boolean;
  payload?: SessionTelemetryTooltipEntry[];
  activeChartMetric: 'lapTime' | 'sectors' | 'topSpeed' | 'tireWear' | 'fuelEnergy' | 'positions';
  driversToPlot: DriverData[];
  session: DetailedSession;
  selectedDriver: DriverData;
}

export const SessionTelemetryTooltip: React.FC<SessionTelemetryTooltipProps> = ({
  active,
  payload,
  activeChartMetric,
  driversToPlot,
  session,
  selectedDriver,
}) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  if (activeChartMetric === 'positions') {
    const sortedDrivers = driversToPlot
      .map((d) => ({
        name: d.name,
        pos: data[d.name] as number | undefined,
        overallPos: data[`${d.name}_overallPos`] as number | undefined,
        isPlayer: Boolean(d.isPlayer || (session.playerDriver && d.name === session.playerDriver.name)),
        isPit: Boolean(data[`${d.name}_isPit`]),
        isOutLap: Boolean(data[`${d.name}_isOutLap`]),
        lapTime: data[`${d.name}_lapTime`] as string | undefined,
      }))
      .filter((d) => d.pos !== undefined && d.pos > 0)
      .sort((a, b) => (a.pos || 999) - (b.pos || 999));

    return (
      <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-2 font-mono min-w-[240px]">
        <div className="font-bold text-white flex items-center justify-between border-b border-lmu-border/60 pb-1 font-sans">
          <span>{data.lapNum}</span>
          <span className="text-[10px] text-lmu-muted uppercase tracking-wider font-semibold">
            {selectedDriver.carClass || 'Class'} Standings
          </span>
        </div>
        <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-0.5">
          {sortedDrivers.map((d) => (
            <div
              key={d.name}
              className={`flex items-center justify-between gap-3 p-1 rounded transition-colors ${
                d.isPlayer ? 'bg-lmu-accent/15 text-white font-bold border border-lmu-accent/40' : 'text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className={`font-mono text-xs font-extrabold shrink-0 ${d.isPlayer ? 'text-lmu-accent-text' : 'text-lmu-text-soft'}`}>
                  P{d.pos}
                </span>
                <span className="truncate">{d.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[11px]">
                {d.isPit ? (
                  <LapStatusBadge isPitStop size="xs" />
                ) : d.isOutLap ? (
                  <LapStatusBadge isOutLap size="xs" />
                ) : (
                  <span>{d.lapTime || '-'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono">
      <p className="font-bold text-white border-b border-lmu-border/60 pb-1 flex items-center justify-between gap-3 font-sans">
        <span>{data.lapNum}</span>
        {data.isPitStop ? (
          <LapStatusBadge isPitStop size="xs" />
        ) : data.isOutLap ? (
          <LapStatusBadge isOutLap size="xs" />
        ) : !data.isValid ? (
          <LapStatusBadge isValid={data.isValid} isInferred={data.isInferred} size="xs" />
        ) : null}
      </p>
      {activeChartMetric === 'lapTime' && (
        <>
          <p className="text-white font-bold">
            <Swatch color={LMU_COLORS.accent} />Lap Time: {data.lapTimeString || '--:--.---'}
            {data.isInferred && <span className="text-lmu-warn-soft font-normal ml-1">(est)</span>}
          </p>
          {data.avgLapTime && <p className="text-lmu-text-soft"><Swatch color={LMU_COLORS.muted} dashed />Session Avg: {data.avgLapTimeString}</p>}
        </>
      )}
      {activeChartMetric === 'sectors' && (
        <>
          <p className="text-white"><Swatch color={SECTOR_COLORS.s1} />S1: {data.s1String}</p>
          <p className="text-white"><Swatch color={SECTOR_COLORS.s2} />S2: {data.s2String}</p>
          <p className="text-white"><Swatch color={SECTOR_COLORS.s3} />S3: {data.s3String}</p>
        </>
      )}
      {activeChartMetric === 'topSpeed' && (
        <p className="text-white font-bold"><Swatch color={LMU_COLORS.accent} />Top Speed: {data.topSpeed ? `${data.topSpeed.toFixed(1)} km/h` : '-'}</p>
      )}
      {activeChartMetric === 'tireWear' && (
        <>
          <p className="text-white font-bold"><Swatch color={WHEEL_CORNER_COLORS.fl} />FL: {data.twFL !== null ? `${data.twFL}%` : '-'}</p>
          <p className="text-white font-bold"><Swatch color={WHEEL_CORNER_COLORS.fr} />FR: {data.twFR !== null ? `${data.twFR}%` : '-'}</p>
          <p className="text-white font-bold"><Swatch color={WHEEL_CORNER_COLORS.rl} />RL: {data.twRL !== null ? `${data.twRL}%` : '-'}</p>
          <p className="text-white font-bold"><Swatch color={WHEEL_CORNER_COLORS.rr} />RR: {data.twRR !== null ? `${data.twRR}%` : '-'}</p>
          <p className="text-lmu-text-soft font-bold"><Swatch color={LMU_COLORS.muted} dashed />Avg: {data.twAvg !== null ? `${data.twAvg}%` : '-'}</p>
        </>
      )}
      {activeChartMetric === 'fuelEnergy' && (
        <>
          {data.fuel !== null && data.fuel !== undefined && <p className="text-white"><Swatch color={TELEMETRY_COLORS.fuel} />Fuel: {data.fuel.toFixed(1)}%</p>}
          {data.virtualEnergy !== null && data.virtualEnergy !== undefined && <p className="text-white"><Swatch color={WHEEL_CORNER_COLORS.fl} />Virtual Energy: {data.virtualEnergy.toFixed(1)}%</p>}
        </>
      )}
    </div>
  );
};
