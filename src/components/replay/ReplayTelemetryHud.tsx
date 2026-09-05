import React from 'react';
import { ReplayTelemetryPoint } from '../../../server/types.js';

export interface ReplayTelemetryHudProps {
  currentPoint?: ReplayTelemetryPoint | null;
}

export const ReplayTelemetryHud: React.FC<ReplayTelemetryHudProps> = ({ currentPoint }) => {
  const currentGear = currentPoint?.speedKmh && currentPoint.speedKmh > 5
    ? Math.min(7, Math.floor(currentPoint.speedKmh / 38) + 1)
    : 1;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 shrink-0">
      {/* Speed & Gear */}
      <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center justify-between">
        <span className="text-[9px] text-sky-400 font-bold">SPEED</span>
        <div className="flex items-baseline gap-1">
          <span className="text-xs font-black text-white font-mono">{currentPoint?.speedKmh ?? 0}</span>
          <span className="text-[8px] text-lmu-muted">km/h</span>
        </div>
        <span className="text-[8px] text-cyan-400 font-mono font-bold">
          GEAR {currentGear}
        </span>
      </div>

      {/* Throttle */}
      <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center transition-all ${
        currentPoint?.tcActive ? 'border-amber-500/70 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.25)]' : 'border-lmu-border'
      }`}>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-emerald-400 font-bold">THR</span>
          {currentPoint?.tcActive && (
            <span className="px-1 py-0.2 rounded text-[8px] font-black bg-amber-500 text-black animate-pulse">
              TC
            </span>
          )}
        </div>
        <span className="text-xs font-black text-emerald-400 font-mono">{(currentPoint?.throttle ?? 0).toFixed(0)}%</span>
        <span className="text-[8px] text-lmu-muted">{currentPoint?.tcActive ? 'tc active' : 'pedal'}</span>
      </div>

      {/* Brake */}
      <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center transition-all ${
        currentPoint?.absActive ? 'border-cyan-500/70 bg-cyan-500/10 shadow-[0_0_8px_rgba(6,182,212,0.25)]' : 'border-lmu-border'
      }`}>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-rose-400 font-bold">BRK</span>
          {currentPoint?.absActive && (
            <span className="px-1 py-0.2 rounded text-[8px] font-black bg-cyan-400 text-black animate-pulse">
              ABS
            </span>
          )}
        </div>
        <span className="text-xs font-black text-rose-400 font-mono">{(currentPoint?.brake ?? 0).toFixed(0)}%</span>
        <span className="text-[8px] text-lmu-muted">{currentPoint?.absActive ? 'abs active' : 'pedal'}</span>
      </div>

      {/* Steering */}
      <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center">
        <span className="text-[9px] text-indigo-400 font-bold">STEER</span>
        <span className="text-xs font-black text-indigo-400 font-mono">{Math.abs(currentPoint?.steerYaw ?? 0)}°</span>
        <span className="text-[8px] text-lmu-muted">{(currentPoint?.steerYaw ?? 0) < -5 ? 'L' : (currentPoint?.steerYaw ?? 0) > 5 ? 'R' : 'C'}</span>
      </div>

      {/* RPM */}
      <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center">
        <span className="text-[9px] text-amber-400 font-bold">RPM</span>
        <span className="text-xs font-black text-white font-mono">{currentPoint?.rpm ? (currentPoint.rpm / 1000).toFixed(1) + 'k' : '-'}</span>
        <span className="text-[8px] text-lmu-muted">engine</span>
      </div>

      {/* Status / Track State */}
      <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center justify-center transition-all ${
        currentPoint?.pitLimiter
          ? 'border-fuchsia-500/70 bg-fuchsia-500/15 shadow-[0_0_8px_rgba(217,70,239,0.3)] animate-pulse'
          : currentPoint?.isOffTrack
          ? 'border-amber-500/70 bg-amber-500/15 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
          : currentPoint?.inPit
          ? 'border-blue-500/50 bg-blue-500/10'
          : 'border-lmu-border'
      }`}>
        <span className="text-[9px] text-purple-400 font-bold">STATUS</span>
        <span className={`text-[11px] font-black font-mono truncate ${
          currentPoint?.pitLimiter
            ? 'text-fuchsia-300'
            : currentPoint?.isOffTrack
            ? 'text-amber-300'
            : currentPoint?.inPit
            ? 'text-blue-300'
            : 'text-lmu-muted'
        }`}>
          {currentPoint?.pitLimiter ? 'LIMITER' : currentPoint?.isOffTrack ? 'OFF TRACK' : currentPoint?.inPit ? 'PIT LANE' : 'ON TRACK'}
        </span>
        <span className="text-[8px] text-lmu-muted">
          {currentPoint?.pitLimiter ? '60 km/h' : currentPoint?.isOffTrack ? 'limits cut' : currentPoint?.inPit ? 'in pits' : 'green'}
        </span>
      </div>
    </div>
  );
};
