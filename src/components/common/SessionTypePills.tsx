import React from 'react';

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
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelectType(type)}
            aria-label={type}
            title={type}
            className={`${btnHeight} inline-flex items-center justify-center font-mono leading-none rounded-[5px] border transition-opacity whitespace-nowrap font-bold uppercase select-none cursor-pointer tracking-wider box-border ${
              isSelected
                ? 'bg-lmu-accent text-white border-lmu-accent opacity-100 shadow-sm'
                : 'border-slate-800 text-lmu-muted hover:text-white hover:border-slate-700 opacity-40 hover:opacity-100'
            }`}
          >
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
};
