import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import type { DetailedSession } from '../../../../shared/types/index.js';
import { canonicalSession } from '../../../../server/core/sessionRows/canonical.js';
import { readSessionCards } from '../../../../server/core/sessionSummaries/cards.js';
import { restoreStoredSessionLinks } from '../../../../server/core/dbSessionStore.js';
import { getTelemetrySessionCandidatesStartingBetween } from '../../../../server/core/dbReconciliationStore.js';
import { driver, lap, session } from './builders.js';

const link = { name: 'Spa.Vcr', path: 'C:/Replays/Spa.Vcr', fileSizeBytes: 10, eventTitle: 'Spa', durationSec: 300, hasRain: true, maxRainIntensity: 30 };

function newSession(id: string, overrides: Partial<DetailedSession> = {}): DetailedSession {
  const player = driver('P', [lap(1), lap(2, { conditions: { wetTyres: true } }), lap(3, { isPitStop: true })], { isPlayer: true, bestLapNumber: 1, avgLapTime: 101.5,
    incidents: [{ type: 'contact', description: 'hit', lapNumber: 2 }], declaredPitStopsCount: 1 });
  return session([player, driver('Q', [lap(1)], { position: 2, classPosition: 2, carClass: 'GT3', carType: 'Porsche 911 GT3 R' })], {
    id, filename: `${id}.xml`, filePath: `${id}.xml`, timestamp: 1_780_000_000_000,
    weather: { condition: 'Dry', timeOfDay: 'Daytime', weatherString: 'Clear' }, settings: { modeSetting: 'Multiplayer', fuelMultiplier: 1, tireWarmers: true },
    bestSessionLap: { driverName: 'P', carType: 'Ferrari 499P', lapTime: 101 }, ...overrides });
}

