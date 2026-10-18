import { afterEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { getLiveCaptureIndexRows, setLiveCaptureAvailability, setLiveCaptureMatch, upsertLiveCapture } from '../../../../server/core/live/dbLiveCaptureStore.js';
import { getLearningSource, readCurrentLearningExamples } from '../../../../server/core/live/dbLiveLearningStore.js';
import { evaluateLiveLearning } from '../../../../server/live/learning/report.js';
import { refreshLiveLearning } from '../../../../server/live/learning/service.js';
import type { LiveCaptureManifest } from '../../../../shared/types/liveCapture.js';
import type { StoredLearningEvent } from '../../../../shared/types/liveLearning.js';

const databases: SessionDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function database(): SessionDatabase {
  const db = new SessionDatabase(':memory:');
  databases.push(db);
  return db;
}

function addSession(db: SessionDatabase): void {
  const raw = db.getDb();
  const startedAt = Date.parse('2026-10-10T11:00:00Z');
  raw.prepare(`INSERT INTO sessions (id, filename, file_path, file_mtime_ms, file_size_bytes, timestamp,
    track_venue, track_course, session_type, session_name, drivers_count, updated_at, game_version)
    VALUES ('session-verified', 'session-verified.xml', 'C:/results/session-verified.xml', ?, 100, ?,
      'Monza', 'GP', 'Race', 'R1', 1, 0, 'Build-42')`).run(startedAt + 3_600_000, startedAt - 5_000);
  raw.prepare('INSERT INTO drivers (name, normalized_name) VALUES (?, ?)').run('Player One', 'player one');
  const driverId = (raw.prepare('SELECT driver_id FROM drivers WHERE name=?').get('Player One') as { driver_id: number }).driver_id;
  raw.prepare('INSERT INTO vehicles (car_type, car_class) VALUES (?, ?)').run('Ferrari 296 GT3', 'GT3');
  const vehicleId = (raw.prepare('SELECT vehicle_id FROM vehicles WHERE car_type=?').get('Ferrari 296 GT3') as { vehicle_id: number }).vehicle_id;
  raw.prepare(`INSERT INTO session_drivers (session_id,driver_ordinal,driver_id,vehicle_id,is_player)
    VALUES ('session-verified',0,?,?,1)`).run(driverId, vehicleId);
  const insertLap = raw.prepare(`INSERT INTO session_laps
    (session_id,driver_ordinal,lap_ordinal,lap_number,lap_time,is_valid,is_clean,is_representative,condition_group)
    VALUES ('session-verified',0,?,?,?,?,1,1,'dry')`);
  insertLap.run(0, 2, 101.2, 1);
  insertLap.run(1, 3, 100.9, 1);
}

function manifest(overrides: Partial<LiveCaptureManifest> = {}): LiveCaptureManifest {
  const startedAt = Date.parse('2026-10-10T11:00:00Z');
  return {
    recordingId: 'recording-learning', source: 'live-capture', schemaVersion: 1, normalizationVersion: 1,
    signConvention: 'iso8855', filename: 'recording-learning.duckdb', layoutKey: 'monza_gp', trackName: 'Monza',
    driverName: 'Player One', vehicleName: 'Ferrari 296 GT3', vehicleModel: 'Ferrari 296 GT3', carClass: 'GT3',
    sessionCode: 3, sessionKind: 'race', startedAt, updatedAt: startedAt + 3600_000,
    firstElapsedSeconds: 0, lastElapsedSeconds: 3600, endedAt: startedAt + 3600_000,
    status: 'completed', samples: 360000, droppedSamples: 0,
    anchors: [{ lapNumber: 2, startSeconds: 300, lapSeconds: 101.2 }, { lapNumber: 3, startSeconds: 401.2, lapSeconds: 100.9 }],
    sessionId: null, gameVersion: null, ...overrides,
  };
}

function verifiedDatabase(): { db: SessionDatabase; capture: LiveCaptureManifest } {
  const db = database();
  addSession(db);
  const capture = manifest();
  upsertLiveCapture(db.getDb(), capture, 4096);
  setLiveCaptureMatch(db.getDb(), capture.recordingId, 'session-verified', 'Build-42', 'verified');
  return { db, capture };
}

function events(): StoredLearningEvent[] {
  const result: StoredLearningEvent[] = [];
  for (const [offset, kind] of (['fuel', 've'] as const).entries()) {
    result.push({ observationId: 100 + offset * 2, event: { kind: 'learning-forecast', data: {
      version: 1, lapNumber: 2, lapStartSeconds: 300, forecastSeconds: 301, kind,
      predicted: 2, predictionSource: 'measured', modelVersion: 3, condition: 'dry', compound: 'Medium',
    } } });
    result.push({ observationId: 101 + offset * 2, event: { kind: 'learning-outcome', data: {
      version: 1, lapNumber: 2, crossingSeconds: 401.2, kind, actual: kind === 'fuel' ? 2.1 : 2.2,
      measurementSource: 'live-usage-meter', exclusions: [],
    } } });
  }
  return result;
}

describe('refreshLiveLearning', () => {
  it('builds eligible compact examples without reading a loaded session and skips an unchanged projection', async () => {
    const { db } = verifiedDatabase();
    let reads = 0;
    const read = async (): Promise<StoredLearningEvent[]> => { reads += 1; return events(); };
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, read)).toBe(1);
    expect(reads).toBe(1);
    const examples = readCurrentLearningExamples(db.getDb());
    expect(examples).toHaveLength(2);
    expect(examples.every((example) => example.exclusions.length === 0)).toBe(true);
    expect(examples.map((example) => example.kind)).toEqual(['fuel', 've']);
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, read)).toBe(0);
    expect(reads).toBe(1);
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => true, read)).toBe(0);
    expect(reads).toBe(1);
  });

  it('marks no-event captures ready with zero rows', async () => {
    const { db } = verifiedDatabase();
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, async () => [])).toBe(1);
    expect(getLearningSource(db.getDb(), 'recording-learning')?.state).toBe('ready');
    expect(readCurrentLearningExamples(db.getDb())).toEqual([]);
  });

  it('invalidates and rebuilds after canonical XML classification changes', async () => {
    const { db } = verifiedDatabase();
    const read = async (): Promise<StoredLearningEvent[]> => events();
    await refreshLiveLearning(db.getDb(), 'recordings', () => false, read);
    db.getDb().prepare(`UPDATE session_laps SET is_clean=0 WHERE session_id='session-verified' AND lap_number=2`).run();
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, read)).toBe(1);
    expect(readCurrentLearningExamples(db.getDb()).every((example) => example.exclusions.includes('lap-not-clean-representative'))).toBe(true);
  });

  it('retains built facts after raw availability is removed when the projection signature is unchanged', async () => {
    const { db, capture } = verifiedDatabase();
    await refreshLiveLearning(db.getDb(), 'recordings', () => false, async () => events());
    setLiveCaptureAvailability(db.getDb(), capture.recordingId, false);
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, async () => { throw new Error('must not read'); })).toBe(0);
    expect(readCurrentLearningExamples(db.getDb())).toHaveLength(2);
  });

  it('records source read failures and observes the retry backoff', async () => {
    const { db } = verifiedDatabase();
    let reads = 0;
    const fail = async (): Promise<StoredLearningEvent[]> => { reads += 1; throw new Error('capture unavailable'); };
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, fail)).toBe(1);
    expect(getLearningSource(db.getDb(), 'recording-learning')).toMatchObject({ state: 'failed', error: 'capture unavailable' });
    expect(readCurrentLearningExamples(db.getDb())).toEqual([]);
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, fail)).toBe(0);
    expect(reads).toBe(1);
    db.getDb().prepare('UPDATE live_learning_sources SET updated_at=0').run();
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, async () => events())).toBe(1);
    expect(getLearningSource(db.getDb(), 'recording-learning')?.state).toBe('ready');
  });

  it('discards read results when the capture link is withdrawn during the read', async () => {
    const { db, capture } = verifiedDatabase();
    const read = async (): Promise<StoredLearningEvent[]> => {
      setLiveCaptureMatch(db.getDb(), capture.recordingId, null, null, 'pending');
      return events();
    };
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => false, read)).toBe(1);
    expect(getLiveCaptureIndexRows(db.getDb())[0]?.matchStatus).toBe('pending');
    expect(readCurrentLearningExamples(db.getDb())).toEqual([]);
  });

  it('discards read results when a game session loads during the read', async () => {
    const { db } = verifiedDatabase();
    let loaded = false;
    const read = async (): Promise<StoredLearningEvent[]> => { loaded = true; return events(); };
    expect(await refreshLiveLearning(db.getDb(), 'recordings', () => loaded, read)).toBe(1);
    expect(readCurrentLearningExamples(db.getDb())).toEqual([]);
    expect(getLearningSource(db.getDb(), 'recording-learning')?.state).toBe('stale');
  });

  it('excludes a projection with stale XML flags from evaluation before refresh', async () => {
    const { db } = verifiedDatabase();
    await refreshLiveLearning(db.getDb(), 'recordings', () => false, async () => events());
    db.getDb().prepare(`UPDATE session_laps SET is_representative=0 WHERE session_id='session-verified' AND lap_number=2`).run();
    const report = evaluateLiveLearning(db.getDb());
    expect(report.dataset).toMatchObject({ currentExamples: 2, eligible: 0, excluded: 2 });
    expect(report.dataset.exclusions['stale-projection']).toBe(2);
  });
});
