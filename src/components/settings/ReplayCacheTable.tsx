import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, TriangleAlert } from 'lucide-react';
import { ReplayCacheSummary } from '../../../shared/types/index.js';
import { formatBytes, formatDateTime } from './settingsFormat.js';

type SortKey = 'filename' | 'isOnDisk' | 'version' | 'driversCount' | 'durationSec' | 'fileSizeBytes' | 'compressedSizeBytes' | 'replayDateMs' | 'trajectoriesCached';

interface Column {
  key: SortKey;
  label: string;
  align: 'left' | 'center' | 'right';
}

const COLUMNS: Column[] = [
  { key: 'filename', label: 'Replay', align: 'left' },
  { key: 'isOnDisk', label: 'Disk', align: 'center' },
  { key: 'version', label: 'Version', align: 'center' },
  { key: 'driversCount', label: 'Drivers', align: 'right' },
  { key: 'durationSec', label: 'Duration', align: 'right' },
  { key: 'fileSizeBytes', label: 'Size', align: 'right' },
  { key: 'compressedSizeBytes', label: 'Compressed', align: 'right' },
  { key: 'replayDateMs', label: 'Date', align: 'right' },
  { key: 'trajectoriesCached', label: 'Trajectories', align: 'right' },
];

const TEXT_ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const JUSTIFY = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function versionOf(r: ReplayCacheSummary): string {
  return r.replayVersion || r.parserVersion || '';
}

function versionNumber(version: string): number {
  const n = parseInt(version.replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function sortValue(r: ReplayCacheSummary, key: SortKey): string | number {
  switch (key) {
    case 'filename': return r.filename.toLowerCase();
    case 'isOnDisk': return r.isOnDisk ? 1 : 0;
    case 'version': return versionNumber(versionOf(r));
    case 'durationSec': return r.durationSec ?? 0;
    default: return r[key] ?? 0;
  }
}

export interface ReplayCacheTableProps {
  replays: ReplayCacheSummary[];
}

/** Cached replays with a name filter and sortable columns. Versions behind the newest cached one are flagged. */
export const ReplayCacheTable: React.FC<ReplayCacheTableProps> = ({ replays }) => {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  const currentVersion = useMemo(
    () => replays.reduce((max, r) => Math.max(max, versionNumber(versionOf(r))), 0),
    [replays]
  );

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle ? replays.filter((r) => r.filename.toLowerCase().includes(needle)) : replays;
    if (!sort) return filtered;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return 0;
    });
  }, [replays, filter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-lmu-muted absolute left-2.5 top-2.5 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by replay name"
            aria-label="Filter replays by name"
            className="w-full bg-lmu-bg border border-lmu-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-lmu-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lmu-accent-text"
          />
        </div>
        <span aria-live="polite" className="text-[11px] text-lmu-muted font-mono">
          {filter.trim() ? `${rows.length} of ${replays.length} replays` : ''}
        </span>
      </div>

      <div
        role="region"
        aria-label="Cached replays"
        tabIndex={0}
        className="relative max-h-72 overflow-y-auto overflow-x-auto border-y border-lmu-border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lmu-accent-text"
      >
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-lmu-card text-lmu-muted uppercase tracking-wider text-[10px]">
            <tr>
              {COLUMNS.map((col) => {
                const active = sort?.key === col.key;
                const Arrow = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`font-semibold px-2 py-1 ${TEXT_ALIGN[col.align]}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`inline-flex w-full items-center gap-1 uppercase tracking-wider px-1 py-1 rounded cursor-pointer hover:text-white focus-visible:outline-2 focus-visible:outline-lmu-accent-text ${JUSTIFY[col.align]} ${active ? 'text-lmu-text' : ''}`}
                    >
                      {col.label}
                      <Arrow className={`w-3 h-3 shrink-0 ${active ? '' : 'text-lmu-faint'}`} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const version = versionOf(r);
              const behind = !!version && versionNumber(version) < currentVersion;
              return (
                <tr key={r.filename} className="border-t border-lmu-border/50 hover:bg-lmu-card-hover/60">
                  <td className="px-3 py-2 text-white font-medium truncate max-w-[196px]" title={r.filename}>{r.filename}</td>
                  <td className="relative px-2 py-2 text-center whitespace-nowrap">
                    {r.isOnDisk ? (
                      <span className="sr-only" data-testid="replay-on-disk-badge">On disk</span>
                    ) : (
                      <span
                        className="inline-flex text-lmu-warn"
                        title="Deleted from disk — cache is the only copy"
                        data-testid="replay-not-on-disk-badge"
                      >
                        <TriangleAlert className="w-4 h-4" aria-hidden="true" />
                        <span className="sr-only">Deleted from disk — cache is the only copy</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">
                    <span
                      className={`text-[11px] ${behind ? 'text-lmu-warn font-semibold' : 'text-lmu-muted'}`}
                      title={behind ? 'Older than the newest cached version' : undefined}
                    >
                      {version || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-white">{r.driversCount}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-white">{formatDuration(r.durationSec)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text-soft">{formatBytes(r.fileSizeBytes)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-text-soft">{formatBytes(r.compressedSizeBytes)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-lmu-muted">{formatDateTime(r.replayDateMs)}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-white">{r.trajectoriesCached}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-lmu-faint">No replay matches that name.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
