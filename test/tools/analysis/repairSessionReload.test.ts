import { describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { repairSessionReload } from '../../../tools/analysis/repairSessionReload.js';
import { driver, lap, session } from '../../server/core/sessionRows/builders.js';
import { findReferenceEntry } from '../../../shared/domain/paceCategory.js';
import type { ReferenceLaptimesCache } from '../../../shared/types/index.js';

describe('offline session reload recovery', () => {
  it('restores exact local ownership and cached pace without rereading or losing retained rows', () => {
    const db = new SessionDatabase(':memory:');
    try {
      const local = driver('Local Driver', [lap(1), lap(2)], { incidents: [{ type: 'contact', description: 'retained', lapNum: 1 }] });
      const damaged = session([driver('Remote', [lap(1)]), local], { playerDriver: undefined });
      db.upsertSession(damaged, 'deleted.xml', 123, 456);
      const ambiguous = session([driver('Local Driver', [lap(1)]), driver('Local Driver', [lap(1)])], { id: 'duplicate', playerDriver: undefined });
      db.upsertSession(ambiguous, 'deleted-duplicate.xml', 124, 457);
      const cache: ReferenceLaptimesCache = { lastUpdated: '2026-10-01T12:00:00Z', sourceUrl: 'cached', entriesCount: 1,
        entries: { roadatlanta_lmgt3: { key: 'roadatlanta_lmgt3', trackName: 'Road Atlanta', carClass: 'LMGT3', patch: '', target100Sec: 78.34,
          targets: { alienSec: 78.34, competitiveSec: 79, goodSec: 80, goodMidpackSec: 81, midpackSec: 82,
            midpackTailSec: 83, tailEnderSec: 84, offlineSec: 85 } } } };
      db.saveReferenceLaptimes(cache);
      const counts = () => ['sessions', 'session_laps', 'session_events'].map(table => db.getDb().prepare(`SELECT count(*) n FROM ${table}`).get());
      const before = counts();
      expect(repairSessionReload(db, 'Local Driver')).toEqual({ sessionsChanged: 1, benchmarksChanged: 1, unresolved: ['duplicate'] });
      expect(counts()).toEqual(before);
      const restored = db.getSessionById(damaged.id)!;
      expect(restored.playerDriver).toBe(restored.drivers[1]);
      expect(restored.playerDriver?.incidents).toEqual(local.incidents);
      expect(restored.playerDriver?.laps).toHaveLength(2);
      expect(db.getSessionById('duplicate')?.playerDriver).toBeUndefined();
      const refs = db.getReferenceLaptimesCache()!;
      expect(refs.lastUpdated).toBe(cache.lastUpdated);
      expect(findReferenceEntry(refs.entries, 'Road Atlanta', '', 'GT3')?.target100Sec).toBe(78.34);
      expect(db.getDb().prepare('SELECT count(*) n FROM benchmark_diff_history').get()).toEqual({ n: 0 });
      const changes = db.getDb().prepare('SELECT total_changes() n').get();
      expect(repairSessionReload(db, 'Local Driver')).toEqual({ sessionsChanged: 0, benchmarksChanged: 0, unresolved: ['duplicate'] });
      expect(db.getDb().prepare('SELECT total_changes() n').get()).toEqual(changes);
    } finally { db.close(); }
  });
});
