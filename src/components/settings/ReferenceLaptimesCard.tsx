import React, { useEffect, useState } from 'react';
import { Database, Globe, ExternalLink, RefreshCw, CheckCircle2, History } from 'lucide-react';
import {
  ReferenceBenchmarkDiff,
  BenchmarkDiffSummary,
  AppStatus,
} from '../../../shared/types/index.js';
import { ReferenceChangesList } from './ReferenceChangesList.js';
import { fetchBenchmarkDiffHistory, fetchBenchmarkDiffById } from '../../api/referenceApi.js';

export interface ReferenceLaptimesCardProps {
  status: AppStatus | null;
  isUpdatingLaptimes: boolean;
  onUpdateReferenceLaptimes: () => void;
  laptimesMessage: string | null;
  updateDiff: ReferenceBenchmarkDiff | null;
}

export const ReferenceLaptimesCard: React.FC<ReferenceLaptimesCardProps> = ({
  status,
  isUpdatingLaptimes,
  onUpdateReferenceLaptimes,
  laptimesMessage,
  updateDiff,
}) => {
  const [history, setHistory] = useState<BenchmarkDiffSummary[]>([]);
  const [selectedDiffId, setSelectedDiffId] = useState<number | 'latest'>('latest');
  const [displayedDiff, setDisplayedDiff] = useState<ReferenceBenchmarkDiff | null>(updateDiff);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  const lastUpdatedStr = status?.referenceLaptimes?.lastUpdated
    ? new Date(status.referenceLaptimes.lastUpdated).toLocaleString()
    : 'Not cached yet';

  // Load history list on mount and when updateDiff changes
  useEffect(() => {
    fetchBenchmarkDiffHistory()
      .then((items) => {
        if (Array.isArray(items)) {
          setHistory(items);
        }
      })
      .catch((err) => {
        console.warn('Failed to load benchmark diff history:', err);
      });
  }, [updateDiff]);

  // Keep displayedDiff in sync with updateDiff when on 'latest'
  useEffect(() => {
    if (selectedDiffId === 'latest') {
      setDisplayedDiff(updateDiff);
    }
  }, [updateDiff, selectedDiffId]);

  const handleSelectDiffVersion = (val: string) => {
    if (val === 'latest') {
      setSelectedDiffId('latest');
      setDisplayedDiff(updateDiff);
      return;
    }

    const id = parseInt(val, 10);
    if (isNaN(id)) return;

    setSelectedDiffId(id);
    setIsLoadingDiff(true);

    fetchBenchmarkDiffById(id)
      .then((diff) => {
        setDisplayedDiff(diff);
      })
      .catch((err) => {
        console.error('Failed to load historical benchmark diff:', err);
      })
      .finally(() => {
        setIsLoadingDiff(false);
      });
  };

  return (
    <div className="bg-lmu-card border border-lmu-border p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between border-b border-lmu-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-lmu-gold" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider">Reference Lap Time Benchmarks</h3>
        </div>
        <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-lmu-gold/20 text-lmu-gold border border-lmu-gold/30">
          {status?.referenceLaptimes?.entriesCount || 0} Benchmarks Cached
        </span>
      </div>

      <p className="text-xs text-lmu-muted leading-relaxed">
        The reference lap times are used to classify each of your laps into pace categories (<strong>Alien</strong>, <strong>Competitive</strong>, <strong>Good</strong>, <strong>Midpack</strong>, <strong>Tail-ender</strong>, <strong>Offline</strong>). Benchmark data is fetched from the official published spreadsheet and cached locally.
      </p>

      <div className="bg-lmu-bg p-4 rounded-xl border border-lmu-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-lmu-muted">
            <Globe className="w-4 h-4 text-lmu-cyan shrink-0" />
            <span>Source: Published Google Sheets CSV</span>
            <a
              href="https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-lmu-accent-text hover:underline ml-1"
            >
              <span>View Sheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-white">
            Last Cached/Updated: <span className="font-mono text-lmu-gold font-semibold">{lastUpdatedStr}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onUpdateReferenceLaptimes}
          disabled={isUpdatingLaptimes}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lmu-gold text-lmu-bg font-extrabold text-xs uppercase tracking-wider hover:bg-lmu-warn transition-all shrink-0 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isUpdatingLaptimes ? 'animate-spin' : ''}`} />
          {isUpdatingLaptimes ? 'Fetching Spreadsheet...' : 'Update Reference Lap Time Benchmarks'}
        </button>
      </div>

      {laptimesMessage && (
        <div className="p-3 rounded-xl bg-lmu-green/10 border border-lmu-green/20 text-xs font-semibold text-lmu-green flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{laptimesMessage}</span>
        </div>
      )}

      {/* Diff Version History Selector */}
      {history.length > 0 && (
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-lmu-border/40">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <History className="w-4 h-4 text-lmu-muted" />
            <span>Benchmark Update History</span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="benchmark-history-select" className="text-xs text-lmu-muted sr-only">
              Select update snapshot
            </label>
            <select
              id="benchmark-history-select"
              value={selectedDiffId}
              onChange={(e) => handleSelectDiffVersion(e.target.value)}
              aria-label="Benchmark Update History Version"
              className="bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-lmu-accent font-mono transition-all cursor-pointer"
            >
              <option value="latest">Latest Diff Snapshot</option>
              {history.map((h) => {
                const dateStr = new Date(h.timestamp).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const summaryText = h.hasChanges
                  ? `+${h.addedCount} / ~${h.updatedCount} / -${h.removedCount} (${h.totalCategoryShifts} shifts)`
                  : 'No changes';
                return (
                  <option key={h.id} value={h.id}>
                    {dateStr} — {summaryText}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      )}

      {/* Viewing older diff notification banner */}
      {selectedDiffId !== 'latest' && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-purple-950/30 border border-purple-800/40 text-xs text-purple-200">
          <span>
            Viewing historical benchmark snapshot from{' '}
            <strong>
              {displayedDiff?.timestamp ? new Date(displayedDiff.timestamp).toLocaleString() : `#${selectedDiffId}`}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => handleSelectDiffVersion('latest')}
            className="text-xs text-purple-300 hover:text-white font-semibold underline cursor-pointer"
          >
            Return to Latest
          </button>
        </div>
      )}

      {/* Reference Benchmark Changes / What Changed Section */}
      {isLoadingDiff ? (
        <div className="p-8 text-center text-xs text-lmu-muted">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-lmu-accent-text" />
          Loading historical benchmark diff...
        </div>
      ) : (
        displayedDiff && <ReferenceChangesList updateDiff={displayedDiff} />
      )}
    </div>
  );
};
