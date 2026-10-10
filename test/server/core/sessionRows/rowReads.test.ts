import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import type { DetailedSession } from '../../../../server/core/types.js';
import { canonicalSession } from '../../../../server/core/sessionRows/canonical.js';
import { readSessionCards } from '../../../../server/core/sessionSummaries/cards.js';
import { restoreStoredSessionLinks } from '../../../../server/core/dbSessionStore.js';
import { driver, lap, session } from './builders.js';

const link = { name: 'Spa.Vcr', path: 'C:/Replays/Spa.Vcr', sizeBytes: 10, eventTitle: 'Spa', durationSec: 300, hasRain: true, maxRainIntensity: 30 };

function newSession(id: string, overrides: Partial<DetailedSession> = {}): DetailedSession {
  const player = driver('P', [lap(1), lap(2, { conditions: { wetTyres: true } }), lap(3, { isPitStop: true })], { isPlayer: true, bestLapNum: 1, avgLapTime: 101.5,
    incidents: [{ type: 'contact', description: 'hit', lapNum: 2 }], totalIncidents: 1, pitStopsCount: 1 });
  return session([player, driver('Q', [lap(1)], { position: 2, classPosition: 2, carClass: 'LMGT3', carType: 'Porsche 911 GT3 R' })], {
    id, filename: `${id}.xml`, filePath: `${id}.xml`, timestamp: 1_780_000_000_000, weatherInfo: 'Sunny',
    weather: { condition: 'Dry', timeOfDay: 'Daytime', weatherString: 'Clear' }, settings: { modeSetting: 'Multiplayer', fuelMultiplier: 1, tireWarmers: true },
    bestSessionLap: { driverName: 'P', carType: 'Ferrari 499P', lapTime: 101, lapTimeString: '1:41.000' }, ...overrides });
}

