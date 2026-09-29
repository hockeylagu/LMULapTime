import React from 'react';
import { ReplayTelemetryPoint } from '../../../../shared/types/index.js';
import { getSteerPercent } from '../../../../shared/domain/formatters.js';

export interface ReplayTelemetryHudProps {
  currentPoint?: ReplayTelemetryPoint | null;
}

export const ReplayTelemetryHud: React.FC<ReplayTelemetryHudProps> = React.memo(({ currentPoint }) => {
  const currentGear = Math.min(7, Math.max(1, currentPoint?.gear ?? 1));

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 shrink-0">
      {/* Speed & Gear */}
      <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center justify-between">
        <span className="text-[10px] text-lmu-info font-bold">SPEED</span>
        <div className="flex items-baseline gap-1">
          <span className="text-xs font-black text-white font-mono">{currentPoint?.speedKmh ?? 0}</span>
          <span className="text-[10px] text-lmu-muted">km/h</span>
        </div>
        <span className="text-[10px] text-lmu-aqua font-mono font-bold">
          GEAR {currentGear}
        </span>
      </div>

      {/* Throttle */}
      <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center transition-colors ${
        currentPoint?.tcActive ? 'border-lmu-warn-strong/70 bg-lmu-warn-strong/10 shadow-[0_0_8px_rgba(245,158,11,0.25)]' : 'border-lmu-border'
      }`}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-lmu-gain font-bold">THR</span>
          {currentPoint?.tcActive && (
            <span className="px-1 py-0.2 rounded text-[10px] font-black bg-lmu-warn-strong text-black animate-pulse">
              TC
            </span>
          )}
        </div>
        <span className="text-xs font-black text-lmu-gain font-mono">{(currentPoint?.throttle ?? 0).toFixed(0)}%</span>
        <span className="text-[10px] text-lmu-muted">{currentPoint?.tcActive ? 'tc active' : 'pedal'}</span>
      </div>

      {/* Brake */}
      <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center transition-colors ${
        currentPoint?.absActive ? 'border-lmu-aqua-strong/70 bg-lmu-aqua-strong/10 shadow-[0_0_8px_rgba(6,182,212,0.25)]' : 'border-lmu-border'
      }`}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-lmu-loss font-bold">BRK</span>
          {currentPoint?.absActive && (
            <span className="px-1 py-0.2 rounded text-[10px] font-black bg-lmu-aqua text-black animate-pulse">
              ABS
            </span>
          )}
        </div>
        <span className="text-xs font-black text-lmu-loss font-mono">{(currentPoint?.brake ?? 0).toFixed(0)}%</span>
        <span className="text-[10px] text-lmu-muted">{currentPoint?.absActive ? 'abs active' : 'pedal'}</span>
      </div>

      {/* Steering */}
      <div className="p-2 rounded-lg bg-lmu-card border border-lmu-border flex flex-col items-center">
        <span className="text-[10px] text-lmu-indigo font-bold">STEER</span>
        <span className="text-xs font-black text-lmu-indigo-soft font-mono">
          {Math.abs(getSteerPercent(currentPoint?.steerYaw))}% {(currentPoint?.steerYaw ?? 0) < -5 ? 'L' : (currentPoint?.steerYaw ?? 0) > 5 ? 'R' : 'C'}
        </span>
        <span className="text-[10px] text-lmu-muted">input</span>
      </div>

      {/* Status / Track State */}
      <div className={`p-2 rounded-lg bg-lmu-card border flex flex-col items-center justify-center transition-colors ${
        currentPoint?.pitLimiter
          ? 'border-lmu-purple-strong/70 bg-lmu-purple-strong/15 shadow-[0_0_8px_rgba(217,70,239,0.3)] animate-pulse'
          : currentPoint?.isOffTrack
          ? 'border-lmu-warn-strong/70 bg-lmu-warn-strong/15 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
          : (currentPoint?.rainIntensity ?? 0) > 0
          ? 'border-lmu-azure-strong/70 bg-lmu-azure-strong/15 shadow-[0_0_8px_rgba(59,130,246,0.25)]'
          : currentPoint?.inPit
          ? 'border-lmu-azure-strong/50 bg-lmu-azure-strong/10'
          : 'border-lmu-border'
      }`}>
        <span className="text-[10px] text-lmu-purple font-bold">STATUS</span>
        <span className={`text-[11px] font-black font-mono truncate ${
          currentPoint?.pitLimiter
            ? 'text-lmu-purple-soft'
            : currentPoint?.isOffTrack
            ? 'text-lmu-warn-soft'
            : (currentPoint?.rainIntensity ?? 0) > 0
            ? 'text-lmu-azure-soft'
            : currentPoint?.inPit
            ? 'text-lmu-azure-soft'
            : 'text-lmu-muted'
        }`}>
          {currentPoint?.pitLimiter
            ? 'LIMITER'
            : currentPoint?.isOffTrack
            ? 'OFF TRACK'
            : (currentPoint?.rainIntensity ?? 0) > 0
            ? `WET (${currentPoint?.rainIntensity})`
            : currentPoint?.inPit
            ? 'PIT LANE'
            : 'ON TRACK'}
        </span>
        <span className="text-[10px] text-lmu-muted">
          {currentPoint?.pitLimiter
            ? '60 km/h'
            : currentPoint?.isOffTrack
            ? 'limits cut'
            : (currentPoint?.rainIntensity ?? 0) > 0
            ? `${currentPoint?.ambientTemp ? `${currentPoint.ambientTemp.toFixed(1)}°C` : 'wet'}${currentPoint?.trackTemp ? ` / ${currentPoint.trackTemp.toFixed(1)}°C` : ''}`
            : currentPoint?.inPit
            ? 'in pits'
            : currentPoint?.ambientTemp
            ? `${currentPoint.ambientTemp.toFixed(1)}°C air`
            : 'green'}
        </span>
      </div>
    </div>
  );
});
