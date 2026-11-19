import { describe, it, expect } from 'vitest';
import {
  debriefCornerLink,
  DebriefUnavailableError,
  loadSessionDebrief,
} from '../../../../src/components/session-detail/debrief/loadSessionDebrief.js';
import type { DriverData } from '../../../../shared/types/index.js';
import { me, mockDebriefServer, realisticLap, referenceLap, session } from './debriefFixtures.js';

describe('loadSessionDebrief', () => {
  it('ranks the best lap turns against the fastest same-car lap, with how often each is lost', async () => {
    const fetchMock = mockDebriefServer();

    const debrief = await loadSessionDebrief(session, me);

    // The reference comes from the same car on this layout, any driver.
    const compareCall = fetchMock.mock.calls.map(([url]) => String(url)).find(url => url.startsWith('/api/compare/laps'));
    const compareQuery = new URLSearchParams(String(compareCall).split('?')[1]);
    expect(compareQuery.get('carType')).toBe('Peugeot 9x8');
    expect(compareQuery.get('carClass')).toBe('Hyper');
    expect(compareQuery.get('playerOnly')).toBe('false');
    expect(debrief.reference.driverName).toBe('Davide Catani');
    expect(debrief.lapNumber).toBe(20);
    expect(debrief.lapDeltaSec).toBe(1.92);

    // Lap 20 is 0.4 s down through T1; lap 16 is also slower than the reference there, lap 18 is not.
    // Lap 1 is the start lap and is not timed. T1 holds the analysed lap's detected corner 1.
    expect(debrief.lapsTimed).toBe(3);
    expect(debrief.corners).toHaveLength(1);
    // Through the class's sequence T1–T2 (the Hyper map's, not the GT3 map's sequence of the same id).
    expect(debrief.segments).toBe('sequences');
    expect(debrief.corners[0]).toMatchObject({ label: 'T1–T2', cornerNumber: 2, timeLossSec: 0.4, lapsLosing: 2, lapsSampled: 3, confidence: 1 });
    // The driver's passes come from one request for the whole session.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/session/R1/corner-passes'))).toHaveLength(1);
  });

  it('links a corner to the telemetry view with the reference as the comparison lap', async () => {
    mockDebriefServer();
    const debrief = await loadSessionDebrief(session, me);

    const params = new URLSearchParams(debriefCornerLink(debrief, 1).split('?')[1]);

    expect(Object.fromEntries(params)).toMatchObject({
      sessionId: 'R1',
      driverOrdinal: '0',
      lapOrdinal: '3',
      baselineSessionId: 'Q1',
      baselineDriverOrdinal: '0',
      baselineLapOrdinal: '0',
      compareDriver: 'Davide Catani',
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

  it('times the laps the parser left out for traffic', async () => {
    mockDebriefServer([referenceLap], { lapFlags: { 16: { nonRepresentativeReason: 'traffic' } } });

    const debrief = await loadSessionDebrief(session, me);

    expect(debrief.lapsTimed).toBe(3);
  });

  it('times only the laps in the analysed lap\'s conditions', async () => {
    mockDebriefServer([referenceLap], { lapFlags: { 16: { wet: true } } });

    const debrief = await loadSessionDebrief(session, me);

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
    expect(debrief.corners[0]).toMatchObject({ cornerNumber: 2, timeLossSec: 0.24, techniqueLossSec: 0.4 });
    expect(new URLSearchParams(debriefCornerLink(debrief, 1, 'technique').split('?')[1]).get('compareDriver')).toBe('Davide Catani');
    expect(new URLSearchParams(debriefCornerLink(debrief, 1).split('?')[1]).get('compareDriver')).toBe('Near Rival');
  });

  it('falls back to the faster cars of the class in this session when no same-car lap is faster, naming the car', async () => {
    const timed = (lapNumber: number, lapTime: number) => ({ ...me.laps[1], lapNumber, lapTime });
    const rival = { ...me, name: 'Enzo Syl', carType: 'Porsche 963', laps: [timed(1, 110), timed(2, 95.41), timed(3, 93.974)] } as DriverData;
    const gt3 = { ...rival, name: 'Fast GT3', carType: 'Porsche 911 GT3 R', carClass: 'GT3', laps: [timed(1, 110), timed(2, 90), timed(3, 90)] } as DriverData;
    mockDebriefServer([]);

    const debrief = await loadSessionDebrief({ ...session, drivers: [me, rival, gt3] }, me);

    expect(debrief.pool).toBe('class');
    expect(debrief.reference).toMatchObject({ driverName: 'Enzo Syl', carType: 'Porsche 963', sessionId: 'R1', driverOrdinal: 1, lapOrdinal: 1 });
    expect(debrief.technique).toMatchObject({ driverName: 'Enzo Syl', lapOrdinal: 2 });
    expect(debrief.caveats[0]).toBe('No Peugeot 9x8 lap on this layout is clearly faster, so the references are faster Hyper cars from this session: part of each gap can be the car.');
  });

  it('leaves out the passes run with a car close in front, and ranks a turn of this lap in traffic lower', async () => {
    mockDebriefServer([referenceLap], { trafficLaps: [16, 20] });

    const debrief = await loadSessionDebrief(session, me);

    // Lap 20 (analysed) and 16 ran T1 behind Vinicius Ares: only lap 18 is left, too few to sample.
    expect(debrief.corners[0]).toMatchObject({ lapsInTraffic: 2, lapsSampled: null, confidence: 0.5 });
    expect(debrief.corners[0].traffic).toMatchObject({ driverName: 'Vinicius Ares', kind: 'battle', closestGapSec: 0.4 });
  });

  it('ranks the official turns when the class has no corner map on this track', async () => {
    const fetchMock = mockDebriefServer([referenceLap], { sequencePasses: { available: false, reason: 'No class of this replay has a corner map on this track yet.' } });

    const debrief = await loadSessionDebrief(session, me);

    expect(debrief.segments).toBe('turns');
    expect(debrief.corners[0]).toMatchObject({ label: 'T1', timeLossSec: 0.4 });
    // The reference lap is read through the official turns too.
    expect(fetchMock.mock.calls.map(([url]) => String(url)).filter(url => url.startsWith('/api/session/Q1/corner-passes'))).toEqual(['/api/session/Q1/corner-passes?driverOrdinal=0']);
  });

  it('leaves out a reference corner its session groups from other turns', async () => {
    mockDebriefServer([referenceLap], { referenceTurnIds: [1] });

    await expect(loadSessionDebrief(session, me)).rejects.toThrow('The replay has no passes for the reference lap.');
  });

  it('says why when the session passes are not built', async () => {
    mockDebriefServer([referenceLap], { passes: { available: false, reason: 'Corner times are still being built.' } });

    await expect(loadSessionDebrief(session, me)).rejects.toThrow('Corner times are still being built.');
  });

  it('ranks from the analysed lap alone when no other lap has passes', async () => {
    mockDebriefServer([{ ...referenceLap }], { lapFlags: { 16: { isValid: false }, 18: { isPitStop: true } } });

    const debrief = await loadSessionDebrief(session, me);

    expect(debrief.lapsTimed).toBe(1);
    expect(debrief.corners[0]).toMatchObject({ cornerNumber: 2, lapsLosing: null, repeatability: 1 });
  });
});
