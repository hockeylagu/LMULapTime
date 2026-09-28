import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { computeLapDeltas } from '../../../shared/domain/lapComparison.js';
import { ReferenceLaptimeEntry, ComparableLap } from '../../../shared/types/index.js';
import { CompareLapCard } from './CompareLapCard';

export interface CompareLapsDeckProps {
  /** The compared laps, left to right. */
  laps: ComparableLap[];
  baselineLap: ComparableLap | null;
  /** The id of the player's rival's lap, tagged when compared. */
  rivalLapId?: string | null;
  setBaselineLapId: (id: string) => void;
  onToggleLap: (lap: ComparableLap) => void;
  onSelectSession?: (sessionId: string) => void;
  benchmarks: ReferenceLaptimeEntry[];
  allLaps: ComparableLap[];
  selectedCarClass: string;
  lapColors: readonly string[];
}

/** The compared laps side by side, each with its deltas to the baseline. */
export const CompareLapsDeck: React.FC<CompareLapsDeckProps> = ({
  laps,
  baselineLap,
  rivalLapId = null,
  setBaselineLapId,
  onToggleLap,
  onSelectSession,
  benchmarks,
  allLaps,
  selectedCarClass,
  lapColors,
}) => {
  if (laps.length === 0) {
    return (
      <div className="py-8 text-center space-y-2">
        <ArrowLeftRight className="w-10 h-10 text-lmu-muted mx-auto opacity-40" />
        <h4 className="text-sm font-bold text-white">No laps selected for comparison</h4>
        <p className="text-xs text-lmu-muted max-w-md mx-auto">
          Pick two drivers on the leaderboard, compare one with your best, or start from a preset above.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {laps.map((lap, index) => {
        const isBaseline = lap.id === baselineLap?.id;
        return (
          <CompareLapCard
            key={lap.id}
            lap={lap}
            isBaseline={isBaseline}
            isRival={lap.id === rivalLapId}
            deltas={baselineLap ? computeLapDeltas(baselineLap, lap) : null}
            color={lapColors[index % lapColors.length]}
            onSetBaseline={setBaselineLapId}
            onRemoveLap={onToggleLap}
            onSelectSession={onSelectSession}
            benchmarks={benchmarks}
            allLaps={allLaps}
            selectedCarClass={selectedCarClass}
          />
        );
      })}
    </div>
  );
};
