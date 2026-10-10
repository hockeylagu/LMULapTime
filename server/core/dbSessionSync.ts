import fs from 'fs';
import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession } from './types.js';
import { SyncResult, SessionSyncProgress } from './dbSchema.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';
import type { ReplayMatchTarget } from '../sessions/replayMatching.js';
import { rateDriversPace } from '../sessions/sessionPaceRating.js';

/** Bumping this re-parses every stored session from its XML. */
export const DB_PARSER_VERSION = '2.19_race_only_traffic';

export interface SessionXmlSyncParser {
  setReplayLookup(lookup: (target: ReplayMatchTarget) => ReplayFileEntry[]): void;
  parseSessionXml(filePath: string): DetailedSession | null;
  parseSessionXmlAsync?(filePath: string): Promise<DetailedSession | null>;
}

export interface SessionSyncHost {
  getDb(): DatabaseType;
  getMetadata(key: string): string | null;
  setMetadata(key: string, value: string): void;
  getSessionsCount(): number;
  getReplayMatchingEntries(target?: ReplayMatchTarget): ReplayFileEntry[];
  upsertSession(session: DetailedSession, filePath: string, mtime: number, size: number): void;
  restoreStoredSessionLinks(session: DetailedSession): void;
  classifySessionConditions(session: DetailedSession): void;
  reclassifyStoredSessions(which: { ids: string[] }): void;
  recordIngestError(sourceType: string, sourcePath: string, error: unknown): void;
  clearIngestError(sourceType: string, sourcePath: string): void;
  getIngestErrors(): Array<{ sourceType: string; sourcePath: string }>;
  markSessionDataChanged(): void;
}

