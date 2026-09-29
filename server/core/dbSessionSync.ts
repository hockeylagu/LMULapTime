import fs from 'fs';
import path from 'path';
import { Database as DatabaseType } from 'better-sqlite3';
import { DetailedSession } from './types.js';
import { SyncResult, SessionSyncProgress } from './dbSchema.js';
import { StoredReplayFileInfo } from './replay/dbReplayMetadataStore.js';
import type { ReplayFileEntry } from '../sessions/sessionXmlTypes.js';
import { replayIndexEntryFromStored } from '../sessions/replayMatching.js';

/** Bumping this re-parses every stored session from its XML. */
export const DB_PARSER_VERSION = '2.17_lap_traffic_pressure_two_lap_pit_loss';

export interface SessionXmlSyncParser {
  addReplayEntry(entry: ReplayFileEntry): void;
  parseSessionXml(filePath: string): DetailedSession | null;
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
): Generator<SessionSyncProgress, SyncResult, void> {
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

  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.xml'));
  let added = 0;
  let updated = 0;

  // A new parser version re-parses every XML on disk and replaces those rows in one transaction.
  // Rows whose XML is gone are kept as they are: they are the only copy of that session left.
  const reparseAll = forceReparse || versionMismatch;
  const persistTransaction = db.transaction((sessionsToInsert: { session: DetailedSession; filePath: string; mtime: number; size: number }[]) => {
    if (versionMismatch) {
      host.setMetadata('parser_version', DB_PARSER_VERSION);
      host.invalidateSessionCache();
    }
    for (const item of sessionsToInsert) {
      // A session parsed with its replay already linked gets that replay's rain now; one linked
      // later gets it when the link is stored (SessionDatabase.updateSessionMatchingReplay).
      if (item.session.matchingReplayFile) host.classifySessionConditions(item.session);
      host.upsertSession(item.session, item.filePath, item.mtime, item.size);
    }
    if (versionMismatch) {
      // Rows whose XML is gone are not parsed again, but the lap rules still apply to them.
      const parsedIds = new Set(sessionsToInsert.map(item => item.session.id));
      host.reclassifyStoredSessions({ ids: existingRows.map(row => row.id).filter(id => !parsedIds.has(id)) });
    }
  });

  const pendingInserts: { session: DetailedSession; filePath: string; mtime: number; size: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    yield { processed: i, total: files.length, currentFile: f, stage: 'Reading XML session log', filePercent: 5 };
    const filePath = path.join(resultsDir, f);
    try {
      const stats = fs.statSync(filePath);
      const normalizedPath = path.normalize(filePath).toLowerCase();
      const cached = cacheMap.get(normalizedPath);

      // Check if file is already cached and unmodified
      if (!reparseAll && cached && cached.file_mtime === Math.floor(stats.mtimeMs) && cached.file_size === stats.size) {
        continue;
      }

      // Parse new or modified XML file
      const parsed = parser.parseSessionXml(filePath);
      if (parsed) {
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
      }
    } catch (err) {
      host.recordIngestError('xml', filePath, err);
      console.error(`Error processing session XML file ${filePath}:`, err);
    }
  }

  if (pendingInserts.length > 0 || versionMismatch) {
    yield { processed: files.length, total: files.length, currentFile: '', stage: 'Persisting session cache', filePercent: 95 };
    persistTransaction(pendingInserts);
  }

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
    step = iterator.next();
  }
  return step.value;
}
