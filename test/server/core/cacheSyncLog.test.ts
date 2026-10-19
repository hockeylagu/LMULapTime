import { describe, expect, it } from 'vitest';
import { CacheSyncLog, formatCacheSyncLog } from '../../../server/core/cacheSyncLog.js';

describe('source sync summaries', () => {
  it.each(['XML sessions', 'replays', 'telemetry DuckDB files', 'live telemetry DuckDB files'])(
    'uses the same summary pattern for %s, including unchanged startup scans', source => {
      expect(formatCacheSyncLog(source, 'C:/LMU/data', { total: 19, added: 0, updated: 0, skipped: 0 }))
        .toBe(`[SQLite Cache] Synced 19 ${source} (0 new, 0 updated) from C:/LMU/data`);
    });
  it('suppresses duplicate unchanged live summaries while preserving startup and inventory changes', () => {
    const log = new CacheSyncLog('live telemetry DuckDB files', 'C:/live');
    const unchanged = { total: 19, added: 0, updated: 0 };
    expect(log.format(unchanged)).toBe('[SQLite Cache] Synced 19 live telemetry DuckDB files (0 new, 0 updated) from C:/live');
    expect(log.format(unchanged)).toBeNull();
    expect(log.format({ total: 20, added: 1, updated: 0 })).toContain('(1 new, 0 updated)');
    expect(log.format({ total: 20, added: 0, updated: 0 })).toBeNull();
    expect(log.format({ total: 20, added: 0, updated: 1 })).toContain('(0 new, 1 updated)');
    expect(log.format({ total: 19, added: 0, updated: 0 })).not.toBeNull();
    expect(log.format({ ...unchanged, skipped: 1 })).toContain('1 skipped');
  });

  it('retains nonzero skipped counts without calling unchanged records skipped', () => {
    expect(formatCacheSyncLog('replays', 'C:/LMU/data', { total: 437, added: 2, updated: 1, skipped: 3 }))
      .toBe('[SQLite Cache] Synced 437 replays (2 new, 1 updated, 3 skipped) from C:/LMU/data');
  });
});
