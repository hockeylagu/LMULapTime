import React from 'react';
import { ArrowLeftRight, Trophy, Sparkles, Award, RotateCcw, Activity } from 'lucide-react';
import { formatTime } from '../../utils/formatters';
import { ComparableLap } from '../../utils/lapComparison';

export interface CompareLapsHeaderProps {
  selectedTrack: string;
  allTimePBObject: ComparableLap | null;
  overallTrackBestObject: ComparableLap | null;
  isPBInComparison: boolean;
  isOverallBestInComparison: boolean;
  theoreticalBestSec: number | null;
  selectedLapsCount: number;
  onAddPersonalBest: () => void;
  onAddTheoreticalBest: () => void;
  onAddOverallTrackBest: () => void;
  onClearAll: () => void;
  onCompareTelemetry?: () => void;
}

export const CompareLapsHeader: React.FC<CompareLapsHeaderProps> = ({
  selectedTrack,
  allTimePBObject,
  overallTrackBestObject,
  isPBInComparison,
  isOverallBestInComparison,
  theoreticalBestSec,
  selectedLapsCount,
  onAddPersonalBest,
  onAddTheoreticalBest,
  onAddOverallTrackBest,
  onClearAll,
  onCompareTelemetry,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 text-xs font-bold rounded uppercase tracking-wider bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30 flex items-center gap-1">
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Telemetry Studio
          </span>
          <span className="text-xs text-lmu-muted">Apples-to-Apples Sector & Speed Analysis</span>
        </div>
        <h2 className="text-2xl font-extrabold text-white mt-1 flex items-center gap-2">
          Multi-Lap & Cross-Session Comparator
        </h2>
        <p className="text-xs text-lmu-muted mt-0.5">
          Compare any lap against Session Bests, Driver All-Time PBs, Theoretical Optimal Sectors, and Alien Reference Targets.
        </p>
      </div>

      {/* Quick Presets & Clear */}
      <div className="flex flex-wrap items-center gap-2">
        {allTimePBObject && !isPBInComparison && allTimePBObject.id !== overallTrackBestObject?.id && (
          <button
            type="button"
            onClick={onAddPersonalBest}
            className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="Add your Personal Best lap for this track & category"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            + Personal Best ({formatTime(allTimePBObject.lapTime)})
          </button>
        )}

        {theoreticalBestSec && (
          <button
            type="button"
            onClick={onAddTheoreticalBest}
            className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/40 text-purple-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="Add all-time theoretical optimal lap for this track & category"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            + Theoretical Best ({formatTime(theoreticalBestSec)})
          </button>
        )}

        {overallTrackBestObject && !isOverallBestInComparison && (
          <button
            type="button"
            onClick={onAddOverallTrackBest}
            className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title={`Add all-time fastest lap on ${selectedTrack} by ${overallTrackBestObject.driverName} (${overallTrackBestObject.lapTimeString}) across all drivers`}
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            + All-Time Best ({overallTrackBestObject.lapTimeString})
          </button>
        )}

        {selectedLapsCount === 2 && onCompareTelemetry && (
          <button
            type="button"
            onClick={onCompareTelemetry}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-lmu-accent to-indigo-600 hover:from-lmu-accent/90 hover:to-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-lmu-accent/25 border border-white/20 cursor-pointer animate-fadeIn"
            title="Inspect & Compare Telemetry traces (Speed, Throttle, Brake, Delta Time, GPS) for these 2 laps"
          >
            <Activity className="w-3.5 h-3.5" />
            Compare Telemetry
          </button>
        )}

        {selectedLapsCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="px-3 py-1.5 rounded-xl bg-lmu-card hover:bg-rose-950/40 border border-lmu-border hover:border-rose-500/40 text-xs text-lmu-muted hover:text-rose-400 font-semibold transition-all flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
};
