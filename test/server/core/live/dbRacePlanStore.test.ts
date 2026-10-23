import { describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { readSessionRacePlan, saveRacePlan } from '../../../../server/core/live/dbRacePlanStore.js';
import type { LiveRaceStrategies } from '../../../../shared/types/liveStrategy.js';

const plan = (laps: number) => ({ kind: 've', unit: '%', raceMinutes: 60, laps, nextBest: null,
  chosen: { name: 'NO TYRE CHANGE', stops: 1, pitLap: 11, loadStart: 100, loadToFinish: 45, tyresStart: 'NEW MEDIUM',
    tyresStop: 'NO CHANGE', treadAtFlag: 0.69, gapSeconds: 0 } }) satisfies LiveRaceStrategies;

describe('race plan store', () => {
  it('reads a session plan through its live recordings, the newest saved, replaced when saved again', () => {
    const db = new SessionDatabase(':memory:').getDb();
    const capture = (recordingId: string, sessionId: string | null) => db.prepare(`INSERT INTO live_capture_index
      (recording_id, filename, manifest_json, session_id, started_at, updated_at) VALUES (?, ?, '{}', ?, 1, 1)`)
      .run(recordingId, `${recordingId}.live.duckdb`, sessionId);
    capture('a', 'race'); capture('b', 'race'); capture('c', null);
    expect(readSessionRacePlan(db, 'race')).toBeNull();
    saveRacePlan(db, 'a', plan(15), 1);
    saveRacePlan(db, 'b', plan(16), 2);
    saveRacePlan(db, 'c', plan(17), 3);
    expect(readSessionRacePlan(db, 'race')).toEqual(plan(16));
    saveRacePlan(db, 'a', plan(14), 4);
    expect(readSessionRacePlan(db, 'race')).toEqual(plan(14));
    expect(readSessionRacePlan(db, 'other')).toBeNull();
  });
});
