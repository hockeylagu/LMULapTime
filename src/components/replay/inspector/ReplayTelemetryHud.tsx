import React from 'react';
import { ReplayTelemetryPoint } from '../../../../shared/types/index.js';
import { getSteerPercent } from '../../../../shared/domain/formatters.js';
import { formatRain } from '../../../../shared/domain/lapConditions.js';

export interface ReplayTelemetryHudProps {
  currentPoint?: ReplayTelemetryPoint | null;
}

export const ReplayTelemetryHud: React.FC<ReplayTelemetryHudProps> = React.memo(({ currentPoint }) => {
  const currentGear = Math.min(7, Math.max(1, currentPoint?.gear ?? 1));

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-0 shrink-0 border-t border-lmu-border divide-x divide-lmu-border">
      {/* Speed & Gear */}
      <div className="px-2 py-1.5 flex flex-col items-center justify-between">
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
      <div className={`px-2 py-1.5 flex flex-col items-center transition-colors ${
        currentPoint?.tcActive ? 'border-lmu-warn-strong/70 bg-lmu-warn-strong/10' : 'border-lmu-border'
      }`}>
        <div className="h-[15px] shrink-0 flex items-center gap-1">
          <span className="text-[10px] text-lmu-gain font-bold">THR</span>
          {currentPoint?.tcActive && (
            <span className="inline-flex h-[15px] items-center px-1 rounded text-[10px] leading-none font-black bg-lmu-warn-strong text-black">
              TC
            </span>
          )}
        </div>
        <span className="text-xs font-black text-lmu-gain font-mono">{(currentPoint?.throttle ?? 0).toFixed(0)}%</span>
        <span className="text-[10px] text-lmu-muted">{currentPoint?.tcActive ? 'tc active' : 'pedal'}</span>
      </div>

      {/* Brake */}
      <div className={`px-2 py-1.5 flex flex-col items-center transition-colors ${
        currentPoint?.absActive ? 'border-lmu-aqua-strong/70 bg-lmu-aqua-strong/10' : 'border-lmu-border'
      }`}>
        <div className="h-[15px] shrink-0 flex items-center gap-1">
          <span className="text-[10px] text-lmu-loss font-bold">BRK</span>
          {currentPoint?.absActive && (
            <span className="inline-flex h-[15px] items-center px-1 rounded text-[10px] leading-none font-black bg-lmu-aqua text-black">
              ABS
            </span>
          )}
        </div>
        <span className="text-xs font-black text-lmu-loss font-mono">{(currentPoint?.brake ?? 0).toFixed(0)}%</span>
        <span className="text-[10px] text-lmu-muted">{currentPoint?.absActive ? 'abs active' : 'pedal'}</span>
      </div>

      {/* Steering */}
      <div className="px-2 py-1.5 flex flex-col items-center">
        <span className="text-[10px] text-lmu-indigo font-bold">STEER</span>
        <span className="text-xs font-black text-lmu-indigo-soft font-mono">
          {Math.abs(getSteerPercent(currentPoint?.steerYaw))}% {(currentPoint?.steerYaw ?? 0) < -5 ? 'L' : (currentPoint?.steerYaw ?? 0) > 5 ? 'R' : 'C'}
        </span>
        <span className="text-[10px] text-lmu-muted">input</span>
      </div>

      {/* Status / Track State */}
      <div className={`px-2 py-1.5 flex flex-col items-center justify-center transition-colors ${
        currentPoint?.pitLimiter
          ? 'border-lmu-purple-strong/70 bg-lmu-purple-strong/15'
          : currentPoint?.isOffTrack
          ? 'border-lmu-warn-strong/70 bg-lmu-warn-strong/15'
          : (currentPoint?.rainIntensity ?? 0) > 0
          ? 'border-lmu-azure-strong/70 bg-lmu-azure-strong/15'
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
            ? `WET (${formatRain(currentPoint?.rainIntensity ?? 0)})`
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
