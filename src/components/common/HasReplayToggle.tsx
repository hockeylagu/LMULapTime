import React from 'react';
import { Video } from 'lucide-react';

export interface HasReplayToggleProps {
  hasReplayOnly: boolean;
  onToggle: (hasReplayOnly: boolean) => void;
  replayCount?: number;
  label?: string;
  ariaLabel?: string;
  titleActive?: string;
  titleInactive?: string;
  className?: string;
}

export const HasReplayToggle: React.FC<HasReplayToggleProps> = ({
  hasReplayOnly,
  onToggle,
  replayCount = 0,
  label = 'Has Replay',
  ariaLabel = 'Filter sessions with replay',
  titleActive = 'Showing only sessions with recorded replay (.Vcr). Click to show all.',
  titleInactive = 'Filter to sessions with recorded replay (.Vcr) telemetry.',
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={() => onToggle(!hasReplayOnly)}
      aria-label={ariaLabel}
      className={`h-9 inline-flex items-center gap-1.5 px-2.5 rounded-xl border text-xs font-semibold transition-all shrink-0 cursor-pointer ${
        hasReplayOnly
          ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
          : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
      } ${className}`}
      title={hasReplayOnly ? titleActive : titleInactive}
    >
      <Video className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
      {replayCount > 0 && (
        <span
          className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
            hasReplayOnly ? 'bg-lmu-accent text-white' : 'bg-lmu-border text-lmu-muted'
          }`}
        >
          {replayCount}
        </span>
      )}
    </button>
  );
};
