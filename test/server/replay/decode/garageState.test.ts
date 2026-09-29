import { describe, it, expect } from 'vitest';
import { applyGarageState, garageSpells } from '../../../../server/replay/decode/garageState.js';
import { withGarageState } from '../../../../server/core/replay/replayTrajectoryCodec.js';
import type { ReplayPitEvent, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../../server/core/types.js';

const event = (timeSec: number, code: number): ReplayPitEvent => ({ driverSlot: 0, timeSec, code, action: String(code) });

/** One sample per second from `start`, at the speed given for each second. */
function lap(start: number, speeds: number[], inGarage = false): ReplayTrajectoryPoint[] {
  return speeds.map((speedKmh, i) => ({ x: i, y: 0, z: 0, timeSec: start + i, speedKmh, inPit: false, inGarage }));
}

const flags = (points: ReplayTrajectoryPoint[]) => points.map(p => (p.inGarage ? 'G' : p.inPit ? 'P' : '-')).join('');

describe('garageSpells', () => {
  it('starts in the garage only when the first pit event is the pit exit (16)', () => {
    expect(garageSpells([event(383, 33), event(45, 16), event(516, 21)])).toEqual([
      { start: 0, end: 45 }, { start: 516, end: Infinity },
    ]);
    // A race car: 17 then 16 in the pits, not a garage start.
    expect(garageSpells([event(639, 17), event(641, 16)])).toEqual([]);
  });

  it('ignores type 49 events and runs a garage return to the next pit exit', () => {
    expect(garageSpells([event(351, 18), event(351.4, 49), event(106, 21), event(133, 16)])).toEqual([
      { start: 106, end: 133 },
    ]);
  });
});

describe('applyGarageState', () => {
  it('flags the car parked in the garage, then the drive down the pit lane as in the pits (qualifying)', () => {
    const points = lap(20, [0, 0, 0, 0, 12, 34, 60, 60, 91, 106]);
    applyGarageState(points, [event(27.5, 16)]);
    expect(flags(points)).toBe('GGGGPPPP--');
  });

  it('picks up a lap starting halfway down the pit lane as leaving the garage', () => {
    const points = lap(120, [60, 60, 62, 96]);
    applyGarageState(points, [event(106, 21), event(122.5, 16)]);
    expect(flags(points)).toBe('PPP-');
  });

  it('ends the spell at racing speed when no pit exit follows (a race car leaving its box)', () => {
    const points = lap(478, [0, 29, 60, 60, 162, 200, 60]);
    applyGarageState(points, [event(351, 18), event(478, 21), event(505, 32)]);
    expect(flags(points)).toBe('GPPP---');
  });

  it('clears garage flags a type 49 event left on a race lap', () => {
    const points = lap(500, [180, 200, 210], true);
    applyGarageState(points, [event(400, 18), event(400.1, 49)]);
    expect(flags(points)).toBe('---');
  });

  it('without garage events, takes a car stopped with the pit-lane bit set for the garage', () => {
    const points = lap(0, [0, 30]);
    points.forEach(p => { p.inPit = true; });
    applyGarageState(points, []);
    expect(flags(points)).toBe('GP');
  });
});

describe('withGarageState', () => {
  it('recomputes the flags of a stored lap from its own driver\'s pit events', () => {
    const trajectory: ReplayTrajectoryData = {
      replayName: 'Q1.Vcr', driverSlot: 2, pointsCount: 3, points: lap(0, [0, 20, 150], true),
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 },
      pitEvents: [{ ...event(1.5, 16), driverSlot: 2 }, { ...event(0.5, 21), driverSlot: 5 }],
    };
    expect(flags(withGarageState(trajectory).points)).toBe('GP-');
  });
});
