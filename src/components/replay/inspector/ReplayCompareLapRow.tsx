import React from 'react';
import { Check } from 'lucide-react';
import { ComparableLap } from '../../../../shared/types/index.js';
import { CarClassBadge } from '../../common/CarClassBadge.js';

export interface ReplayCompareLapRowProps {
  lap: ComparableLap;
  isSelected: boolean;
  isCurrentLap: boolean;
  onSelect: (lap: ComparableLap) => void;
}

export const ReplayCompareLapRow: React.FC<ReplayCompareLapRowProps> = React.memo(({
  lap,
  isSelected,
  isCurrentLap,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(lap)}
      className={`w-full grid grid-cols-[minmax(180px,1.4fr)_minmax(140px,1.1fr)_50px_140px] items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
        isSelected ? 'bg-lmu-accent/10 border border-lmu-accent/40' : 'border border-transparent hover:bg-lmu-card'
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">
          {lap.sessionName || 'Session'} ({lap.sessionType || 'Session'})
        </span>
        <span className="block truncate text-[11px] text-lmu-muted">
          {lap.dateString} | {lap.matchingReplayFile}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">{lap.driverName}</span>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          <span className="block truncate text-[11px] text-lmu-muted">{lap.carType}</span>
          {lap.carClass && <CarClassBadge carClass={lap.carClass} carType={lap.carType} size="xs" />}
        </div>
      </span>
      <span className="text-center font-mono text-xs text-lmu-muted">L{lap.lapNum}</span>
      <span
        className={`flex items-center justify-end gap-1.5 font-mono font-bold text-xs ${
          lap.isAllTimePB ? 'text-lmu-gold' : lap.isSessionBest ? 'text-lmu-blue' : 'text-white'
        }`}
      >
        {isCurrentLap && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
            Current
          </span>
        )}
        {isSelected && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
            <Check className="w-3 h-3" /> Baseline
          </span>
        )}
        {lap.lapTimeString}
      </span>
    </button>
  );
});
