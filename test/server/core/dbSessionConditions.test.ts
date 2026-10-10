import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { SessionDatabase } from '../../../server/core/db.js';
import { replaceReplayWideFacts } from '../../../server/core/replay/dbReplayLapStore.js';
import { replayRainOverLap } from '../../../server/core/dbSessionConditions.js';
import type { DetailedSession, DriverData, LapData, ReplayTrajectoryData } from '../../../server/core/types.js';

const replayName = 'Sebring International Raceway R1 17.Vcr';
const replayLink = { name: replayName, path: `C:\\replays\\${replayName}`, sizeBytes: 1 };

/** Six 120 s laps on Mediums from et 0; the replay rains from 400 s. */
function lap(lapNum: number): LapData {
  return {
    lapNum, position: 1, lapTime: lapNum >= 5 ? 130 : 120, lapTimeString: '', s1: null, s2: null, s3: null, topSpeed: null,
    fCompound: 'Medium', rCompound: 'Medium', elapsedSeconds: (lapNum - 1) * 120, isPitStop: false, isValid: true,
  } as LapData;
}

const driver = { name: 'Samuel Lague', isPlayer: true, laps: [1, 2, 3, 4, 5, 6].map(lap) } as unknown as DriverData;
const session = {
  id: '2026_08_24_22_22_58-17R1', filename: '2026_08_24_22_22_58-17R1.xml', timestamp: 0,
  trackVenue: 'Sebring International Raceway', trackCourse: 'Sebring', sessionType: 'Race', sessionName: 'R1',
  driversCount: 1, drivers: [driver], playerDriver: driver,
} as unknown as DetailedSession;

const rawDb = (db: SessionDatabase) => (db as unknown as { db: DatabaseType }).db;
const rainByLap = (s: DetailedSession | null | undefined) => s?.drivers[0].laps.map((l) => l.conditions?.rain ?? null);

