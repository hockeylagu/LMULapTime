import React, { useMemo } from 'react';
import { Scale, Sparkles } from 'lucide-react';
import type { ComparableLap, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { suggestReferenceLap } from './suggestReferenceLap.js';

export interface ReplayCompareButtonProps {
  replayName: string | null;
  driverName: string | null;
  trajectory: ReplayTrajectoryData | null;
  availableCompareLaps: ComparableLap[];
  onToggleCompare: () => void;
  onSelectCompareLap: (lap: ComparableLap) => void;
  formatLapTime: (sec?: number | null) => string;
}

/** The Compare button, with a one-click "vs your best" when a faster lap of the driver exists. */
export const ReplayCompareButton: React.FC<ReplayCompareButtonProps> = ({
  replayName, driverName, trajectory, availableCompareLaps, onToggleCompare, onSelectCompareLap, formatLapTime,
}) => {
  const currentLap = trajectory?.currentLap;
  const summary = trajectory?.laps?.find(l => l.lapNumber === currentLap);
  const currentLapTime = summary?.validatedTimeSec ?? summary?.lapTimeSec;
  const suggestion = useMemo(
    () => suggestReferenceLap(availableCompareLaps, replayName, driverName, currentLap, currentLapTime),
    [availableCompareLaps, replayName, driverName, currentLap, currentLapTime]
  );

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleCompare}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-bold text-xs border transition-all cursor-pointer bg-lmu-card hover:bg-white/10 border-lmu-border text-lmu-muted hover:text-white"
        title="Choose a lap for telemetry comparison"
      >
        <Scale className="w-3.5 h-3.5" />
        <span>Compare</span>
      </button>
      {suggestion && (
        <button
          type="button"
          onClick={() => onSelectCompareLap(suggestion)}
          className="flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-mono border transition-all cursor-pointer bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
          title={`Compare with your fastest lap in the ${suggestion.carType} here: ${suggestion.sessionType ?? ''} ${suggestion.dateString ?? ''}, lap ${suggestion.lapNum}`}
        >
          <Sparkles className="w-3 h-3" />
          <span>vs your best {formatLapTime(suggestion.lapTime)}</span>
        </button>
      )}
    </div>
  );
};
