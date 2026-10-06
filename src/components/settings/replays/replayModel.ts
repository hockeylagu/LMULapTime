import { ReplayCacheSummary } from '../../../../shared/types/index.js';

/** Which replays the segmented filter shows. */
export type ReplayShow = 'all' | 'disk' | 'archived' | 'outdated';

export const REPLAY_SHOW_OPTIONS: ReadonlyArray<{ value: ReplayShow; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'disk', label: 'On disk' },
  { value: 'archived', label: 'Archived' },
  { value: 'outdated', label: 'Outdated' },
];

/** What each segment holds, for the button's accessible description. */
export const REPLAY_SHOW_HINTS: Readonly<Record<ReplayShow, string>> = {
  all: 'Every cached replay',
  disk: 'Replays whose file LMU still has',
  archived: 'Replays LMU deleted; the cache holds the only copy',
  outdated: 'On-disk replays decoded at an older version, waiting for the background replay upgrade. Archived replays never count here.',
};

export type ReplaySortKey =
  | 'name' | 'source' | 'version' | 'drivers' | 'duration' | 'size' | 'compressed' | 'date' | 'decoded';
export type SortDir = 'asc' | 'desc';
export interface ReplaySort { key: ReplaySortKey; dir: SortDir }

/** The order the list opens in; `updateSearchParams` drops this value from the URL. */
export const DEFAULT_REPLAY_SORT: ReplaySort = { key: 'date', dir: 'desc' };

const SORT_KEYS: ReadonlySet<string> = new Set<ReplaySortKey>([
  'name', 'source', 'version', 'drivers', 'duration', 'size', 'compressed', 'date', 'decoded',
]);

export function parseShow(value: string | null): ReplayShow {
  return REPLAY_SHOW_OPTIONS.some((option) => option.value === value) ? (value as ReplayShow) : 'all';
}

/** "size-asc" from the URL; anything unreadable is the default order. */
export function parseSort(value: string | null): ReplaySort {
  const [key, dir] = (value ?? '').split('-');
  if (!SORT_KEYS.has(key) || (dir !== 'asc' && dir !== 'desc')) return DEFAULT_REPLAY_SORT;
  return { key: key as ReplaySortKey, dir };
}

export function formatSort(sort: ReplaySort): string {
  return `${sort.key}-${sort.dir}`;
}

export function versionOf(replay: ReplayCacheSummary): string {
  return replay.replayVersion || replay.parserVersion || '';
}

