import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import type { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { writeSessionRows } from '../../../../server/core/sessionRows/writer.js';
import { queryCompactComparableLaps } from '../../../../server/core/sessionSummaries/comparisonQueries.js';
import { extractComparableLaps } from '../../../../server/sessions/sessionAnalytics.js';

const paceTarget = vi.hoisted(() => ({ percentage: 67 }));
vi.mock('../../../../server/sessions/sessionPaceRating.js', () => ({
  rateDriversPace: (drivers: DriverData[]) => {
    for (const driver of drivers) for (const row of driver.laps) row.pacePercentage = paceTarget.percentage;
  },
}));

function fixture(id: string, timestamp: number, track: string, drivers: Array<{name: string; player: boolean; laps: LapData[]}>): DetailedSession {
  const mapped = drivers.map((source, driverOrdinal) => ({
    name: source.name, driverName: source.name, carType: 'Ferrari 499P', carClass: 'LMH', carNumber: `${driverOrdinal + 1}`,
    teamName: 'Test Team', isPlayer: source.player, driverOrdinal, position: driverOrdinal + 1,
    classPosition: driverOrdinal + 1, bestLapTime: Math.min(...source.laps.map(lap => lap.lapTime ?? Infinity)),
    bestLapTimeString: '', bestLapNum: source.laps.find(lap => lap.isValid)?.lapNum, lapsCount: source.laps.length,
    cleanLapsCount: source.laps.length, laps: source.laps.map((lap, lapOrdinal) => ({ ...lap, lapOrdinal })),
  } as unknown as DriverData));
  return { id, filename: `${id}.xml`, filePath: `${id}.xml`, timeString: '', timestamp, trackVenue: track,
    trackCourse: track === 'Spa' ? 'GP' : 'National', trackLengthMeters: 5000, sessionType: 'Race', sessionName: 'R1',
    drivers: mapped, driversCount: mapped.length, playerDriver: mapped.find(driver => driver.isPlayer), isEmpty: false,
  } as unknown as DetailedSession;
}

function addSession(db: Database.Database, session: DetailedSession): void {
  const venue = session.trackVenue;
  const course = session.trackCourse;
  const layout = venue === 'Spa' ? 'spa_gp' : 'silverstone_national';
  db.prepare(`INSERT INTO sessions (id,filename,file_path,file_mtime,file_size,timestamp,track_venue,track_course,
    session_type,session_name,metadata_json,data_json,updated_at,layout_key,recording_name,session_kind,is_empty)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(session.id, session.filename, session.filePath, session.timestamp, 1,
    session.timestamp, venue, course, 'Race', 'R1', '{}', JSON.stringify(session), session.timestamp, layout, null, 'race', 0);
  // The rows and their derived columns come from the writer, as in ingestion.
  writeSessionRows(db, session);
}

const lap = (lapNum: number, lapTime: number, conditions?: LapData['conditions']): LapData => ({
  lapNum, lapTime, lapTimeString: `${lapTime}`, position: 1, s1: 30, s2: 40, s3: lapTime - 70,
  isValid: true, isInferred: false, isOutLap: false, isPitStop: false, conditions,
} as LapData);

describe('SQL comparison query', () => {
  it('matches the extraction oracle across layouts, duplicate names, wet laps and selected locators while hydrating only the page and best rows', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const sessions = [
      fixture('spa-a', 100, 'Spa', [
        { name: 'Alex Smith', player: true, laps: [lap(1, 100), lap(2, 99, { wetTyres: true })] },
        { name: 'Alex Smith', player: false, laps: [lap(1, 98)] },
        { name: 'Offline AI', player: false, laps: [lap(1, 97)] },
      ]),
      fixture('spa-b', 200, 'Spa', [{ name: 'Rival', player: true, laps: [lap(1, 96)] }]),
      fixture('silverstone', 300, 'Silverstone', [{ name: 'Wrong Layout', player: false, laps: [lap(1, 80)] }]),
    ];
    sessions.forEach(session => addSession(db, session));
    const validBestPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT lap_time FROM session_laps
      WHERE is_valid=1 AND lap_time>0 ORDER BY lap_time LIMIT 1`).all() as Array<{ detail: string }>;
    const boardBestPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT lap_time FROM session_laps
      WHERE leaderboard_eligible=1 AND lap_time>0 ORDER BY lap_time LIMIT 1`).all() as Array<{ detail: string }>;
    expect(validBestPlan.some(row => row.detail.includes('idx_session_lap_valid_best'))).toBe(true);
    expect(boardBestPlan.some(row => row.detail.includes('idx_session_lap_board_best'))).toBe(true);
    const hydrated: string[] = [];
    const readSession = (id: string) => { hydrated.push(id); return sessions.find(session => session.id === id) ?? null; };
    const filters = { trackName: 'Spa', playerOnly: false, humansOnly: true };
    const actual = queryCompactComparableLaps(db, readSession, filters, { page: 2, pageSize: 2 });
    const expected = extractComparableLaps(sessions.filter(session => session.trackVenue === 'Spa'), filters);
    // The extraction helper infers player identity from the duplicated name; the SQL contract uses
    // the persisted is_player fact, so drop that known false-positive from its display oracle.
    const expectedVisible = expected.laps.filter(item => !(item.sessionId === 'spa-a' && item.driverOrdinal === 1));
    expect(actual.total).toBe(expectedVisible.length);
    expect(actual.laps.map(item => [item.sessionId, item.driverOrdinal, item.lapOrdinal, item.lapTime]))
      .toEqual(expectedVisible.slice(2, 4).map(item => [item.sessionId, item.driverOrdinal, item.lapOrdinal, item.lapTime]));
    expect(actual.overallTrackBestLap?.sessionId).toBe('spa-b');
    expect(actual.laps.some(item => item.sessionId === 'silverstone')).toBe(false);
    expect(hydrated.length).toBeLessThanOrEqual(5);
    expect(new Set(hydrated).size).toBe(hydrated.length);

    const selected = queryCompactComparableLaps(db, readSession, { ...filters, humansOnly: false, sessionId: 'spa-a', driverOrdinal: 1, lapOrdinal: 0 }, { pageSize: 1 });
    expect(selected.laps.map(item => [item.sessionId, item.driverOrdinal, item.lapOrdinal])).toEqual([['spa-a', 1, 0]]);
    expect(selected.laps[0].isPlayer).toBe(false);
    paceTarget.percentage = 83;
    const reread = queryCompactComparableLaps(db, readSession, { ...filters, sessionId: 'spa-a', driverOrdinal: 0, lapOrdinal: 0 }, { pageSize: 1 });
    expect(reread.laps[0].pacePercentage).toBe(83);
    db.close();
  });
});
