import React from 'react';
import { FOCUS_RING } from './buttonStyles.js';
import { ReplayGlyph } from './replay/ReplayGlyph.js';

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
      aria-pressed={hasReplayOnly}
      className={`h-9 inline-flex items-center gap-1.5 px-2.5 rounded-xl border text-xs font-semibold transition-all shrink-0 cursor-pointer ${
        hasReplayOnly
          ? 'bg-lmu-raised border-lmu-rule text-white'
          : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
      } ${className} ${FOCUS_RING}`}
      title={hasReplayOnly ? titleActive : titleInactive}
    >
      <ReplayGlyph size={14} />
      <span>{label}</span>
      {replayCount > 0 && (
        <span
          className={`px-1.5 py-px rounded-full text-[10px] font-mono ${
            hasReplayOnly ? 'bg-lmu-bg text-lmu-text-soft' : 'bg-lmu-border text-lmu-muted'
          }`}
        >
          {replayCount}
        </span>
      )}
    </button>
  );
};
