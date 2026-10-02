import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AiReportHistoryEntry } from '../../../shared/types/index.js';
import { fetchJson } from '../../api/apiClient.js';
import { SettingsPanel } from './SettingsPanel.js';
import { formatDateTime } from './settingsFormat.js';

export const AiReportsHistoryCard: React.FC = () => {
  const [reports, setReports] = useState<AiReportHistoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = () => {
    setIsLoading(true);
    setError(null);
    fetchJson<AiReportHistoryEntry[]>('/api/ai/reports')
      .then(data => setReports(Array.isArray(data) ? data : []))
      .catch(() => setError('Unable to load AI report history.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadReports(); }, []);

  return (
    <SettingsPanel
      sectionId="ai-history"
      aside={
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-lmu-muted">
            {reports?.length ?? 0} Cached
          </span>
          <button
            type="button"
            onClick={loadReports}
            disabled={isLoading}
            aria-label="Refresh AI report history"
            className="p-1.5 rounded-md text-lmu-muted hover:text-white hover:bg-lmu-card-hover transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-lmu-accent-text"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      <p className="text-xs text-lmu-muted leading-relaxed">
        Every generated Gemini lap report is cached in SQLite so it can be re-displayed instantly without spending tokens again.
      </p>

      {error && <p role="alert" className="text-xs font-semibold text-lmu-loss">{error}</p>}

      {reports && reports.length === 0 && !isLoading && (
        <p className="text-xs text-lmu-faint">No AI reports generated yet.</p>
      )}

      {reports && reports.length > 0 && (
        <div
          role="region"
          aria-label="Cached AI lap reports"
          tabIndex={0}
          className="relative max-h-72 overflow-y-auto border-y border-lmu-border divide-y divide-lmu-border/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lmu-accent-text"
        >
          {reports.map(r => (
            <div key={r.cacheKey} className="px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white truncate" title={r.replayName}>
                  {r.replayName} · Lap {r.lapNumber}
                </span>
                <span className="text-[10px] text-lmu-muted font-mono shrink-0">
                  {formatDateTime(r.generatedAt)}
                </span>
              </div>
              {r.overallSummary && (
                <p className="text-[11px] text-lmu-muted line-clamp-2 max-w-prose" title={r.overallSummary}>{r.overallSummary}</p>
              )}
              <div className="flex items-center gap-3 text-[10px] text-lmu-muted font-mono">
                <span>{r.model}</span>
                {r.baselineReplayName && <span>vs {r.baselineReplayName} Lap {r.baselineLapNumber}</span>}
                {r.tokensUsed && <span>{r.tokensUsed.total} tokens</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsPanel>
  );
};
