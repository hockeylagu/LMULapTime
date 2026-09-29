import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { SessionDatabase } from '../../../server/core/db.js';
import { replaceReplayDriverLapFacts, replaceReplayWideFacts } from '../../../server/core/replay/dbReplayLapStore.js';
import { emptyLapFact } from '../../../server/replay/replayFacts.js';
import { attachPitServices } from '../../../server/sessions/sessionPitStops.js';
import type { ReplayDriverEventFact } from '../../../server/replay/replayFacts.js';
import type { DetailedSession, DriverData, LapData } from '../../../server/core/types.js';

const replayName = 'Daytona R1 6.Vcr';

/** Four 100 s laps from et 0; lap 2 is the in-lap. */
const laps = (): LapData[] => [1, 2, 3, 4].map((lapNum) => ({
  lapNum, position: 1, lapTime: 100, lapTimeString: '', s1: null, s2: null, s3: null, topSpeed: null,
  fCompound: 'Medium', rCompound: 'Medium', elapsedSeconds: (lapNum - 1) * 100, isPitStop: lapNum === 2, isValid: true,
} as LapData));

const driver = (name: string, carClass = 'GT3') => ({ name, carClass, laps: laps() } as unknown as DriverData);

/** A stop entering the pit lane at 190 s, on the jacks at 200 s for `serviceSec`. */
function stopEvents(slot: number, name: string, serviceSec: number, penalty = false): ReplayDriverEventFact[] {
  const event = (seq: number, timeSec: number, code: number): ReplayDriverEventFact => ({
    kind: 'pit', seq, driverSlot: slot, timeSec, code, value: null, otherSlot: null, detail: { driverName: name },
  });
  return [
    event(slot * 10, 190, 34), event(slot * 10 + 1, 200, 36), event(slot * 10 + 2, 200 + serviceSec, 37), event(slot * 10 + 3, 230 + serviceSec, 32),
    ...(penalty ? [{ ...event(slot, 205, 0), kind: 'penalty_served' as const }] : []),
  ];
}

const rawDb = (db: SessionDatabase) => (db as unknown as { db: DatabaseType }).db;

describe('attachPitServices', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    replaceReplayWideFacts(rawDb(db), replayName, {
      endSec: 400, sessionRunningOrder: null, runningOrder: [], conditions: [],
      driverEvents: [
        ...stopEvents(0, 'Me', 75), ...stopEvents(1, 'A', 30), ...stopEvents(2, 'B', 28), ...stopEvents(3, 'C', 32, true),
        ...stopEvents(4, 'Hyper', 90),
      ],
    }, 'v7');
  });

  afterEach(() => db.close());

  it('puts each stop on its in-lap with the class usual stop, and guesses repairs on a long one', () => {
    const me = driver('Me');
    const session = {
      id: 's', matchingReplayFile: { name: replayName, path: replayName, sizeBytes: 1 },
      drivers: [me, driver('A'), driver('B'), driver('C'), driver('Hyper', 'Hyper')], playerDriver: me,
    } as unknown as DetailedSession;

    attachPitServices(rawDb(db), session);

    expect(session.playerDriver?.laps[1].pitService).toEqual({
      pitLaneSec: 115, serviceSec: 75, classMedianServiceSec: 30, unexplainedSec: 45,
    });
    expect(session.playerDriver?.laps.filter((l) => l.pitService).map((l) => l.lapNum)).toEqual([2]);
    // The other class is not part of the GT3 usual stop, and a penalty served explains a stop.
    expect(session.drivers[3].laps[1].pitService?.penaltyServed).toBe(true);
    expect(session.drivers[4].laps[1].pitService?.classMedianServiceSec).toBeNull();
  });

  it('reads where the timing line fell in the pit lane from the replay laps', () => {
    // My replay lap 3 starts at 195 s: 5 s into the pit lane, before the jacks at 200 s.
    const lapFact = (lapNumber: number, startSec: number) => ({ ...emptyLapFact(lapNumber), startSec, endSec: startSec + 100 });
    replaceReplayDriverLapFacts(rawDb(db), replayName, 0, [lapFact(2, 95), lapFact(3, 195)], 'v7');
    const me = driver('Me');
    const session = { id: 's', matchingReplayFile: { name: replayName, path: replayName, sizeBytes: 1 }, drivers: [me] } as unknown as DetailedSession;

    attachPitServices(rawDb(db), session);

    expect(me.laps[1].pitService).toMatchObject({ laneBeforeLineSec: 5, serviceAfterLine: true });
  });

  it('leaves a session without a linked replay alone', () => {
    const session = { id: 's', drivers: [driver('Me')] } as unknown as DetailedSession;
    attachPitServices(rawDb(db), session);
    expect(session.drivers[0].laps.some((l) => l.pitService)).toBe(false);
  });
});
