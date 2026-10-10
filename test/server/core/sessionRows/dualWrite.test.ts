import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import type { DetailedSession, ReplayMetadata } from '../../../../server/core/types.js';
import { canonicalSession } from '../../../../server/core/sessionRows/canonical.js';
import { readSession } from '../../../../server/core/sessionRows/reader.js';
import { NORMALIZED_SESSION_VERSION, SESSION_ROW_TABLES } from '../../../../server/core/sessionRows/schema.js';
import { backfillNormalizedSessions, countStaleNormalizedSessions } from '../../../../server/core/sessionRows/verify.js';
import { driver, lap, session } from './builders.js';

const link = { name: 'Spa.Vcr', path: 'C:/Replays/Spa.Vcr', sizeBytes: 10 };
const savedAt = Date.parse('2026-06-28T23:44:43.122Z');

function newSession(id: string, overrides: Partial<DetailedSession> = {}): DetailedSession {
  return session([driver('P', [lap(1), lap(2)], { isPlayer: true }), driver('Q', [lap(1)])], { id, filename: `${id}.xml`, filePath: `${id}.xml`, timestamp: 1_780_000_000_000, ...overrides });
}

describe('normalized session rows: dual write and backfill', () => {
  let db: SessionDatabase;
  const raw = () => db.getDb();
  const version = (id: string) => (raw().prepare('SELECT normalized_version AS v FROM sessions WHERE id = ?').get(id) as { v: number }).v;
  /** The rows read back equal the JSON session, and the version says so. */
  const expectInStep = (id: string) => {
    const json = db.getSessionById(id) as DetailedSession;
    expect(version(id)).toBe(NORMALIZED_SESSION_VERSION);
    expect(readSession(raw(), id)).toEqual(canonicalSession(json));
  };

  beforeEach(() => { db = new SessionDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('writes the rows with the session and keeps them in step through links, telemetry, withdrawal and reclassification', () => {
    db.upsertSession(newSession('a'), 'a.xml', 1, 10);
    expectInStep('a');

    db.updateSessionMatchingReplay('a', link);
    expect(readSession(raw(), 'a')?.matchingReplayFile).toMatchObject(link);
    expectInStep('a');

    expect(db.updateSessionTelemetryFile('a', 'spa.duckdb')).toBe(true);
    expect(readSession(raw(), 'a')).toMatchObject({ duckdbFilename: 'spa.duckdb', hasDuckDbTelemetry: true });
    expectInStep('a');

    db.reclassifyStoredSessions({ ids: ['a'] });
    expectInStep('a');

    db.rejectSessionReplayLink('a', link, 'time-window');
    expect(readSession(raw(), 'a')?.matchingReplayFile).toBeUndefined();
    expectInStep('a');
  });

  it('follows a replay rename and a reparse', () => {
    const metadata = (durationSec: number): ReplayMetadata => ({ filename: link.name, filePath: link.path, fileSizeBytes: 1, mtimeMs: 0, timeSliceCount: 0,
      totalEvents: 0, durationSec, sceneDesc: 'SPA', drivers: [] });
    db.upsertReplayMetadataCache(link.name, link.path, savedAt, 10, metadata(340));
    db.upsertSession(newSession('a', { matchingReplayFile: link }), 'a.xml', 1, 10);
    db.upsertReplayMetadataCache(link.name, link.path, savedAt + 3 * 3600_000, 20, metadata(400));
    expect(readSession(raw(), 'a')?.matchingReplayFile?.name).toMatch(/^Spa @2026-06-28T23-44-43Z\.Vcr$/);
    expectInStep('a');

    const reparsed = newSession('a');
    reparsed.drivers[0].laps.pop();
    db.upsertSession(reparsed, 'a.xml', 2, 10);
    expect(readSession(raw(), 'a')?.drivers[0].laps).toHaveLength(1);
    expectInStep('a');
  });

  it('clears the rows with the session cache', () => {
    db.upsertSession(newSession('a', { matchingReplayFile: link }), 'a.xml', 1, 10);
    db.clearCache();
    for (const table of SESSION_ROW_TABLES) expect(raw().prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
  });

  it('backfills rows from the stored JSON ten sessions at a time and reports what does not round-trip', () => {
    for (let index = 0; index < 13; index++) db.upsertSession(newSession(`s${String(index).padStart(2, '0')}`, { timestamp: 1_780_000_000_000 + index }), `s${String(index).padStart(2, '0')}.xml`, 1, 10);
    // A session stored by an older build: JSON only, and one with a field the rows have no column for.
    const odd = newSession('s05', { timestamp: 1_780_000_000_005 });
    (odd.drivers[0].laps[0] as unknown as Record<string, unknown>).unmodeled = true;
    raw().prepare('UPDATE sessions SET data_json = ? WHERE id = ?').run(JSON.stringify(odd), 's05');
    raw().exec(`UPDATE sessions SET normalized_version = 0; ${SESSION_ROW_TABLES.map(table => `DELETE FROM ${table}`).join('; ')}`);
    expect(countStaleNormalizedSessions(raw())).toBe(13);

    const first = backfillNormalizedSessions(raw(), 10);
    expect(first.processed).toBe(10);
    expect(first.failed.map(failure => failure.id)).toEqual(['s05']);
    expect(first.failed[0].mismatches).toContain('$.drivers[0].laps[0].unmodeled: true vs undefined');
    expect(version('s05')).toBe(-NORMALIZED_SESSION_VERSION);
    // The rows stay (their derived columns feed history reads) but are not trusted: readers keep to the JSON.
    expect(readSession(raw(), 's05')?.drivers.length).toBeGreaterThan(0);
    expect((db.getSessionById('s05')?.drivers[0].laps[0] as unknown as Record<string, unknown>).unmodeled).toBe(true);
    expect(version('s00')).toBe(NORMALIZED_SESSION_VERSION);
    expect(backfillNormalizedSessions(raw(), 10).processed).toBe(3);
    // The mismatch is not attempted again until the version changes.
    expect(backfillNormalizedSessions(raw(), 10).processed).toBe(0);
    expect(countStaleNormalizedSessions(raw())).toBe(0);
    expect(readSession(raw(), 's12')).toEqual(canonicalSession(db.getSessionById('s12') as DetailedSession));
  });

  it('leaves a session on JSON when its rows cannot be written, without failing the JSON write', () => {
    raw().exec('DROP TABLE session_events');
    db.upsertSession(newSession('a'), 'a.xml', 1, 10);
    expect(db.getSessionById('a')?.id).toBe('a');
    expect(version('a')).toBe(-NORMALIZED_SESSION_VERSION);
  });
});
