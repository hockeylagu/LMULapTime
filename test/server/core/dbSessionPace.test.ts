import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import type { DetailedSession, DriverData, LapData } from '../../../server/core/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The benchmark target the ratings are computed against; each test sets it.
const target = vi.hoisted(() => ({ sec: 120 as number | null }));

vi.mock('../../../server/benchmarks/referenceLaptimes.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../server/benchmarks/referenceLaptimes.js')>();
  const { getPaceCategoryFromPercentage } = await import('../../../shared/domain/paceCategory.js');
  return {
    ...original,
    calculatePaceCategory: (lapTime: number | null) => {
      if (!lapTime || !target.sec) return null;
      const percentage = parseFloat(((lapTime / target.sec) * 100).toFixed(2));
      return { category: getPaceCategoryFromPercentage(percentage), percentage, target100Sec: target.sec, deltaToTargetSec: lapTime - target.sec };
    },
  };
});

function lap(lapNum: number, lapTime: number): LapData {
  return {
    lapNum, position: 1, lapTime, lapTimeString: '', s1: null, s2: null, s3: null, topSpeed: null,
    fCompound: 'Medium', rCompound: 'Medium', elapsedSeconds: (lapNum - 1) * 125, isPitStop: false, isValid: true,
  } as LapData;
}

const driver = {
  name: 'Samuel Lague', isPlayer: true, carClass: 'GT3', carType: 'BMW M4 LMGT3',
  bestLapTime: 121.2, bestLapNum: 2, laps: [lap(1, 122.4), lap(2, 121.2)],
} as unknown as DriverData;
const session = {
  id: '2026_09_18_15_57_39-22Q1', filename: '2026_09_18_15_57_39-22Q1.xml', timestamp: 0,
  trackVenue: 'Bahrain International Circuit', trackCourse: 'Bahrain International Circuit', trackLengthMeters: 5412,
  sessionType: 'Qualifying', sessionName: 'Q1', driversCount: 1, drivers: [driver], playerDriver: driver,
} as unknown as DetailedSession;

describe('re-rating stored sessions when the benchmark targets change', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    target.sec = 120;
    db = new SessionDatabase(':memory:');
    db.upsertSession(JSON.parse(JSON.stringify(session)) as DetailedSession, 'C:\\results\\22Q1.xml', 1, 1);
    db.rerateSessionPace('v1');
  });

  afterEach(() => {
    db.close();
  });

  it('rates the laps and the best lap against the new target, in the stored row and the loaded session', () => {
    const loaded = db.getAllSessions()[0];
    expect(loaded.playerDriver?.bestLapPacePercentage).toBe(101);

    target.sec = 120.5;
    expect(db.rerateSessionPace('v2')).toBe(1);

    expect(loaded.playerDriver?.bestLapPacePercentage).toBe(100.58);
    expect(loaded.drivers[0].laps[0].pacePercentage).toBe(101.58);
    db.invalidateSessionCache();
    expect(db.getSessionById(session.id)?.playerDriver?.bestLapPacePercentage).toBe(100.58);
  });

  it('does nothing again for the same target version', () => {
    const revision = db.getSessionRevision();
    target.sec = 119;
    expect(db.rerateSessionPace('v1')).toBe(0);
    expect(db.getSessionRevision()).toBe(revision);
  });

  it('drops the ratings when the layout and class lose their target', () => {
    target.sec = null;
    db.rerateSessionPace('v2');
    const stored = db.getAllSessions()[0];
    expect(stored.playerDriver?.bestLapPacePercentage).toBeUndefined();
    expect(stored.drivers[0].laps[1].paceCategory).toBeUndefined();
  });

  it('repairs a stored rating from the old completion marker even when targets have not changed', () => {
    db.getDb().prepare('DELETE FROM cache_metadata WHERE key = ?').run('session_pace_reference_v2');
    db.setMetadata('session_pace_reference', 'v1');
    target.sec = 120.5;
    expect(db.rerateSessionPace('v1')).toBe(1);
    expect(db.getSessionById(session.id)?.drivers[0].laps[1].pacePercentage).toBe(100.58);
  });

  it.each([false, true])('rates a late worker result at persistence and preserves wet-best rules (wet=%s)', async wet => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lmu-pace-race-'));
    try {
      fs.writeFileSync(path.join(directory, 'late.xml'), '<session/>');
      const oldWorkerResult = structuredClone(db.getSessionById(session.id)!);
      if (wet) {
        oldWorkerResult.drivers[0].laps[1].fCompound = 'Wet';
        oldWorkerResult.drivers[0].laps[1].rCompound = 'Wet';
      }
      const iterator = db.syncSessionsAsyncIterator(directory, {
        addReplayEntry: () => {},
        parseSessionXml: () => { throw new Error('Expected asynchronous parsing'); },
        parseSessionXmlAsync: async () => {
          target.sec = 120.5;
          db.rerateSessionPace('v2');
          return oldWorkerResult;
        },
      });
      for await (const progress of iterator) void progress;
      expect(db.rerateSessionPace('v2')).toBe(0);
      const stored = db.getSessionById(session.id)!;
      expect(stored.drivers[0].laps[1].pacePercentage).toBe(100.58);
      expect(stored.playerDriver?.bestLapPacePercentage).toBe(wet ? undefined : 100.58);
      expect(stored.playerDriver?.bestLapWet).toBe(wet ? true : undefined);
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
  });
});
