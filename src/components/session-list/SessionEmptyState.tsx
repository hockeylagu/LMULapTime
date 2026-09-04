import React from 'react';
import { FilterX } from 'lucide-react';

export interface SessionEmptyStateProps {
  emptyMessage?: string;
  onResetFilters?: () => void;
  hideEmptyNotice?: React.ReactNode;
}

export const SessionEmptyState: React.FC<SessionEmptyStateProps> = ({
  emptyMessage = 'No sessions found matching filters.',
  onResetFilters,
  hideEmptyNotice,
}) => {
  return (
    <div className="py-12 text-center text-lmu-muted">
      <p className="text-base font-medium">{emptyMessage}</p>
      {onResetFilters && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-lmu-card hover:bg-lmu-accent text-white border border-lmu-border text-xs font-semibold transition-all cursor-pointer"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Reset All Filters</span>
          </button>
        </div>
      )}
      {hideEmptyNotice && (
        <div className="text-xs text-lmu-muted mt-2">
          {hideEmptyNotice}
        </div>
      )}
    </div>
  );
};
