import React from 'react';
import { getSessionTypeStyle } from './sessionTypeStyles.js';
import { FOCUS_RING } from './buttonStyles.js';

/** "All" is the resting state: selected, but narrowing nothing, so it stays neutral. */
export const SEGMENT_RESTING = 'bg-lmu-raised text-white border-lmu-rule';
/** A choice that narrows the list shows in red, unless it has a hue of its own (session types, car classes). */
export const SEGMENT_NARROWED = 'bg-lmu-accent text-white border-lmu-accent';

export const SESSION_TYPE_OPTIONS = ['All', 'Practice', 'Qualifying', 'Race'] as const;

export interface SessionTypePillsProps {
  selectedType: string;
  onSelectType: (type: string) => void;
  options?: readonly string[];
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export const SessionTypePills: React.FC<SessionTypePillsProps> = ({
  selectedType,
  onSelectType,
  options = SESSION_TYPE_OPTIONS,
  className = '',
  size = 'sm',
}) => {
  const containerHeight = size === 'xs' ? 'h-8' : size === 'md' ? 'h-10' : 'h-9';
  const btnHeight =
    size === 'xs' ? 'h-[20px] px-2.5 text-[11px]' : size === 'md' ? 'h-[28px] px-4 text-xs' : 'h-[24px] px-3.5 text-xs';

  return (
    <div
      role="group"
      aria-label="Filter by session type"
      className={`inline-flex items-center gap-1.5 bg-lmu-bg px-1.5 rounded-xl border border-lmu-border font-semibold shrink-0 box-border ${containerHeight} ${className}`}
    >
      {options.map((type) => {
        const isSelected = selectedType === type;
        const displayLabel = type === 'All' ? 'ALL' : type;
        const style = getSessionTypeStyle(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelectType(type)}
            aria-label={type}
            aria-pressed={isSelected}
            title={type}
            className={`${btnHeight} inline-flex items-center justify-center gap-1.5 font-mono leading-none rounded-[5px] border transition-colors whitespace-nowrap font-bold uppercase select-none cursor-pointer tracking-wider box-border ${
              !isSelected
                ? 'border-lmu-border text-lmu-faint hover:text-white hover:border-lmu-rule'
                : type === 'All'
                ? SEGMENT_RESTING
                : style
                ? style.chip
                : SEGMENT_NARROWED
            } ${FOCUS_RING}`}
          >
            {style && !isSelected && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} aria-hidden="true" />}
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
};
