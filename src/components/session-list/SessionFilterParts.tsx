import React from 'react';
import { Search, X, FilterX } from 'lucide-react';

/** Free-text search over the session list, with a clear button once something is typed. */
export const SessionSearchField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => (
  <div className="relative flex-1 min-w-[240px]">
    <Search className="w-3.5 h-3.5 text-lmu-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-lmu-bg border border-lmu-border rounded-xl pl-9 pr-8 h-9 text-xs text-white placeholder-lmu-muted focus:outline-none focus:border-lmu-muted transition-colors"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lmu-muted hover:text-white p-0.5 rounded cursor-pointer"
        title="Clear search"
        aria-label="Clear search"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

/** Shown only while a filter narrows the list: one click back to every session. */
export const ClearFiltersButton: React.FC<{ onClear?: () => void }> = ({ onClear }) =>
  onClear ? (
    <button
      type="button"
      onClick={onClear}
      className="h-9 inline-flex items-center gap-1.5 px-2.5 rounded-xl text-xs font-semibold text-lmu-text-soft hover:text-white hover:bg-lmu-raised transition-colors cursor-pointer shrink-0"
    >
      <FilterX className="w-3.5 h-3.5" />
      <span>Clear filters</span>
    </button>
  ) : null;

/**
 * Two-row toolbar of a session list: what to look at and how to order it on top,
 * what to narrow it to underneath, with the clear action at the end of that row.
 */
export const SessionFilterRows: React.FC<{
  find: React.ReactNode;
  order: React.ReactNode;
  narrow: React.ReactNode;
  onClear?: () => void;
  className?: string;
}> = ({ find, order, narrow, onClear, className = '' }) => (
  <div className={`space-y-3 ${className}`}>
    <div className="flex flex-wrap items-center gap-3">
      {find}
      <div className="flex items-center gap-3 ml-auto">{order}</div>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      {narrow}
      <div className="ml-auto">
        <ClearFiltersButton onClear={onClear} />
      </div>
    </div>
  </div>
);
