/**
 * Read-only parity check of the session cards built from columns against the card JSON the projection writes:
 *   npx tsx tools/analysis/checkNormalizedCards.ts server/lmu_cache.db [--limit N]
 * Opens the given SQLite file read-only, stores every session in an in-memory database through upsertSession (which writes the
 * rows, the derived columns and summary_json), then compares readSessionCards with summary_json. Never writes the file.
 */
import Database from 'better-sqlite3';
import type { DetailedSession } from '../../server/core/types.js';
import { initDbSchema } from '../../server/core/dbSchema.js';
import { upsertSession } from '../../server/core/dbSessionStore.js';
import { canonicalSession, diffValues } from '../../server/core/sessionRows/canonical.js';
import { readSessionCards } from '../../server/core/sessionSummaries/cards.js';

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('usage: tsx tools/analysis/checkNormalizedCards.ts <cache.db> [--limit N]'); process.exit(2); }
const limitIndex = rest.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(rest[limitIndex + 1]) : Infinity;

const source = new Database(file, { readonly: true, fileMustExist: true });
const memory = new Database(':memory:');
initDbSchema(memory);
const ids = (source.prepare('SELECT id FROM sessions ORDER BY timestamp').all() as Array<{ id: string }>).map(row => row.id).slice(0, limit);
const select = source.prepare('SELECT data_json, file_path FROM sessions WHERE id = ?');
const kinds = new Map<string, { count: number; examples: string[] }>();
let matched = 0, mismatched = 0;

for (const id of ids) {
  const row = select.get(id) as { data_json: string; file_path: string };
  const session = JSON.parse(row.data_json) as DetailedSession;
  upsertSession(memory, session, row.file_path, 1, 1);
  const old = memory.prepare('SELECT summary_json FROM sessions WHERE id = ?').get(id) as { summary_json: string };
  const card = readSessionCards(memory, [id])[0];
  // The stored card carries explicit nulls of optional properties; the columns hold them as absent.
  const stored = JSON.parse(old.summary_json) as DetailedSession;
  const ordinal = stored.playerDriver?.driverOrdinal;
  const expected = canonicalSession(stored);
  if (expected.playerDriver) expected.playerDriver.driverOrdinal = ordinal;
  const diffs = diffValues(expected, card, 20);
  if (diffs.length === 0) matched++; else mismatched++;
  for (const diff of diffs) {
    const kind = diff.replace(/\[\d+\]/g, '[]').replace(/:.*$/, '');
    const entry = kinds.get(kind) ?? { count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 2) entry.examples.push(`${id} ${diff}`);
    kinds.set(kind, entry);
  }
  memory.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
console.log(`sessions ${ids.length}  card parity matched ${matched}  mismatched ${mismatched}`);
for (const [kind, entry] of [...kinds].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`\n${kind}  x${entry.count}`);
  for (const example of entry.examples) console.log(`  ${example.slice(0, 300)}`);
}
source.close();
memory.close();
