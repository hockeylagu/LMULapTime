import React from 'react';
import { CircleDot, RotateCw } from 'lucide-react';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import {
  speedDeltaClass,
  timeDeltaClass,
  formatSpeedDelta,
  formatTimeDelta,
} from './CornerTableFormatters.js';

export interface RotationPhaseCardProps {
  corner: CornerSegmentComparison;
  isCompareMode: boolean;
}

export const RotationPhaseCard: React.FC<RotationPhaseCardProps> = ({
  corner,
  isCompareMode,
}) => {
  const trackUsage = corner.primaryTrackUsage;

  return (
    <div className="flex flex-col bg-[#050810] p-2.5 rounded-lg border border-lmu-border/40 min-w-0">
      <div className="flex items-center justify-between h-7 border-b border-slate-800/80 pb-1 w-full min-w-0">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-400 uppercase tracking-wider whitespace-nowrap">
          <CircleDot className="w-3.5 h-3.5 shrink-0" />
          <span>Rotation Phase</span>
        </span>
        {isCompareMode && (
          <span className={`shrink-0 text-[10px] whitespace-nowrap ml-1 ${timeDeltaClass(corner.phaseTiming?.rotation.timeDeltaSec ?? 0)}`}>
            {corner.phaseTiming ? formatTimeDelta(corner.phaseTiming.rotation.timeDeltaSec) : '--'}
          </span>
        )}
      </div>

      {/* Hero Speed Metric */}
      <div className="flex items-center justify-between h-8 py-1 border-b border-slate-800/60 min-w-0">
        <span className="text-slate-400 text-[10px] uppercase font-semibold text-left whitespace-nowrap">Min Speed</span>
        <div className="flex items-center gap-1 shrink-0 text-right whitespace-nowrap">
          <span className="text-sm font-bold text-white">{corner.primaryMinSpeedKmh}</span>
          <span className="text-[10px] text-slate-400">km/h</span>
          {isCompareMode && (
            <span className={`ml-1 text-[10px] ${speedDeltaClass(corner.minSpeedDeltaKmh)}`}>
              {formatSpeedDelta(corner.minSpeedDeltaKmh)}
            </span>
          )}
        </div>
      </div>

      {/* Consistent 4-Row Breakdown */}
      <div className="flex flex-col text-[10px] divide-y divide-slate-800/40">
        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span className="text-slate-400 text-left whitespace-nowrap" title="Effective Turn Radius">
            Radius
          </span>
          <span
            className="shrink-0 text-right whitespace-nowrap text-white font-bold"
            title={corner.effectiveRadiusM ? `Effective turn radius: ~${corner.effectiveRadiusM}m` : undefined}
          >
            {corner.effectiveRadiusM ? `R≈${corner.effectiveRadiusM}m` : '--'}
          </span>
        </div>

        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            title="Vehicle rotation progress at 15% throttle application"
            className="text-slate-400 text-left whitespace-nowrap flex items-center gap-1"
          >
            <RotateCw className="w-2.5 h-2.5 text-sky-400 shrink-0" />
            <span>Rotation</span>
          </span>
          <span
            className="shrink-0 text-right whitespace-nowrap text-white font-bold"
            title={
              corner.primaryRotationAtThrottlePct !== null && corner.primaryRotationAtThrottlePct !== undefined
                ? `${corner.primaryRotationAtThrottlePct}% vehicle rotated at throttle`
                : '--'
            }
          >
            {corner.primaryRotationAtThrottlePct !== null && corner.primaryRotationAtThrottlePct !== undefined ? (
              <>
                <span>{corner.primaryRotationAtThrottlePct}%</span>
                {isCompareMode && corner.rotationAtThrottleDeltaPct !== null && corner.rotationAtThrottleDeltaPct !== undefined && (
                  <span className="ml-1 text-[9px] font-normal text-slate-400">
                    ({corner.rotationAtThrottleDeltaPct > 0 ? '+' : ''}{corner.rotationAtThrottleDeltaPct}%)
                  </span>
                )}
              </>
            ) : (
              '--'
            )}
          </span>
        </div>

        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span className="text-slate-400 text-left whitespace-nowrap" title="Peak Yaw Rate">
            Peak Yaw Rate
          </span>
          <span className="shrink-0 text-right whitespace-nowrap text-white font-bold">
            {corner.primaryPeakYawRateDeg ? `${corner.primaryPeakYawRateDeg}°/s` : '--'}
          </span>
        </div>

        {/* Row 4: Apex Space Left / Margin to Inside Apex Curb */}
        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={
              isCompareMode
                ? 'Apex Margin Delta: difference in distance to apex curb compared to baseline (negative = closer to apex)'
                : 'Apex Margin: remaining distance between car and inside apex curb (0.0m = clipped curb)'
            }
          >
            {isCompareMode ? 'Apex Margin Δ' : 'Apex Margin'}
          </span>
          <span className="shrink-0 text-right whitespace-nowrap">
            {isCompareMode ? (
              corner.apexSpaceDeltaM !== null && corner.apexSpaceDeltaM !== undefined ? (
                <span
                  className={
                    corner.apexSpaceDeltaM < 0
                      ? 'text-emerald-400 font-bold font-mono'
                      : corner.apexSpaceDeltaM > 0
                      ? 'text-amber-400 font-bold font-mono'
                      : 'text-slate-400 font-mono'
                  }
                  title={
                    corner.apexSpaceDeltaM < 0
                      ? `${Math.abs(corner.apexSpaceDeltaM).toFixed(1)}m closer to inside apex curb than baseline`
                      : corner.apexSpaceDeltaM > 0
                      ? `${corner.apexSpaceDeltaM.toFixed(1)}m further from apex curb than baseline`
                      : 'Identical apex placement'
                  }
                >
                  {corner.apexSpaceDeltaM > 0
                    ? `+${corner.apexSpaceDeltaM.toFixed(1)}m`
                    : corner.apexSpaceDeltaM < 0
                    ? `-${Math.abs(corner.apexSpaceDeltaM).toFixed(1)}m`
                    : '0.0m'}
                </span>
              ) : trackUsage?.apexSpaceLeftM !== undefined ? (
                <span className="text-white font-bold" title={`${trackUsage.apexSpaceLeftM.toFixed(1)}m from apex curb`}>
                  {trackUsage.apexSpaceLeftM.toFixed(1)}m <span className="text-[9px] text-slate-400 font-normal">left</span>
                </span>
              ) : (
                <span className="text-slate-500">--</span>
              )
            ) : trackUsage?.apexSpaceLeftM !== undefined ? (
              <span
                className={
                  trackUsage.apexSpaceLeftM < 0
                    ? 'text-rose-400 font-bold'
                    : trackUsage.apexSpaceLeftM <= 0.2
                    ? 'text-emerald-400 font-bold'
                    : trackUsage.apexSpaceLeftM <= 0.8
                    ? 'text-white font-bold'
                    : 'text-amber-400 font-bold'
                }
                title={
                  trackUsage.apexSpaceLeftM < 0
                    ? `${Math.abs(trackUsage.apexSpaceLeftM).toFixed(1)}m over apex curb (corner cut / off track)`
                    : trackUsage.apexSpaceLeftM <= 0.2
                    ? `${trackUsage.apexSpaceLeftM.toFixed(1)}m from apex curb (clipped apex curb)`
                    : trackUsage.apexSpaceLeftM <= 0.8
                    ? `${trackUsage.apexSpaceLeftM.toFixed(1)}m space to inside apex curb`
                    : `${trackUsage.apexSpaceLeftM.toFixed(1)}m space to inside apex curb (missed apex)`
                }
              >
                <span>
                  {trackUsage.apexSpaceLeftM < 0
                    ? `${trackUsage.apexSpaceLeftM.toFixed(1)}m`
                    : trackUsage.apexSpaceLeftM === 0
                    ? '0.0m'
                    : `${trackUsage.apexSpaceLeftM.toFixed(1)}m`}
                </span>{' '}
                <span className="text-[9px] text-slate-400 font-normal">
                  {trackUsage.apexSpaceLeftM < 0 ? 'cut' : 'left'}
                </span>
              </span>
            ) : trackUsage?.apexMarginM !== undefined ? (
              <span className="text-white font-bold" title={`${Math.abs(trackUsage.apexMarginM).toFixed(1)}m from track centerline`}>
                {Math.abs(trackUsage.apexMarginM).toFixed(1)}m
              </span>
            ) : (
              <span className="text-slate-500">Center</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
