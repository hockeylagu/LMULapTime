import { describe, expect, it } from 'vitest';
import type { DetailedSession, LapData } from '../../../shared/types/index.js';
import { buildSessionSummaryProjection } from '../../../shared/domain/sessionSummaries/index.js';
import { selectCleanLapCandidates, computeTopNLapAverage, computeConsistencyRating } from '../../../shared/domain/lapComparison.js';

function lap(lapNum: number, lapTime: number | null, changes: Partial<LapData> = {}): LapData {
  return { lapNum, position: 1, lapTime, lapTimeString: '', s1: lapTime, s2: lapTime, s3: lapTime,
    topSpeed: 250 + lapNum, fCompound: 'Dry', rCompound: 'Dry', isPitStop: false, isValid: true, ...changes };
}

const session: DetailedSession = {
  id: 's1', filename: 's1.xml', filePath: 's1.xml', trackVenue: 'Monza', trackCourse: 'GP', trackEvent: '', trackLengthMeters: 5793,
  timeString: 'date', timestamp: 10, sessionType: 'Race', sessionName: 'R1', driversCount: 1,
  playerDriver: { name: 'Driver', carType: 'Car', carClass: 'GT3', carNumber: '1', teamName: '', isPlayer: true, position: 1,
    classPosition: 1, bestLapTime: 91, bestLapTimeString: '', bestLapNum: 2, bestS1: 91, bestS2: 91, bestS3: 91,
    theoreticalBest: 273, theoreticalBestString: '', lapsCount: 4, laps: [] },
  drivers: [{ name: 'Driver', carType: 'Car', carClass: 'GT3', carNumber: '1', teamName: '', isPlayer: true, position: 1,
    classPosition: 1, bestLapTime: 91, bestLapTimeString: '', bestLapNum: 2, bestS1: 91, bestS2: 91, bestS3: 91,
    theoreticalBest: 273, theoreticalBestString: '', lapsCount: 4,
    laps: [lap(1, 90), lap(2, 91), lap(3, 92, { conditions: { wetTyres: true } }), lap(4, null, { isValid: false, isInferred: true })] }],
};

describe('session summary projection', () => {
  it('matches domain clean-lap, average, top-three and consistency rules by condition', () => {
    const projected = buildSessionSummaryProjection(session, 4);
    const driver = projected.drivers[0];
    const clean = selectCleanLapCandidates(session.drivers[0].laps);
    expect(driver.cleanLapsCount).toBe(clean.length);
    expect(driver.topThreeAverage).toBe(computeTopNLapAverage(session.drivers[0].laps, 3));
    expect(driver.lapsCount).toBe(3);
    expect(driver.pitCount).toBe(0);
    expect(driver.consistencyScore).toBe(computeConsistencyRating(session.drivers[0].laps).consistencyScore);
    expect(projected.laps.map(item => item.isClean)).toEqual(session.drivers[0].laps.map(item => clean.includes(item)));
    expect(projected.conditions.map(item => item.conditionGroup)).toEqual(['dry', 'wet']);
    expect(projected.laps[2].leaderboardEligible).toBe(false);
    expect(projected.layoutKey).toBe('monza_gp');
  });

  it('preserves primary-driver ordinal identity and the no-lap progression fallback', () => {
    const duplicate = { ...session, playerDriver: { ...session.playerDriver!, laps: [] }, drivers: [
      { ...session.drivers[0], isPlayer: true, laps: [] },
      { ...session.drivers[0], isPlayer: false, laps: [], avgLapTime: 92, lapsCount: 7 },
    ] };
    const projected = buildSessionSummaryProjection(duplicate, 1);
    expect(projected.drivers.map(driver => driver.isPlayer)).toEqual([true, false]);
    expect(projected.drivers.map(driver => driver.isHuman)).toEqual([true, false]);
    expect(projected.drivers[1]).toMatchObject({ lapsCount: 7, cleanLapsCount: 7, drivingTimeSum: 644, averageLapTime: 92 });
    expect(projected.drivers[1].topThreeAverage).toBeNull();
    expect(projected.isEmpty).toBe(false);
    const empty = buildSessionSummaryProjection({ ...duplicate, playerDriver: { ...duplicate.playerDriver!, bestLapTime: null, lapsCount: 0 }, driversCount: 0 }, 2);
    expect(empty.isEmpty).toBe(true);
  });

  it('uses the selected player contribution and keeps non-player laps out of session totals', () => {
    const player = { ...session.drivers[0], positionGain: 3 };
    const projected = buildSessionSummaryProjection({ ...session, playerDriver: player, drivers: [
      { ...player, name: 'AI', isPlayer: false, lapsCount: 100, laps: [lap(1, 10)] }, player,
    ] }, 1);
    expect(projected.aggregate).toMatchObject({ player: { driverOrdinal: 1, lapsCount: 3, declaredLapsCount: 4 },
      positionGain: 3, distanceKm: 17.379, primaryLapCount: 4, primaryValidLapCount: 3 });
    const withoutPlayer = buildSessionSummaryProjection({ ...session, playerDriver: undefined,
      drivers: [{ ...player, isPlayer: false }] }, 1);
    expect(withoutPlayer.aggregate).toMatchObject({ player: null, distanceKm: 0, primaryLapCount: 4 });
  });

  it('persists legacy distance estimates and a timezone-independent date fallback once', () => {
    const projected = buildSessionSummaryProjection({ ...session, trackLengthMeters: null,
      timestamp: 0, timeString: '2026/06/01 12:00:00' }, 1);
    expect(projected.aggregate).toMatchObject({ distanceKm: 15, activityDistanceKm: 13.5,
      sessionDay: '2026/06/01', eventTimestamp: Date.UTC(2026, 5, 1, 12) });
  });
});