describe('reads from the normalized rows', () => {
  let db: SessionDatabase;
  const raw = () => db.getDb();

  beforeEach(() => { db = new SessionDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it.each(['clear', 'rule reset'] as const)('invalidates persisted session and card attachments on telemetry %s', action => {
    db.upsertSession(newSession('a', { matchingReplayFile: link }), 'a.xml', 1, 10);
    db.updateSessionTelemetryFile('a', 'old.duckdb');
    expect(readSessionCards(raw(), ['a'])[0].matchingReplayFile?.duckdbFilename).toBe('old.duckdb');
    const revision = db.getTelemetryMetadataRevision();
    if (action === 'clear') db.clearTelemetryCache();
    else expect(db.resetTelemetryLinksForRule('new-rule')).toBe(true);
    expect(db.getTelemetryMetadataRevision()).toBeGreaterThan(revision);
    expect(db.getSessionById('a')).toMatchObject({ hasDuckDbTelemetry: false });
    expect(db.getSessionById('a')?.duckdbFilename).toBeUndefined();
    expect(db.getSessionById('a')?.matchingReplayFile?.duckdbFilename).toBeUndefined();
    expect(readSessionCards(raw(), ['a'])[0].hasDuckDbTelemetry).toBe(false);
    db.updateSessionTelemetryFile('a', 'new.duckdb');
    if (action === 'rule reset') expect(db.resetTelemetryLinksForRule('new-rule')).toBe(false);
    expect(db.getSessionById('a')?.duckdbFilename).toBe('new.duckdb');
  });

  it('serves sessions, links, ids, windows and recording owners from the rows', () => {
    db.upsertSession(newSession('a', { matchingReplayFile: link }), 'a.xml', 1, 10);
    db.upsertSession(newSession('b', { timestamp: 1_780_000_900_000 }), 'b.xml', 1, 10);
    db.updateSessionTelemetryFile('a', 'spa.duckdb');
    const expected = canonicalSession(db.getSessionById('a') as DetailedSession);

    expect(db.getSessionById('a')).toEqual(expected);
    expect(db.getSessionById('a.xml')?.id).toBe('a');
    expect(db.getSessionsByIds(['b', 'a']).map(item => item.id)).toEqual(['b', 'a']);
    expect(db.getSessionsStartingBetween(1_780_000_000_000, 1_780_000_950_000).map(item => item.id)).toEqual(['a', 'b']);
    expect(db.getSessionsLinkedToRecording('Spa.Vcr').map(item => item.id)).toEqual(['a']);
    expect(Array.from(db.iterateDetailedSessions()).map(item => item.id)).toEqual(['a', 'b']);
    expect(db.getTelemetryOwnersWithoutFile()).toEqual([]);

    const reparsed = newSession('a');
    restoreStoredSessionLinks(raw(), reparsed);
    expect(reparsed.matchingReplayFile).toMatchObject({ name: 'Spa.Vcr', hasDuckDbTelemetry: true, duckdbFilename: 'spa.duckdb' });
    expect(reparsed).toMatchObject({ duckdbFilename: 'spa.duckdb', hasDuckDbTelemetry: true });
    // Nothing changes, so nothing is rewritten.
    const stamp = () => raw().prepare('SELECT updated_at, source_revision FROM sessions WHERE id = ?').get('a');
    const before = stamp();
    expect(db.updateSessionTelemetryFile('a', 'spa.duckdb')).toBe(false);
    db.updateSessionMatchingReplay('a', { name: 'Spa.Vcr', path: link.path, sizeBytes: 10, eventTitle: 'Spa', durationSec: 300, maxRainIntensity: 30, hasRain: true });
    expect(stamp()).toEqual(before);
  });

  it('changes a link or the telemetry file and reclassifies from the rows alone', () => {
    db.upsertSession(newSession('a'), 'a.xml', 1, 10);
    db.updateSessionMatchingReplay('a', link);
    expect(db.getSessionById('a')?.matchingReplayFile?.name).toBe('Spa.Vcr');
    expect(db.updateSessionTelemetryFile('a', 'spa.duckdb')).toBe(true);
    db.reclassifyStoredSessions({ ids: ['a'] });
    expect(db.getSessionById('a')?.matchingReplayFile).toMatchObject({ name: 'Spa.Vcr', duckdbFilename: 'spa.duckdb' });
    expect(db.rejectSessionReplayLink('a', link, 'layout')).not.toBeNull();
    expect(db.getSessionById('a')?.matchingReplayFile).toBeUndefined();
    expect(raw().prepare('SELECT recording_name FROM sessions WHERE id = ?').get('a')).toEqual({ recording_name: null });
  });

  it('lifts a DuckDB file that only the link carried onto the session', () => {
    const legacy = newSession('a', { matchingReplayFile: { ...link, hasDuckDbTelemetry: true, duckdbFilename: 'old.duckdb' } });
    db.upsertSession(legacy, 'a.xml', 1, 10);
    expect(raw().prepare('SELECT has_duckdb_telemetry AS flag, duckdb_filename AS file FROM sessions WHERE id = ?').get('a')).toEqual({ flag: 1, file: 'old.duckdb' });
    expect(db.getSessionById('a')).toMatchObject({ duckdbFilename: 'old.duckdb', hasDuckDbTelemetry: true, matchingReplayFile: { duckdbFilename: 'old.duckdb' } });
    expect(raw().prepare('PRAGMA table_info(session_recordings)').all().map(column => (column as { name: string }).name)).not.toContain('duckdb_filename');
  });
});

describe('session cards built from columns', () => {
  let db: SessionDatabase;
  beforeEach(() => { db = new SessionDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('equal the card JSON the projection writes, for players, links, telemetry and a missing player', () => {
    db.upsertSession(newSession('a', { matchingReplayFile: { ...link, hasDuckDbTelemetry: true, duckdbFilename: 'spa.duckdb' }, duckdbFilename: 'spa.duckdb', hasDuckDbTelemetry: true }), 'a.xml', 1, 10);
    db.upsertSession(newSession('b', { timestamp: 1_780_000_100_000 }), 'b.xml', 1, 10);
    const noPlayer = session([driver('Q', [lap(1)]), driver('R', [lap(1)])], { id: 'c', filename: 'c.xml', filePath: 'c.xml', timestamp: 1_780_000_200_000 });
    db.upsertSession(noPlayer, 'c.xml', 1, 10);
    const cards = readSessionCards(db.getDb(), ['c', 'a', 'missing', 'b']);
    expect(cards.map(card => card.id)).toEqual(['c', 'a', 'b']);
    const sessionMap: Record<string, DetailedSession> = {
      a: newSession('a', { matchingReplayFile: { ...link, hasDuckDbTelemetry: true, duckdbFilename: 'spa.duckdb' }, duckdbFilename: 'spa.duckdb', hasDuckDbTelemetry: true }),
      b: newSession('b', { timestamp: 1_780_000_100_000 }),
      c: noPlayer,
    };
    for (const card of cards) {
      const sess = sessionMap[card.id];
      expect(card.id).toBe(sess.id);
      expect(card.trackVenue).toBe(sess.trackVenue);
      expect(card.trackCourse).toBe(sess.trackCourse);
    }
    expect(cards[1].playerDriver).toMatchObject({ completedLapsCount: 3, cleanLapsCount: expect.any(Number), pitStopsCount: 1 });
    expect(cards[1].playerDriver).not.toHaveProperty('laps');
    expect(cards[1].playerDriver).not.toHaveProperty('incidents');
    expect(cards[0].playerDriver).toBeUndefined();
  });
});
