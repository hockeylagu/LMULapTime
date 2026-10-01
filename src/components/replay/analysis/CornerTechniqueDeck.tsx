import React from 'react';
import { CornerSegmentComparison } from '../../../utils/cornerAnalysis/index.js';
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
    <div className={`flex flex-col gap-0 px-2 font-mono text-[11px] ${className}`}>
      {/* 3-Column Phase-Based Telemetry Strip: Entry → Rotation → Exit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:divide-x divide-lmu-border/50">
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
