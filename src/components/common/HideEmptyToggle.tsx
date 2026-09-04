import React from 'react';
import { FilterX } from 'lucide-react';

export interface HideEmptyToggleProps {
  hideEmpty: boolean;
  onToggle: (hideEmpty: boolean) => void;
  emptyCount?: number;
  label?: string;
  titleHiding?: string;
  titleShowing?: string;
  className?: string;
}

export const HideEmptyToggle: React.FC<HideEmptyToggleProps> = ({
  hideEmpty,
  onToggle,
  emptyCount = 0,
  label = 'Hide Empty Results',
  titleHiding = 'Hiding empty sessions (0 laps). Click to show all.',
  titleShowing = 'Showing all sessions including empty results. Click to filter out empty results.',
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={() => onToggle(!hideEmpty)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
        hideEmpty
          ? 'bg-lmu-accent/20 border-lmu-accent/60 text-lmu-accent shadow-sm'
          : 'bg-lmu-bg border-lmu-border text-lmu-muted hover:text-white'
      } ${className}`}
      title={hideEmpty ? titleHiding : titleShowing}
    >
      <FilterX className="w-3.5 h-3.5" />
      <span>{label}</span>
      {emptyCount > 0 && (
        <span
          className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
            hideEmpty ? 'bg-lmu-accent text-white' : 'bg-lmu-border text-lmu-muted'
          }`}
        >
          {emptyCount}
        </span>
      )}
    </button>
  );
};
