import React, { useMemo } from 'react';
import { ReplayTelemetryPoint } from '../../../../shared/types/index.js';
import { CHART_COLORS, MAP_COLORS, TELEMETRY_COLORS } from '../../../utils/themeColors.js';

export interface ReplayFrictionCircleProps {
  points: ReplayTelemetryPoint[];
  currentIndex: number;
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
  const lateralRatio = Math.max(-MAX_DISPLAY_RATIO, Math.min(MAX_DISPLAY_RATIO, (point.accelLatG ?? 0) / 2.8));
  const longitudinalRatio = Math.max(-MAX_DISPLAY_RATIO, Math.min(MAX_DISPLAY_RATIO, (point.accelLonG ?? 0) / 2.5));
  return {
    x: CENTER + lateralRatio * ENVELOPE_RADIUS,
    y: CENTER - longitudinalRatio * ENVELOPE_RADIUS,
  };
}

export const ReplayFrictionCircle: React.FC<ReplayFrictionCircleProps> = React.memo(({
  points,
  currentIndex,
}) => {
  const currentPoint = points[currentIndex];
  const gripState = getGripState(currentPoint);
  const current = projectPoint(currentPoint ?? { x: 0, y: 0, z: 0 });
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
    <div className="h-[132px] shrink-0 rounded-lg border border-lmu-border bg-lmu-surface px-3 py-2 flex items-center gap-3" aria-label="Estimated friction circle">
      <svg viewBox="0 0 128 128" className="h-[116px] w-[116px] shrink-0" role="img" aria-label="Lateral and longitudinal grip plot">
        <circle cx={CENTER} cy={CENTER} r={ENVELOPE_RADIUS} fill={MAP_COLORS.markerUnselected} stroke={MAP_COLORS.trackBoundary} strokeWidth="1.5" />
        <circle cx={CENTER} cy={CENTER} r={ENVELOPE_RADIUS * 0.75} fill="none" stroke={MAP_COLORS.centerline} strokeDasharray="3 3" />
        <line x1="8" y1={CENTER} x2="120" y2={CENTER} stroke={MAP_COLORS.centerline} />
        <line x1={CENTER} y1="8" x2={CENTER} y2="120" stroke={MAP_COLORS.centerline} />
        {trail && <polyline points={trail} fill="none" stroke={TELEMETRY_COLORS.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />}
        <circle cx={current.x} cy={current.y} r="5" fill={gripState.color} stroke={CHART_COLORS.white} strokeWidth="1.5" />
        <text x="4" y="61" fill={MAP_COLORS.markerDimmed} fontSize="7">L</text>
        <text x="119" y="61" fill={MAP_COLORS.markerDimmed} fontSize="7">R</text>
        <text x="68" y="10" fill={MAP_COLORS.markerDimmed} fontSize="7">DRIVE</text>
        <text x="68" y="124" fill={MAP_COLORS.markerDimmed} fontSize="7">BRAKE</text>
      </svg>

      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold tracking-wider text-lmu-muted">EST. GRIP UTILIZATION</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-black font-mono text-white">{gripState.utilization}%</span>
          <span className="text-[10px] font-black tracking-wide" style={{ color: gripState.color }}>
            {gripState.label}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-lmu-muted">{gripState.detail}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 text-[10px] font-mono">
          <span className="text-lmu-muted">LAT <strong className="text-white">{(currentPoint?.accelLatG ?? 0).toFixed(2)} G</strong></span>
          <span className="text-lmu-muted">LON <strong className="text-white">{(currentPoint?.accelLonG ?? 0).toFixed(2)} G</strong></span>
        </div>
      </div>
    </div>
  );
});