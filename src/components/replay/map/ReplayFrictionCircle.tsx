import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { ReplayTelemetryPoint } from '../../../../shared/types/index.js';
import { CHART_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface ReplayFrictionCircleProps {
  points: ReplayTelemetryPoint[];
  currentIndex: number;
  primaryPoint?: ReplayTelemetryPoint | null;
  baselinePoints?: ReplayTelemetryPoint[];
  baselinePoint?: ReplayTelemetryPoint | null;
  className?: string;
  onClose?: () => void;
}

const CENTER = 64;
const ENVELOPE_RADIUS = 47;
const MAX_DISPLAY_RATIO = 1.2;

function getGripState(point?: ReplayTelemetryPoint) {
  const longitudinalRatio = Math.abs(point?.accelLonG ?? 0) / 2.5;
  const lateralRatio = Math.abs(point?.accelLatG ?? 0) / 2.8;
  const utilization = Math.round(Math.hypot(longitudinalRatio, lateralRatio) * 100);
  const slip = point?.tireSlipPct ?? 0;

  if (point?.wheelLockActive || point?.isOffTrack || slip >= 92) {
    return { label: 'LOST GRIP', detail: 'Reduce demand', color: MAP_COLORS.gripLost, utilization };
  }
  if (utilization > 100 || slip >= 80) {
    return { label: 'OVER LIMIT', detail: 'Excess slip', color: TELEMETRY_COLORS.baseline, utilization };
  }
  if (utilization >= 90) {
    return { label: 'AT LIMIT', detail: 'Balanced grip', color: MAP_COLORS.gripLimit, utilization };
  }
  if (utilization >= 75) {
    return { label: 'BUILDING', detail: 'Near the limit', color: MAP_COLORS.gripBuilding, utilization };
  }
  return { label: 'RESERVE', detail: 'Grip available', color: MAP_COLORS.markerMuted, utilization };
}

function projectPoint(point: ReplayTelemetryPoint): { x: number; y: number } {
  // Inertial load transfer (where the weight goes):
  // - Turning right (accelLatG < 0) transfers load to outside left tires (x < CENTER, 'L')
  // - Turning left (accelLatG > 0) transfers load to outside right tires (x > CENTER, 'R')
  // - Braking (accelLonG < 0) transfers load forward to front axle (y < CENTER, top, 'BRAKE')
  // - Accelerating (accelLonG > 0) transfers load rearward to rear axle (y > CENTER, bottom, 'DRIVE')
  const lateralRatio = Math.max(-MAX_DISPLAY_RATIO, Math.min(MAX_DISPLAY_RATIO, (point.accelLatG ?? 0) / 2.8));
  const longitudinalRatio = Math.max(-MAX_DISPLAY_RATIO, Math.min(MAX_DISPLAY_RATIO, (point.accelLonG ?? 0) / 2.5));
  return {
    x: CENTER + lateralRatio * ENVELOPE_RADIUS,
    y: CENTER + longitudinalRatio * ENVELOPE_RADIUS,
  };
}

function resolveBaselinePoint(
  primaryPt?: ReplayTelemetryPoint,
  baselinePoint?: ReplayTelemetryPoint | null,
  baselinePoints?: ReplayTelemetryPoint[]
): ReplayTelemetryPoint | undefined {
  if (baselinePoint) return baselinePoint;
  if (!baselinePoints || baselinePoints.length === 0 || !primaryPt) return undefined;
  const targetDist = primaryPt.distM ?? primaryPt.stationM;
  if (targetDist !== undefined) {
    let closest = baselinePoints[0];
    let minDiff = Infinity;
    for (let i = 0; i < baselinePoints.length; i++) {
      const bp = baselinePoints[i];
      const d = bp.distM ?? bp.stationM;
      if (d !== undefined) {
        const diff = Math.abs(d - targetDist);
        if (diff < minDiff) {
          minDiff = diff;
          closest = bp;
        }
      }
    }
    return closest;
  }
  return undefined;
}

export const ReplayFrictionCircle: React.FC<ReplayFrictionCircleProps> = React.memo(({
  points,
  currentIndex,
  primaryPoint,
  baselinePoints,
  baselinePoint,
  className = '',
  onClose,
}) => {
  const currentPoint = primaryPoint ?? points[currentIndex];
  const gripState = getGripState(currentPoint);
  const current = projectPoint(currentPoint ?? { x: 0, y: 0, z: 0 });

  const activeBaseline = useMemo(
    () => resolveBaselinePoint(currentPoint, baselinePoint, baselinePoints),
    [currentPoint, baselinePoint, baselinePoints]
  );
  const baselineCurrent = useMemo(
    () => (activeBaseline ? projectPoint(activeBaseline) : null),
    [activeBaseline]
  );

  const trail = useMemo(() => {
    const currentTime = currentPoint?.timeSec;
    let startIndex = Math.max(0, currentIndex - 20);
    if (currentTime !== undefined) {
      startIndex = currentIndex;
      while (startIndex > 0 && (points[startIndex - 1].timeSec ?? currentTime) >= currentTime - 2) {
        startIndex--;
      }
    }

    return points
      .slice(startIndex, currentIndex + 1)
      .map(projectPoint)
      .map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' ');
  }, [currentIndex, currentPoint?.timeSec, points]);

  return (
    <div
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className={`h-[132px] shrink-0 rounded-lg border border-lmu-border bg-lmu-surface px-3 py-2 flex items-center gap-3 ${className}`}
      aria-label="Estimated friction circle"
    >
      <svg viewBox="0 0 128 128" className="h-[116px] w-[116px] shrink-0" role="img" aria-label="Lateral and longitudinal grip plot">
        <circle cx={CENTER} cy={CENTER} r={ENVELOPE_RADIUS} fill={MAP_COLORS.markerUnselected} stroke={MAP_COLORS.trackBoundary} strokeWidth="1.5" />
        <circle cx={CENTER} cy={CENTER} r={ENVELOPE_RADIUS * 0.75} fill="none" stroke={MAP_COLORS.centerline} strokeDasharray="3 3" />
        <line x1="8" y1={CENTER} x2="120" y2={CENTER} stroke={MAP_COLORS.centerline} />
        <line x1={CENTER} y1="8" x2={CENTER} y2="120" stroke={MAP_COLORS.centerline} />
        {trail && <polyline points={trail} fill="none" stroke={TELEMETRY_COLORS.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />}

        {baselineCurrent && (
          <circle
            data-testid="friction-circle-baseline-dot"
            cx={baselineCurrent.x}
            cy={baselineCurrent.y}
            r="4.5"
            fill={TELEMETRY_COLORS.baseline}
            stroke={CHART_COLORS.white}
            strokeWidth="1.5"
            opacity="0.95"
          />
        )}

        {activeBaseline && (
          <circle
            cx={current.x}
            cy={current.y}
            r="7"
            fill="none"
            stroke={gripState.color}
            strokeWidth="1.5"
            opacity="0.85"
          />
        )}

        <circle
          data-testid="friction-circle-dot"
          cx={current.x}
          cy={current.y}
          r="5"
          fill={activeBaseline ? TELEMETRY_COLORS.primary : gripState.color}
          stroke={CHART_COLORS.white}
          strokeWidth="1.5"
        />

        <text x="4" y="61" fill={MAP_COLORS.markerDimmed} fontSize="11">L</text>
        <text x="119" y="61" fill={MAP_COLORS.markerDimmed} fontSize="11">R</text>
        <text x="64" y="12" textAnchor="middle" fill={MAP_COLORS.markerDimmed} fontSize="10" fontWeight="bold">BRAKE</text>
        <text x="64" y="124" textAnchor="middle" fill={MAP_COLORS.markerDimmed} fontSize="10" fontWeight="bold">DRIVE</text>
      </svg>

      <div className="relative min-w-0 flex-1">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close friction circle"
            title="Close friction circle"
            className="absolute -top-1 -right-1 p-0.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="text-[10px] font-bold tracking-wider text-lmu-muted">EST. GRIP UTILIZATION</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-black font-mono text-white">{gripState.utilization}%</span>
          <span className="text-[10px] font-black tracking-wide" style={{ color: gripState.color }}>
            {gripState.label}
          </span>
        </div>

        {activeBaseline ? (
          <div className="mt-1.5 space-y-1 text-[10px] font-mono">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sky-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-sky-400 ring-1 ring-white/60" /> Driver
              </span>
              <span className="text-white font-semibold">
                {(currentPoint?.accelLatG ?? 0).toFixed(2)} <span className="text-lmu-muted font-normal">lat</span> / {(currentPoint?.accelLonG ?? 0).toFixed(2)} <span className="text-lmu-muted font-normal">lon</span>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-amber-400 ring-1 ring-white/60" /> Baseline
              </span>
              <span className="text-amber-200/90 font-semibold">
                {(activeBaseline?.accelLatG ?? 0).toFixed(2)} <span className="text-lmu-muted font-normal">lat</span> / {(activeBaseline?.accelLonG ?? 0).toFixed(2)} <span className="text-lmu-muted font-normal">lon</span>
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-0.5 text-[10px] text-lmu-muted">{gripState.detail}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 text-[10px] font-mono">
              <span className="text-lmu-muted">LAT <strong className="text-white">{(currentPoint?.accelLatG ?? 0).toFixed(2)} G</strong></span>
              <span className="text-lmu-muted">LON <strong className="text-white">{(currentPoint?.accelLonG ?? 0).toFixed(2)} G</strong></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});