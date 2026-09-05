import React from 'react';
import { Flag, ArrowLeftRight, Activity } from 'lucide-react';
import { ComparableLap, computeLapDeltas } from '../../utils/lapComparison';
import { ReferenceLaptimeEntry } from '../../../server/types';
import { CompareLapCard } from './CompareLapCard';

export interface CompareLapsDeckProps {
  selectedLaps: ComparableLap[];
  baselineLap: ComparableLap | null;
  baselineLapId: string;
  setBaselineLapId: (id: string) => void;
  onToggleLap: (lap: ComparableLap) => void;
  onSelectSession?: (sessionId: string) => void;
  bestComparedS1: number | null;
  bestComparedS2: number | null;
  bestComparedS3: number | null;
  benchmarks: ReferenceLaptimeEntry[];
  allLaps: ComparableLap[];
  selectedCarClass: string;
  lapColors: string[];
  onCompareTelemetry?: () => void;
}

export const CompareLapsDeck: React.FC<CompareLapsDeckProps> = ({
  selectedLaps,
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
  onCompareTelemetry,
}) => {
  if (selectedLaps.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl text-center space-y-3">
        <ArrowLeftRight className="w-12 h-12 text-lmu-muted mx-auto opacity-40" />
        <h3 className="text-lg font-bold text-white">No Laps Selected for Comparison</h3>
        <p className="text-xs text-lmu-muted max-w-md mx-auto">
          Choose laps from the Available Laps Explorer table below or click the quick presets above (Personal Best,
          Theoretical Best, All-Time Best) to start comparing telemetry side-by-side.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 rounded-2xl space-y-4">
      {/* Header & Baseline Lap Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-lmu-border/50">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Flag className="w-4 h-4 text-lmu-gold" />
            Side-by-Side Lap Telemetry Comparison ({selectedLaps.length}/4)
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Set any lap as the <strong className="text-lmu-gold">Baseline</strong> for instant sector and velocity delta calculations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedLaps.length === 2 && onCompareTelemetry && (
            <button
              type="button"
              onClick={onCompareTelemetry}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-lmu-accent to-indigo-600 hover:from-lmu-accent/90 hover:to-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-lmu-accent/25 border border-white/20 cursor-pointer"
              title="Compare full telemetry traces (Speed, Throttle, Brake, Delta Time, GPS) for these 2 laps"
            >
              <Activity className="w-3.5 h-3.5" />
              Compare Telemetry
            </button>
          )}
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Active Baseline Lap:
          </span>
          <span className="text-xs font-mono font-bold text-lmu-gold bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-lg">
            {baselineLap ? `${baselineLap.driverName} — ${baselineLap.lapTimeString}` : 'None'}
          </span>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {selectedLaps.map((lap, index) => {
          const isBaseline = lap.id === baselineLap?.id;
          const deltas = baselineLap ? computeLapDeltas(baselineLap, lap) : null;
          const color = lapColors[index % lapColors.length];
          const isCardS1Best =
            lap.isValid && lap.s1 !== null && bestComparedS1 !== null && Math.abs(lap.s1 - bestComparedS1) < 0.0005;
          const isCardS2Best =
            lap.isValid && lap.s2 !== null && bestComparedS2 !== null && Math.abs(lap.s2 - bestComparedS2) < 0.0005;
          const isCardS3Best =
            lap.isValid && lap.s3 !== null && bestComparedS3 !== null && Math.abs(lap.s3 - bestComparedS3) < 0.0005;

          return (
            <CompareLapCard
              key={lap.id}
              lap={lap}
              isBaseline={isBaseline}
              deltas={deltas}
              color={color}
              isCardS1Best={isCardS1Best}
              isCardS2Best={isCardS2Best}
              isCardS3Best={isCardS3Best}
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
    </div>
  );
};
