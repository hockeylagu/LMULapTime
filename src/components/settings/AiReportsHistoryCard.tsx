import React, { useEffect, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { AiReportHistoryEntry } from '../../../shared/types/index.js';
import { apiErrorMessage, fetchJson, isAbortError } from '../../api/apiClient.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { formatDateTime, formatNumber, pluralize } from './settingsFormat.js';

/** The newest reports shown before "Show all": the list is a log, not a place to scroll. */
const LATEST_COUNT = 5;

export interface AiReportsHistorySectionProps {
  defaultOpen?: boolean;
}

export const AiReportsHistorySection: React.FC<AiReportsHistorySectionProps> = ({ defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [reports, setReports] = useState<AiReportHistoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<AiReportHistoryEntry[]>('/api/ai/reports', { signal: controller.signal })
      .then(data => setReports(Array.isArray(data) ? data : []))
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, 'Unable to load AI report history.'));
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [reloadCount]);
  // The first load starts in the loading state; a reload enters it here.
  const reload = () => {
    setIsLoading(true);
    setError(null);
    setReloadCount(count => count + 1);
  };

  const shown = reports && !showAll ? reports.slice(0, LATEST_COUNT) : reports;

  return (
    <div className="border-t border-lmu-border pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-lmu-text">
          <button
            type="button"
            onClick={() => setIsOpen(open => !open)}
            aria-expanded={isOpen}
            aria-controls="ai-history-content"
            className={`inline-flex items-center gap-2 text-left cursor-pointer group text-lmu-text hover:text-white transition-colors ${FOCUS_RING}`}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 text-lmu-muted transition-transform group-hover:text-lmu-text ${isOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            <span>Report History</span>
          </button>
        </h4>
        <div className="flex items-center gap-2">
          {reports && reports.length > 0 && <span className="text-xs font-mono text-lmu-muted">{formatNumber(reports.length)} cached</span>}
          <button
            type="button"
            onClick={reload}
            disabled={isLoading}
            aria-label="Refresh AI report history"
            className={`p-1.5 rounded-md text-lmu-muted hover:text-lmu-text hover:bg-lmu-card-hover transition-colors cursor-pointer disabled:cursor-default ${FOCUS_RING}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div id="ai-history-content" className="space-y-3">
          <p className="text-xs text-lmu-muted leading-relaxed">
            Every generated Gemini lap report is cached in SQLite so it can be re-displayed instantly without spending tokens again.
          </p>

          {error && (
            <div role="alert" className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-lmu-loss break-words min-w-0">{error}</span>
              <button type="button" onClick={reload} disabled={isLoading} className={SECONDARY_BUTTON}>Retry</button>
            </div>
          )}

          {isLoading && !reports && !error && <p role="status" className="text-xs text-lmu-muted">Loading reports…</p>}

          {reports && reports.length === 0 && !isLoading && (
            <p className="text-xs text-lmu-muted">No AI reports generated yet. A report you generate for a lap is kept here.</p>
          )}

          {shown && shown.length > 0 && (
            <ul aria-label="Cached AI lap reports" className="border-y border-lmu-border divide-y divide-lmu-border/50">
              {shown.map(r => (
                <li key={r.cacheKey} className="px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-xs font-semibold text-lmu-text truncate" title={r.sessionId ?? 'Previous report'}>
                      {r.sessionId ?? 'Previous report'} · Lap {r.lapNumber}
                    </span>
                    <span className="text-[11px] text-lmu-muted font-mono shrink-0">
                      {formatDateTime(r.generatedAt)}
                    </span>
                  </div>
                  {r.overallSummary && (
                    <p className="text-[11px] text-lmu-muted line-clamp-2 max-w-prose" title={r.overallSummary}>{r.overallSummary}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-lmu-muted font-mono">
                    <span>{r.model}</span>
                    {r.baselineSessionId && <span className="min-w-0 break-words">vs {r.baselineSessionId} Lap {r.baselineLapNumber}</span>}
                    {typeof r.tokensUsed?.total === 'number' && <span>{pluralize(r.tokensUsed.total, 'token')}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {reports && reports.length > LATEST_COUNT && (
            <button type="button" onClick={() => setShowAll(value => !value)} aria-expanded={showAll} className={SECONDARY_BUTTON}>
              {showAll ? 'Show latest only' : `Show all ${formatNumber(reports.length)}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const AiReportsHistoryCard: React.FC<AiReportsHistorySectionProps> = (props) => (
  <AiReportsHistorySection defaultOpen={true} {...props} />
);
