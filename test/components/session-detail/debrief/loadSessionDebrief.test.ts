import { describe, it, expect } from 'vitest';
import {
  debriefCornerLink,
  DebriefUnavailableError,
  loadSessionDebrief,
} from '../../../../src/components/session-detail/debrief/loadSessionDebrief.js';
import { me, mockDebriefServer, MY_REPLAY, REF_REPLAY, referenceLap, session } from './debriefFixtures.js';

describe('loadSessionDebrief', () => {
  it('ranks the best lap corners against the fastest same-car lap, with how often each is lost', async () => {
    const fetchMock = mockDebriefServer();

    const debrief = await loadSessionDebrief(session, me);

    // The reference comes from the same car on this layout, any driver.
    const compareQuery = new URLSearchParams(String(fetchMock.mock.calls[0][0]).split('?')[1]);
    expect(compareQuery.get('carModel')).toBe('Peugeot 9x8');
    expect(compareQuery.get('carClass')).toBe('Hyper');
    expect(compareQuery.get('playerOnly')).toBe('false');
    expect(debrief.reference.driverName).toBe('Davide Catani');
    expect(debrief.lapNumber).toBe(20);
    expect(debrief.lapDeltaSec).toBe(1.92);

    // Lap 20 is 0.4 s down in the corner; lap 16 is also slower than the reference there, lap 18 is not.
    // Lap 1 is the start lap and is not timed.
    expect(debrief.lapsTimed).toBe(3);
    expect(debrief.corners).toHaveLength(1);
    expect(debrief.corners[0]).toMatchObject({ cornerNumber: 1, timeLossSec: 0.4, lapsLosing: 2, lapsSampled: 3 });
    // Neither lap came from DuckDB, so the comparison is trusted at 80%.
    expect(debrief.confidence).toBe(0.8);
  });

  it('links a corner to the telemetry view with the reference as the comparison lap', async () => {
    mockDebriefServer();
    const debrief = await loadSessionDebrief(session, me);

    const params = new URLSearchParams(debriefCornerLink(debrief, 1).split('?')[1]);

    expect(Object.fromEntries(params)).toMatchObject({
      replayName: MY_REPLAY,
      lap: '20',
      driverName: 'Samuel Lague',
      baselineReplay: REF_REPLAY,
      compareDriver: 'Davide Catani',
      compareLapNum: '3',
      compareSessionId: 'Q1',
      corner: '1',
    });
  });

  it('says why there is no debrief without another lap in the same car', async () => {
    mockDebriefServer([]);

    await expect(loadSessionDebrief(session, me)).rejects.toThrow(DebriefUnavailableError);
    await expect(loadSessionDebrief(session, me)).rejects.toThrow('No other Peugeot 9x8 lap with replay data on this layout');
  });

  it('says why there is no debrief without a replay', async () => {
    const noReplay = { ...session, matchingReplayFile: undefined };

    await expect(loadSessionDebrief(noReplay, me)).rejects.toThrow('This session has no replay to analyse.');
  });

  it('still ranks the corners when the other laps cannot be loaded', async () => {
    mockDebriefServer([{ ...referenceLap }]);
    const onlyBestLap = { ...me, laps: me.laps.filter(l => l.lapNum === 20 || l.lapNum === 1).concat([{ ...me.laps[1], lapNum: 99 }]) };

    const debrief = await loadSessionDebrief(session, onlyBestLap);

    expect(debrief.lapsTimed).toBe(1);
    expect(debrief.corners[0]).toMatchObject({ cornerNumber: 1, lapsLosing: null, repeatability: 1 });
  });
});
