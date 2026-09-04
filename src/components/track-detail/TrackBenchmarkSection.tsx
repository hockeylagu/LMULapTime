import React from 'react';
import { Zap } from 'lucide-react';
import { ReferenceLaptimeEntry } from '../../../server/types';
import { BenchmarkTargetsGrid } from '../common/BenchmarkTargetsGrid';

export interface TrackBenchmarkSectionProps {
  currentBenchmark: ReferenceLaptimeEntry | null;
}

export const TrackBenchmarkSection: React.FC<TrackBenchmarkSectionProps> = ({ currentBenchmark }) => {
  return (
    <div className="glass-panel p-6 rounded-2xl space-y-6">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-5 h-5 text-lmu-gold" />
            Appropriate Reference Lap Times
          </h3>
          <p className="text-xs text-lmu-muted mt-0.5">
            Reference lap times categorized by vehicle class (strictly isolated to avoid mixing different vehicle types)
          </p>
        </div>
      </div>

      {currentBenchmark ? (
        <div className="space-y-6">
          <BenchmarkTargetsGrid benchmark={currentBenchmark} variant="grid" />
        </div>
      ) : (
        <div className="py-8 text-center text-lmu-muted">
          No reference benchmarks found for this track. Update reference laptimes in Settings.
        </div>
      )}
    </div>
  );
};
