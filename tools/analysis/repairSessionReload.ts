import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { SessionDatabase } from '../../server/core/db.js';
import { normalizeCarClass } from '../../shared/domain/vehicleMapping.js';
import type { ReferenceLaptimeEntry } from '../../shared/types/index.js';

/** Explicit offline repair; no startup migration and no source-file reparse or replay decode. */
export function repairSessionReload(store: SessionDatabase, playerName: string) {
  const target = playerName.trim().toLowerCase();
  if (!target) throw new Error('An exact configured player name is required.');
  const cache = store.getReferenceLaptimesCache();
  let benchmarksChanged = 0;
  const entries: Record<string, ReferenceLaptimeEntry> = {};
  for (const entry of Object.values(cache?.entries ?? {})) {
    const carClass = normalizeCarClass(entry.carClass);
    const key = carClass === entry.carClass ? entry.key
      : `${entry.trackName}_${carClass}`.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (entries[key]) throw new Error(`Duplicate canonical benchmark key: ${key}`);
    entries[key] = { ...entry, key, carClass };
    if (carClass !== entry.carClass) benchmarksChanged++;
  }
  const rows = store.getDb().prepare('SELECT id,file_path,file_mtime_ms,file_size_bytes FROM sessions').all() as Array<{
    id: string; file_path: string; file_mtime_ms: number; file_size_bytes: number;
  }>;
  let sessionsChanged = 0;
  const unresolved: string[] = [];
  store.getDb().transaction(() => {
    if (cache && benchmarksChanged) store.saveReferenceLaptimes({ ...cache, entries,
      entriesCount: Object.keys(entries).length, lastUpdateDiff: undefined });
    for (const row of rows) {
      const session = store.getSessionById(row.id);
      if (!session) throw new Error(`Cannot read retained session ${row.id}`);
      const matches = session.drivers.filter(driver => driver.name.trim().toLowerCase() === target);
      if (matches.length !== 1) { unresolved.push(row.id); continue; }
      const player = matches[0];
      if (session.playerDriver === player && player.isPlayer && session.drivers.filter(driver => driver.isPlayer).length === 1) continue;
      for (const driver of session.drivers) driver.isPlayer = driver === player;
      session.playerDriver = player;
      store.upsertSession(session, row.file_path, row.file_mtime_ms, row.file_size_bytes);
      sessionsChanged++;
    }
  })();
  return { benchmarksChanged, sessionsChanged, unresolved };
}

async function serverIsRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 3001 });
    const finish = (running: boolean) => { socket.destroy(); resolve(running); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(true));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  const dbPath = path.resolve(args.includes('--db') ? option('--db') : 'server/lmu_cache.db');
  const playerName = args.includes('--player') ? option('--player') : '';
  if (!playerName?.trim()) throw new Error('Usage: npx tsx tools/analysis/repairSessionReload.ts --player "Exact Name" [--db path] [--apply --backup new-path]');
  if (args.includes('--apply') && await serverIsRunning()) throw new Error('Stop the backend before applying this offline repair.');
  const source = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    console.log('Before', source.prepare('SELECT count(*) sessions,sum(player_driver_ordinal IS NOT NULL) playerLinks FROM sessions').get());
    if (!args.includes('--apply')) { console.log('Inspection only. Use --apply --backup new-path to repair.'); return; }
    const backup = args.includes('--backup') ? path.resolve(option('--backup')) : '';
    if (!backup || backup === dbPath || fs.existsSync(backup)) throw new Error('--backup must name a new file separate from the source database.');
    await source.backup(backup);
    console.log('Backup', backup);
  } finally { source.close(); }
  const store = new SessionDatabase(dbPath);
  try {
    console.log('Repair', repairSessionReload(store, playerName));
    console.log('After', store.getDb().prepare('SELECT count(*) sessions,sum(player_driver_ordinal IS NOT NULL) playerLinks FROM sessions').get());
  } finally { store.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
