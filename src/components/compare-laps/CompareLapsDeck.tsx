import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { computeLapDeltas } from '../../../shared/domain/lapComparison.js';
import { ReferenceLaptimeEntry, ComparableLap } from '../../../shared/types/index.js';
import { CompareLapCard } from './CompareLapCard';

export interface CompareLapsDeckProps {
  /** The compared laps, left to right. */
  laps: ComparableLap[];
  baselineLap: ComparableLap | null;
  setBaselineLapId: (id: string) => void;
  onToggleLap: (lap: ComparableLap) => void;
  onSelectSession?: (sessionId: string) => void;
  bestComparedS1: number | null;
  bestComparedS2: number | null;
  bestComparedS3: number | null;
  benchmarks: ReferenceLaptimeEntry[];
  allLaps: ComparableLap[];
  selectedCarClass: string;
  lapColors: readonly string[];
}

const isBest = (lap: ComparableLap, value: number | null, best: number | null) =>
  lap.isValid && value !== null && best !== null && Math.abs(value - best) < 0.0005;

/** The compared laps side by side, each with its deltas to the baseline. */
export const CompareLapsDeck: React.FC<CompareLapsDeckProps> = ({
  laps,
  baselineLap,
  setBaselineLapId,
  onToggleLap,
  onSelectSession,
  bestComparedS1,
  bestComparedS2,
  bestComparedS3,
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
            deltas={baselineLap ? computeLapDeltas(baselineLap, lap) : null}
            color={lapColors[index % lapColors.length]}
            isCardS1Best={isBest(lap, lap.s1, bestComparedS1)}
            isCardS2Best={isBest(lap, lap.s2, bestComparedS2)}
            isCardS3Best={isBest(lap, lap.s3, bestComparedS3)}
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
