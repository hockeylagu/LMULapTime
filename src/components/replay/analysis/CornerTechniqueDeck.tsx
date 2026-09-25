import React from 'react';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis.js';
import {
  timeDeltaClass,
  formatTimeDelta,
} from './CornerTableFormatters.js';
import {
  EntryPhaseCard,
  RotationPhaseCard,
  ExitPhaseCard,
} from './CornerPhaseCards.js';

export interface CornerTechniqueDeckProps {
  corner: CornerSegmentComparison;
  isCompareMode?: boolean;
  className?: string;
}

export const CornerTechniqueDeck: React.FC<CornerTechniqueDeckProps> = ({
  corner,
  isCompareMode = false,
  className = '',
}) => {

  const brakeDistToApex = corner.primaryBrakingDistM !== null
    ? Math.max(0, Math.round(corner.minDistM - corner.primaryBrakingDistM))
    : null;
  const turnInDistToApex = corner.primaryTurnInDistM !== null && corner.primaryTurnInDistM !== undefined
    ? Math.max(0, Math.round(corner.minDistM - corner.primaryTurnInDistM))
    : null;
  const initialThrottleOffset = corner.primaryInitialThrottleDistM != null
    ? Math.round(corner.primaryInitialThrottleDistM - corner.minDistM)
    : null;
  const fullThrottleOffset = corner.primaryThrottleOnDistM !== null
    ? Math.round(corner.primaryThrottleOnDistM - corner.minDistM)
    : null;

  return (
    <div className={`flex flex-col gap-2 p-2 pt-0 font-mono text-[11px] ${className}`}>
      {/* Milestone / Phase Delta Summary Strip */}
      <div className="flex flex-wrap items-center justify-between px-2.5 py-1.5 rounded-lg bg-lmu-deep border border-lmu-border/50 text-[10px] text-slate-300 gap-1.5">
        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">
          {isCompareMode ? 'Phase Deltas' : 'Corner Flow'}
        </span>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px]">
          {isCompareMode ? (
            <>
              <span>
                <span className="text-cyan-400 font-semibold">Entry:</span>{' '}
                <span className={timeDeltaClass(corner.phaseTiming?.entry?.timeDeltaSec ?? 0)}>
                  {corner.phaseTiming?.entry ? formatTimeDelta(corner.phaseTiming.entry.timeDeltaSec) : '--'}
                </span>
              </span>
              <span className="text-slate-700">•</span>
              <span>
                <span className="text-rose-400 font-semibold">Rotation:</span>{' '}
                <span className={timeDeltaClass(corner.phaseTiming?.rotation?.timeDeltaSec ?? 0)}>
                  {corner.phaseTiming ? formatTimeDelta(corner.phaseTiming.rotation.timeDeltaSec) : '--'}
                </span>
              </span>
              <span className="text-slate-700">•</span>
              <span>
                <span className="text-emerald-400 font-semibold">Exit:</span>{' '}
                <span className={timeDeltaClass(corner.phaseTiming?.exit?.timeDeltaSec ?? 0)}>
                  {corner.phaseTiming ? formatTimeDelta(corner.phaseTiming.exit.timeDeltaSec) : '--'}
                </span>
              </span>
            </>
          ) : (
            <>
              <span>
                <span className="text-cyan-400 font-semibold">Entry:</span>{' '}
                <span className="text-white font-bold">{corner.exitDistM > corner.entryDistM ? `${Math.round(corner.minDistM - corner.entryDistM)}m` : '--'}</span>
              </span>
              <span className="text-slate-700">•</span>
              <span>
                <span className="text-rose-400 font-semibold">Apex:</span>{' '}
                <span className="text-white font-bold">{corner.primaryMinSpeedKmh} km/h</span>
              </span>
              <span className="text-slate-700">•</span>
              <span>
                <span className="text-emerald-400 font-semibold">Exit:</span>{' '}
                <span className="text-white font-bold">{corner.primaryExitSpeedKmh} km/h</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* 3-Column Phase-Based Telemetry Strip: Entry → Rotation → Exit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <EntryPhaseCard
          corner={corner}
          isCompareMode={isCompareMode}
          brakeDistToApex={brakeDistToApex}
          turnInDistToApex={turnInDistToApex}
        />

        <RotationPhaseCard
          corner={corner}
          isCompareMode={isCompareMode}
        />

        <ExitPhaseCard
          corner={corner}
          isCompareMode={isCompareMode}
          initialThrottleOffset={initialThrottleOffset}
          fullThrottleOffset={fullThrottleOffset}
        />
      </div>
    </div>
  );
};
