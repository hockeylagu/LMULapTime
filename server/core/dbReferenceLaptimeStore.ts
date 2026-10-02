import { Database as DatabaseType } from 'better-sqlite3';
import {
  ReferenceLaptimeEntry,
  ReferenceLaptimesCache,
  ReferenceBenchmarkDiff,
  BenchmarkDiffSummary,
} from './types.js';
import { getMetadata, setMetadata } from './dbMetadataStore.js';

/** The latest update, copied out of `benchmark_diff_history` for the status route. */
const LAST_DIFF_KEY = 'reference_laptimes_last_diff';

export function recordBenchmarkDiff(
  db: DatabaseType,
  diff: ReferenceBenchmarkDiff,
  sourceUrl: string = ''
): number {
  const stmt = db.prepare(`
    INSERT INTO benchmark_diff_history (
      timestamp, source_url, total_entries, added_count, updated_count, removed_count,
      has_changes, total_affected_sessions, total_category_shifts, diff_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    diff.timestamp || new Date().toISOString(),
    sourceUrl,
    diff.totalEntries,
    diff.addedCount,
    diff.updatedCount,
    diff.removedCount,
    diff.hasChanges ? 1 : 0,
    diff.totalAffectedSessions || 0,
    diff.totalCategoryShifts || 0,
    JSON.stringify(diff)
  );

  return Number(info.lastInsertRowid);
}

export function getBenchmarkDiffHistory(
  db: DatabaseType,
  limit: number = 30
): BenchmarkDiffSummary[] {
  const rows = db.prepare(`
    SELECT
      id, timestamp, has_changes, added_count, updated_count, removed_count,
      total_entries, total_affected_sessions, total_category_shifts
    FROM benchmark_diff_history
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as {
    id: number;
    timestamp: string;
    has_changes: number;
    added_count: number;
    updated_count: number;
    removed_count: number;
    total_entries: number;
    total_affected_sessions: number;
    total_category_shifts: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    hasChanges: Boolean(r.has_changes),
    addedCount: r.added_count,
    updatedCount: r.updated_count,
    removedCount: r.removed_count,
    totalEntries: r.total_entries,
    totalAffectedSessions: r.total_affected_sessions,
    totalCategoryShifts: r.total_category_shifts,
  }));
}

export function getBenchmarkDiffById(
  db: DatabaseType,
  id: number
): ReferenceBenchmarkDiff | null {
  const row = db.prepare('SELECT diff_json FROM benchmark_diff_history WHERE id = ?').get(id) as { diff_json: string } | undefined;
  if (!row) return null;
  const parsed = JSON.parse(row.diff_json) as ReferenceBenchmarkDiff;
  parsed.id = id;
  return parsed;
}

/** Ids of the stored diffs whose impact was computed with another rule than `rule`. */
export function getBenchmarkDiffIdsWithImpactRuleOtherThan(db: DatabaseType, rule: number): number[] {
  const rows = db.prepare(
    "SELECT id FROM benchmark_diff_history WHERE json_extract(diff_json, '$.impactRule') IS NOT ?"
  ).all(rule) as { id: number }[];
  return rows.map(r => r.id);
}

/** Rewrites a stored diff with its recomputed impact and totals. */
export function updateBenchmarkDiffImpact(db: DatabaseType, id: number, diff: ReferenceBenchmarkDiff): void {
  db.prepare(`
    UPDATE benchmark_diff_history
    SET total_affected_sessions = ?, total_category_shifts = ?, diff_json = ?
    WHERE id = ?
  `).run(diff.totalAffectedSessions || 0, diff.totalCategoryShifts || 0, JSON.stringify({ ...diff, id: undefined }), id);
  const lastDiff = getMetadata(db, LAST_DIFF_KEY);
  if (lastDiff && (JSON.parse(lastDiff) as ReferenceBenchmarkDiff).id === id) {
    setMetadata(db, LAST_DIFF_KEY, JSON.stringify({ ...diff, id }));
  }
}

