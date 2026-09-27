import { Database as DatabaseType } from 'better-sqlite3';
import {
  ReferenceLaptimeEntry,
  ReferenceLaptimesCache,
  ReferenceBenchmarkDiff,
} from './types.js';

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
      setMetadata('reference_laptimes_last_diff', JSON.stringify(cache.lastUpdateDiff));
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
  const diffJson = getMetadata('reference_laptimes_last_diff');
  const lastUpdateDiff = diffJson ? (JSON.parse(diffJson) as ReferenceBenchmarkDiff) : null;

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
  db.exec("DELETE FROM reference_laptimes; DELETE FROM cache_metadata WHERE key LIKE 'reference_%';");
}
