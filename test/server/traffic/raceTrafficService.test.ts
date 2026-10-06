import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionDatabase } from '../../../server/core/db.js';
import { RaceTrafficRequest, RaceTrafficService } from '../../../server/traffic/raceTrafficService.js';
import { buildRacePositions, StoredLapBlob } from '../../../server/traffic/lapSamples.js';
import type { DetailedSession, ReplayTrajectoryData, ReplayTrajectoryPoint } from '../../../server/core/types.js';
import { circleCenterline, pointAt } from './circleTrack.js';

const REPLAY = 'Daytona International Speedway Road Course R1 1.Vcr';

/** A 20 s lap at 50 m/s, 5 Hz, starting `aheadM` metres up the road. */
function lap(lapNumber: number, aheadM: number): ReplayTrajectoryData {
  const startSec = (lapNumber - 1) * 20;
  const points: ReplayTrajectoryPoint[] = [];
  for (let i = 0; i <= 100; i++) {
    const time = startSec + i / 5;
    points.push({ ...pointAt((lapNumber - 1) * 1000 + aheadM + 50 * (time - startSec)), y: 0, timeSec: time });
  }
  return { replayName: REPLAY, pointsCount: points.length, rawSampleRateHz: 5, currentLap: lapNumber, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 }, points };
}

const session = {
  trackVenue: 'Daytona International Speedway',
  trackCourse: 'Daytona International Speedway Road Course',
  drivers: [{ name: 'Me', carClass: 'Hyper' }, { name: 'Rival', carClass: 'Hyper' }],
} as unknown as DetailedSession;

const request: RaceTrafficRequest = {
  replayName: REPLAY,
  driverSlot: 0,
  // The replay lists the rival as LMGT3: the session's class wins.
  replayDrivers: [{ slot: 0, name: 'Me', carClass: 'LMH' }, { slot: 1, name: 'Rival', carClass: 'LMGT3' }],
  session,
};

describe('RaceTrafficService', () => {
  let db: SessionDatabase;
  let build: ReturnType<typeof vi.fn<(laps: StoredLapBlob[], centerline: Array<[number, number]>) => Promise<ReturnType<typeof buildRacePositions>>>>;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    for (const lapNumber of [1, 2]) {
      db.upsertReplayTrajectoryCache(REPLAY, 0, lapNumber, 1, 1, lap(lapNumber, 0));
      db.upsertReplayTrajectoryCache(REPLAY, 1, lapNumber, 1, 1, lap(lapNumber, 30));
    }
    build = vi.fn((laps: StoredLapBlob[], centerline: Array<[number, number]>) => Promise.resolve(buildRacePositions(laps, centerline)));
  });

  afterEach(() => db.close());

  const service = () => new RaceTrafficService(db, build, () => circleCenterline());

  it('builds the positions index once, then reads it back', async () => {
    const traffic = service();

    const [first, concurrent] = await Promise.all([traffic.getDriverTraffic(request), traffic.getDriverTraffic(request)]);
    const later = await service().getDriverTraffic(request);

    expect(build).toHaveBeenCalledTimes(1);
    expect(concurrent).toEqual(first);
    expect(later).toEqual(first);
    expect(first.available).toBe(true);
    expect(first.laps.map(l => l.lapNumber)).toEqual([1, 2]);
    expect(first.laps[0].spells).toMatchObject([{ carName: 'Rival', carClass: 'Hyper', kind: 'battle', direction: 'ahead' }]);
  });

  it('rebuilds the index when the replay laps it came from change', async () => {
    await service().getDriverTraffic(request);
    db.upsertReplayTrajectoryCache(REPLAY, 1, 3, 1, 1, lap(3, 30));

    await service().getDriverTraffic(request);

    expect(build).toHaveBeenCalledTimes(2);
  });

  it('rebuilds archived replay traffic only when its projection frame changes', async () => {
    let geometry = { centerline: circleCenterline(), projectionRevision: 'projection-one', geometryRevision: 'geometry-one' };
    const traffic = new RaceTrafficService(db, build, () => geometry);
    expect(await traffic.getDriverTraffic(request)).toMatchObject({ available: true, projectionRevision: 'projection-one' });
    geometry = { ...geometry, geometryRevision: 'geometry-two' };
    await traffic.getDriverTraffic(request);
    expect(build).toHaveBeenCalledTimes(1);
    geometry = { ...geometry, projectionRevision: 'projection-two' };
    expect(await traffic.getDriverTraffic(request)).toMatchObject({ available: true, projectionRevision: 'projection-two' });
    expect(build).toHaveBeenCalledTimes(2);
    expect(db.listReplayLapRows(REPLAY)).toHaveLength(4);
  });

  it('invalidates legacy centerline-only caches when route coordinates change', async () => {
    let centerline = circleCenterline();
    const traffic = new RaceTrafficService(db, build, () => centerline);
    await traffic.getDriverTraffic(request);
    centerline = centerline.map(([x, z]) => [x + 1, z]);
    await traffic.getDriverTraffic(request);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('preserves the previous index and reports unavailable when retained samples cannot rebuild it', async () => {
    let projectionRevision = 'projection-one';
    const saved = vi.spyOn(db, 'saveRacePositions');
    const traffic = new RaceTrafficService(db, build, () => ({ centerline: circleCenterline(), projectionRevision }));
    await traffic.getDriverTraffic(request);
    const previousSignature = saved.mock.calls[0][1];
    const old = db.getRacePositions(REPLAY, previousSignature);
    projectionRevision = 'projection-two';
    vi.spyOn(db, 'listReplayLapRows').mockReturnValue([]);
    expect(await traffic.getDriverTraffic(request)).toMatchObject({ available: false, reason: expect.stringContaining('retained replay samples') });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(db.getRacePositions(REPLAY, previousSignature)).toEqual(old);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('meets no one in practice or qualifying (private in LMU)', async () => {
    for (const sessionType of ['Practice', 'Qualifying']) {
      const nonRace = { ...session, sessionType } as DetailedSession;
      expect(await service().getDriverTraffic({ ...request, session: nonRace })).toEqual({ available: true, laps: [] });
    }
    expect(build).not.toHaveBeenCalled();
  });

  it('says why there is no traffic to show', async () => {
    const noCentreline = new RaceTrafficService(db, build, () => null);
    expect(await noCentreline.getDriverTraffic(request)).toMatchObject({ available: false, reason: expect.stringContaining('centreline') });
    expect(await service().getDriverTraffic({ ...request, replayName: 'Daytona International Speedway Road Course R1 2.Vcr' }))
      .toMatchObject({ available: false, reason: 'The replay has no stored laps yet.' });
    expect(await service().getDriverTraffic({ ...request, driverSlot: 9 }))
      .toMatchObject({ available: false, reason: 'The driver has no stored laps in this replay.' });
    expect(await service().getDriverTraffic({ ...request, session: undefined, replayName: 'Unknown_Track_P1.Vcr' }))
      .toMatchObject({ available: false });
  });

  it('lets a later request retry after a failed build', async () => {
    build.mockRejectedValueOnce(new Error('worker crashed'));
    const traffic = service();

    await expect(traffic.getDriverTraffic(request)).rejects.toThrow('worker crashed');
    expect((await traffic.getDriverTraffic(request)).available).toBe(true);
  });
});
