import React, { useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { AiReportHistoryEntry } from '../../../server/types';

export const AiReportsHistoryCard: React.FC = () => {
  const [reports, setReports] = useState<AiReportHistoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = () => {
    setIsLoading(true);
    setError(null);
    fetch('/api/ai/reports')
      .then(res => res.json())
      .then(data => setReports(Array.isArray(data) ? data : []))
      .catch(() => setError('Unable to load AI report history.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { loadReports(); }, []);

  return (
    <div className="glass-panel p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-lmu-accent" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider">AI Lap Report History</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-lmu-accent/20 text-lmu-accent border border-lmu-accent/30">
            {reports?.length ?? 0} Cached
          </span>
          <button
            type="button"
            onClick={loadReports}
            disabled={isLoading}
            aria-label="Refresh AI report history"
            className="p-1.5 rounded-lg border border-lmu-border text-lmu-muted hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <p className="text-xs text-lmu-muted leading-relaxed">
        Every generated Gemini lap report is cached in SQLite so it can be re-displayed instantly without spending tokens again.
      </p>

      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

      {reports && reports.length === 0 && !isLoading && (
        <p className="text-xs text-lmu-muted italic">No AI reports generated yet.</p>
      )}

      {reports && reports.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-lmu-border divide-y divide-lmu-border/50">
          {reports.map(r => (
            <div key={r.cacheKey} className="px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white truncate" title={r.replayName}>
                  {r.replayName} · Lap {r.lapNumber}
                </span>
                <span className="text-[10px] text-lmu-muted font-mono shrink-0">
                  {new Date(r.generatedAt).toLocaleString()}
                </span>
              </div>
              {r.overallSummary && (
                <p className="text-[11px] text-lmu-muted line-clamp-2">{r.overallSummary}</p>
              )}
              <div className="flex items-center gap-3 text-[10px] text-lmu-muted font-mono">
                <span>{r.model}</span>
                {r.baselineReplayName && <span>vs {r.baselineReplayName} L{r.baselineLapNumber}</span>}
                {r.tokensUsed && <span>{r.tokensUsed.total} tokens</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
