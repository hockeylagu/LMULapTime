import React, { useState } from 'react';
import type { ReplayTelemetryPoint } from '../../../../../shared/types/index.js';
import { getSteerPercent } from '../../../../../shared/domain/formatters.js';
import { formatRain } from '../../../../../shared/domain/lapConditions.js';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface GpsMapTelemetryHudProps {
  primaryPoint?: ReplayTelemetryPoint | null;
  baselinePoint?: ReplayTelemetryPoint | null;
  deltaTimeSec?: number | null;
  lineDistanceM?: number | null;
  className?: string;
}

function getStatusLabel(p?: ReplayTelemetryPoint | null): string {
  if (p?.pitLimiter) return 'LIMITER';
  if (p?.isOffTrack) return 'OFF TRACK';
  if ((p?.rainIntensity ?? 0) > 0) return `WET (${formatRain(p?.rainIntensity ?? 0)})`;
  return p?.inPit ? 'PIT LANE' : 'ON TRACK';
}

function getStatusSubtext(p?: ReplayTelemetryPoint | null): string {
  if (p?.pitLimiter) return '60 km/h';
  if (p?.isOffTrack) return 'limits cut';
  if ((p?.rainIntensity ?? 0) > 0) return p?.ambientTemp ? `${p.ambientTemp.toFixed(1)}°C` : 'wet';
  return p?.inPit ? 'in pits' : p?.ambientTemp ? `${p.ambientTemp.toFixed(1)}°C` : 'green';
}

