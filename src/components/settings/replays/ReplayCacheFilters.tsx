import React from 'react';
import { Search } from 'lucide-react';
import { SEGMENT_NARROWED, SEGMENT_RESTING } from '../../common/SessionTypePills.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { REPLAY_SHOW_HINTS, REPLAY_SHOW_OPTIONS, ReplayCounts, ReplayShow } from './replayModel.js';

export interface ReplayCacheFiltersProps {
  text: string;
  onTextChange: (text: string) => void;
  show: ReplayShow;
  onShowChange: (show: ReplayShow) => void;
  counts: ReplayCounts | null;
  /** "12 of 350 replays" while the list is narrowed, empty otherwise. */
  resultText: string;
}

function countFor(show: ReplayShow, counts: ReplayCounts | null): number | null {
  if (!counts) return null;
  switch (show) {
    case 'disk': return counts.onDisk;
    case 'archived': return counts.archived;
    case 'outdated': return counts.outdated;
    default: return counts.total;
  }
}

/** The name filter and the All / On disk / Archived / Outdated segments, with a count on each. */
export const ReplayCacheFilters: React.FC<ReplayCacheFiltersProps> = ({ text, onTextChange, show, onShowChange, counts, resultText }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-72">
        <Search className="w-3.5 h-3.5 text-lmu-muted absolute left-3 top-[11px] pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Filter by replay name"
          aria-label="Filter replays by name"
          className={`w-full h-9 bg-lmu-bg border border-lmu-border rounded-xl pl-9 pr-3 text-xs text-lmu-text placeholder-lmu-muted focus:border-lmu-muted ${FOCUS_RING}`}
        />
      </div>

      <div
        role="group"
        aria-label="Show replays"
        className="inline-flex items-center gap-1.5 bg-lmu-bg px-1.5 rounded-xl border border-lmu-border font-semibold shrink-0 box-border h-9"
      >
        {REPLAY_SHOW_OPTIONS.map((option) => {
          const selected = show === option.value;
          const count = countFor(option.value, counts);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onShowChange(option.value)}
              aria-pressed={selected}
              title={REPLAY_SHOW_HINTS[option.value]}
              aria-description={REPLAY_SHOW_HINTS[option.value]}
              className={`h-[24px] px-3.5 text-xs inline-flex items-center justify-center gap-1.5 font-mono leading-none rounded-[5px] border transition-colors whitespace-nowrap font-bold uppercase select-none cursor-pointer tracking-wider box-border ${FOCUS_RING} ${
                !selected
                  ? 'border-lmu-border text-lmu-faint hover:text-lmu-text hover:border-lmu-rule'
                  : option.value === 'all'
                  ? SEGMENT_RESTING
                  : SEGMENT_NARROWED
              }`}
            >
              {option.label}
              {count !== null && <span className="tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
    <span aria-live="polite" className="text-[11px] text-lmu-muted font-mono">{resultText}</span>
  </div>
);
