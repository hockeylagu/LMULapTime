import { describe, expect, it } from 'vitest';
import type { ReplayFlagEvent, ReplayTrajectoryData, ReplayWeatherEvent } from '../../../server/core/types.js';
import { upgradeStoredTrajectory } from '../../../server/core/replay/replayTrajectoryCodec.js';
import {
  conditionsFrom,
  driverEventArraysFrom,
  driverEventsFrom,
  lapFactsFrom,
  lapSpanFrom,
  lapSummariesFrom,
  replayWideFactsFrom,
  runningOrderFrom,
} from '../../../server/replay/replayFacts.js';

const wx = (timeSec: number, rainIntensity: number, ambientTemp = 20): ReplayWeatherEvent => ({ timeSec, rainIntensity, ambientTemp });
const flag = (timeSec: number, flagState: number, sectorMask = 33): ReplayFlagEvent => ({ timeSec, flagState, flagName: 'x', sectorMask, driverSlot: 255, driverFlag: 0 });

describe('replay facts', () => {
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

    it('rebuilds the decoded arrays exactly, in their order', () => {
      expect(driverEventArraysFrom(driverEventsFrom(trajectory))).toEqual(trajectory);
      expect(driverEventArraysFrom([])).toEqual({ pitEvents: [], contacts: [], penalties: [] });
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

  it('reads replay-wide facts from a legacy row after its values are corrected', () => {
    const legacy = {
      replayName: 'r', pointsCount: 1, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      points: [{ x: 0, y: 0, z: 0, timeSec: 50 }],
      weatherEvents: [{ timeSec: 0, rainIntensity: 0, ambientTemp: 25 }],
      standingsHistory: [{ timeSec: 10, order: [0] }],
      sessionRunningOrder: [0],
    } as ReplayTrajectoryData;
    const facts = replayWideFactsFrom(upgradeStoredTrajectory(legacy, 'v3'));

    expect(facts.endSec).toBe(50);
    // v3 ambient used the old scale: 25 °C is raw 146, which the current scale reads as 24.1 °C.
    expect(facts.conditions).toEqual([{ startSec: 0, endSec: 50, rain: 0, ambientC: 24.1, flagState: null, sectorMask: null, driverFlag: null }]);
    expect(facts.runningOrder).toEqual([{ timeSec: 10, order: [0] }]);
    expect(facts.sessionRunningOrder).toEqual([0]);
    expect(facts.driverEvents).toEqual([]);
  });
});
