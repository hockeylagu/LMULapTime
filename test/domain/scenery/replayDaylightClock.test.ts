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
});
