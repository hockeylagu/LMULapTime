import { describe, expect, it } from 'vitest';
import type { ReplayFlagEvent, ReplayTrajectoryData, ReplayWeatherEvent } from '../../../server/core/types.js';
import {
  conditionsFrom,
  driverEventsFrom,
  factsDriverSlot,
  lapFactsFrom,
  lapSpanFrom,
  lapSummariesFrom,
  runningOrderFrom,
  withoutReplayFacts,
} from '../../../server/replay/replayFacts.js';

const wx = (timeSec: number, rainIntensity: number, ambientTemp = 20): ReplayWeatherEvent => ({ timeSec, rainIntensity, ambientTemp });
const flag = (timeSec: number, flagState: number, sectorMask = 33): ReplayFlagEvent => ({ timeSec, flagState, flagName: 'x', sectorMask, driverSlot: 255, driverFlag: 0 });

describe('replay facts', () => {
  describe('stored lap rows', () => {
    const decodedLap: ReplayTrajectoryData = {
      replayName: 'R.Vcr', pointsCount: 1, currentLap: 2, driverSlot: 3,
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      points: [{ x: 0, y: 0, z: 0, timeSec: 10 }],
      laps: [{ lapNumber: 2, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30 }],
      weatherEvents: [wx(0, 0)],
      flagEvents: [flag(0, 0)],
      pitEvents: [{ driverSlot: 3, timeSec: 5, code: 34, action: 'Pit entry' }, { driverSlot: 4, timeSec: 6, code: 34, action: 'Pit entry' }],
      contacts: [{ driverSlot: 3, timeSec: 7, impactMagnitude: 2, otherParty: 4 }],
      penalties: [{ driverSlot: 4, timeSec: 8, penaltyText: 'x', action: 'given' }],
      standingsHistory: [{ timeSec: 0, order: [3, 4] }],
      sessionRunningOrder: [3, 4],
    };

    it('leave out the replay-wide facts and keep the driver\'s own pit events', () => {
      const stored = withoutReplayFacts(decodedLap, 3);

      expect(stored).toEqual({
        replayName: 'R.Vcr', pointsCount: 1, currentLap: 2, driverSlot: 3,
        bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
        points: [{ x: 0, y: 0, z: 0, timeSec: 10 }],
        pitEvents: [{ driverSlot: 3, timeSec: 5, code: 34, action: 'Pit entry' }],
      });
      expect(decodedLap.pitEvents).toHaveLength(2);
    });

    it('keep the lap list when the decode filed no lap facts', () => {
      expect(withoutReplayFacts(decodedLap, null).laps).toEqual(decodedLap.laps);
      expect(withoutReplayFacts({ ...decodedLap, driverSlot: 9 }, 9).pitEvents).toBeUndefined();
    });

    it('are filed under the decoded slot, or the trajectory\'s own for the -1 alias', () => {
      expect(factsDriverSlot(2, { driverSlot: 5 })).toBe(2);
      expect(factsDriverSlot(-1, { driverSlot: 5 })).toBe(5);
      expect(factsDriverSlot(-1, {})).toBeNull();
    });
  });

  describe('conditions', () => {
    it('keeps one row per change of the weather or the flags, the last running to the end', () => {
      const rows = conditionsFrom([wx(0, 0), wx(3, 0), wx(6, 40), wx(9, 40)], [flag(0, 0), flag(3, 0), flag(7, 3)], 20);

      expect(rows.map(r => [r.startSec, r.endSec, r.rain, r.flagState])).toEqual([
        [0, 6, 0, 0],
        [6, 7, 40, 0],
        [7, 20, 40, 3],
      ]);
    });

    it('lets the later of two packets at the same time hold, and merges back into an equal row', () => {
      const rows = conditionsFrom([], [flag(0, 1), flag(0, 0), flag(3, 1), flag(3, 0)], 5);

      expect(rows.map(r => [r.startSec, r.endSec, r.flagState])).toEqual([[0, 5, 0]]);
    });

    it('leaves what was not recorded yet as null', () => {
      const [first, second] = conditionsFrom([wx(4, 10)], [flag(0, 0)], 10);

      expect(first).toMatchObject({ startSec: 0, rain: null, ambientC: null, flagState: 0 });
      expect(second).toMatchObject({ startSec: 4, rain: 10, ambientC: 20, flagState: 0 });
      expect(conditionsFrom([], [], 10)).toEqual([]);
    });
  });

  describe('driver events', () => {
    const trajectory: Pick<ReplayTrajectoryData, 'pitEvents' | 'contacts' | 'penalties'> = {
      pitEvents: [
        { driverSlot: 3, driverName: 'A', timeSec: 10, code: 34, action: 'Pit entry' },
        { driverSlot: 1, timeSec: 10, code: 21, action: 'Garage', isGarage: true, durationSec: 12.5, fuelAddedLiters: 20 },
      ],
      contacts: [{ driverSlot: 2, timeSec: 5, impactMagnitude: 800, otherParty: 4, otherPartyName: 'B' }, { driverSlot: 2, timeSec: 6, impactMagnitude: 50 }],
      penalties: [
        { driverSlot: 1, timeSec: 30, penaltyText: 'Drive through', penaltyType: 'dt', action: 'given' },
        { driverSlot: 1, timeSec: 90, penaltyText: 'Drive through', action: 'served' },
        { driverSlot: 2, timeSec: 95, penaltyText: 'Time', penaltySeconds: 5, action: 'given' },
      ],
    };

    it('stores the fields without a column as detail', () => {
      const facts = driverEventsFrom(trajectory);

      expect(facts.find(f => f.kind === 'pit' && f.seq === 1)).toEqual({
        kind: 'pit', seq: 1, driverSlot: 1, timeSec: 10, code: 21, value: 12.5, otherSlot: null,
        detail: { action: 'Garage', isGarage: true, fuelAddedLiters: 20 },
      });
      expect(facts.filter(f => f.kind.startsWith('penalty')).map(f => f.kind)).toEqual(['penalty_given', 'penalty_served', 'penalty_given']);
    });

  });

  it('keeps the running order only where it changes', () => {
    const rows = runningOrderFrom([
      { timeSec: 0, order: [1, 2, 3] },
      { timeSec: 1, order: [1, 2, 3] },
      { timeSec: 2, order: [2, 1, 3] },
      { timeSec: 2, order: [1, 2, 3] },
      { timeSec: 5, order: [3, 1, 2] },
    ]);

    expect(rows).toEqual([{ timeSec: 0, order: [1, 2, 3] }, { timeSec: 5, order: [3, 1, 2] }]);
  });

  describe('laps', () => {
    it('spans a lap from its first to its last timed sample', () => {
      expect(lapSpanFrom([{}, { timeSec: 1.5 }, { timeSec: 3 }, {}])).toEqual({ startSec: 1.5, endSec: 3 });
      expect(lapSpanFrom([{}, {}])).toBeNull();
    });

    it('gives every listed lap a row, timed when its row is stored, and rebuilds the list', () => {
      const laps = [
        { lapNumber: 1, lapTimeSec: 100, s1Sec: 30, s2Sec: 40, s3Sec: 30, isOutlap: true, isValid: true, startFrame: 0, endFrame: 99 },
        { lapNumber: 2, lapTimeSec: 90, s1Sec: 30, s2Sec: 30, s3Sec: 30, isBest: true, lapDistMeters: 4000 },
      ];
      const facts = lapFactsFrom(laps, new Map([[2, { startSec: 100, endSec: 190 }], [3, { startSec: 190, endSec: 200 }]]));

      expect(facts.map(f => [f.lapNumber, f.startSec, f.lapTimeSec, f.isBest])).toEqual([[1, null, 100, null], [2, 100, 90, true], [3, 190, null, null]]);
      expect(lapSummariesFrom(facts)).toEqual(laps);
    });
  });

});
