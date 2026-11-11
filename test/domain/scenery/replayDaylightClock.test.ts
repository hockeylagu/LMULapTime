import { describe, expect, it } from 'vitest';
import { replayDaylightClock } from '../../../shared/domain/scenery/replayDaylightClock.js';

describe('replayDaylightClock', () => {
  it('starts the race and online practice at the race start, qualifying 15 minutes before', () => {
    expect(replayDaylightClock('Race', 1260, 30)).toEqual({session: 'race', startMinute: 1260, sessionTimeSec: 30});
    expect(replayDaylightClock('Qualifying', 1260, 234)).toEqual({session: 'qualify', startMinute: 1245, sessionTimeSec: 234});
    expect(replayDaylightClock('Practice', 780, 0)).toEqual({session: 'practice1', startMinute: 780, sessionTimeSec: 0});
  });

  it("leaves the start to the track's session default offline, before the race start was read, or for other sessions", () => {
    expect(replayDaylightClock('Practice', null, 407)).toEqual({session: 'practice1', startMinute: null, sessionTimeSec: 407});
    expect(replayDaylightClock('Qualifying', undefined, 10)).toEqual({session: 'qualify', startMinute: null, sessionTimeSec: 10});
    expect(replayDaylightClock('Unknown', 840, 10)).toEqual({session: 'race', startMinute: null, sessionTimeSec: 10});
  });

  it("takes the replay's cloud cover nearest the lap's session time", () => {
    const cover: Array<[number, number]> = [[0, 0.1], [60, 0.4], [120, 0.8]];
    expect(replayDaylightClock('Race', 840, 80, cover).cloudCover).toBe(0.4);
    expect(replayDaylightClock('Race', 840, 500, cover).cloudCover).toBe(0.8);
    expect(replayDaylightClock('Race', 840, 80, []).cloudCover).toBeUndefined();
  });

  it("takes the nearest cloud cells, interpolates the two drifts to the lap's session time (held outside the samples) and keeps the first sample's drifts", () => {
    const field: Array<[number, number, number, string]> = [[0, 1, 2, 'a'], [100, 2, 4, 'b']], start = {startUpperDrift: 1, startLowerDrift: 2};
    expect(replayDaylightClock('Race', 840, 25, null, field).cloudField).toEqual({cells: 'a', upperDrift: 1.25, lowerDrift: 2.5, ...start});
    expect(replayDaylightClock('Race', 840, 75, null, field).cloudField).toEqual({cells: 'b', upperDrift: 1.75, lowerDrift: 3.5, ...start});
    expect(replayDaylightClock('Race', 840, 500, null, field).cloudField).toEqual({cells: 'b', upperDrift: 2, lowerDrift: 4, ...start});
    expect(replayDaylightClock('Race', 840, -5, null, field).cloudField).toEqual({cells: 'a', upperDrift: 1, lowerDrift: 2, ...start});
    expect(replayDaylightClock('Race', 840, 25, null, [field[0]]).cloudField).toEqual({cells: 'a', upperDrift: 1, lowerDrift: 2, ...start});
    expect(replayDaylightClock('Race', 840, 25, null, []).cloudField).toBeUndefined();
    expect(replayDaylightClock('Race', 840, 25, null, [field[0]], ['01', '03']).cloudField?.variants).toEqual(['01', '03']);
  });
});
