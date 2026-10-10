import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DetailedSession, LapData } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertSession } from '../../../../server/core/dbSessionStore.js';
import { queryCompactDashboard } from '../../../../server/core/sessionSummaries/dashboardQueries.js';

const makeSession = (id: string, timestamp: number, lapTime: number): DetailedSession => {
  const lap: LapData = { lapNum: 1, position: 1, lapTime, lapTimeString: `${lapTime}`, s1: 30, s2: 30, s3: lapTime - 60,
    topSpeed: 250, fCompound: 'Dry', rCompound: 'Dry', isPitStop: false, isValid: true };
  const driver = { name: 'Player', carType: 'Ferrari 499P', carClass: 'Hypercar', carNumber: '1', teamName: '', isPlayer: true,
    position: 1, classPosition: 1, bestLapTime: lapTime, bestLapTimeString: `${lapTime}`, bestLapNum: 1, bestS1: 30, bestS2: 30,
    bestS3: lapTime - 60, theoreticalBest: lapTime, theoreticalBestString: `${lapTime}`, lapsCount: 1, laps: [lap] };
  return { id, filename: `${id}.xml`, filePath: `${id}.xml`, trackVenue: 'Monza', trackCourse: 'GP', trackEvent: '',
    trackLengthMeters: 5793, timeString: `2026/06/01 12:0${timestamp}`, timestamp, sessionType: 'Race', sessionName: 'R1', driversCount: 1,
    playerDriver: driver, drivers: [driver] };
};

describe('compact dashboard queries', () => {
  it('aggregates the complete history while returning only the requested compact page and current-target pace order', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    upsertSession(db, makeSession('slower', 1, 95), 'slower.xml', 1, 10);
    upsertSession(db, makeSession('faster', 2, 90), 'faster.xml', 2, 10);
    const benchmark = { key: 'Monza_HY', trackName: 'Monza', carClass: 'Hypercar', patch: 'test', target100Sec: 90,
      targets: { alienSec: 90, competitiveSec: 90, goodSec: 90, goodMidpackSec: 90, midpackSec: 90, midpackTailSec: 90, tailEnderSec: 90, offlineSec: 90 } };
    db.prepare(`INSERT INTO reference_laptimes (key,track_name,car_class,patch,target100_sec,alien_sec,competitive_sec,good_sec,
      good_midpack_sec,midpack_sec,midpack_tail_sec,tail_ender_sec,offline_sec,data_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(benchmark.key, benchmark.trackName, benchmark.carClass, benchmark.patch,
      benchmark.target100Sec, 90, 90, 90, 90, 90, 90, 90, 90, JSON.stringify(benchmark), 1);

    const result = queryCompactDashboard(db, { sort: 'pace-asc', page: 1, pageSize: 1, referenceEntries: { [benchmark.key]: benchmark } });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe('faster');
    expect(result.sessions[0].playerDriver).not.toHaveProperty('laps');
    expect(result.sessions[0].playerDriver?.driverOrdinal).toBe(0);
    expect(result.sessions[0].playerDriver?.bestLapOrdinal).toBe(0);
    expect(result.metrics).toMatchObject({
      sessionsCount: 2, totalLaps: 2, cleanLaps: 2, cleanLapsPercentage: 100,
      raceSessionsCount: 2, raceWinsCount: 2, racePodiumsCount: 2,
      averageBenchmarkPacePercentage: 102.8, averageBenchmarkPaceCategory: 'Good', totalPitStops: 0,
      rankedTracks: [{ track: 'Monza', laps: 2, km: 11.586 }],
      rankedCars: [{ car: 'Ferrari 499P', laps: 2, km: 11.586 }],
      bestTrackRefLaps: [{ sessionId: 'faster', percentage: 100, category: 'Alien', lapTimeString: '90', track: 'Monza', car: 'Ferrari 499P' }],
    });
    expect(result.trends.hasData).toBe(true);
    expect(result.trends.latestOuting?.id).toBe('faster');
    expect(result.trends.latestOuting?.driverOrdinal).toBe(0);
    expect(result.tracks).toContain('Monza');
    db.close();
  });

  it('reads aggregate facts without driver/lap history or extracting JSON scalars', () => {
    const statements: string[] = [];
    const db = new Database(':memory:', { verbose: sql => { if (typeof sql === 'string') statements.push(sql); } });
    try {
      initDbSchema(db);
      upsertSession(db, makeSession('one', 1, 90), 'one.xml', 1, 1);
      db.exec('DELETE FROM session_laps; DELETE FROM session_events');
      statements.length = 0;
      const result = queryCompactDashboard(db, {});
      expect(result.metrics).toMatchObject({ totalLaps: 1, totalDistanceKm: 5.793, totalDrivingSeconds: 90 });
      expect(result.trends.todayActivity).toMatchObject({ lapsCount: 1, distanceKm: 5.8 });
      expect(result.trends.recentCleanRate).toBe(100);
      const aggregateReads = statements.filter(sql => sql.includes('session_summary_facts'));
      expect(aggregateReads.length).toBeGreaterThan(0);
      expect(aggregateReads.every(sql => !sql.includes('json_extract') && !sql.includes('summary_json'))).toBe(true);
      const plan = db.prepare('EXPLAIN QUERY PLAN SELECT session_id FROM session_summary_facts WHERE session_day=? AND session_type=? ORDER BY timestamp DESC LIMIT 1')
        .all('2026/06/01', 'Race') as Array<{ detail: string }>;
      expect(plan.some(row => row.detail.includes('idx_session_facts_day'))).toBe(true);
    } finally { db.close(); }
  });
});
