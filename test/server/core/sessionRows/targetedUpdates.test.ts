import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import type { DetailedSession, ReplayMetadata } from '../../../../server/core/types.js';
import { canonicalSession, diffValues } from '../../../../server/core/sessionRows/canonical.js';
import { readSessionCards } from '../../../../server/core/sessionSummaries/cards.js';
import { isReplayLinkWithdrawn } from '../../../../server/core/replay/dbReplayLinkStore.js';
import { archiveReplacedRecording } from '../../../../server/core/replay/dbReplayIdentity.js';
import * as writer from '../../../../server/core/sessionRows/writer.js';

import { driver, lap, session } from './builders.js';

const initialLink = {
  name: 'Spa_R1.Vcr',
  path: 'C:/Replays/Spa_R1.Vcr',
  sizeBytes: 1234567,
  eventTitle: 'Spa 6h',
  splitNo: 1,
  eventType: 'Race',
  durationSec: 3600,
  hasRain: false,
  maxRainIntensity: 0,
  weatherCondition: 'Dry' as const,
  ambientTemp: 22,
  trackTemp: 28,
};

const makeReplayMetadata = (durationSec: number, sceneDesc = 'Spa-Francorchamps'): ReplayMetadata => ({
  filename: initialLink.name,
  filePath: initialLink.path,
  fileSizeBytes: 1234567,
  mtimeMs: 1_780_000_000_000,
  timeSliceCount: 0,
  totalEvents: 0,
  durationSec,
  sceneDesc,
  drivers: [],
});



function buildTestSession(id: string, overrides: Partial<DetailedSession> = {}): DetailedSession {
  const pLaps = [
    lap(1, { lapTime: 100, s1: 30, s2: 35, s3: 35, isValid: true }),
    lap(2, { lapTime: 102, s1: 31, s2: 35, s3: 36, isValid: true }),
    lap(3, { lapTime: 101, s1: 30, s2: 35, s3: 36, isValid: true }),
  ];
  // Lap 1 is a race start lap (excluded from clean average), so average of laps 2 & 3 = (102 + 101) / 2 = 101.5
  const player = driver('Player Driver', pLaps, {
    isPlayer: true,
    carClass: 'Hypercar',
    carType: 'Ferrari 499P',
    bestLapNum: 1,
    bestLapTime: 100,
    avgLapTime: 101.5,
    avgLapTimeString: '1:41.500',
  });

  const aiLaps = [
    lap(1, { lapTime: 105, s1: 32, s2: 36, s3: 37, isValid: true }),
    lap(2, { lapTime: 106, s1: 32, s2: 37, s3: 37, isValid: true }),
  ];
  // Lap 1 is excluded from clean average, lap 2 = 106
  const ai = driver('AI Rival', aiLaps, {
    isPlayer: false,
    carClass: 'Hypercar',
    carType: 'Toyota GR010',
    bestLapNum: 1,
    bestLapTime: 105,
    avgLapTime: 106,
    avgLapTimeString: '1:46.000',
  });

  return session([player, ai], {
    id,
    filename: `${id}.xml`,
    filePath: `C:/Results/${id}.xml`,
    trackVenue: 'Spa-Francorchamps',
    trackCourse: 'Grand Prix',
    timestamp: 1_780_000_000_000,
    ...overrides,
  });
}

