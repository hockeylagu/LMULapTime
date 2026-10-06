import React from 'react';
import { AlertCircle, ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { ReplayCacheSummary } from '../../../../shared/types/index.js';
import { formatBytes, formatDateTime, formatNumber } from '../settingsFormat.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import {
  formatDuration,
  isArchived,
  isArchivedBehind,
  isOutdated,
  isUnread,
  ReplaySort,
  ReplaySortKey,
  splitReplayName,
  versionOf,
} from './replayModel.js';

interface Column {
  key: ReplaySortKey;
  label: string;
  align: 'left' | 'center' | 'right';
  /** Plain-words meaning of the column, read out by screen readers and shown as the tooltip. */
  hint?: string;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Replay', align: 'left' },
  { key: 'source', label: 'Disk', align: 'left', hint: 'Whether LMU still has the replay file, or the cache holds the only copy' },
  { key: 'version', label: 'Version', align: 'center', hint: 'The version of the replay decoder the replay was last decoded with. On-disk replays behind the current version are decoded again in the background.' },
  { key: 'drivers', label: 'Drivers', align: 'right', hint: 'Cars in the replay' },
  { key: 'duration', label: 'Duration', align: 'right' },
  { key: 'size', label: 'File size', align: 'right', hint: 'Size of the original replay file LMU wrote' },
  { key: 'compressed', label: 'Stored size', align: 'right', hint: 'Space the cache uses for this replay, compressed' },
  { key: 'date', label: 'Date', align: 'right' },
  { key: 'decoded', label: 'Telemetry', align: 'right', hint: 'Cars whose full telemetry is decoded and stored in the cache' },
];

const ARCHIVED_VERSION_HINT =
  'The original replay file is gone, so this replay cannot be decoded again. It was decoded with an older version of the app and is still fully usable.';

const TEXT_ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;

const ReplayName: React.FC<{ filename: string }> = ({ filename }) => {
  const { head, tail } = splitReplayName(filename);
  return (
    <span className="flex min-w-0" title={filename}>
      <span className="truncate whitespace-pre">{head}</span>
      {tail && <span className="shrink-0 whitespace-pre">{tail}</span>}
    </span>
  );
};

/** Why the replay is not (fully) decoded, written out under its name: readable without hovering. */
const ReplayError: React.FC<{ replay: ReplayCacheSummary }> = ({ replay }) => (
  <span data-testid="replay-error" className="mt-0.5 flex items-start gap-1 text-[11px] font-normal text-lmu-loss">
    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
    <span className="min-w-0 break-words">
      {isUnread(replay) ? 'Could not be read' : 'Could not be decoded'}: {replay.error}
    </span>
  </span>
);

export interface ReplayCacheTableProps {
  rows: ReplayCacheSummary[];
  sort: ReplaySort;
  onSort: (key: ReplaySortKey) => void;
  currentVersion: string | null;
}

/**
 * One row per cached replay in a capped-height scroll box with a sticky header. The box has no tab stop of
 * its own: the sort buttons inside it are focusable, so the keyboard can scroll it.
 */
export const ReplayCacheTable: React.FC<ReplayCacheTableProps> = ({ rows, sort, onSort, currentVersion }) => (
  <div role="region" aria-label="Cached replays" className="max-h-[28rem] overflow-auto border-y border-lmu-border">
  <table className="w-full text-xs">
    <thead>
      <tr>
        {COLUMNS.map((col) => {
          const active = sort.key === col.key;
          const Arrow = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
          return (
            <th
              key={col.key}
              scope="col"
              aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
              className={`sticky top-0 z-10 bg-lmu-card border-b border-lmu-border text-[11px] font-semibold uppercase tracking-wider text-lmu-muted px-2 py-1 ${TEXT_ALIGN[col.align]}`}
            >
              <button
                type="button"
                onClick={() => onSort(col.key)}
                title={col.hint}
                aria-describedby={col.hint ? `replay-col-${col.key}` : undefined}
                className={`inline-flex w-full items-center gap-1 uppercase tracking-wider px-1 py-1 rounded cursor-pointer ${FOCUS_RING} ${JUSTIFY[col.align]} ${active ? 'text-lmu-text' : 'hover:text-lmu-text'}`}
              >
                {col.label}
                <Arrow className={`w-3 h-3 shrink-0 ${active ? '' : 'text-lmu-faint'}`} aria-hidden="true" />
              </button>
              {col.hint && <span id={`replay-col-${col.key}`} className="sr-only">{col.hint}</span>}
            </th>
          );
        })}
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => {
        const version = versionOf(r);
        const outdated = isOutdated(r, currentVersion);
        const archived = isArchived(r);
        const kept = isArchivedBehind(r, currentVersion);
        const versionHint = outdated
          ? `Behind the current ${currentVersion}; it is decoded again in the background`
          : kept ? ARCHIVED_VERSION_HINT : undefined;
        return (
          <tr key={r.filename} className="border-b border-lmu-border/50 hover:bg-lmu-card-hover/60">
            <td className="w-full max-w-0 px-3 py-2 text-lmu-text font-medium">
              <ReplayName filename={r.filename} />
              {r.error && <ReplayError replay={r} />}
            </td>
            <td className="px-3 py-2 whitespace-nowrap" data-testid="replay-source">
              {archived
                ? <span className="font-semibold text-lmu-gain" title="LMU deleted this replay; the cache holds the only copy">Archived</span>
                : <span className="text-lmu-muted">On disk</span>}
            </td>
            <td className="px-3 py-2 text-center font-mono whitespace-nowrap">
              <span
                data-testid="replay-version"
                className={`text-[11px] ${outdated ? 'text-lmu-warn font-semibold' : 'text-lmu-muted'}`}
                title={versionHint}
                aria-description={versionHint}
              >
                {outdated ? `${version} behind` : kept ? `${version} · kept` : (version || '—')}
              </span>
            </td>
            <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text">{formatNumber(r.driversCount)}</td>
            <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text">{formatDuration(r.durationSec)}</td>
            <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text-soft">{formatBytes(r.fileSizeBytes)}</td>
            <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text-soft">{formatBytes(r.compressedSizeBytes)}</td>
            <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-muted">{formatDateTime(r.replayDateMs)}</td>
            <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text">{formatNumber(r.trajectoriesCached)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
  </div>
);
