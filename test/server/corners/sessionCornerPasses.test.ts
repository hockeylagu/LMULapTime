import { describe, expect, it } from 'vitest';
import { planLayoutCornerPasses } from '../../../server/corners/cornerPassService.js';
import { cornerPassLaps, readSessionCornerPasses, type CornerPassReader } from '../../../server/corners/sessionCornerPasses.js';
import type { CornerPass } from '../../../shared/types/corners/cornerPasses.js';

// A square of 100 m sides with its start line 50 m along the centre line.
const SQUARE: Array<[number, number]> = [];
for (let i = 0; i < 400; i += 5) {
  const side = Math.floor(i / 100), along = i % 100;
  SQUARE.push(side === 0 ? [along, 0] : side === 1 ? [100, along] : side === 2 ? [100 - along, 100] : [0, 100 - along]);
}
const loadTrack = () => ({ centerline: SQUARE, projectionRevision: 'rev1', timingGates: { startFinish: { stationM: 50 } } });
const pass = (slot: number): CornerPass => ({ slot, lapNumber: 2, segment: 1, entrySec: 61, minSpeedSec: 62, exitSec: 64,
  entrySpeedKmh: 200, minSpeedKmh: 90, exitSpeedKmh: 150, minSpeedM: 140, brakeM: 100, turnInM: 120, throttleM: 160,
  aheadSlot: null, aheadGapSec: null, behindSlot: null, behindGapSec: null });
const CARS = [{ slot: 0, name: 'A', sessionDriverOrdinal: 0 }, { slot: 4, name: 'B', sessionDriverOrdinal: 1 }];

function reader(versionKey: string | null): CornerPassReader {
  return {
    getReplayLapSignature: () => '4:100',
    getCornerPassBuild: () => (versionKey === null ? null : { versionKey, layoutKey: 'sebring_full', passCount: 2 }),
    listCornerPasses: () => [pass(0), pass(4)],
    listCornerPassLaps: () => [0, 4].map(slot => ({ slot, lapNumber: 2, startSec: 60, endSec: 120, isValid: true, isPitStop: false, isOutLap: false, wet: false })),
    listContacts: () => [{ slot: 4, timeSec: 62 }],
  };
}

describe('cornerPassLaps', () => {
  const replayLap = (driverSlot: number, lapNumber: number, startSec: number | null = 10) =>
    ({ driverSlot, lapNumber, startSec, endSec: startSec === null ? null : startSec + 60, isOutLap: lapNumber === 1, isValid: true });

  it('takes the session flags of the car\'s driver, else the replay\'s own; laps without a clock are left out', () => {
    const laps = cornerPassLaps(
      [replayLap(0, 1), replayLap(0, 2), replayLap(0, 3), replayLap(4, 1), replayLap(4, 2, null)],
      CARS,
      ordinal => (ordinal === 0 ? [
        { lapNumber: 1, isValid: true, isOutLap: false },
        { lapNumber: 2, isValid: false, isPitStop: true, nonRepresentativeReason: 'traffic' as const, conditions: { wetTyres: true } },
      ] : undefined),
    );
    expect(laps).toEqual([
      { slot: 0, lapNumber: 1, startSec: 10, endSec: 70, isValid: true, isPitStop: false, isOutLap: false, wet: false },
      { slot: 0, lapNumber: 2, startSec: 10, endSec: 70, isValid: false, isPitStop: true, isOutLap: false, nonRepresentativeReason: 'traffic', wet: true },
      // Not in the results: the replay's flags.
      { slot: 0, lapNumber: 3, startSec: 10, endSec: 70, isValid: true, isPitStop: false, isOutLap: false, wet: false },
      { slot: 4, lapNumber: 1, startSec: 10, endSec: 70, isValid: true, isPitStop: false, isOutLap: true, wet: false },
    ]);
  });
});

describe('readSessionCornerPasses', () => {
  const plan = planLayoutCornerPasses('sebring_full', '4:100', loadTrack);
  const currentKey = 'versionKey' in plan ? plan.versionKey : '';

  it('serves the current build with its labelled turns, every car or one', () => {
    const all = readSessionCornerPasses(reader(currentKey), 'a.Vcr', CARS, undefined, loadTrack);
    if (!all.available) throw new Error(all.reason);
    expect(all).toMatchObject({ layoutKey: 'sebring_full', startStationM: 50, trackLengthM: 400, cars: CARS });
    expect(all.passes.map(p => p.slot)).toEqual([0, 4]);
    // The plan's turns (the turn list placed on the centre line), as served.
    expect(all.turns.map(turn => turn.id)).toEqual('turns' in plan ? plan.turns.map(turn => turn.id) : null);

    expect(all.laps.map(lap => lap.slot)).toEqual([0, 4]);
    expect(all.contacts).toEqual([{ slot: 4, timeSec: 62 }]);

    const one = readSessionCornerPasses(reader(currentKey), 'a.Vcr', CARS, 4, loadTrack);
    if (!one.available) throw new Error(one.reason);
    expect([one.passes, one.laps, one.contacts].map(rows => rows.map(row => row.slot))).toEqual([[4], [4], [4]]);
  });

  it('says why when the passes are not built or are from another build', () => {
    expect(readSessionCornerPasses(reader(null), 'a.Vcr', CARS, undefined, loadTrack))
      .toEqual({ available: false, reason: 'Corner times are not built for this replay yet.' });
    expect(readSessionCornerPasses(reader('passes v1'), 'a.Vcr', CARS, undefined, loadTrack))
      .toEqual({ available: false, reason: 'Corner times are from an older build; they are rebuilt offline.' });
  });
});
