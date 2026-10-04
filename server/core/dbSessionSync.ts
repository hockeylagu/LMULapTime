import fs from 'fs';
import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession } from './types.js';
import { SyncResult, SessionSyncProgress } from './dbSchema.js';
import { StoredReplayFileInfo } from './replay/dbReplayMetadataStore.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';
import { replayIndexEntryFromStored } from '../sessions/replayMatching.js';
import { rateDriversPace } from '../sessions/sessionPaceRating.js';

/** Bumping this re-parses every stored session from its XML. */
export const DB_PARSER_VERSION = '2.18_wet_best_lap_unrated';

export interface SessionXmlSyncParser {
  addReplayEntry(entry: ReplayFileEntry): void;
  parseSessionXml(filePath: string): DetailedSession | null;
  parseSessionXmlAsync?(filePath: string): Promise<DetailedSession | null>;
}

export interface SessionSyncHost {
  getDb(): DatabaseType;
  getMetadata(key: string): string | null;
  setMetadata(key: string, value: string): void;
  getSessionsCount(): number;
  getAllStoredReplayFiles(): Array<StoredReplayFileInfo & { filename: string }>;
  upsertSession(session: DetailedSession, filePath: string, mtime: number, size: number): void;
  classifySessionConditions(session: DetailedSession): void;
  reclassifyStoredSessions(which: { ids: string[] }): void;
  recordIngestError(sourceType: string, sourcePath: string, error: unknown): void;
  clearIngestError(sourceType: string, sourcePath: string): void;
  invalidateSessionCache(): void;
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

  // Get existing cached session file info
  const db = host.getDb();
  const existingRows = (db.prepare('SELECT id, file_path, file_mtime, file_size FROM sessions').all() as {
    id: string;
    file_path: string;
    file_mtime: number;
    file_size: number;
  }[]);

  const cacheMap = new Map<string, { id: string; file_mtime: number; file_size: number }>();
  for (const row of existingRows) {
    cacheMap.set(path.normalize(row.file_path).toLowerCase(), row);
  }

  // Seed parser's replay index with stored DB replays so deleted VCR files still match
  const storedReplays = host.getAllStoredReplayFiles();
  for (const r of storedReplays) parser.addReplayEntry(replayIndexEntryFromStored(r));

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
      const stats = fs.statSync(filePath);
      const normalizedPath = path.normalize(filePath).toLowerCase();
      const cached = cacheMap.get(normalizedPath);

      // Check if file is already cached and unmodified
      if (!reparseAll && cached && cached.file_mtime === Math.floor(stats.mtimeMs) && cached.file_size === stats.size) {
        yield { processed: i + 1, total: files.length, currentFile: f, stage: 'Checking XML session log' };
        continue;
      }

      // Parse new or modified XML file
      const asyncParsed = yield { processed: i, total: files.length, currentFile: f, stage: 'Reading XML session log', filePercent: 5 };
      const parsed = asyncParsed === undefined ? parser.parseSessionXml(filePath) : asyncParsed;
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
      host.invalidateSessionCache();
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
      try {
        const parsed = await parser.parseSessionXmlAsync(path.join(resultsDir, step.value.currentFile));
        step = iterator.next(parsed);
      } catch (error: unknown) {
        step = iterator.throw(error);
      }
    } else step = iterator.next();
  }
  return step.value;
}
