import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface SessionPaginationProps {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** Page numbers to show: the first, the last and the neighbours of the current page, with gaps as null. */
export const pageWindow = (page: number, pageCount: number): (number | null)[] => {
  const shown = [...new Set([1, pageCount, page - 1, page, page + 1])].filter(p => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return shown.flatMap((p, i) => {
    const gap = i > 0 ? p - shown[i - 1] : 1;
    // A gap of a single page shows that page: an ellipsis would take the same room and hide it.
    if (gap === 2) return [p - 1, p];
    return gap > 2 ? [null, p] : [p];
  });
};

const STEP = 'h-7 min-w-7 px-1.5 inline-flex items-center justify-center rounded-md font-mono text-[11px] tabular-nums transition-colors';

export const SessionPagination: React.FC<SessionPaginationProps> = ({ page, pageCount, start, end, total, onPageChange }) => (
  <nav aria-label="Session pages" className="flex items-center justify-between gap-4 pt-4 border-t border-lmu-border/60">
    <p className="text-xs text-lmu-muted">
      <span className="font-mono text-lmu-text-soft tabular-nums">{(start + 1).toLocaleString()}–{end.toLocaleString()}</span>
      {' '}of <span className="font-mono text-lmu-text-soft tabular-nums">{total.toLocaleString()}</span> sessions
    </p>
    {pageCount > 1 && (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className={`${STEP} text-lmu-text-soft hover:text-white hover:bg-lmu-raised disabled:text-lmu-faint disabled:hover:bg-transparent disabled:cursor-default cursor-pointer`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageWindow(page, pageCount).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className={`${STEP} text-lmu-faint`} aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`${STEP} cursor-pointer ${
                p === page ? 'bg-lmu-raised text-white font-bold' : 'text-lmu-muted hover:text-white hover:bg-lmu-raised/60'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === pageCount}
          aria-label="Next page"
          className={`${STEP} text-lmu-text-soft hover:text-white hover:bg-lmu-raised disabled:text-lmu-faint disabled:hover:bg-transparent disabled:cursor-default cursor-pointer`}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    )}
  </nav>
);
