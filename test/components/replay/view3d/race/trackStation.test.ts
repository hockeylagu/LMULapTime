import { describe, expect, it } from 'vitest';
import { raceDaylightClock, trackStation } from '../../../../../src/components/replay/view3d/race/useRaceScene.js';
import type { RaceReplayOverview, RaceReplayProgress } from '../../../../../shared/types/index.js';

const progress: RaceReplayProgress = {
  fromSec: 10, hz: 1, trackLengthM: 1000,
  cars: [{ slot: 4, distances: [900, 980, 1060, null, 2100] }],
};

describe('trackStation', () => {
  it('reads the station between grid samples, wrapped at the line', () => {
    expect(trackStation(progress, 4, 10.5)).toBeCloseTo(940);
    expect(trackStation(progress, 4, 11.5)).toBeCloseTo(20);
  });

  it('holds the last sample before a gap and is undefined off the track, for other cars or without progress', () => {
    expect(trackStation(progress, 4, 12.5)).toBeCloseTo(60);
    expect(trackStation(progress, 4, 13.2)).toBeUndefined();
    expect(trackStation(progress, 7, 10)).toBeUndefined();
    expect(trackStation(null, 4, 10)).toBeUndefined();
    expect(trackStation(progress, 4, 2)).toBeUndefined();
  });
});

describe('raceDaylightClock', () => {
  it('is the in-game clock at the replay time, with the weather sample nearest it', () => {
    const overview = {sessionType: 'Race', daylight: {raceStartMinute: 900, cloudCover: [[0, 0.1], [3000, 0.6]], cloudField: null, cloudVariants: null}} as unknown as RaceReplayOverview;
    expect(raceDaylightClock(overview, 3600)).toEqual({session: 'race', startMinute: 900, sessionTimeSec: 3600, cloudCover: 0.6});
    expect(raceDaylightClock(overview, 600).cloudCover).toBe(0.1);
  });
});