export function saveReferenceLaptimes(
  db: DatabaseType,
  cache: ReferenceLaptimesCache,
  setMetadata: (key: string, value: string) => void
): void {
  const upsertStmt = db.prepare(`
    INSERT INTO reference_laptimes (
      key, track_name, car_class, patch, target100_sec,
      alien_sec, competitive_sec, good_sec, good_midpack_sec,
      midpack_sec, midpack_tail_sec, tail_ender_sec, offline_sec,
      fastest_car, record_laptime_sec, data_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      track_name = excluded.track_name,
      car_class = excluded.car_class,
      patch = excluded.patch,
      target100_sec = excluded.target100_sec,
      alien_sec = excluded.alien_sec,
      competitive_sec = excluded.competitive_sec,
      good_sec = excluded.good_sec,
      good_midpack_sec = excluded.good_midpack_sec,
      midpack_sec = excluded.midpack_sec,
      midpack_tail_sec = excluded.midpack_tail_sec,
      tail_ender_sec = excluded.tail_ender_sec,
      offline_sec = excluded.offline_sec,
      fastest_car = excluded.fastest_car,
      record_laptime_sec = excluded.record_laptime_sec,
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  const entries = Object.values(cache.entries);

  const transaction = db.transaction(() => {
    setMetadata('reference_laptimes_last_updated', cache.lastUpdated);
    setMetadata('reference_laptimes_source_url', cache.sourceUrl);
    if (cache.lastUpdateDiff) {
      const diffId = recordBenchmarkDiff(db, cache.lastUpdateDiff, cache.sourceUrl);
      cache.lastUpdateDiff.id = diffId;
      setMetadata(LAST_DIFF_KEY, JSON.stringify(cache.lastUpdateDiff));
    }

    for (const entry of entries) {
      const targets = entry.targets || {
        alienSec: entry.target100Sec,
        competitiveSec: entry.target100Sec * 1.01,
        goodSec: entry.target100Sec * 1.02,
        goodMidpackSec: entry.target100Sec * 1.03,
        midpackSec: entry.target100Sec * 1.04,
        midpackTailSec: entry.target100Sec * 1.05,
        tailEnderSec: entry.target100Sec * 1.06,
        offlineSec: entry.target100Sec * 1.07,
      };

      upsertStmt.run(
        entry.key,
        entry.trackName,
        entry.carClass,
        entry.patch || null,
        entry.target100Sec,
        targets.alienSec,
        targets.competitiveSec,
        targets.goodSec,
        targets.goodMidpackSec,
        targets.midpackSec,
        targets.midpackTailSec,
        targets.tailEnderSec,
        targets.offlineSec,
        entry.fastestCar || null,
        entry.recordLaptimeSec ?? null,
        JSON.stringify(entry),
        now
      );
    }

    const existingKeys = db.prepare('SELECT key FROM reference_laptimes').all() as { key: string }[];
    const newKeySet = new Set(Object.keys(cache.entries));
    const deleteStmt = db.prepare('DELETE FROM reference_laptimes WHERE key = ?');
    for (const row of existingKeys) {
      if (!newKeySet.has(row.key)) {
        deleteStmt.run(row.key);
      }
    }
  });

  transaction();
}

export function getReferenceLaptimesCache(
  db: DatabaseType,
  getMetadata: (key: string) => string | null
): ReferenceLaptimesCache | null {
  const rows = db.prepare('SELECT data_json FROM reference_laptimes').all() as { data_json: string }[];
  if (rows.length === 0) {
    return null;
  }

  const entries: Record<string, ReferenceLaptimeEntry> = {};
  for (const row of rows) {
    const entry = JSON.parse(row.data_json) as ReferenceLaptimeEntry;
    entries[entry.key] = entry;
  }

  const lastUpdated = getMetadata('reference_laptimes_last_updated') || new Date().toISOString();
  const sourceUrl = getMetadata('reference_laptimes_source_url') || '';
  const diffJson = getMetadata(LAST_DIFF_KEY);
  const copy = diffJson ? (JSON.parse(diffJson) as ReferenceBenchmarkDiff) : null;
  // The history row is the record (a recount rewrites it); the copy only says which row is the latest.
  const lastUpdateDiff = copy?.id !== undefined ? getBenchmarkDiffById(db, copy.id) ?? copy : copy;

  return {
    lastUpdated,
    sourceUrl,
    entriesCount: Object.keys(entries).length,
    entries,
    lastUpdateDiff,
  };
}

export function getReferenceLaptimeEntry(db: DatabaseType, key: string): ReferenceLaptimeEntry | null {
  const row = db.prepare('SELECT data_json FROM reference_laptimes WHERE key = ?').get(key) as { data_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.data_json) as ReferenceLaptimeEntry;
}

export function clearReferenceLaptimes(db: DatabaseType): void {
  db.exec("DELETE FROM reference_laptimes; DELETE FROM benchmark_diff_history; DELETE FROM cache_metadata WHERE key LIKE 'reference_%';");
}
