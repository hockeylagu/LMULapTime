import { describe, it, expect } from 'vitest';
import type { RaceReplayLap, RaceReplayOverview } from '../../../../shared/types/index.js';
import { raceLapCount, raceLapTimingAt } from '../../../../src/components/replay/race/raceLaps.js';

/** Two 100 s laps from 50 s, sectors 30 / 40 / 30. */
const laps: RaceReplayLap[] = [1, 2].map(lapNumber => ({
  slot: 1, lapNumber, startSec: 50 + (lapNumber - 1) * 100, endSec: 50 + lapNumber * 100, lapTimeSec: 100,
  s1Sec: 30, s2Sec: 40, s3Sec: 30, isValid: true,
}));

describe('raceLapTimingAt', () => {
  it('runs the lap and the sector the car is in, keeping the sectors it finished', () => {
    expect(raceLapTimingAt(laps, 60)).toEqual({ sector: 1, summary: { lapNumber: 1, lapTimeSec: 10, s1Sec: 10, s2Sec: NaN, s3Sec: NaN } });
    expect(raceLapTimingAt(laps, 100)).toEqual({ sector: 2, summary: { lapNumber: 1, lapTimeSec: 50, s1Sec: 30, s2Sec: 20, s3Sec: NaN } });
    expect(raceLapTimingAt(laps, 245)).toEqual({ sector: 3, summary: { lapNumber: 2, lapTimeSec: 95, s1Sec: 30, s2Sec: 40, s3Sec: 25 } });
  });

  it('shows the last lap in full between laps, nothing before the first, and no sectors the replay lacks', () => {
    expect(raceLapTimingAt(laps, 40)).toBeNull();
    expect(raceLapTimingAt(laps, 300)).toEqual({ sector: null, summary: { lapNumber: 2, lapTimeSec: 100, s1Sec: 30, s2Sec: 40, s3Sec: 30 } });
    const bare = laps.map(lap => ({ ...lap, s1Sec: null, s2Sec: null, s3Sec: null }));
    expect(raceLapTimingAt(bare, 60)).toEqual({ sector: null, summary: { lapNumber: 1, lapTimeSec: 10, s1Sec: NaN, s2Sec: NaN, s3Sec: NaN } });
  });
});

describe('raceLapCount', () => {
  it("counts the results' laps, else the replay's", () => {
    const overview: RaceReplayOverview = { replayName: 'R.Vcr', daylight: { sessionStartMinute: null, cloudCover: null, cloudField: null, cloudVariants: null }, startSec: 0, endSec: 300, windowSec: 60, runningOrder: [], events: [],
      cars: [{ slot: 1, name: 'Ann', sessionLapOrdinals: { '1': 0 } }, { slot: 2, name: 'Bea' }],
      laps: [...laps, { ...laps[1], slot: 2, lapNumber: 3 }] };
    expect(raceLapCount(overview)).toBe(1);
    expect(raceLapCount({ ...overview, cars: [{ slot: 1, name: 'Ann' }] })).toBe(3);
  });
});
