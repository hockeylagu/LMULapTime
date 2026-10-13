import React from 'react';
import { Check, CloudRain } from 'lucide-react';
import { ComparableLap } from '../../../../../shared/types/index.js';
import { CarIdentity } from '../../../vehicle/CarIdentity.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { formatTime } from '../../../../../shared/domain/formatters.js';
import { SessionTypeChip } from '../../../session-list/SessionRowParts.js';

export const REPLAY_COMPARE_COLUMNS = 'grid grid-cols-[88px_144px_minmax(150px,1fr)_minmax(240px,1.4fr)_40px_88px_88px] items-center gap-x-3';

export interface ReplayCompareLapRowProps {
  lap: ComparableLap;
  isSelected: boolean;
  isCurrentLap: boolean;
  showPlayerBadge?: boolean;
  onSelect: (lap: ComparableLap) => void;
}

export const ReplayCompareLapRow: React.FC<ReplayCompareLapRowProps> = React.memo(({
  lap,
  isSelected,
  isCurrentLap,
  showPlayerBadge = false,
  onSelect,
}) => {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(lap)}
      className={`w-full ${REPLAY_COMPARE_COLUMNS} whitespace-nowrap px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
        isSelected ? 'bg-lmu-accent/10' : isCurrentLap ? 'bg-lmu-info/5 hover:bg-lmu-info/10' : 'hover:bg-white/[0.03]'
      } ${FOCUS_RING}`}
    >
      <span className="flex min-w-0 items-center gap-2">
          <SessionTypeChip session={{ sessionName: lap.sessionName, sessionType: lap.sessionType || 'Session' }} className="min-w-0 max-w-20 truncate" />
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
      <span className="truncate font-mono text-[11px] text-lmu-muted" title={lap.timeString}>
        {lap.timeString || '—'}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-semibold text-lmu-text" title={lap.driverName}>{lap.driverName}</span>
        {showPlayerBadge && lap.isPlayer && <span className="text-[11px] font-bold px-1.5 rounded bg-lmu-accent/20 text-lmu-accent-soft shrink-0">You</span>}
      </span>
      <CarIdentity carType={lap.carType} carClass={lap.carClass} nameClassName="text-white font-medium max-w-[180px]" emptyLabel="N/A" />
      <span className="text-right font-mono text-xs text-lmu-muted">{lap.lapNumber}</span>
      <span
        className={`text-right font-mono font-bold tabular-nums text-sm ${
          lap.isAllTimePB ? 'text-lmu-personal-best' : lap.isSessionBest ? 'text-lmu-session-best' : 'text-lmu-text'
        }`}
        title={lap.isAllTimePB ? "This driver's best lap in the class: any car, any condition" : lap.isSessionBest ? 'Session best' : undefined}
      >
        {formatTime(lap.lapTime)}
      </span>
      <span className="flex items-center gap-1.5">
        {isCurrentLap && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-lmu-info-strong/20 text-lmu-info border border-lmu-info-strong/30">
            Current
          </span>
        )}
        {isSelected && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-lmu-gain-strong/20 text-lmu-gain border border-lmu-gain-strong/30 flex items-center gap-0.5">
            <Check className="w-3 h-3" aria-hidden="true" />
            <span className={isCurrentLap ? 'sr-only' : undefined}>Baseline</span>
          </span>
        )}
      </span>
    </button>
  );
});
