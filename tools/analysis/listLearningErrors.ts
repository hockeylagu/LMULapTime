import Database from 'better-sqlite3';
import path from 'node:path';
import { readCurrentLearningExamples } from '../../server/core/live/dbLiveLearningStore.js';

// Read-only race review: every frozen fuel/VE forecast against the lap it predicted, grouped per session.
// Usage: tsx tools/analysis/listLearningErrors.ts [sessionIdFilter] [dbPath]
const filter = process.argv[2] ?? '';
const dbPath = path.resolve(process.argv[3] ?? path.join('server', 'lmu_cache.db'));
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  const groups = new Map<string, ReturnType<typeof readCurrentLearningExamples>>();
  for (const example of readCurrentLearningExamples(db)) {
    if (!example.sessionId.includes(filter)) continue;
    const key = `${example.sessionId} ${example.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), example]);
  }
  for (const [key, examples] of groups) {
    const first = examples[0]!;
    const errors = examples.filter(row => row.exclusions.length === 0 && row.predicted !== null)
      .map(row => (row.predicted! - row.actual) / row.actual * 100).sort((a, b) => a - b);
    const median = errors.length ? errors[Math.floor(errors.length / 2)]!.toFixed(1) : '-';
    console.log(`\n${key}  ${first.layoutKey} | ${first.vehicleModel} | ${first.compound ?? '?'} | ${first.condition ?? '?'}`
      + `  eligible ${errors.length}/${examples.length}  median error ${median} %`);
    for (const row of examples) {
      const error = row.predicted === null ? null : (row.predicted - row.actual) / row.actual * 100;
      console.log(`  lap ${String(row.lapNumber).padStart(3)}  ${(row.predictionSource ?? '-').padEnd(8)}`
        + ` predicted ${row.predicted?.toFixed(3) ?? '-'}  actual ${row.actual.toFixed(3)}`
        + `  error ${error === null ? '-' : `${error >= 0 ? '+' : ''}${error.toFixed(1)} %`}`
        + (row.exclusions.length ? `  excluded: ${row.exclusions.join(', ')}` : ''));
    }
  }
} finally { db.close(); }
