import React, { useEffect, useState } from 'react';
import { Globe, ExternalLink, RefreshCw, History } from 'lucide-react';
import {
  ReferenceBenchmarkDiff,
  BenchmarkDiffSummary,
  AppStatus,
} from '../../../shared/types/index.js';
import { ReferenceChangesList } from './ReferenceChangesList.js';
import { fetchBenchmarkDiffHistory, fetchBenchmarkDiffById } from '../../api/referenceApi.js';
import { FeedbackMessage, SettingsFeedback, SettingsPanel } from './SettingsPanel.js';
import { formatDateTime } from './settingsFormat.js';

export interface ReferenceLaptimesCardProps {
  status: AppStatus | null;
  isUpdatingLaptimes: boolean;
  onUpdateReferenceLaptimes: () => void;
  laptimesMessage: SettingsFeedback | null;
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
    ? formatDateTime(status.referenceLaptimes.lastUpdated)
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
    <SettingsPanel
      sectionId="reference-benchmarks"
      aside={
        <span className="text-xs font-mono text-lmu-muted">
          {status?.referenceLaptimes?.entriesCount || 0} Benchmarks Cached
        </span>
      }
    >
      <p className="text-xs text-lmu-muted leading-relaxed">
        The reference lap times are used to classify each of your laps into pace categories (<strong>Alien</strong>, <strong>Competitive</strong>, <strong>Good</strong>, <strong>Midpack</strong>, <strong>Tail-ender</strong>, <strong>Offline</strong>). Benchmark data is fetched from the official published spreadsheet and cached locally.
      </p>

      <div className="flex items-center justify-between gap-4 border-y border-lmu-border py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-lmu-muted">
            <Globe className="w-4 h-4 text-lmu-muted shrink-0" />
            <span>Source: Published Google Sheets CSV</span>
            <a
              href="https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-lmu-text-soft hover:underline ml-1"
            >
              <span>View Sheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-white">
            Updated: <span className="font-mono text-lmu-text-soft font-semibold">{lastUpdatedStr}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onUpdateReferenceLaptimes}
          disabled={isUpdatingLaptimes}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-lmu-card border border-lmu-rule text-lmu-text-soft font-semibold text-xs hover:bg-lmu-card-hover transition-colors shrink-0 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
        >
          <RefreshCw className={`w-4 h-4 ${isUpdatingLaptimes ? 'animate-spin' : ''}`} />
          {isUpdatingLaptimes ? 'Fetching spreadsheet...' : 'Update Reference Lap Time Benchmarks'}
        </button>
      </div>

      <FeedbackMessage feedback={laptimesMessage} />

      {/* Diff Version History Selector */}
      {history.length > 0 && (
        <div className="flex items-center justify-between gap-3">
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
              className="bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-white focus:border-lmu-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text font-mono transition-colors cursor-pointer"
            >
              <option value="latest">Latest Diff Snapshot</option>
              {history.map((h) => {
                const dateStr = formatDateTime(h.timestamp);
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
        <div className="flex items-center justify-between gap-3 py-3 border-y border-lmu-border text-xs text-lmu-muted">
          <span>
            Viewing historical benchmark snapshot from{' '}
            <strong>
              {displayedDiff?.timestamp ? formatDateTime(displayedDiff.timestamp) : `#${selectedDiffId}`}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => handleSelectDiffVersion('latest')}
            className="text-xs text-lmu-text-soft hover:text-white font-semibold underline underline-offset-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
          >
            Return to Latest
          </button>
        </div>
      )}

      {/* Reference Benchmark Changes / What Changed Section */}
      {isLoadingDiff ? (
        <div className="p-8 text-center text-xs text-lmu-muted">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-lmu-muted" />
          Loading historical benchmark diff...
        </div>
      ) : (
        displayedDiff && <ReferenceChangesList updateDiff={displayedDiff} />
      )}
    </SettingsPanel>
  );
};
