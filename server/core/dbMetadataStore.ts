import { Database as DatabaseType } from 'better-sqlite3';

export interface IngestErrorEntry {
  sourceType: string;
  sourcePath: string;
  errorMessage: string;
  attempts: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export function getMetadata(db: DatabaseType, key: string): string | null {
  const row = db.prepare('SELECT value FROM cache_metadata WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMetadata(db: DatabaseType, key: string, value: string): void {
  db.prepare(`
    INSERT INTO cache_metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function recordIngestError(db: DatabaseType, sourceType: string, sourcePath: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const now = Date.now();
  db.prepare(`
    INSERT INTO ingest_errors (source_type, source_path, error_message, attempts, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(source_type, source_path) DO UPDATE SET
      error_message = excluded.error_message,
      attempts = ingest_errors.attempts + 1,
      last_seen_at = excluded.last_seen_at
  `).run(sourceType, sourcePath, message, now, now);
}

export function clearIngestError(db: DatabaseType, sourceType: string, sourcePath: string): void {
  db.prepare('DELETE FROM ingest_errors WHERE source_type = ? AND source_path = ?').run(sourceType, sourcePath);
}

export function getIngestErrors(db: DatabaseType): IngestErrorEntry[] {
  const rows = db.prepare(`
    SELECT source_type, source_path, error_message, attempts, first_seen_at, last_seen_at
    FROM ingest_errors ORDER BY last_seen_at DESC
  `).all() as Array<{
    source_type: string;
    source_path: string;
    error_message: string;
    attempts: number;
    first_seen_at: number;
    last_seen_at: number;
  }>;
  return rows.map(row => ({
    sourceType: row.source_type,
    sourcePath: row.source_path,
    errorMessage: row.error_message,
    attempts: row.attempts,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));
}
