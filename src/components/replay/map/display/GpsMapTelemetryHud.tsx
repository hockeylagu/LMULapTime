import React, { useId, useState } from 'react';
import type { ReplayTelemetryPoint } from '../../../../../shared/types/index.js';
import { getSteerPercent } from '../../../../../shared/domain/formatters.js';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { formatGear, formatReading, getStatusLabel, getStatusSubtext, hasReading, totalAcceleration } from './telemetryReadouts.js';

export interface GpsMapTelemetryHudProps {
  primaryPoint?: ReplayTelemetryPoint | null;
  baselinePoint?: ReplayTelemetryPoint | null;
  deltaTimeSec?: number | null;
  lineDistanceM?: number | null;
  className?: string;
}

export const GpsMapTelemetryHud: React.FC<GpsMapTelemetryHudProps> = React.memo(({
  primaryPoint,
  baselinePoint,
  deltaTimeSec: rawDeltaTimeSec,
  lineDistanceM,
  className = '',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const contentId = useId();
  const isComparing = Boolean(baselinePoint);
  const deltaTimeSec = hasReading(rawDeltaTimeSec) ? rawDeltaTimeSec : null;

  if (!primaryPoint) return null;

  const computedLineDist = (hasReading(primaryPoint.x) && hasReading(baselinePoint?.x) && hasReading(primaryPoint.z) && hasReading(baselinePoint?.z))
    ? Math.hypot(primaryPoint.x - baselinePoint.x, primaryPoint.z - baselinePoint.z) : null;
  const lineDist = lineDistanceM ?? computedLineDist;
  const effectiveLineDist = hasReading(lineDist) ? lineDist : null;

  const deltaColor = deltaTimeSec == null
    ? 'text-lmu-muted'
    : deltaTimeSec < -0.005
    ? 'text-lmu-gain'
    : deltaTimeSec > 0.005
    ? 'text-lmu-loss'
    : 'text-lmu-text-soft';
  const deltaLabel = deltaTimeSec == null
    ? 'no delta'
    : deltaTimeSec < -0.005
    ? 'ahead'
    : deltaTimeSec > 0.005
    ? 'behind'
    : 'even';

  const renderCells = (p?: ReplayTelemetryPoint | null, isGhost = false) => {
    const gear = formatGear(p?.gear);
    const steerDeg = p?.steerYaw;
    const steering = hasReading(steerDeg)
      ? `${Math.abs(getSteerPercent(steerDeg)).toFixed(1)}% ${steerDeg > 5 ? 'L' : steerDeg < -5 ? 'R' : 'C'}` : '--';
    const latG = p?.accelLatG;
    const lonG = p?.accelLonG;
    const totalG = totalAcceleration(p);

    return (
      <>
        {/* Delta (when comparing) */}
        {isComparing && (
          <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono tabular-nums whitespace-nowrap overflow-hidden">
            {!isGhost ? (
              <>
                <span className={`text-sm font-bold ${deltaColor}`}>
                  {deltaTimeSec != null ? `${deltaTimeSec > 0 ? '+' : ''}${deltaTimeSec.toFixed(2)}s` : '--'}
                </span>
                <span className="text-[10px] text-lmu-muted leading-[1.4]">{deltaLabel}</span>
              </>
            ) : (
              <>
                <span className="text-sm font-bold text-lmu-text">REF</span>
                <span className="text-[10px] text-lmu-muted leading-[1.4]">reference</span>
              </>
            )}
          </div>
        )}

        {/* Line separation distance (when comparing) */}
        {isComparing && (
          <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono tabular-nums whitespace-nowrap overflow-hidden">
            {!isGhost ? (
              <>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-sm font-bold text-lmu-text">
                    {effectiveLineDist !== null ? effectiveLineDist.toFixed(1) : '--'}
                  </span>
                  <span className="text-[10px] text-lmu-muted font-medium">m</span>
                </div>
                <span className="text-[10px] text-lmu-muted leading-[1.4]">line gap</span>
              </>
            ) : (
              <>
                <span className="text-sm font-bold text-lmu-text">--</span>
                <span className="text-[10px] text-lmu-muted leading-[1.4]">line</span>
              </>
            )}
          </div>
        )}

        {/* Speed & Gear */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 whitespace-nowrap overflow-hidden">
          <div className="flex items-baseline gap-0.5 font-mono tabular-nums">
            <span className="text-sm font-bold text-lmu-text">{formatReading(p?.speedKmh)}</span>
            <span className="text-[10px] text-lmu-muted font-medium">km/h</span>
          </div>
          <span className={`text-[10px] font-mono font-semibold ${isGhost ? 'text-lmu-warn' : 'text-lmu-info'}`}>
            GEAR {gear}
          </span>
        </div>

        {/* Throttle */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 whitespace-nowrap overflow-hidden">
          <div className="flex items-center gap-1 font-mono tabular-nums">
            <span className="text-sm font-bold text-lmu-text">
              {formatReading(p?.throttle, 0)}%
            </span>

          </div>
          <span className="text-[10px] text-lmu-muted font-mono leading-[1.4]">
            {p?.tcActive ? <span className="inline-flex min-h-3.5 items-center px-1 rounded text-[10px] leading-[1.4] font-bold bg-lmu-warn text-lmu-deep">TC</span> : 'pedal'}
          </span>
        </div>

        {/* Brake */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 whitespace-nowrap overflow-hidden">
          <div className="flex items-center gap-1 font-mono tabular-nums">
            <span className="text-sm font-bold text-lmu-text">
              {formatReading(p?.brake, 0)}%
            </span>

          </div>
          <span className="text-[10px] text-lmu-muted font-mono leading-[1.4]">
            {p?.absActive ? <span className="inline-flex min-h-3.5 items-center px-1 rounded text-[10px] leading-[1.4] font-bold bg-lmu-info text-lmu-deep">ABS</span> : 'pedal'}
          </span>
        </div>

        {/* Steering */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono tabular-nums whitespace-nowrap overflow-hidden">
          <span className="text-sm font-bold text-lmu-text tabular-nums">
            {steering}
          </span>
          <span className="text-[10px] text-lmu-muted leading-[1.4]">input</span>
        </div>

        {/* G-Force */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono tabular-nums whitespace-nowrap overflow-hidden">
          <span className="text-sm font-bold text-lmu-text tabular-nums">
            {hasReading(totalG) ? `${totalG.toFixed(2)}G` : '--'}
          </span>
          <span className="text-[10px] text-lmu-muted tabular-nums leading-[1.4]">
            {hasReading(latG) && hasReading(lonG) ? `${Math.abs(latG).toFixed(1)}${latG > 0.05 ? 'L' : latG < -0.05 ? 'R' : ''} · ${Math.abs(lonG).toFixed(1)}${lonG < -0.05 ? 'B' : 'A'}` : 'unavailable'}
          </span>
        </div>

        {/* Status */}
        <div className="flex flex-col items-center justify-center px-1 sm:px-1.5 py-0.5 sm:py-1 font-mono tabular-nums whitespace-nowrap overflow-hidden">
          <span className="text-[11px] font-bold tracking-tight text-lmu-text">
            {getStatusLabel(p)}
          </span>
          <span className="text-[10px] text-lmu-muted leading-[1.4]">
            {getStatusSubtext(p)}
          </span>
        </div>
      </>
    );
  };

  const gridColsClass = isComparing
    ? 'grid-cols-[60px_64px_58px_66px_54px_54px_80px_76px_74px]'
    : 'grid-cols-[70px_58px_58px_82px_78px_80px]';

  const containerWidthClass = isCollapsed
    ? 'w-auto'
    : isComparing ? 'w-[614px] max-w-[calc(100vw-24px)]' : 'w-[454px] max-w-[calc(100vw-24px)]';

  return (
    <div
      data-testid="gps-map-telemetry-hud"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 select-none bg-lmu-strip/95 backdrop-blur-md rounded-xl border border-lmu-border shadow-xl pointer-events-auto ${containerWidthClass} ${className}`}
    >
      <div className="flex items-stretch">
        {isCollapsed ? (
          <div id={contentId} className="flex items-center gap-2.5 px-3 py-1 font-mono text-xs leading-5 tabular-nums text-lmu-muted whitespace-nowrap">
            {isComparing && deltaTimeSec != null && (
              <>
                <span title="Primary lap time minus baseline lap time at the same track distance; negative is ahead." className={`font-bold ${deltaColor}`}>
                  {deltaTimeSec > 0 ? '+' : ''}{deltaTimeSec.toFixed(2)}s
                </span>
                <span>·</span>
              </>
            )}
            {isComparing && effectiveLineDist != null && (
              <>
                <span className="text-lmu-text font-bold">{effectiveLineDist.toFixed(1)}m line</span>
                <span>·</span>
              </>
            )}
            <span className="text-lmu-text font-bold">{formatReading(primaryPoint.speedKmh)} km/h</span>
            <span>·</span>
            <span className="text-lmu-text font-bold">THR {formatReading(primaryPoint.throttle, 0)}%</span>
            <span>·</span>
            <span className="text-lmu-text font-bold">BRK {formatReading(primaryPoint.brake, 0)}%</span>
            <span>·</span>
            <span className="text-lmu-text font-bold">{formatReading(totalAcceleration(primaryPoint), 1)}G</span>
          </div>
        ) : (
          <div id={contentId} className="flex flex-col divide-y divide-lmu-border">
            {/* Header row */}
            <div className={`grid ${gridColsClass} divide-x divide-lmu-border bg-lmu-raised/40 py-0.5 text-center text-[10px] text-lmu-muted font-semibold tracking-wider uppercase whitespace-nowrap`}>
              {isComparing && <span className="text-lmu-muted px-1">LAP</span>}
              {isComparing && <span title="Primary lap time minus baseline lap time at the same track distance; negative is ahead." className="px-1">DELTA</span>}
              {isComparing && <span title="Distance between racing lines at the same track distance, not a race gap." className="px-1">LINE</span>}
              <span className="px-1">SPEED</span>
              <span className="px-1">THR</span>
              <span className="px-1">BRK</span>
              <span className="px-1">STEER</span>
              <span className="px-1">G-FORCE</span>
              <span title="Car location, pit limiter and weather; not race-control flags." className="px-1">STATUS</span>
            </div>

            {/* Row 1: selected primary lap */}
            <div
              data-testid="telemetry-hud-primary"
              className={`grid ${gridColsClass} divide-x divide-lmu-border items-center py-0.5 sm:py-1 whitespace-nowrap`}
            >
              {isComparing && (
                <div className="flex items-center justify-center px-0.5">
                  <span title="The selected lap being inspected." className="px-1 py-0.5 rounded text-[10px] leading-[1.4] font-bold tracking-normal bg-lmu-info/15 text-lmu-text border border-lmu-info/30">
                    Primary
                  </span>
                </div>
              )}
              {renderCells(primaryPoint, false)}
            </div>

            {/* Row 2: comparison baseline lap */}
            {isComparing && (
              <div
                data-testid="telemetry-hud-baseline"
                className={`grid ${gridColsClass} divide-x divide-lmu-border items-center py-0.5 sm:py-1 bg-lmu-warn/5`}
              >
                <div className="flex items-center justify-center px-0.5">
                  <span title="The lap selected as the comparison reference." className="px-1 py-0.5 rounded text-[10px] leading-[1.4] font-bold tracking-normal bg-lmu-warn/15 text-lmu-text border border-lmu-warn/30">
                    Baseline
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
          aria-expanded={!isCollapsed} aria-controls={contentId}
          title={isCollapsed ? 'Expand telemetry bar' : 'Collapse telemetry bar'}
          className={`flex items-center justify-center w-7 shrink-0 bg-lmu-raised/40 hover:bg-lmu-raised text-lmu-muted hover:text-lmu-text transition-colors cursor-pointer border-l border-lmu-border rounded-r-xl ${FOCUS_RING}`}
        >
          {isCollapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
});