export const GpsMapTelemetryHud: React.FC<GpsMapTelemetryHudProps> = React.memo(({
  primaryPoint,
  baselinePoint,
  deltaTimeSec,
  lineDistanceM,
  className = '',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isComparing = Boolean(baselinePoint);

  if (!primaryPoint) return null;

  const computedLineDist = (primaryPoint.x != null && baselinePoint?.x != null && primaryPoint.z != null && baselinePoint?.z != null)
    ? Math.hypot(primaryPoint.x - baselinePoint.x, primaryPoint.z - baselinePoint.z) : null;
  const effectiveLineDist = lineDistanceM ?? computedLineDist;

  const deltaColor = deltaTimeSec == null
    ? 'text-slate-400'
    : deltaTimeSec < -0.005
    ? 'text-emerald-400'
    : deltaTimeSec > 0.005
    ? 'text-rose-400'
    : 'text-slate-300';
  const deltaLabel = deltaTimeSec == null
    ? 'gap'
    : deltaTimeSec < -0.005
    ? 'gaining'
    : deltaTimeSec > 0.005
    ? 'losing'
    : 'even';

  const renderCells = (p?: ReplayTelemetryPoint | null, isGhost = false) => {
    const gear = Math.min(7, Math.max(1, p?.gear ?? 1));
    const steerDeg = p?.steerYaw ?? 0;
    const steerPct = Math.abs(getSteerPercent(steerDeg));
    const steerDir = steerDeg < -5 ? 'L' : steerDeg > 5 ? 'R' : 'C';
    const latG = p?.accelLatG ?? 0;
    const lonG = p?.accelLonG ?? 0;
    const totalG = Math.hypot(latG, lonG);

    return (
      <>
        {/* Delta (when comparing) */}
        {isComparing && (
          <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono whitespace-nowrap overflow-hidden">
            {!isGhost ? (
              <>
                <span className={`text-xs sm:text-sm font-bold ${deltaColor}`}>
                  {deltaTimeSec != null ? `${deltaTimeSec > 0 ? '+' : ''}${deltaTimeSec.toFixed(2)}s` : '--'}
                </span>
                <span className="text-[9px] sm:text-[10px] text-lmu-muted leading-tight">{deltaLabel}</span>
              </>
            ) : (
              <>
                <span className="text-xs sm:text-sm font-bold text-white">REF</span>
                <span className="text-[9px] sm:text-[10px] text-lmu-muted leading-tight">baseline</span>
              </>
            )}
          </div>
        )}

        {/* Line separation distance (when comparing) */}
        {isComparing && (
          <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono whitespace-nowrap overflow-hidden">
            {!isGhost ? (
              <>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-xs sm:text-sm font-bold text-white">
                    {effectiveLineDist !== null ? effectiveLineDist.toFixed(1) : '--'}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-lmu-muted font-medium">m</span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-lmu-muted leading-tight">line gap</span>
              </>
            ) : (
              <>
                <span className="text-xs sm:text-sm font-bold text-white">--</span>
                <span className="text-[9px] sm:text-[10px] text-lmu-muted leading-tight">line</span>
              </>
            )}
          </div>
        )}

        {/* Speed & Gear */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 whitespace-nowrap overflow-hidden">
          <div className="flex items-baseline gap-0.5 font-mono">
            <span className="text-xs sm:text-sm font-bold text-white">{p?.speedKmh ?? 0}</span>
            <span className="text-[9px] sm:text-[10px] text-lmu-muted font-medium">km/h</span>
          </div>
          <span className={`text-[9px] sm:text-[10px] font-mono font-semibold ${isGhost ? 'text-amber-400/90' : 'text-sky-400'}`}>
            GEAR {gear}
          </span>
        </div>

        {/* Throttle */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 whitespace-nowrap overflow-hidden">
          <div className="flex items-center gap-1 font-mono">
            <span className="text-xs sm:text-sm font-bold text-white">
              {(p?.throttle ?? 0).toFixed(0)}%
            </span>
            {p?.tcActive && (
              <span className="inline-flex h-3 items-center px-0.5 rounded text-[8px] leading-none font-bold bg-amber-400 text-black">
                TC
              </span>
            )}
          </div>
          <span className="text-[9px] sm:text-[10px] text-lmu-muted font-mono leading-tight">
            {p?.tcActive ? 'tc' : 'pedal'}
          </span>
        </div>

        {/* Brake */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 whitespace-nowrap overflow-hidden">
          <div className="flex items-center gap-1 font-mono">
            <span className="text-xs sm:text-sm font-bold text-white">
              {(p?.brake ?? 0).toFixed(0)}%
            </span>
            {p?.absActive && (
              <span className="inline-flex h-3 items-center px-0.5 rounded text-[8px] leading-none font-bold bg-sky-400 text-black">
                ABS
              </span>
            )}
          </div>
          <span className="text-[9px] sm:text-[10px] text-lmu-muted font-mono leading-tight">
            {p?.absActive ? 'abs' : 'pedal'}
          </span>
        </div>

        {/* Steering */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono whitespace-nowrap overflow-hidden">
          <span className="text-xs sm:text-sm font-bold text-white tabular-nums">
            {steerPct.toFixed(1)}% {steerDir}
          </span>
          <span className="text-[9px] sm:text-[10px] text-lmu-muted leading-tight">input</span>
        </div>

        {/* G-Force */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono whitespace-nowrap overflow-hidden">
          <span className="text-xs sm:text-sm font-bold text-white tabular-nums">
            {p ? `${totalG.toFixed(2)}G` : '--'}
          </span>
          <span className="text-[9px] sm:text-[10px] text-lmu-muted tabular-nums leading-tight">
            {p ? `${Math.abs(latG).toFixed(1)}L · ${Math.abs(lonG).toFixed(1)}${lonG < -0.05 ? 'B' : 'A'}` : 'total'}
          </span>
        </div>

        {/* Status */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono whitespace-nowrap overflow-hidden">
          <span className="text-[10px] sm:text-[11px] font-bold tracking-tight text-white">
            {getStatusLabel(p)}
          </span>
          <span className="text-[9px] sm:text-[10px] text-lmu-muted leading-tight">
            {getStatusSubtext(p)}
          </span>
        </div>
      </>
    );
  };

  const gridColsClass = isComparing
    ? 'grid-cols-[46px_64px_58px_66px_54px_54px_72px_76px_82px]'
    : 'grid-cols-[70px_58px_58px_74px_78px_88px]';

  const containerWidthClass = isCollapsed
    ? 'w-auto'
    : isComparing ? 'w-[596px] max-w-[calc(100vw-24px)]' : 'w-[450px] max-w-[calc(100vw-24px)]';

  return (
    <div
      data-testid="gps-map-telemetry-hud"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 select-none bg-slate-950/90 backdrop-blur-md rounded-xl border border-white/15 shadow-xl pointer-events-auto ${containerWidthClass} ${className}`}
    >
      <div className="flex items-stretch">
        {isCollapsed ? (
          <div className="flex items-center gap-2.5 px-3 py-1 font-mono text-[11px] sm:text-xs text-lmu-muted whitespace-nowrap">
            {isComparing && deltaTimeSec != null && (
              <>
                <span className={`font-bold ${deltaColor}`}>
                  {deltaTimeSec > 0 ? '+' : ''}{deltaTimeSec.toFixed(2)}s
                </span>
                <span>·</span>
              </>
            )}
            {isComparing && effectiveLineDist != null && (
              <>
                <span className="text-white font-bold">{effectiveLineDist.toFixed(1)}m line</span>
                <span>·</span>
              </>
            )}
            <span className="text-white font-bold">{primaryPoint.speedKmh ?? 0} km/h</span>
            <span>·</span>
            <span className="text-white font-bold">THR {(primaryPoint.throttle ?? 0).toFixed(0)}%</span>
            <span>·</span>
            <span className="text-white font-bold">BRK {(primaryPoint.brake ?? 0).toFixed(0)}%</span>
            <span>·</span>
            <span className="text-white font-bold">{Math.hypot(primaryPoint.accelLatG ?? 0, primaryPoint.accelLonG ?? 0).toFixed(1)}G</span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {/* Header row */}
            <div className={`grid ${gridColsClass} divide-x divide-white/10 bg-white/5 py-0.5 text-center text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase whitespace-nowrap`}>
              {isComparing && <span className="text-slate-400 px-1">CAR</span>}
              {isComparing && <span className="text-amber-400 px-1">DELTA</span>}
              {isComparing && <span className="text-sky-300 px-1">LINE</span>}
              <span className="text-sky-400 px-1">SPEED</span>
              <span className="text-emerald-400 px-1">THR</span>
              <span className="text-rose-400 px-1">BRK</span>
              <span className="text-indigo-400 px-1">STEER</span>
              <span className="text-amber-400 px-1">G-FORCE</span>
              <span className="text-purple-400 px-1">STATUS</span>
            </div>

            {/* Row 1: ME / Primary Car */}
            <div
              data-testid="telemetry-hud-primary"
              className={`grid ${gridColsClass} divide-x divide-white/10 items-center py-0.5 sm:py-1 whitespace-nowrap`}
            >
              {isComparing && (
                <div className="flex items-center justify-center px-1">
                  <span className="px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-bold font-mono tracking-wider bg-sky-500/20 text-white border border-sky-500/30">
                    ME
                  </span>
                </div>
              )}
              {renderCells(primaryPoint, false)}
            </div>

            {/* Row 2: THE OTHER / Baseline Ghost Car (when comparing) */}
            {isComparing && (
              <div
                data-testid="telemetry-hud-baseline"
                className={`grid ${gridColsClass} divide-x divide-white/10 items-center py-0.5 sm:py-1 bg-amber-500/[0.04]`}
              >
                <div className="flex items-center justify-center px-1">
                  <span className="px-1.5 py-0.5 rounded text-[8.5px] sm:text-[9.5px] font-bold font-mono tracking-wider bg-amber-500/20 text-white border border-amber-500/30">
                    RIVAL
                  </span>
                </div>
                {renderCells(baselinePoint, true)}
              </div>
            )}
          </div>
        )}

        {/* Collapse / Expand Toggle */}
        <button
          type="button"
          onClick={() => setIsCollapsed(c => !c)}
          aria-label={isCollapsed ? 'Expand telemetry bar' : 'Collapse telemetry bar'}
          title={isCollapsed ? 'Expand HUD' : 'Collapse HUD'}
          className="flex items-center justify-center w-6 shrink-0 bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer border-l border-white/10 rounded-r-xl"
        >
          {isCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
});
