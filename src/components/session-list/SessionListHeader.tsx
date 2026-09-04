import React from 'react';
import { LayoutGrid, Table as TableIcon } from 'lucide-react';

export interface SessionListHeaderProps {
  headerTitle?: React.ReactNode;
  headerSubtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
}

export const SessionListHeader: React.FC<SessionListHeaderProps> = ({
  headerTitle,
  headerSubtitle,
  headerActions,
  viewMode,
  onViewModeChange,
}) => {
  const hasHeaderContent = Boolean(headerTitle || headerSubtitle || headerActions);

  const toggleButtons = (
    <div className="flex items-center bg-lmu-bg p-1 rounded-xl border border-lmu-border text-xs font-semibold shrink-0">
      <button
        type="button"
        onClick={() => onViewModeChange('grid')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
          viewMode === 'grid'
            ? 'bg-lmu-accent text-white shadow-sm font-bold'
            : 'text-lmu-muted hover:text-white'
        }`}
        title="Cards view"
        aria-label="Cards view"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        <span>Cards</span>
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange('table')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
          viewMode === 'table'
            ? 'bg-lmu-accent text-white shadow-sm font-bold'
            : 'text-lmu-muted hover:text-white'
        }`}
        title="Table view"
        aria-label="Table view"
      >
        <TableIcon className="w-3.5 h-3.5" />
        <span>Table</span>
      </button>
    </div>
  );

  if (!hasHeaderContent) {
    return <div className="flex justify-end mb-2">{toggleButtons}</div>;
  }

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-lmu-border/50 pb-4">
      <div>
        {headerTitle && (
          <div className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            {headerTitle}
          </div>
        )}
        {headerSubtitle && (
          <div className="text-xs text-lmu-muted mt-0.5">
            {headerSubtitle}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {headerActions}
        {toggleButtons}
      </div>
    </div>
  );
};