describe('replay rain on the laps of a linked session', () => {
  let db: SessionDatabase;

  beforeEach(() => {
    db = new SessionDatabase(':memory:');
    db.upsertSession(JSON.parse(JSON.stringify(session)) as DetailedSession, 'C:\\results\\17R1.xml', 1, 1);
    replaceReplayWideFacts(rawDb(db), replayName, {
      endSec: 800, sessionRunningOrder: null, driverEvents: [], runningOrder: [],
      conditions: [
        { startSec: 0, endSec: 400, rain: 5, ambientC: 25, flagState: null, sectorMask: null, driverFlag: null },
        { startSec: 400, endSec: 800, rain: 18, ambientC: 24, flagState: null, sectorMask: null, driverFlag: null },
      ],
    }, 'v7');
  });

  afterEach(() => {
    db.close();
  });

  it('reads the peak rain over a stretch of session time, and nothing for a replay without conditions', () => {
    const rain = replayRainOverLap(rawDb(db), replayName);
    expect(rain?.(0, 120)).toBe(5);
    expect(rain?.(360, 480)).toBe(18);
    expect(replayRainOverLap(rawDb(db), 'Other.Vcr')).toBeUndefined();
  });

  it('tags the retained row and leaves an already read detail independent', () => {
    const loaded = Array.from(db.iterateDetailedSessions())[0];

    db.updateSessionMatchingReplay(session.id, replayLink);

    const expected = [null, null, null, 18, 18, 18];
    expect(rainByLap(loaded)).toEqual([null,null,null,null,null,null]);
    expect(db.getSessionById(session.id)?.playerDriver?.laps[4].conditions).toEqual({ rain: 18 });
    db.markSessionDataChanged();
    expect(rainByLap(db.getSessionById(session.id))).toEqual(expected);
  });

  it('judges the rain laps against each other, so they are not off pace', () => {
    db.updateSessionMatchingReplay(session.id, replayLink);
    const laps = db.getSessionById(session.id)?.drivers[0].laps ?? [];
    // Laps 5-6 are 8% slower than the dry laps; without conditions they would be off pace.
    expect(laps.map((l) => l.nonRepresentativeReason ?? null)).toEqual([null, null, null, null, null, null]);
  });

  it('refreshes shared session facts when replay rain changes lap classification', () => {
    db.reclassifyStoredSessions({ ids: [session.id] });
    const read = () => rawDb(db).prepare('SELECT clean_laps_count,driving_time_sum,distance_km FROM session_summary_facts WHERE session_id=?').get(session.id);
    const before = read();
    db.updateSessionMatchingReplay(session.id, replayLink);
    const after = read();
    expect(after).not.toEqual(before);
    const projected = rawDb(db).prepare('SELECT clean_laps_count,driving_time_sum FROM session_drivers WHERE session_id=? AND is_player_driver=1').get(session.id);
    expect(after).toMatchObject(projected as { clean_laps_count: number; driving_time_sum: number });
    db.rejectSessionReplayLink(session.id, replayLink, 'layout');
    expect(read()).toEqual(before);
  });

  it('drops the rain again when the link is withdrawn', () => {
    db.updateSessionMatchingReplay(session.id, replayLink);
    db.rejectSessionReplayLink(session.id, replayLink, 'time-window');
    db.markSessionDataChanged();
    expect(rainByLap(db.getSessionById(session.id))).toEqual([null, null, null, null, null, null]);
  });

  it('tags the linked sessions when a decode stores the replay\'s conditions', () => {
    const decodedName = 'Decoded.Vcr';
    db.updateSessionMatchingReplay(session.id, { ...replayLink, name: decodedName });
    const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, spanX: 0, spanZ: 0 };
    const decoded: ReplayTrajectoryData = {
      replayName: decodedName, pointsCount: 2, currentLap: 1, driverSlot: 0, bounds,
      points: [{ x: 0, y: 0, z: 0, timeSec: 0 }, { x: 0, y: 0, z: 0, timeSec: 719 }],
      weatherEvents: [{ timeSec: 0, rainIntensity: 0, ambientTemp: 25 }, { timeSec: 600, rainIntensity: 16, ambientTemp: 24 }],
    };

    db.replaceReplayDriverLaps(decodedName, `C:\\replays\\${decodedName}`, 1, 1, 0, decoded, true);

    // Lap 5 runs from 480 s to 610 s, into the rain from 600 s.
    expect(rainByLap(Array.from(db.iterateDetailedSessions())[0])).toEqual([null, null, null, null, 16, 16]);
  });

  it('tags the sessions linked to a replay once its conditions are stored', () => {
    db.updateSessionMatchingReplay(session.id, { ...replayLink, name: 'Later.Vcr' });
    replaceReplayWideFacts(rawDb(db), 'Later.Vcr', {
      endSec: 800, sessionRunningOrder: null, driverEvents: [], runningOrder: [],
      conditions: [{ startSec: 0, endSec: 800, rain: 20, ambientC: 24, flagState: null, sectorMask: null, driverFlag: null }],
    }, 'v7');

    db.reclassifyStoredSessions({ replayName: 'Later.Vcr' });

    db.markSessionDataChanged();
    expect(rainByLap(db.getSessionById(session.id))).toEqual([20, 20, 20, 20, 20, 20]);
  });

  it('takes the session weather from every stored condition, not the sampled header scan', () => {
    db.updateSessionMatchingReplay(session.id, { ...replayLink, hasRain: true, maxRainIntensity: 5, weatherCondition: 'Dynamic Weather' });

    db.markSessionDataChanged();
    const link = db.getSessionById(session.id)?.matchingReplayFile;
    expect(link).toMatchObject({ hasRain: true, maxRainIntensity: 18, weatherCondition: 'Wet' });
  });

  it('leaves a wet best lap unrated against the dry benchmark, and rates it again once dry', () => {
    const rated = JSON.parse(JSON.stringify(session)) as DetailedSession;
    const player = rated.drivers[0];
    player.laps.forEach((l) => Object.assign(l, { paceCategory: 'Offline', pacePercentage: l.lapTime === 130 ? 110 : 101.5 }));
    Object.assign(player.laps[4], { paceCategory: 'Good', pacePercentage: 103 });
    Object.assign(player, { bestLapNum: 5, bestLapTime: 130, bestLapPaceCategory: 'Good', bestLapPacePercentage: 103 });
    db.upsertSession(rated, 'C:\\results\\17R1.xml', 1, 1);

    db.updateSessionMatchingReplay(session.id, replayLink);
    db.markSessionDataChanged();
    const wet = db.getSessionById(session.id);
    expect(wet?.playerDriver).toMatchObject({ bestLapWet: true });
    expect(wet?.playerDriver?.bestLapPaceCategory).toBeUndefined();
    expect(wet?.playerDriver?.bestLapPacePercentage).toBeUndefined();

    db.rejectSessionReplayLink(session.id, replayLink, 'time-window');
    db.markSessionDataChanged();
    const dry = db.getSessionById(session.id)?.playerDriver;
    expect(dry?.bestLapWet).toBeUndefined();
    expect(dry?.bestLapPaceCategory).toBeUndefined();
  });
});
