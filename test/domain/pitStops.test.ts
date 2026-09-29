import { describe, expect, it } from 'vitest';
import { classMedianService, lineInPitLane, pitStopsFromEvents, stopEnergy, summarisePitService } from '../../shared/domain/pitStops.js';

// The 08/27 Daytona stop: entry 1753.1, on jacks 1768.5, service complete 1841.7, exit 1876.2.
const events = [
  { timeSec: 1644.6, code: 33 }, { timeSec: 1753.1, code: 49 }, { timeSec: 1753.1, code: 34 },
  { timeSec: 1768.5, code: 36 }, { timeSec: 1841.7, code: 37 }, { timeSec: 1876.2, code: 32 },
];

describe('pitStopsFromEvents', () => {
  it('reads a stop from pit entry to pit exit, with the jacks and the service between', () => {
    expect(pitStopsFromEvents(events)).toEqual([{ entrySec: 1753.1, exitSec: 1876.2, jacksSec: 1768.5, completeSec: 1841.7 }]);
  });

  it('keeps a drive-through without service and falls back on the stall when the jacks are missing', () => {
    expect(pitStopsFromEvents([{ timeSec: 10, code: 34 }, { timeSec: 40, code: 32 }]))
      .toEqual([{ entrySec: 10, exitSec: 40, jacksSec: null, completeSec: null }]);
    expect(pitStopsFromEvents([{ timeSec: 10, code: 34 }, { timeSec: 20, code: 18 }, { timeSec: 50, code: 37 }, { timeSec: 70, code: 32 }]))
      .toEqual([{ entrySec: 10, exitSec: 70, jacksSec: 20, completeSec: 50 }]);
  });
});

describe('stopEnergy', () => {
  const [stop] = pitStopsFromEvents(events);

  it('takes the energy on the way in and the time the refill took from the jacks', () => {
    const points = [
      { timeSec: 1750, virtualEnergy: 32.2 }, { timeSec: 1770, virtualEnergy: 40 },
      { timeSec: 1795.8, virtualEnergy: 100 }, { timeSec: 1830, virtualEnergy: 100 },
    ];
    expect(stopEnergy(points, stop)).toEqual({ from: 32.2, to: 100, refillSec: 1795.8 - 1768.5 });
  });

  it('says no refill when the energy did not rise, and nothing without energy', () => {
    expect(stopEnergy([{ timeSec: 1750, virtualEnergy: 50 }, { timeSec: 1800, virtualEnergy: 50 }], stop)).toEqual({ from: 50, to: 50 });
    expect(stopEnergy([{ timeSec: 1750 }], stop)).toBeUndefined();
  });
});

describe('summarisePitService', () => {
  const [stop] = pitStopsFromEvents(events);

  it('calls a stop far past the refill and the class usual unexplained (a guess at repairs)', () => {
    expect(summarisePitService(stop, {
      classMedianServiceSec: 29.3, energy: { from: 32.2, to: 100, refillSec: 27.3 }, penaltyServed: false,
    })).toEqual({ pitLaneSec: 123.1, serviceSec: 73.2, classMedianServiceSec: 29.3, energyFrom: 32, energyTo: 100, refillSec: 27.3, unexplainedSec: 44 });
  });

  it('explains nothing when a penalty was served, the stop was close to usual, or there is no reference', () => {
    expect(summarisePitService(stop, { classMedianServiceSec: 29.3, penaltyServed: true }).unexplainedSec).toBeUndefined();
    expect(summarisePitService(stop, { classMedianServiceSec: 60, penaltyServed: false }).unexplainedSec).toBeUndefined();
    expect(summarisePitService(stop, { classMedianServiceSec: null, penaltyServed: false }).unexplainedSec).toBeUndefined();
  });

  it('finds the timing line in the pit lane and which side of it the box was', () => {
    // Lap 15 started at 1766.5, in the pit lane and 2 s before the jacks.
    const lineSec = lineInPitLane(stop, [1534.6, 1644.2, 1766.5, 1977.5]);
    expect(lineSec).toBe(1766.5);
    expect(summarisePitService(stop, { classMedianServiceSec: null, penaltyServed: false, lineSec }))
      .toMatchObject({ laneBeforeLineSec: 13.4, serviceAfterLine: true });
    expect(summarisePitService(stop, { classMedianServiceSec: null, penaltyServed: false, lineSec: 1800 }).serviceAfterLine).toBeUndefined();
    expect(lineInPitLane(stop, [1644.2, 1977.5])).toBeUndefined();
  });

  it('needs three other stops for a class usual', () => {
    expect(classMedianService([30, 20])).toBeNull();
    expect(classMedianService([30, 20, 40])).toBe(30);
  });
});