describe('Phase 3a targeted updates', () => {
  let db: SessionDatabase;
  const raw = () => db.getDb();

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it('sets replay link via targeted update without calling writeSessionRows', () => {
    const s = buildTestSession('session-link-test');
    db.upsertSession(s, s.filePath, 1, 10);

    const writeSpy = vi.spyOn(writer, 'writeSessionRows');

    db.updateSessionMatchingReplay(s.id, initialLink);

    // writeSessionRows must not be called during targeted replay link attachment
    expect(writeSpy).not.toHaveBeenCalled();

    // Verify row reading and card reading reflect the new replay link
    const loaded = db.getSessionById(s.id);
    expect(loaded?.matchingReplayFile?.name).toBe('Spa_R1.Vcr');
    expect(loaded?.matchingReplayFile?.eventTitle).toBe('Spa 6h');

    const cards = readSessionCards(raw(), [s.id]);
    expect(cards[0]?.matchingReplayFile?.name).toBe('Spa_R1.Vcr');

    // Equivalence: loaded session matches expected canonical form
    const expected = canonicalSession({ ...s, matchingReplayFile: initialLink });
    expect(diffValues(expected, loaded)).toEqual([]);
  });

  it('withdraws replay link via targeted update without calling writeSessionRows', () => {
    const s = buildTestSession('session-withdraw-test', { matchingReplayFile: initialLink });
    db.upsertSession(s, s.filePath, 1, 10);

    const writeSpy = vi.spyOn(writer, 'writeSessionRows');

    const rejection = db.rejectSessionReplayLink(s.id, initialLink, 'time-window');
    expect(rejection).not.toBeNull();
    expect(rejection?.replayName).toBe('Spa_R1.Vcr');

    // writeSessionRows must not be called during link rejection
    expect(writeSpy).not.toHaveBeenCalled();

    // Replay link removed from session and recordings table
    expect(db.getSessionById(s.id)?.matchingReplayFile).toBeUndefined();
    expect(raw().prepare('SELECT * FROM session_recordings WHERE session_id = ?').get(s.id)).toBeUndefined();
    expect(raw().prepare('SELECT recording_name FROM sessions WHERE id = ?').get(s.id)).toEqual({ recording_name: null });

    // Rejected link stored
    expect(isReplayLinkWithdrawn(raw(), s.id, 'Spa_R1.Vcr')).toBe(true);

    const expected = canonicalSession(s);
    delete expected.matchingReplayFile;
    expect(diffValues(expected, db.getSessionById(s.id))).toEqual([]);
  });

  it('renames replay file across multiple sessions via targeted update', () => {
    const s1 = buildTestSession('session-r1', { matchingReplayFile: initialLink });
    const s2 = buildTestSession('session-r2', { matchingReplayFile: initialLink });
    db.upsertSession(s1, s1.filePath, 1, 10);
    db.upsertSession(s2, s2.filePath, 2, 10);

    // Insert replay metadata so archiveReplacedRecording finds the stored recording
    db.upsertReplayMetadataCache(
      initialLink.name,
      initialLink.path,
      1_780_000_000_000,
      1234567,
      makeReplayMetadata(3600)
    );

    const writeSpy = vi.spyOn(writer, 'writeSessionRows');

    const archivedName = archiveReplacedRecording(raw(), initialLink.name, {
      mtime: 1_780_000_500_000,
      size: 9999999,
      metadata: makeReplayMetadata(1800),
    });


    expect(archivedName).not.toBeNull();

    // writeSessionRows must not be called during replay archive rename
    expect(writeSpy).not.toHaveBeenCalled();

    // Both sessions now link to the archived replay name
    const loaded1 = db.getSessionById(s1.id);
    const loaded2 = db.getSessionById(s2.id);
    expect(loaded1?.matchingReplayFile?.name).toBe(archivedName);
    expect(loaded2?.matchingReplayFile?.name).toBe(archivedName);
  });

  it('attaches and detaches DuckDB telemetry file via targeted update', () => {
    const s = buildTestSession('session-duckdb-test', { matchingReplayFile: initialLink });
    db.upsertSession(s, s.filePath, 1, 10);

    const writeSpy = vi.spyOn(writer, 'writeSessionRows');

    // Attach
    expect(db.updateSessionTelemetryFile(s.id, 'spa_telemetry.duckdb')).toBe(true);
    // Duplicate attach is a no-op
    expect(db.updateSessionTelemetryFile(s.id, 'spa_telemetry.duckdb')).toBe(false);

    expect(writeSpy).not.toHaveBeenCalled();

    // Both session and link reflect telemetry attachment
    const loaded = db.getSessionById(s.id);
    expect(loaded?.hasDuckDbTelemetry).toBe(true);
    expect(loaded?.duckdbFilename).toBe('spa_telemetry.duckdb');
    expect(loaded?.matchingReplayFile?.hasDuckDbTelemetry).toBe(true);
    expect(loaded?.matchingReplayFile?.duckdbFilename).toBe('spa_telemetry.duckdb');

    // Cards reflect it
    const cards = readSessionCards(raw(), [s.id]);
    expect(cards[0]?.hasDuckDbTelemetry).toBe(true);
    expect(cards[0]?.duckdbFilename).toBe('spa_telemetry.duckdb');
    expect(cards[0]?.matchingReplayFile?.hasDuckDbTelemetry).toBe(true);
    expect(cards[0]?.matchingReplayFile?.duckdbFilename).toBe('spa_telemetry.duckdb');

    // Detach
    expect(db.updateSessionTelemetryFile(s.id, undefined)).toBe(true);
    const detached = db.getSessionById(s.id);
    expect(detached?.hasDuckDbTelemetry).toBe(false);
    expect(detached?.duckdbFilename).toBeUndefined();
    expect(detached?.matchingReplayFile?.hasDuckDbTelemetry).toBeUndefined();
  });

  it('updates conditions and derived projection metrics via targeted update', () => {
    const s = buildTestSession('session-conditions-test', { matchingReplayFile: initialLink });
    db.upsertSession(s, s.filePath, 1, 10);

    // Insert replay rain conditions
    raw().prepare(`
      INSERT INTO replay_conditions (filename, start_sec, end_sec, rain)
      VALUES (?, ?, ?, ?)
    `).run('Spa_R1.Vcr', 0, 4000, 45);

    const writeSpy = vi.spyOn(writer, 'writeSessionRows');

    db.reclassifyStoredSessions({ ids: [s.id] });

    // writeSessionRows must not be called during condition reclassification
    expect(writeSpy).not.toHaveBeenCalled();

    // Weather on the replay link is updated
    const loaded = db.getSessionById(s.id);
    expect(loaded?.matchingReplayFile?.hasRain).toBe(true);
    expect(loaded?.matchingReplayFile?.maxRainIntensity).toBe(45);

    // Condition summary table is updated with wet condition facts
    const conditionSummaries = raw().prepare('SELECT * FROM session_driver_condition_summaries WHERE session_id = ?').all(s.id);
    expect(conditionSummaries.length).toBeGreaterThan(0);

    // Clean lap figures on session_drivers are preserved/recalculated
    const playerDriverRow = raw().prepare('SELECT * FROM session_drivers WHERE session_id = ? AND driver_ordinal = 0').get(s.id) as Record<string, unknown>;
    expect(playerDriverRow.completed_laps_count).toBe(3);
  });
});
