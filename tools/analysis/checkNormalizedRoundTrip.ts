/**
 * Read-only check of the normalized session rows against a real cache:
 *   npx tsx tools/analysis/checkNormalizedRoundTrip.ts server/lmu_cache.db [--limit N]
 * Opens the given SQLite file read-only (it only SELECTs the original session columns and data_json), writes every session's
 * parsed JSON into an in-memory database through writeSessionRows, reads it back and compares it with
 * canonicalSession. Prints counts and the first mismatching paths per kind. Never writes the file.
 */
import Database from 'better-sqlite3';
import type { DetailedSession } from '../../server/core/types.js';
import { initDbSchema } from '../../server/core/dbSchema.js';
import { canonicalSession, diffValues } from '../../server/core/sessionRows/canonical.js';
import { readSession } from '../../server/core/sessionRows/reader.js';
import { insertSessionRow } from '../../server/core/sessionRows/stub.js';
import { writeSessionRows } from '../../server/core/sessionRows/writer.js';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: tsx tools/analysis/checkNormalizedRoundTrip.ts <cache.db> [--limit N]'); process.exit(2); }
const limitIndex = rest.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(rest[limitIndex + 1]) : Infinity;

const source = new Database(file, { readonly: true, fileMustExist: true });
const memory = new Database(':memory:');
initDbSchema(memory);

const ids = (source.prepare('SELECT id FROM sessions ORDER BY timestamp').all() as Array<{ id: string }>).map(row => row.id).slice(0, limit);
// The base columns exist in every cache version; the new ones may not, so they are never selected.
const select = source.prepare('SELECT id, data_json, filename, file_path, timestamp, track_venue, track_course, session_type, session_name, drivers_count FROM sessions WHERE id = ?');
const kinds = new Map<string, { count: number; sessions: Set<string>; examples: string[] }>();
let matched = 0, mismatched = 0, errors = 0, drivers = 0, laps = 0;
const started = Date.now();
let writeMs = 0, readMs = 0;

for (const id of ids) {
  const row = select.get(id) as { id: string; data_json: string; filename: string; file_path: string; timestamp: number; track_venue: string; track_course: string; session_type: string; session_name: string; drivers_count: number };
  const session = JSON.parse(row.data_json) as DetailedSession;
  drivers += session.drivers?.length ?? 0;
  for (const driver of session.drivers ?? []) laps += driver.laps?.length ?? 0;
  let diffs: string[];
  try {
    insertSessionRow(memory, session);
    // The columns come from the real row, as in the cache: a session row that disagrees with its JSON is a mismatch.
    memory.prepare('UPDATE sessions SET filename=?, file_path=?, timestamp=?, track_venue=?, track_course=?, session_type=?, session_name=?, drivers_count=? WHERE id=?')
      .run(row.filename, row.file_path, row.timestamp, row.track_venue, row.track_course, row.session_type, row.session_name, row.drivers_count, id);
    const t0 = performance.now();
    writeSessionRows(memory, session);
    const t1 = performance.now();
    const stored = readSession(memory, session.id);
    readMs += performance.now() - t1;
    writeMs += t1 - t0;
    diffs = diffValues(canonicalSession(session), stored, 30);
  } catch (error: unknown) {
    errors++;
    diffs = [`$: ERROR ${error instanceof Error ? error.message : String(error)}`];
  }
  if (diffs.length === 0) matched++; else mismatched++;
  for (const diff of diffs) {
    const kind = diff.replace(/\[\d+\]/g, '[]').replace(/:.*$/, '') + (diff.includes('ERROR') ? ' ' + diff : '');
    const entry = kinds.get(kind) ?? { count: 0, sessions: new Set(), examples: [] };
    entry.count++; entry.sessions.add(id);
    if (entry.examples.length < 2) entry.examples.push(`${id} ${diff}`);
    kinds.set(kind, entry);
  }
  memory.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  for (const table of ['session_recordings', 'session_drivers', 'session_laps', 'session_lap_passes', 'session_events']) memory.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(id);
}

console.log(`sessions ${ids.length}  matched ${matched}  mismatched ${mismatched}  errors ${errors}  drivers ${drivers}  laps ${laps}`);
console.log(`total ${(Date.now() - started) / 1000}s  write ${Math.round(writeMs)}ms  read ${Math.round(readMs)}ms`);
for (const [kind, entry] of [...kinds].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`\n${kind}  x${entry.count} in ${entry.sessions.size} sessions`);
  for (const example of entry.examples) console.log(`  ${example.slice(0, 300)}`);
}
source.close();
memory.close();
