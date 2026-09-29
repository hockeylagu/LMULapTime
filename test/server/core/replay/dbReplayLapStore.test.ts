import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionDatabase } from '../../../../server/core/db.js';
import { REPLAY_CACHE_VERSION } from '../../../../server/core/dbSchema.js';
import type { ReplayTrajectoryData } from '../../../../server/core/types.js';
import {
  getDriverEvents,
  getLapConditions,
  getReplayConditions,
  getReplayFactsVersion,
  getReplayLaps,
  getRunningOrder,
  renameReplayFacts,
  replaceReplayDriverLapFacts,
  replaceReplayWideFacts,
} from '../../../../server/core/replay/dbReplayLapStore.js';
import { emptyLapFact } from '../../../../server/replay/decode/replayFacts.js';

const name = 'Facts_R1.Vcr';
const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 };

// One decode of a driver: two laps of 100 s, with the replay-wide arrays every lap blob carries.
const decoded = (driverSlot: number, pitCode = 34): ReplayTrajectoryData => {
  const lap = (currentLap: number): ReplayTrajectoryData => ({
    replayName: name, pointsCount: 2, currentLap, driverSlot, bounds,
    points: [{ x: 0, y: 0, z: 0, timeSec: currentLap * 100 }, { x: 0, y: 0, z: 0, timeSec: currentLap * 100 + 99 }],
    laps: [1, 2].map(n => ({ lapNumber: n, lapTimeSec: 99, s1Sec: 33, s2Sec: 33, s3Sec: 33 })),
    weatherEvents: [{ timeSec: 0, rainIntensity: 0, ambientTemp: 20 }, { timeSec: 250, rainIntensity: 120, ambientTemp: 19 }],
    flagEvents: [{ timeSec: 0, flagState: 0, flagName: 'Green', driverSlot: 255 }, { timeSec: 120, flagState: 3, flagName: 'FCY', driverSlot: 255 }],
    pitEvents: [{ driverSlot: 1, timeSec: 150, code: pitCode, action: 'Pit entry' }],
    standingsHistory: [{ timeSec: 0, order: [1, 2] }],
  });
  return { ...lap(1), allLapsData: [lap(1), lap(2)] };
};

describe('normalized replay facts store', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('written with a decode', () => {
    it('stores the driver\'s laps and the replay-wide facts', () => {
      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 1, decoded(1), true);
      const raw = db.getDb();

      expect(getReplayLaps(raw, name).map(l => [l.driverSlot, l.lapNumber, l.startSec, l.endSec, l.lapTimeSec])).toEqual([[1, 1, 100, 199, 99], [1, 2, 200, 299, 99]]);
      expect(getReplayFactsVersion(raw, name)).toBe(REPLAY_CACHE_VERSION);
      expect(getReplayConditions(raw, name).map(c => [c.startSec, c.endSec, c.rain, c.flagState])).toEqual([[0, 120, 0, 0], [120, 250, 0, 3], [250, 299, 120, 3]]);
      expect(getDriverEvents(raw, name).map(e => [e.kind, e.driverSlot, e.code])).toEqual([['pit', 1, 34]]);
      expect(getRunningOrder(raw, name)).toEqual([{ timeSec: 0, order: [1, 2] }]);
    });

    it('keeps the replay-wide facts of the first decode at this version, and each driver\'s own laps', () => {
      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 1, decoded(1), true);
      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 2, decoded(2, 99), false);
      const raw = db.getDb();

      expect(getDriverEvents(raw, name).map(e => e.code)).toEqual([34]);
      expect(getReplayLaps(raw, name).map(l => l.driverSlot)).toEqual([1, 1, 2, 2]);
    });

    it('replaces the replay-wide facts of an older version, and drops laps the new decode no longer has', () => {
      const raw = db.getDb();
      replaceReplayWideFacts(raw, name, { endSec: 1, sessionRunningOrder: null, conditions: [], runningOrder: [], driverEvents: [] }, 'v3');
      replaceReplayDriverLapFacts(raw, name, 1, [emptyLapFact(1), emptyLapFact(2), emptyLapFact(3)], 'v3');

      db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 1, decoded(1), true);

      expect(getReplayFactsVersion(raw, name)).toBe(REPLAY_CACHE_VERSION);
      expect(getDriverEvents(raw, name)).toHaveLength(1);
      expect(getReplayLaps(raw, name).map(l => l.lapNumber)).toEqual([1, 2]);
    });
  });

  it('gives each lap the conditions over its own time span', () => {
    db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 1, decoded(1), true);

    expect(getLapConditions(db.getDb(), name)).toEqual([
      { driverSlot: 1, lapNumber: 1, maxRain: 0, rainAtStart: 0, minAmbientC: 20, fullCourseYellow: true },
      { driverSlot: 1, lapNumber: 2, maxRain: 120, rainAtStart: 0, minAmbientC: 19, fullCourseYellow: true },
    ]);
  });

  it('leaves a lap without stored points out of the conditions', () => {
    const raw = db.getDb();
    replaceReplayWideFacts(raw, name, {
      endSec: 10, sessionRunningOrder: null, runningOrder: [], driverEvents: [],
      conditions: [{ startSec: 0, endSec: 10, rain: 5, ambientC: null, flagState: 0, sectorMask: null, driverFlag: null }],
    }, 'v7');
    replaceReplayDriverLapFacts(raw, name, 1, [emptyLapFact(1), emptyLapFact(2, { startSec: 20, endSec: 30 }), emptyLapFact(3, { startSec: 2, endSec: 4 })], 'v7');

    expect(getLapConditions(raw, name).map(c => c.lapNumber)).toEqual([3]);
  });

  it('filters driver events by driver and time', () => {
    const raw = db.getDb();
    replaceReplayWideFacts(raw, name, {
      endSec: 100, sessionRunningOrder: [2, 1], conditions: [], runningOrder: [],
      driverEvents: [10, 20, 30].map((timeSec, seq) => ({ kind: 'contact' as const, seq, driverSlot: seq % 2, timeSec, code: null, value: 1, otherSlot: null, detail: null })),
    }, 'v7');

    expect(getDriverEvents(raw, name, { driverSlot: 0 }).map(e => e.timeSec)).toEqual([10, 30]);
    expect(getDriverEvents(raw, name, { fromSec: 15, toSec: 30 }).map(e => e.timeSec)).toEqual([20, 30]);
  });

  it('moves every fact with the replay when it is renamed', () => {
    db.replaceReplayDriverLaps(name, 'C:\\r\\' + name, 1, 1, 1, decoded(1), true);
    const raw = db.getDb();

    renameReplayFacts(raw, name, 'Archived.Vcr');

    expect(getReplayLaps(raw, name)).toEqual([]);
    expect(getReplayFactsVersion(raw, name)).toBeNull();
    expect(getReplayLaps(raw, 'Archived.Vcr')).toHaveLength(2);
    expect(getDriverEvents(raw, 'Archived.Vcr')).toHaveLength(1);
    expect(getReplayConditions(raw, 'Archived.Vcr')).toHaveLength(3);
  });
});
