import { describe, it, expect } from 'vitest';
import {
  debriefCornerLink,
  DebriefUnavailableError,
  loadSessionDebrief,
} from '../../../../src/components/session-detail/debrief/loadSessionDebrief.js';
import { me, mockDebriefServer, MY_REPLAY, realisticLap, REF_REPLAY, referenceLap, session } from './debriefFixtures.js';

describe('loadSessionDebrief', () => {
  it('ranks the best lap corners against the fastest same-car lap, with how often each is lost', async () => {
    const fetchMock = mockDebriefServer();

    const debrief = await loadSessionDebrief(session, me);

    // The reference comes from the same car on this layout, any driver.
    const compareCall = fetchMock.mock.calls.map(([url]) => String(url)).find(url => url.startsWith('/api/compare/laps'));
    const compareQuery = new URLSearchParams(String(compareCall).split('?')[1]);
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

  it('warns when the analysed lap was run in traffic, and leaves traffic laps out of repeatability', async () => {
    mockDebriefServer();
    const gt3 = { name: 'Rui Paiva', carClass: 'GT3', sameClass: false };
    const inTraffic = {
      ...me,
      laps: me.laps.map(l => {
        if (l.lapNum === 20) return { ...l, traffic: { ahead: null, behind: null, following: false, passed: [gt3], passedBy: [] } };
        if (l.lapNum === 16) return { ...l, nonRepresentativeReason: 'traffic' as const };
        return l;
      }),
    };

    const debrief = await loadSessionDebrief(session, inTraffic);

    expect(debrief.caveats).toContain('Your lap was run in traffic (Passed Rui Paiva (GT3)): a tow or a pass changes the numbers.');
    expect(debrief.lapsTimed).toBe(2);
  });

  it('ranks against the lap about 0.5% faster, and takes the technique from the fastest', async () => {
    const tooClose = { ...realisticLap, id: 'close', driverName: 'Close Rival', lapTime: 95.8 };
    mockDebriefServer([referenceLap, tooClose, realisticLap]);

    const debrief = await loadSessionDebrief(session, me);

    expect(debrief.reference.driverName).toBe('Near Rival');
    expect(debrief.technique?.driverName).toBe('Davide Catani');
    expect(debrief.lapDeltaSec).toBe(0.484);
    expect(debrief.techniqueDeltaSec).toBe(1.92);
    expect(debrief.corners[0]).toMatchObject({ cornerNumber: 1, timeLossSec: 0.24, techniqueLossSec: 0.4 });
    expect(new URLSearchParams(debriefCornerLink(debrief, 1, 'technique').split('?')[1]).get('compareDriver')).toBe('Davide Catani');
    expect(new URLSearchParams(debriefCornerLink(debrief, 1).split('?')[1]).get('compareDriver')).toBe('Near Rival');
  });

  it('leaves out the corner passes run in traffic, times laps flagged for traffic, and ranks a corner of this lap in traffic lower', async () => {
    const spell = (startStationM: number, endStationM: number) => ({
      carName: 'Vinicius Ares', carClass: 'Hyper', kind: 'battle' as const, direction: 'ahead' as const,
      startSec: 0, endSec: 5, startStationM, endStationM, closestGapSec: 0.4,
    });
    mockDebriefServer([referenceLap], {
      available: true,
      laps: [
        { lapNumber: 16, spells: [spell(60, 90)] }, // through the corner (30-110 m)
        { lapNumber: 18, spells: [spell(120, 140)] }, // after it: the lap's corner still counts
        { lapNumber: 20, spells: [spell(100, 20)] }, // across the line and into the corner
      ],
    });
    const flagged = { ...me, laps: me.laps.map(l => (l.lapNum === 18 ? { ...l, nonRepresentativeReason: 'traffic' as const } : l)) };

    const debrief = await loadSessionDebrief(session, flagged);

    expect(debrief.trafficKnown).toBe(true);
    expect(debrief.lapsTimed).toBe(3);
    // Lap 20 (analysed) and 16 ran the corner in traffic: only lap 18 is left, too few to sample.
    expect(debrief.corners[0]).toMatchObject({ lapsInTraffic: 2, lapsSampled: null, confidence: 0.4 });
    expect(debrief.corners[0].traffic?.carName).toBe('Vinicius Ares');
    expect(debrief.caveats.some(c => c.includes('run in traffic'))).toBe(false);
  });

  it('still ranks the corners when the other laps cannot be loaded', async () => {
    mockDebriefServer([{ ...referenceLap }]);
    const onlyBestLap = { ...me, laps: me.laps.filter(l => l.lapNum === 20 || l.lapNum === 1).concat([{ ...me.laps[1], lapNum: 99 }]) };

    const debrief = await loadSessionDebrief(session, onlyBestLap);

    expect(debrief.lapsTimed).toBe(1);
    expect(debrief.corners[0]).toMatchObject({ cornerNumber: 1, lapsLosing: null, repeatability: 1 });
  });
});
