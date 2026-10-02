import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { ReplayScanStatus, ScanStatus } from '../../../shared/types/index.js';
import { updateSearchParams } from '../../utils/urlParams.js';
import { SECONDARY_BUTTON } from '../common/buttonStyles.js';
import { ReplayCacheFilters } from './replays/ReplayCacheFilters.js';
import { ReplayCacheTable } from './replays/ReplayCacheTable.js';
import { ReplayProgress } from './replays/ReplayProgress.js';
import {
  formatSort,
  parseShow,
  parseSort,
  ReplayShow,
  ReplaySortKey,
  versionStatus,
  visibleReplays,
} from './replays/replayModel.js';
import { ReplayCacheState } from './replays/useReplayCache.js';
import { SettingsPanel } from './SettingsPanel.js';
import { formatBytes, formatNumber, pluralize } from './settingsFormat.js';

/** Settings-scoped query params, kept apart from `section` and from other pages' params. */
export const REPLAY_PARAMS = { view: 'replayView', filter: 'replayFilter', sort: 'replaySort' } as const;

export interface ReplayCacheCardProps {
  replay: ReplayCacheState;
  replayScanStatus?: ScanStatus | ReplayScanStatus | null;
}

/** Rows drawn at first and per "Show more": a library of thousands of replays stays quick to open and sort. */
export const REPLAY_ROWS_PAGE = 200;

const Readout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-mono font-semibold text-lmu-text">{children}</span>
);

/** Every replay in the cache, on disk or archived after LMU deleted the file, with its filters, sort and progress. */
export const ReplayCacheCard: React.FC<ReplayCacheCardProps> = ({ replay: cache, replayScanStatus }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { replays, counts, currentVersion } = cache;

  const text = searchParams.get(REPLAY_PARAMS.filter) ?? '';
  const show = parseShow(searchParams.get(REPLAY_PARAMS.view));
  const sort = parseSort(searchParams.get(REPLAY_PARAMS.sort));

  const rows = useMemo(
    () => (replays ? visibleReplays(replays, { text, show, sort, currentVersion }) : []),
    [replays, text, show, sort, currentVersion]
  );

  const setText = (value: string) => updateSearchParams(searchParams, setSearchParams, { [REPLAY_PARAMS.filter]: value });
  const setShow = (value: ReplayShow) =>
    updateSearchParams(searchParams, setSearchParams, { [REPLAY_PARAMS.view]: value === 'all' ? null : value });
  const toggleSort = (key: ReplaySortKey) => {
    const next = sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' as const : 'asc' as const }
      : { key, dir: 'asc' as const };
    updateSearchParams(searchParams, setSearchParams, { [REPLAY_PARAMS.sort]: formatSort(next) });
  };
  const clearFilters = () =>
    updateSearchParams(searchParams, setSearchParams, { [REPLAY_PARAMS.filter]: null, [REPLAY_PARAMS.view]: null });

  // The row limit starts over whenever the filter, the segment or the sort changes.
  const listKey = `${text}|${show}|${formatSort(sort)}`;
  const [limit, setLimit] = useState({ key: listKey, rows: REPLAY_ROWS_PAGE });
  const rowLimit = limit.key === listKey ? limit.rows : REPLAY_ROWS_PAGE;
  const shownRows = rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;

  const isNarrowed = text.trim() !== '' || show !== 'all';
  const resultText = isNarrowed && counts
    ? `${formatNumber(rows.length)} of ${pluralize(counts.total, 'replay')}`
    : '';

  return (
    <SettingsPanel
      sectionId="replay-cache"
      aside={
        <button
          type="button"
          onClick={cache.reload}
          disabled={cache.isLoading}
          aria-label="Refresh cached replays"
          className="p-1.5 rounded-md text-lmu-muted hover:text-lmu-text hover:bg-lmu-card-hover transition-colors disabled:text-lmu-faint cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cache.isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        </button>
      }
    >
      {counts && counts.total > 0 && (
        <p className="text-xs text-lmu-muted">
          <Readout>{formatNumber(counts.total)}</Readout> {counts.total === 1 ? 'replay' : 'replays'} · <Readout>{formatNumber(counts.onDisk)}</Readout> on disk ·{' '}
          <Readout>{formatNumber(counts.archived)}</Readout> kept after LMU deleted {counts.archived === 1 ? 'it' : 'them'} ·{' '}
          <Readout>{formatBytes(counts.fileSizeBytes)}</Readout> stored as <Readout>{formatBytes(counts.compressedSizeBytes)}</Readout>
        </p>
      )}

      {versionStatus(counts, currentVersion) && (
        <p className="text-xs text-lmu-muted" data-testid="replay-version-status">{versionStatus(counts, currentVersion)}</p>
      )}

      <p className="text-xs text-lmu-muted leading-relaxed">
        Replay metadata, drivers, laps and full-resolution telemetry are parsed once and cached in
        SQLite (brotli-compressed) during each session scan. Replays LMU has deleted are never touched
        and stay fully usable from the cache.
      </p>

      <ReplayProgress replayScanStatus={replayScanStatus} activeUpgrade={cache.activeUpgrade} upgradeError={cache.upgradeError} pendingUpgrade={cache.pendingUpgrade} />

      {cache.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-lmu-loss break-words min-w-0">{cache.error}</span>
          <button type="button" onClick={cache.reload} disabled={cache.isLoading} className={SECONDARY_BUTTON}>
            Retry
          </button>
        </div>
      )}

      {replays === null && !cache.error && (
        <p role="status" className="text-xs text-lmu-muted">Loading replays…</p>
      )}

      {replays && replays.length === 0 && (
        <p className="text-xs text-lmu-muted">
          No replays cached yet. Set the replays folder, then save it in Folder Paths &amp; Driver (a sync runs after saving).
        </p>
      )}

      {replays && replays.length > 0 && (
        <div className="space-y-3">
          <ReplayCacheFilters
            text={text}
            onTextChange={setText}
            show={show}
            onShowChange={setShow}
            counts={counts}
            resultText={resultText}
          />
          {rows.length > 0 ? (
            <>
              <ReplayCacheTable rows={shownRows} sort={sort} onSort={toggleSort} currentVersion={currentVersion} />
              {rows.length > shownRows.length && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-lmu-muted">
                  <span className="font-mono">Showing {formatNumber(shownRows.length)} of {formatNumber(rows.length)}</span>
                  <button
                    type="button"
                    onClick={() => setLimit({ key: listKey, rows: rowLimit + REPLAY_ROWS_PAGE })}
                    className={SECONDARY_BUTTON}
                  >
                    Show {formatNumber(Math.min(REPLAY_ROWS_PAGE, rows.length - shownRows.length))} more
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-6 text-center text-xs text-lmu-muted space-y-3">
              <p>No replay matches these filters.</p>
              <button type="button" onClick={clearFilters} className={SECONDARY_BUTTON}>Clear filters</button>
            </div>
          )}
        </div>
      )}
    </SettingsPanel>
  );
};