/** "v7" is 7; an unreadable version is 0. */
export function versionNumber(version: string | null | undefined): number {
  const n = parseInt((version ?? '').replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Behind the server's replay version and still on disk, so the background upgrade will decode it again.
 * An archived replay can never be upgraded (its file is gone), so an old version there is not a fault.
 */
export function isOutdated(replay: ReplayCacheSummary, currentVersion: string | null): boolean {
  const current = versionNumber(currentVersion);
  const version = versionNumber(versionOf(replay));
  return replay.isOnDisk === true && current > 0 && version > 0 && version < current;
}

/** A file on disk whose replay could not be read at all: listed with its error, nothing of it is cached. */
export function isUnread(replay: ReplayCacheSummary): boolean {
  return Boolean(replay.error) && !versionOf(replay);
}

export function isArchived(replay: ReplayCacheSummary): boolean {
  return replay.isOnDisk === false;
}

/** Archived and decoded at an older version than the current one. Not a fault: the file is gone, so it stays as it is. */
export function isArchivedBehind(replay: ReplayCacheSummary, currentVersion: string | null): boolean {
  const current = versionNumber(currentVersion);
  const version = versionNumber(versionOf(replay));
  return isArchived(replay) && current > 0 && version > 0 && version < current;
}

/**
 * The one-line version status under the card's counts, or null when the current version is unknown
 * (an API server that has not been restarted does not send it) so nothing false is claimed.
 */
export function versionStatus(counts: ReplayCounts | null, currentVersion: string | null): string | null {
  if (!counts || counts.total === 0 || versionNumber(currentVersion) === 0) return null;
  const parts = [
    counts.outdated > 0
      ? `${counts.outdated} on-disk ${counts.outdated === 1 ? 'replay is' : 'replays are'} behind v${versionNumber(currentVersion)} and will be upgraded in the background`
      : counts.onDisk > 0
      ? `All on-disk replays are at v${versionNumber(currentVersion)}`
      : `Current version is v${versionNumber(currentVersion)}`,
  ];
  if (counts.archivedBehind > 0) parts.push(`${counts.archivedBehind} archived kept at older versions`);
  return parts.join(' · ');
}

export interface ReplayCounts {
  total: number;
  onDisk: number;
  archived: number;
  outdated: number;
  /** Archived replays decoded at a version older than the current one: kept as they are, never re-decoded. */
  archivedBehind: number;
  fileSizeBytes: number;
  compressedSizeBytes: number;
}

export function countReplays(replays: ReplayCacheSummary[], currentVersion: string | null): ReplayCounts {
  const cached = replays.filter(replay => !isUnread(replay));
  const counts: ReplayCounts = { total: cached.length, onDisk: 0, archived: 0, outdated: 0, archivedBehind: 0, fileSizeBytes: 0, compressedSizeBytes: 0 };
  for (const replay of cached) {
    if (isArchived(replay)) counts.archived += 1;
    else counts.onDisk += 1;
    if (isOutdated(replay, currentVersion)) counts.outdated += 1;
    if (isArchivedBehind(replay, currentVersion)) counts.archivedBehind += 1;
    counts.fileSizeBytes += replay.fileSizeBytes || 0;
    counts.compressedSizeBytes += replay.compressedSizeBytes || 0;
  }
  return counts;
}

export function matchesShow(replay: ReplayCacheSummary, show: ReplayShow, currentVersion: string | null): boolean {
  switch (show) {
    case 'disk': return !isArchived(replay);
    case 'archived': return isArchived(replay);
    case 'outdated': return isOutdated(replay, currentVersion);
    default: return true;
  }
}

function sortValue(replay: ReplayCacheSummary, key: ReplaySortKey): string | number {
  switch (key) {
    case 'name': return replay.filename.toLowerCase();
    case 'source': return isArchived(replay) ? 0 : 1;
    case 'version': return versionNumber(versionOf(replay));
    case 'drivers': return replay.driversCount ?? 0;
    case 'duration': return replay.durationSec ?? 0;
    case 'size': return replay.fileSizeBytes ?? 0;
    case 'compressed': return replay.compressedSizeBytes ?? 0;
    case 'date': return replay.replayDateMs ?? 0;
    case 'decoded': return replay.trajectoriesCached ?? 0;
  }
}

export function visibleReplays(
  replays: ReplayCacheSummary[],
  options: { text: string; show: ReplayShow; sort: ReplaySort; currentVersion: string | null }
): ReplayCacheSummary[] {
  const needle = options.text.trim().toLowerCase();
  const factor = options.sort.dir === 'asc' ? 1 : -1;
  return replays
    .filter((replay) => matchesShow(replay, options.show, options.currentVersion))
    .filter((replay) => !needle || replay.filename.toLowerCase().includes(needle) || Boolean(replay.error && replay.error.toLowerCase().includes(needle)))
    .sort((a, b) => {
      const av = sortValue(a, options.sort.key);
      const bv = sortValue(b, options.sort.key);
      if (av < bv) return -factor;
      if (av > bv) return factor;
      return a.filename.localeCompare(b.filename);
    });
}

/**
 * Splits a replay name so its distinguishing end ("Q1 3.Vcr": session type, number) can stay visible
 * while the track part truncates. Names with fewer than three words are not split.
 */
export function splitReplayName(filename: string): { head: string; tail: string } {
  const words = filename.split(' ');
  if (words.length < 3) return { head: filename, tail: '' };
  const tail = ` ${words.slice(-2).join(' ')}`;
  return { head: filename.slice(0, filename.length - tail.length), tail };
}

export function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '—';
  const t = Math.round(sec);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
