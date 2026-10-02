import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, History, RefreshCw } from 'lucide-react';
import {
  ReferenceBenchmarkDiff,
  BenchmarkDiffSummary,
  AppStatus,
} from '../../../shared/types/index.js';
import { ChangeCounts, ReferenceChangesList } from './ReferenceChangesList.js';
import { fetchBenchmarkDiffHistory, fetchBenchmarkDiffById } from '../../api/referenceApi.js';
import { apiErrorMessage, isAbortError } from '../../api/apiClient.js';
import { FOCUS_RING, SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { FeedbackMessage, SettingsFeedback, SettingsPanel } from './SettingsPanel.js';
import { formatDateTime, formatNumber, pluralize } from './settingsFormat.js';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTN03UvJDm99byA6vQPZHKOCYVvfxLu1zkJAzdaKyROykzEKY2-Xl1rl1q5znZEf36m88dxMKsY2eaO/pubhtml';

/** Where each pace category ends, as a share of the target time (shared/domain/paceCategory.ts). */
const PACE_LEGEND: ReadonlyArray<[string, string]> = [
  ['Alien', '≤ 100.5%'],
  ['Competitive', '≤ 101.5%'],
  ['Good', '≤ 103.5%'],
  ['Midpack', '≤ 105.5%'],
  ['Tail-ender', '≤ 107%'],
  ['Offline', 'slower'],
];

/** "1 Oct 2026, 09:00 — 3 changed, 5 pace shifts": what an update did, in words. */
export function describeBenchmarkUpdate(h: BenchmarkDiffSummary): string {
  const date = formatDateTime(h.timestamp, 'Unknown date');
  if (!h.hasChanges) return `${date} — no changes`;
  const parts: string[] = [];
  if (h.addedCount > 0) parts.push(`${h.addedCount} added`);
  if (h.updatedCount > 0) parts.push(`${h.updatedCount} changed`);
  if (h.removedCount > 0) parts.push(`${h.removedCount} removed`);
  if (h.totalCategoryShifts > 0) parts.push(pluralize(h.totalCategoryShifts, 'pace shift'));
  return `${date} — ${parts.join(', ')}`;
}

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
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyReload, setHistoryReload] = useState(0);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const diffRequest = useRef<AbortController | null>(null);

  const entriesCount = status?.referenceLaptimes?.entriesCount;
  const lastUpdated = status?.referenceLaptimes?.lastUpdated;
  const latest: { addedCount: number; updatedCount: number; removedCount: number; hasChanges: boolean } | null =
    updateDiff ?? history[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    fetchBenchmarkDiffHistory({ signal: controller.signal })
      .then((items) => {
        setHistoryError(null);
        if (Array.isArray(items)) setHistory(items);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setHistoryError(apiErrorMessage(err, 'Unable to load the update history.'));
      });
    return () => controller.abort();
  }, [updateDiff, historyReload]);

  // While "Latest update" is selected, it follows the newest diff.
  useEffect(() => {
    if (selectedDiffId === 'latest') setDisplayedDiff(updateDiff);
  }, [updateDiff, selectedDiffId]);

  // An update the reader just asked for shows what it changed.
  const wasUpdating = useRef(isUpdatingLaptimes);
  useEffect(() => {
    if (wasUpdating.current && !isUpdatingLaptimes && updateDiff?.hasChanges) setIsOpen(true);
    wasUpdating.current = isUpdatingLaptimes;
  }, [isUpdatingLaptimes, updateDiff]);

  const handleSelectDiffVersion = (val: string) => {
    diffRequest.current?.abort();
    setDiffError(null);

    if (val === 'latest') {
      setSelectedDiffId('latest');
      setDisplayedDiff(updateDiff);
      setIsLoadingDiff(false);
      return;
    }

    const id = parseInt(val, 10);
    if (isNaN(id)) return;

    const controller = new AbortController();
    diffRequest.current = controller;
    setSelectedDiffId(id);
    // The old diff must not sit under the new selection while this one loads, or if it fails.
    setDisplayedDiff(null);
    setIsLoadingDiff(true);

    fetchBenchmarkDiffById(id, { signal: controller.signal })
      .then((diff) => setDisplayedDiff(diff))
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setDiffError(apiErrorMessage(err, 'Unable to load that update.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingDiff(false);
      });
  };

  const hasHistory = history.length > 0 || !!displayedDiff;

  return (
    <SettingsPanel sectionId="reference-benchmarks">
      <div className="space-y-2 text-xs text-lmu-muted leading-relaxed">
        <p>
          Benchmarks are community target lap times for each layout and car class. Each of your laps is put in a pace category by how close it is to the target.
        </p>
        <p>
          {PACE_LEGEND.map(([name, limit], i) => (
            <React.Fragment key={name}>
              {i > 0 && ' · '}
              <strong className="text-lmu-text-soft">{name}</strong> <span className="font-mono">{limit}</span>
            </React.Fragment>
          ))}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-lmu-border py-4">
        <div className="space-y-1.5 min-w-0">
          {lastUpdated ? (
            <p className="text-xs text-lmu-text">
              <span className="font-mono font-semibold">{formatNumber(entriesCount ?? 0)}</span> {(entriesCount ?? 0) === 1 ? 'target' : 'targets'} · updated{' '}
              <span className="font-mono font-semibold">{formatDateTime(lastUpdated)}</span>
              {latest && (
                <>
                  {' · '}
                  {latest.hasChanges
                    ? <ChangeCounts addedCount={latest.addedCount} updatedCount={latest.updatedCount} removedCount={latest.removedCount} />
                    : <span className="text-lmu-muted">no changes</span>}
                </>
              )}
            </p>
          ) : (
            <p className="text-xs text-lmu-muted">{status ? 'No targets saved yet. Update to fetch them.' : 'Loading…'}</p>
          )}
          <p className="text-xs text-lmu-muted">
            From the public Google Sheet.{' '}
            <a href={SHEET_URL} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-lmu-text-soft hover:underline ${FOCUS_RING}`}>
              View sheet <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </p>
        </div>

        <div className="space-y-1 sm:text-right">
          <button type="button" onClick={onUpdateReferenceLaptimes} disabled={isUpdatingLaptimes} className={`${SECONDARY_BUTTON} shrink-0`}>
            <RefreshCw className={`w-4 h-4 ${isUpdatingLaptimes ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            {isUpdatingLaptimes ? 'Fetching the sheet…' : 'Update from the sheet'}
          </button>
          <p className="text-[11px] text-lmu-muted">Downloads the sheet and shows what changed.</p>
        </div>
      </div>

      <FeedbackMessage feedback={laptimesMessage} />

      {historyError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-lmu-loss break-words min-w-0">{historyError}</span>
          <button type="button" onClick={() => setHistoryReload((n) => n + 1)} className={SECONDARY_BUTTON}>Retry</button>
        </div>
      )}

      {hasHistory && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            className={`inline-flex items-center gap-2 text-xs font-semibold text-lmu-text-soft hover:text-lmu-text cursor-pointer ${FOCUS_RING}`}
          >
            <History className="w-4 h-4 text-lmu-muted" aria-hidden="true" />
            Update history
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>

          {isOpen && (
            <div className="space-y-4 border-l border-lmu-border pl-4">
              {history.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <label htmlFor="benchmark-history-select" className="text-xs text-lmu-muted">Show update</label>
                  <select
                    id="benchmark-history-select"
                    value={selectedDiffId}
                    onChange={(e) => handleSelectDiffVersion(e.target.value)}
                    className={`bg-lmu-bg border border-lmu-border rounded-xl px-3 py-1.5 text-xs text-lmu-text focus:border-lmu-accent ${FOCUS_RING} font-mono transition-colors cursor-pointer`}
                  >
                    <option value="latest">Latest update</option>
                    {history.map((h) => (
                      <option key={h.id} value={h.id}>{describeBenchmarkUpdate(h)}</option>
                    ))}
                  </select>
                  {selectedDiffId !== 'latest' && (
                    <button
                      type="button"
                      onClick={() => handleSelectDiffVersion('latest')}
                      className={`text-xs text-lmu-text-soft hover:text-lmu-text font-semibold underline underline-offset-2 cursor-pointer ${FOCUS_RING}`}
                    >
                      Back to latest update
                    </button>
                  )}
                </div>
              )}

              {diffError ? (
                <p role="alert" className="text-xs font-semibold text-lmu-loss">{diffError}</p>
              ) : isLoadingDiff ? (
                <p role="status" className="text-xs text-lmu-muted">Loading that update…</p>
              ) : (
                displayedDiff && <ReferenceChangesList updateDiff={displayedDiff} />
              )}
            </div>
          )}
        </div>
      )}
    </SettingsPanel>
  );
};
