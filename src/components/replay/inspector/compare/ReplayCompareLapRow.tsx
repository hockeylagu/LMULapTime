import React from 'react';
import { Check, CloudRain } from 'lucide-react';
import { ComparableLap } from '../../../../../shared/types/index.js';
import { CarClassBadge } from '../../../common/CarClassBadge.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';

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
      } ${FOCUS_RING}`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 truncate font-semibold text-white">
          <span className="truncate">{lap.sessionName || 'Session'} ({lap.sessionType || 'Session'})</span>
          {Boolean(lap.hasRain || lap.weatherCondition === 'Wet' || lap.weatherCondition === 'Dynamic Weather') && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-bold bg-lmu-azure-strong/20 text-lmu-azure border border-lmu-azure-strong/30 shrink-0"
              title={lap.weatherCondition || 'Wet Session'}
            >
              <CloudRain className="w-2.5 h-2.5" />
              <span>WET</span>
            </span>
          )}
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
          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-lmu-info-strong/20 text-lmu-info border border-lmu-info-strong/30">
            Current
          </span>
        )}
        {isSelected && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-lmu-gain-strong/20 text-lmu-gain border border-lmu-gain-strong/30 flex items-center gap-0.5">
            <Check className="w-3 h-3" /> Baseline
          </span>
        )}
        {lap.lapTimeString}
      </span>
    </button>
  );
});
