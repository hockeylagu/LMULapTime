import React from 'react';
import { DetailedSession, DriverData } from '../../../server/types.js';

export interface SessionTelemetryTooltipProps {
  active?: boolean;
  payload?: any[];
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
        isPit: data[`${d.name}_isPit`],
        isOutLap: data[`${d.name}_isOutLap`],
        lapTime: data[`${d.name}_lapTime`],
      }))
      .filter((d) => d.pos !== undefined && d.pos > 0)
      .sort((a, b) => (a.pos || 999) - (b.pos || 999));

    return (
      <div className="bg-lmu-card/95 backdrop-blur border border-lmu-border p-3 rounded-xl shadow-xl text-xs space-y-2 font-mono min-w-[240px]">
        <div className="font-bold text-white flex items-center justify-between border-b border-lmu-border/60 pb-1 font-sans">
          <span>{data.lapNum}</span>
          <span className="text-[10px] text-lmu-muted uppercase font-semibold">
            {selectedDriver.carClass || 'Class'} Standings
          </span>
        </div>
        <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-0.5">
          {sortedDrivers.map((d) => (
            <div
              key={d.name}
              className={`flex items-center justify-between gap-3 p-1 rounded transition-colors ${
                d.isPlayer ? 'bg-lmu-gold/20 text-lmu-gold font-bold border border-lmu-gold/40' : 'text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className={`font-mono text-xs font-extrabold shrink-0 ${d.isPlayer ? 'text-lmu-gold' : 'text-slate-300'}`}>
                  P{d.pos}
                </span>
                <span className="truncate">{d.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[11px]">
                {d.isPit ? (
                  <span className="text-amber-400 font-bold text-[10px]">PIT</span>
                ) : d.isOutLap ? (
                  <span className="text-cyan-400 font-semibold text-[10px]">OUT</span>
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
        {data.isPitStop && <span className="text-amber-400 font-bold text-[10px]">PIT STOP</span>}
        {data.isOutLap && <span className="text-cyan-400 font-semibold text-[10px]">OUT LAP</span>}
        {!data.isPitStop && !data.isOutLap && !data.isValid && (
          <span className="text-rose-400 text-[10px]">INVALID</span>
        )}
      </p>
      {activeChartMetric === 'lapTime' && (
        <>
          <p className="text-rose-400 font-bold">
            Lap Time: {data.lapTimeString || '--:--.---'}
            {data.isInferred && <span className="text-amber-300 font-normal ml-1">(est)</span>}
          </p>
          {data.avgLapTime && <p className="text-indigo-300">Session Avg: {data.avgLapTimeString}</p>}
        </>
      )}
      {activeChartMetric === 'sectors' && (
        <>
          <p className="text-lmu-gold">S1: {data.s1String}</p>
          <p className="text-lmu-blue">S2: {data.s2String}</p>
          <p className="text-lmu-green">S3: {data.s3String}</p>
        </>
      )}
      {activeChartMetric === 'topSpeed' && (
        <p className="text-lmu-accent font-bold">Top Speed: {data.topSpeed ? `${data.topSpeed.toFixed(1)} km/h` : '-'}</p>
      )}
      {activeChartMetric === 'tireWear' && (
        <>
          <p className="text-white font-bold">FL: {data.twFL !== null ? `${data.twFL}%` : '-'}</p>
          <p className="text-white font-bold">FR: {data.twFR !== null ? `${data.twFR}%` : '-'}</p>
          <p className="text-white font-bold">RL: {data.twRL !== null ? `${data.twRL}%` : '-'}</p>
          <p className="text-white font-bold">RR: {data.twRR !== null ? `${data.twRR}%` : '-'}</p>
          <p className="text-lmu-cyan font-bold">Avg: {data.twAvg !== null ? `${data.twAvg}%` : '-'}</p>
        </>
      )}
      {activeChartMetric === 'fuelEnergy' && (
        <>
          {data.fuel !== null && <p className="text-amber-400">Fuel: {data.fuel.toFixed(1)}%</p>}
          {data.virtualEnergy !== null && <p className="text-indigo-400">Virtual Energy: {data.virtualEnergy.toFixed(1)}%</p>}
        </>
      )}
    </div>
  );
};