export function *syncSessionsIterator(
  host: SessionSyncHost,
  resultsDir: string,
  parser: SessionXmlSyncParser,
  forceReparse = false
): Generator<SessionSyncProgress, SyncResult, DetailedSession | null | undefined> {
  if (!fs.existsSync(resultsDir)) {
    return {
      added: 0,
      updated: 0,
      total: host.getSessionsCount(),
      lastSyncedAt: host.getMetadata('last_synced_at') || new Date().toISOString(),
    };
  }

  const cachedVersion = host.getMetadata('parser_version');
  const versionMismatch = cachedVersion !== DB_PARSER_VERSION;

  // Results XMLs are write-once: a stored path is enough to skip an ordinary scan.
  // Only parser upgrades, explicit reparses and failed reads revisit existing files.
  const db = host.getDb();
  const existingRows = (db.prepare('SELECT id, file_path FROM sessions').all() as {
    id: string;
    file_path: string;
  }[]);
  const cachedPaths = new Set(existingRows.map(row => path.normalize(row.file_path).toLowerCase()));
  // Files the last scan could not read are read again even when unchanged: one that failed during a
  // parser upgrade would otherwise keep the older parse for good (the version is committed regardless).
  const unread = new Set(host.getIngestErrors()
    .filter(entry => entry.sourceType === 'xml')
    .map(entry => path.normalize(entry.sourcePath).toLowerCase()));

  parser.setReplayLookup(target => host.getReplayMatchingEntries(target));

  const files = fs.readdirSync(resultsDir).filter(f => f.toLowerCase().endsWith('.xml'));
  let added = 0;
  let updated = 0;

  // Publish small transactions during the scan so sessions appear before it finishes.
  // The parser version is committed only once the whole scan finishes.
  // Rows whose XML is gone are kept as they are: they are the only copy of that session left.
  const reparseAll = forceReparse || versionMismatch;
  const persistTransaction = db.transaction((sessionsToInsert: { session: DetailedSession; filePath: string; mtime: number; size: number }[]) => {
    for (const item of sessionsToInsert) {
      // A worker's benchmark snapshot may predate a refresh, including while this batch waited.
      // Rate at the synchronous write boundary so a late result cannot restore obsolete ratings.
      rateDriversPace(item.session.drivers ?? [], {
        venue: item.session.trackVenue, course: item.session.trackCourse,
        trackLengthMeters: item.session.trackLengthMeters,
      });
      // A session parsed with its replay already linked gets that replay's rain now; one linked
      // later gets it when the link is stored (SessionDatabase.updateSessionMatchingReplay).
      host.restoreStoredSessionLinks(item.session);
      host.classifySessionConditions(item.session);
      host.upsertSession(item.session, item.filePath, item.mtime, item.size);
    }
  });

  const parsedIds = new Set<string>();
  const pendingInserts: { session: DetailedSession; filePath: string; mtime: number; size: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const filePath = path.join(resultsDir, f);
    try {
      const normalizedPath = path.normalize(filePath).toLowerCase();
      const cached = cachedPaths.has(normalizedPath);

      if (!reparseAll && cached && !unread.has(normalizedPath)) {
        yield { processed: i + 1, total: files.length, currentFile: f, stage: 'Checking XML session log' };
        continue;
      }

      // File attributes are recorded for new files and deliberate reparses only.
      const stats = fs.statSync(filePath);
      const asyncParsed = yield { processed: i, total: files.length, currentFile: f, stage: 'Reading XML session log', filePercent: 5 };
      const parsed = asyncParsed === undefined ? parser.parseSessionXml(filePath) : asyncParsed;
      // Write-once only holds for a finished file, and a stored path is never read again: a file
      // LMU was still writing during the read is not stored, and the failure makes the next scan retry it.
      const after = fs.statSync(filePath);
      if (after.size !== stats.size || after.mtimeMs !== stats.mtimeMs) {
        host.recordIngestError('xml', filePath, new Error('The XML changed while it was read; it is read again on the next scan'));
        continue;
      }
      if (parsed) {
        parsedIds.add(parsed.id);
        pendingInserts.push({
          session: parsed,
          filePath,
          mtime: Math.floor(stats.mtimeMs),
          size: stats.size,
        });

        if (cached) {
          updated++;
        } else {
          added++;
        }
        host.clearIngestError('xml', filePath);
      } else host.recordIngestError('xml', filePath, new Error('XML session could not be parsed'));
    } catch (err) {
      host.recordIngestError('xml', filePath, err);
      console.error(`Error processing session XML file ${filePath}:`, err);
    }
    if (pendingInserts.length >= 10) {
      // Keep the batch until its transaction commits. This is outside the per-file parse catch:
      // a storage failure must abort the scan so the parser version cannot advance past it.
      persistTransaction(pendingInserts);
      pendingInserts.length = 0;
      yield { processed: i + 1, total: files.length, currentFile: f, stage: 'Published XML sessions', filePercent: 100 };
    }
  }

  if (pendingInserts.length > 0 || versionMismatch) {
    yield { processed: files.length, total: files.length, currentFile: '', stage: 'Persisting session cache', filePercent: 95 };
    persistTransaction(pendingInserts);
    pendingInserts.length = 0;
  }
  if (versionMismatch) {
    db.transaction(() => {
      // Rows whose XML is gone are kept and reclassified: they are the only remaining copy.
      host.reclassifyStoredSessions({ ids: existingRows.map(row => row.id).filter(id => !parsedIds.has(id)) });
      host.setMetadata('parser_version', DB_PARSER_VERSION);
      host.markSessionDataChanged();
    })();
  }
  yield { processed: files.length, total: files.length, currentFile: '' };

  const nowIso = new Date().toISOString();
  host.setMetadata('last_synced_at', nowIso);
  host.setMetadata('results_dir', resultsDir);

  return {
    added,
    updated,
    total: host.getSessionsCount(),
    lastSyncedAt: nowIso,
  };
}

export function syncSessionsFromDir(
  host: SessionSyncHost,
  resultsDir: string,
  parser: SessionXmlSyncParser,
  forceReparse = false,
  onProgress?: (progress: SessionSyncProgress) => void
): SyncResult {
  const iterator = syncSessionsIterator(host, resultsDir, parser, forceReparse);
  let step = iterator.next();
  while (!step.done) {
    onProgress?.(step.value);
    step = iterator.next();
  }
  return step.value;
}

export async function *syncSessionsAsyncIterator(
  host: SessionSyncHost,
  resultsDir: string,
  parser: SessionXmlSyncParser,
  forceReparse = false
): AsyncGenerator<SessionSyncProgress, SyncResult, void> {
  const iterator = syncSessionsIterator(host, resultsDir, parser, forceReparse);
  let step = iterator.next();
  while (!step.done) {
    yield step.value;
    if (step.value.stage === 'Reading XML session log' && parser.parseSessionXmlAsync) {
      const filePath = path.join(resultsDir, step.value.currentFile);
      let parsed: DetailedSession | null;
      try {
        parsed = await parser.parseSessionXmlAsync(filePath);
      } catch (error: unknown) {
        // The worker failed, not the file: read it here instead of leaving the session out of this scan.
        console.warn(`[SQLite Cache] XML worker failed on ${filePath}, reading it on the main thread:`, error);
        try {
          parsed = parser.parseSessionXml(filePath);
        } catch (fallbackError: unknown) {
          step = iterator.throw(fallbackError);
          continue;
        }
      }
      step = iterator.next(parsed);
    } else step = iterator.next();
  }
  return step.value;
}
