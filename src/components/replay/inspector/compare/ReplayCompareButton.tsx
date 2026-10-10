import React, { useMemo } from 'react';
import { Scale, Sparkles } from 'lucide-react';
import type { ComparableLap, ReplayTrajectoryData } from '../../../../../shared/types/index.js';
import { suggestReferenceLap } from '../../../../utils/referenceLaps.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

export interface ReplayCompareButtonProps {
  sessionId: string | null;
  driverName: string | null;
  trajectory: ReplayTrajectoryData | null;
  availableCompareLaps: ComparableLap[];
  onToggleCompare: () => void;
  onSelectCompareLap: (lap: ComparableLap) => void;
  formatLapTime: (sec?: number | null) => string;
  disabled?: boolean;
}

/** The Compare button, with a one-click "vs your best" when a faster lap of the driver exists. */
export const ReplayCompareButton: React.FC<ReplayCompareButtonProps> = ({
  sessionId, driverName, trajectory, availableCompareLaps, onToggleCompare, onSelectCompareLap, formatLapTime, disabled = false,
}) => {
  const currentLap = trajectory?.currentLap;
  const summary = trajectory?.laps?.find(l => l.lapNumber === currentLap);
  const currentLapTime = summary?.validatedTimeSec ?? summary?.lapTimeSec;
  const suggestion = useMemo(
    () => suggestReferenceLap(availableCompareLaps, sessionId, driverName, currentLap, currentLapTime),
    [availableCompareLaps, sessionId, driverName, currentLap, currentLapTime]
  );

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleCompare}
        disabled={disabled}
        className={`flex h-8 items-center gap-1.5 px-2.5 rounded-lg font-bold text-xs border transition-colors cursor-pointer bg-lmu-card hover:bg-white/10 border-lmu-border text-lmu-muted hover:text-white disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:hover:bg-lmu-card disabled:cursor-not-allowed ${FOCUS_RING}`}
        title="Choose a lap for telemetry comparison"
      >
        <Scale className="w-3.5 h-3.5" />
        <span>Compare</span>
      </button>
      {suggestion && (
        <button
          type="button"
          onClick={() => onSelectCompareLap(suggestion)}
          disabled={disabled}
          className="flex h-8 items-center gap-1.5 px-2.5 rounded-lg text-xs font-mono border transition-colors cursor-pointer bg-lmu-bg border-lmu-border hover:bg-lmu-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:hover:bg-lmu-card disabled:cursor-not-allowed"
          style={{ color: TELEMETRY_COLORS.baseline }}
          title={`Compare with your fastest lap in the ${suggestion.carType} here: ${suggestion.sessionType ?? ''} ${suggestion.dateString ?? ''}, lap ${suggestion.lapNum}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>vs your best {formatLapTime(suggestion.lapTime)}</span>
        </button>
      )}
    </div>
  );
};
