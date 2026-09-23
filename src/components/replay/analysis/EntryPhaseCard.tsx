import React from 'react';
import { ArrowDownRight } from 'lucide-react';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import {
  speedDeltaClass,
  timeDeltaClass,
  formatSpeedDelta,
  formatTimeDelta,
  formatBrakingDelta,
  brakingDeltaClass,
} from './CornerTableFormatters.js';

export interface EntryPhaseCardProps {
  corner: CornerSegmentComparison;
  isCompareMode: boolean;
  brakeDistToApex: number | null;
  turnInDistToApex: number | null;
}

export const EntryPhaseCard: React.FC<EntryPhaseCardProps> = ({
  corner,
  isCompareMode,
  brakeDistToApex,
  turnInDistToApex,
}) => {
  const trackUsage = corner.primaryTrackUsage;

  return (
    <div className="flex flex-col bg-[#050810] p-2.5 rounded-lg border border-lmu-border/40 min-w-0">
      <div className="flex items-center justify-between h-7 border-b border-slate-800/80 pb-1 w-full min-w-0">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-400 uppercase tracking-wider whitespace-nowrap">
          <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
          <span>Entry Phase</span>
        </span>
        {isCompareMode && corner.phaseTiming?.entry && (
          <span className={`shrink-0 text-[10px] whitespace-nowrap ml-1 ${timeDeltaClass(corner.phaseTiming.entry.timeDeltaSec)}`}>
            {formatTimeDelta(corner.phaseTiming.entry.timeDeltaSec)}
          </span>
        )}
      </div>

      {/* Hero Speed Metric */}
      <div className="flex items-center justify-between h-8 py-1 border-b border-slate-800/60 min-w-0">
        <span className="text-slate-400 text-[10px] uppercase font-semibold text-left whitespace-nowrap">Speed</span>
        <div className="flex items-center gap-1 shrink-0 text-right whitespace-nowrap">
          <span className="text-sm font-bold text-white">{corner.primaryEntrySpeedKmh}</span>
          <span className="text-[10px] text-slate-400">km/h</span>
          {isCompareMode && (
            <span className={`ml-1 text-[10px] ${speedDeltaClass(corner.entrySpeedDeltaKmh)}`}>
              {formatSpeedDelta(corner.entrySpeedDeltaKmh)}
            </span>
          )}
        </div>
      </div>

      {/* Consistent 4-Row Breakdown */}
      <div className="flex flex-col text-[10px] divide-y divide-slate-800/40">
        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={isCompareMode ? 'Braking Point Delta' : 'Brake Point to Apex'}
          >
            {isCompareMode ? 'Brake Δ' : 'Brake to Apex'}
          </span>
          <span
            className={`shrink-0 text-right whitespace-nowrap ${
              isCompareMode ? brakingDeltaClass(corner.brakingPointDeltaM) : 'text-white font-bold'
            }`}
            title={
              isCompareMode
                ? formatBrakingDelta(corner.brakingPointDeltaM)
                : brakeDistToApex !== null ? `${brakeDistToApex}m to apex` : 'Flat out'
            }
          >
            {isCompareMode ? (
              formatBrakingDelta(corner.brakingPointDeltaM)
            ) : brakeDistToApex !== null ? (
              <>
                <span>{brakeDistToApex}m</span>{' '}
                <span className="text-[9px] text-slate-400 font-normal">apex</span>
              </>
            ) : (
              'Flat out'
            )}
          </span>
        </div>

        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={isCompareMode ? 'Turn-In Delta' : 'Turn-In Point to Apex'}
          >
            {isCompareMode ? 'Turn-In Δ' : 'Turn-In'}
          </span>
          <span
            className={`shrink-0 text-right whitespace-nowrap ${
              isCompareMode ? brakingDeltaClass(corner.turnInDeltaM ?? null) : 'text-white font-bold'
            }`}
            title={
              isCompareMode
                ? formatBrakingDelta(corner.turnInDeltaM ?? null)
                : turnInDistToApex !== null ? `${turnInDistToApex}m to apex` : '--'
            }
          >
            {isCompareMode ? (
              formatBrakingDelta(corner.turnInDeltaM ?? null)
            ) : turnInDistToApex !== null ? (
              <>
                <span>{turnInDistToApex}m</span>{' '}
                <span className="text-[9px] text-slate-400 font-normal">apex</span>
              </>
            ) : (
              '--'
            )}
          </span>
        </div>

        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span className="text-slate-400 text-left whitespace-nowrap" title="Trail Braking Zone">
            Trail Brake
          </span>
          <span
            className="shrink-0 text-right whitespace-nowrap text-white font-bold"
            title={
              corner.trailBrakeDistM && corner.trailBrakeDistM > 0
                ? `${corner.trailBrakeDistM}m${corner.trailBrakeDurationSec ? ` (${corner.trailBrakeDurationSec}s bleed)` : ''}`
                : 'None detected'
            }
          >
            {corner.trailBrakeDistM && corner.trailBrakeDistM > 0 ? (
              <>
                <span>{corner.trailBrakeDistM}m</span>
                {corner.trailBrakeDurationSec !== undefined && corner.trailBrakeDurationSec > 0 && (
                  <span className="text-[9px] font-normal text-slate-400 ml-1">({corner.trailBrakeDurationSec}s)</span>
                )}
              </>
            ) : (
              'None'
            )}
          </span>
        </div>

        {/* Row 4: Track Entry Space Left */}
        <div className="flex items-center justify-between h-7 gap-1.5 min-w-0">
          <span
            className="text-slate-400 text-left whitespace-nowrap"
            title={
              isCompareMode
                ? 'Entry Space Delta: difference in unused track width on entry compared to baseline (negative = used more track width)'
                : 'Entry Space: remaining lateral space to outside track edge before turn-in (indicates if car used full track width)'
            }
          >
            {isCompareMode ? 'Entry Space Δ' : 'Entry Space'}
          </span>
          <span className="shrink-0 text-right whitespace-nowrap">
            {isCompareMode ? (
              corner.entrySpaceDeltaM !== null && corner.entrySpaceDeltaM !== undefined ? (
                <span
                  className={
                    corner.entrySpaceDeltaM < 0
                      ? 'text-emerald-400 font-bold font-mono'
                      : corner.entrySpaceDeltaM > 0
                      ? 'text-amber-400 font-bold font-mono'
                      : 'text-slate-400 font-mono'
                  }
                  title={
                    corner.entrySpaceDeltaM < 0
                      ? `Used ${Math.abs(corner.entrySpaceDeltaM).toFixed(1)}m more track width on entry than baseline`
                      : corner.entrySpaceDeltaM > 0
                      ? `Left ${corner.entrySpaceDeltaM.toFixed(1)}m more unused space on entry than baseline`
                      : 'Identical track width used on entry'
                  }
                >
                  {corner.entrySpaceDeltaM > 0
                    ? `+${corner.entrySpaceDeltaM.toFixed(1)}m`
                    : corner.entrySpaceDeltaM < 0
                    ? `-${Math.abs(corner.entrySpaceDeltaM).toFixed(1)}m`
                    : '0.0m'}
                </span>
              ) : trackUsage?.entrySpaceLeftM !== undefined ? (
                <span className="text-white font-bold" title={`${trackUsage.entrySpaceLeftM.toFixed(1)}m space left to outside track edge`}>
                  {trackUsage.entrySpaceLeftM.toFixed(1)}m <span className="text-[9px] text-slate-400 font-normal">left</span>
                </span>
              ) : (
                <span className="text-slate-500">--</span>
              )
            ) : trackUsage?.entrySpaceLeftM !== undefined ? (
              <span
                className={
                  trackUsage.entrySpaceLeftM < 0
                    ? 'text-rose-400 font-bold'
                    : trackUsage.entrySpaceLeftM <= 0.2
                    ? 'text-emerald-400 font-bold'
                    : trackUsage.entrySpaceLeftM <= 0.9
                    ? 'text-white font-bold'
                    : 'text-amber-400 font-bold'
                }
                title={
                  trackUsage.entrySpaceLeftM < 0
                    ? `${Math.abs(trackUsage.entrySpaceLeftM).toFixed(1)}m over outside track edge (off track on entry)`
                    : trackUsage.entrySpaceLeftM <= 0.2
                    ? `${trackUsage.entrySpaceLeftM.toFixed(1)}m space to outside track edge (full track used on entry)`
                    : trackUsage.entrySpaceLeftM <= 0.9
                    ? `${trackUsage.entrySpaceLeftM.toFixed(1)}m space to outside track edge`
                    : `${trackUsage.entrySpaceLeftM.toFixed(1)}m space to outside track edge (turned in narrow: more track available)`
                }
              >
                <span>
                  {trackUsage.entrySpaceLeftM < 0
                    ? `${trackUsage.entrySpaceLeftM.toFixed(1)}m`
                    : trackUsage.entrySpaceLeftM === 0
                    ? '0.0m'
                    : `${trackUsage.entrySpaceLeftM.toFixed(1)}m`}
                </span>{' '}
                <span className="text-[9px] text-slate-400 font-normal">
                  {trackUsage.entrySpaceLeftM < 0 ? 'off-track' : 'left'}
                </span>
              </span>
            ) : trackUsage?.entryOffsetM !== undefined ? (
              <span className="text-white font-bold" title={`${trackUsage.entryOffsetM.toFixed(1)}m from track edge`}>
                {trackUsage.entryOffsetM.toFixed(1)}m <span className="text-[9px] text-slate-400 font-normal">edge</span>
              </span>
            ) : corner.straightBrakingDistM ? (
              <span className="text-white font-bold">{corner.straightBrakingDistM}m straight</span>
            ) : (
              <span className="text-slate-500">--</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