describe('reads from the normalized rows', () => {
  let db: SessionDatabase;
  const raw = () => db.getDb();

  beforeEach(() => { db = new SessionDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it.each(['clear', 'rule reset'] as const)('invalidates persisted session and card attachments on telemetry %s', action => {
    db.upsertSession(newSession('a', { matchingReplayFile: link }), 'a.xml', 1, 10);
    db.updateSessionTelemetryFile('a', 'old.duckdb');
    expect(readSessionCards(raw(), ['a'])[0].duckdbFilename).toBe('old.duckdb');
    const revision = db.getTelemetryMetadataRevision();
    if (action === 'clear') db.clearTelemetryCache();
    else expect(db.resetTelemetryLinksForRule('new-rule')).toBe(true);
    expect(db.getTelemetryMetadataRevision()).toBeGreaterThan(revision);
    expect(db.getSessionById('a')?.duckdbFilename).toBeUndefined();
    expect(readSessionCards(raw(), ['a'])[0].duckdbFilename).toBeUndefined();
    db.updateSessionTelemetryFile('a', 'new.duckdb');
    if (action === 'rule reset') expect(db.resetTelemetryLinksForRule('new-rule')).toBe(false);
    expect(db.getSessionById('a')?.duckdbFilename).toBe('new.duckdb');
  });

  it('hydrates driver and lap ordinals from their stored positions, including on the player', () => {
    db.upsertSession(session([driver('Q', [lap(1)]), driver('P', [lap(1), lap(2), lap(3)], { isPlayer: true })], { id: 'o' }), 'o.xml', 1, 10);
    const read = db.getSessionById('o') as DetailedSession;
    expect(read.drivers.map(item => item.driverOrdinal)).toEqual([0, 1]);
    expect(read.drivers[1].laps.map(item => item.lapOrdinal)).toEqual([0, 1, 2]);
    expect(read.playerDriver?.driverOrdinal).toBe(1);
  });

  it('serves sessions, links, ids, windows and recording owners from the rows', () => {
    db.upsertSession(newSession('a', { matchingReplayFile: link }), 'a.xml', 1, 10);
    db.upsertSession(newSession('b', { timestamp: 1_780_000_900_000 }), 'b.xml', 1, 10);
    db.updateSessionTelemetryFile('a', 'spa.duckdb');
    const expected = canonicalSession(db.getSessionById('a') as DetailedSession);

    expect(db.getSessionById('a')).toEqual(expected);
    expect(db.getSessionById('a.xml')).toBeNull();
    expect(db.getSessionsByIds(['b', 'a']).map(item => item.id)).toEqual(['b', 'a']);
    expect(db.getSessionsStartingBetween(1_780_000_000_000, 1_780_000_950_000).map(item => item.id)).toEqual(['a', 'b']);
    const telemetryCandidates = getTelemetrySessionCandidatesStartingBetween(raw(), 1_780_000_000_000, 1_780_000_950_000);
    expect(telemetryCandidates).toEqual([
      expect.objectContaining({ id: 'a', trackVenue: 'Spa', sessionType: 'Race', sessionName: 'R1',
        matchingReplayFile: { name: 'Spa.Vcr' }, drivers: [{ name: 'P' }, { name: 'Q' }], playerDriverName: 'P' }),
      expect.objectContaining({ id: 'b', drivers: [{ name: 'P' }, { name: 'Q' }] }),
    ]);
    expect(telemetryCandidates[0]).not.toHaveProperty('laps');
    expect(db.getSessionsLinkedToRecording('Spa.Vcr').map(item => item.id)).toEqual(['a']);
    expect(Array.from(db.iterateDetailedSessions()).map(item => item.id)).toEqual(['a', 'b']);
    expect(db.getTelemetryOwnersWithoutFile()).toEqual([]);

    const reparsed = newSession('a');
    restoreStoredSessionLinks(raw(), reparsed);
    expect(reparsed.matchingReplayFile).toMatchObject({ name: 'Spa.Vcr' });
    expect(reparsed).toMatchObject({ duckdbFilename: 'spa.duckdb' });
    // Nothing changes, so nothing is rewritten.
    const stamp = () => raw().prepare('SELECT updated_at, source_revision FROM sessions WHERE id = ?').get('a');
    const before = stamp();
    expect(db.updateSessionTelemetryFile('a', 'spa.duckdb')).toBe(false);
    db.updateSessionMatchingReplay('a', { name: 'Spa.Vcr', path: link.path, fileSizeBytes: 10, eventTitle: 'Spa', durationSec: 300, maxRainIntensity: 30, hasRain: true });
    expect(stamp()).toEqual(before);
    // Keep unnamed entries (the matcher handles them), without inventing a driver for empty sessions.
    db.upsertSession(newSession('unnamed', { drivers: [driver('', [lap(1)])], playerDriver: undefined, driversCount: 1 }), 'unnamed.xml', 1, 10);
    db.upsertSession(newSession('empty', { drivers: [], playerDriver: undefined, driversCount: 0 }), 'empty.xml', 1, 10);
    const candidates = getTelemetrySessionCandidatesStartingBetween(raw(), 1_780_000_000_000, 1_780_000_950_000);
    expect(candidates.find(item => item.id === 'unnamed')?.drivers).toEqual([{ name: '' }]);
    expect(candidates.find(item => item.id === 'empty')?.drivers).toEqual([]);
  });

  it('uses exact session ids even when filenames collide or ids end in .xml', () => {
    const insert = (id: string, filename: string) => db.upsertSession(newSession(id, { filename }), filename, 1, 10);
    insert('target', 'other-session.xml');
    insert('other-session', 'target.xml');
    insert('literal.xml', 'literal.xml');
    expect(db.getSessionById('target')?.id).toBe('target');
    expect(db.getSessionById('other-session')?.id).toBe('other-session');
    expect(db.getSessionById('literal.xml')?.id).toBe('literal.xml');
    expect(db.getSessionById('target.xml')).toBeNull();
    expect(db.getSessionById('missing')).toBeNull();
  });

  it('changes a link or the telemetry file and reclassifies from the rows alone', () => {
    db.upsertSession(newSession('a'), 'a.xml', 1, 10);
    db.updateSessionMatchingReplay('a', link);
    expect(db.getSessionById('a')?.matchingReplayFile?.name).toBe('Spa.Vcr');
    expect(db.updateSessionTelemetryFile('a', 'spa.duckdb')).toBe(true);
    db.reclassifyStoredSessions({ ids: ['a'] });
    expect(db.getSessionById('a')?.matchingReplayFile).toMatchObject({ name: 'Spa.Vcr' });
    expect(db.getSessionById('a')?.duckdbFilename).toBe('spa.duckdb');
    expect(db.rejectSessionReplayLink('a', link, 'layout')).not.toBeNull();
    expect(db.getSessionById('a')?.matchingReplayFile).toBeUndefined();
    expect(raw().prepare('SELECT recording_name FROM sessions WHERE id = ?').get('a')).toEqual({ recording_name: null });
  });

  it('keeps the DuckDB file on the session only, not on the replay link', () => {
    db.upsertSession(newSession('a', { matchingReplayFile: link, duckdbFilename: 'old.duckdb' }), 'a.xml', 1, 10);
    expect(raw().prepare('SELECT duckdb_filename AS file FROM sessions WHERE id = ?').get('a')).toEqual({ file: 'old.duckdb' });
    expect(db.getSessionById('a')).toMatchObject({ duckdbFilename: 'old.duckdb' });
    expect(db.getSessionById('a')?.matchingReplayFile).not.toHaveProperty('duckdbFilename');
    expect(raw().prepare('PRAGMA table_info(session_recordings)').all().map(column => (column as { name: string }).name)).not.toContain('duckdb_filename');
  });
});

describe('session cards built from columns', () => {
  let db: SessionDatabase;
  beforeEach(() => { db = new SessionDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('equal the card JSON the projection writes, for players, links, telemetry and a missing player', () => {
    db.upsertSession(newSession('a', { matchingReplayFile: link, duckdbFilename: 'spa.duckdb' }), 'a.xml', 1, 10);
    db.upsertSession(newSession('b', { timestamp: 1_780_000_100_000 }), 'b.xml', 1, 10);
    const noPlayer = session([driver('Q', [lap(1)]), driver('R', [lap(1)])], { id: 'c', filename: 'c.xml', filePath: 'c.xml', timestamp: 1_780_000_200_000 });
    db.upsertSession(noPlayer, 'c.xml', 1, 10);
    const cards = readSessionCards(db.getDb(), ['c', 'a', 'missing', 'b']);
    expect(cards.map(card => card.id)).toEqual(['c', 'a', 'b']);
    const sessionMap: Record<string, DetailedSession> = {
      a: newSession('a', { matchingReplayFile: link, duckdbFilename: 'spa.duckdb' }),
      b: newSession('b', { timestamp: 1_780_000_100_000 }),
      c: noPlayer,
    };
    for (const card of cards) {
      const sess = sessionMap[card.id];
      expect(card.id).toBe(sess.id);
      expect(card.trackVenue).toBe(sess.trackVenue);
      expect(card.trackCourse).toBe(sess.trackCourse);
    }
    expect(cards[1].playerDriver).toMatchObject({ lapsCount: 3, cleanLapsCount: expect.any(Number) as unknown, pitStopsCount: 1 });
    expect(cards[1].playerDriver).not.toHaveProperty('laps');
    expect(cards[1].playerDriver).not.toHaveProperty('incidents');
    expect(cards[0].playerDriver).toBeUndefined();
  });
});
