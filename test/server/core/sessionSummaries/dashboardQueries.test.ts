import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { DetailedSession, LapData, ReferenceLaptimeEntry } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { upsertSession } from '../../../../server/core/dbSessionStore.js';
import { queryCompactDashboard } from '../../../../server/core/sessionSummaries/dashboardQueries.js';

const makeSession = (id: string, timestamp: number, lapTime: number): DetailedSession => {
  const lap: LapData = { lapNumber: 1, position: 1, lapTime, s1: 30, s2: 30, s3: lapTime - 60,
    topSpeed: 250, fCompound: 'Dry', rCompound: 'Dry', isPitStop: false, isValid: true };
  const driver = { name: 'Player', carType: 'Ferrari 499P', carClass: 'Hyper', carNumber: '1', teamName: '', isPlayer: true,
    position: 1, classPosition: 1, bestLapTime: lapTime, bestLapNumber: 1, bestS1: 30, bestS2: 30,
    bestS3: lapTime - 60, theoreticalBest: lapTime, declaredLapsCount: 1, laps: [lap] };
  return { id, filename: `${id}.xml`, filePath: `${id}.xml`, trackVenue: 'Monza', trackCourse: 'GP', trackEvent: '',
    trackLengthMeters: 5793, timeString: `2026/06/01 12:0${timestamp}`, timestamp, sessionType: 'Race', sessionName: 'R1', driversCount: 1,
    playerDriver: driver, drivers: [driver] };
};

describe('compact dashboard queries', () => {
  it('averages one best pace per layout/class only after three dry rated sessions, using current targets', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      const entries = Object.fromEntries([
        ['Monza', 'Hyper'], ['Monza', 'GT3'], ['Monza Curva Grande Circuit', 'Hyper'],
      ].map(([trackName, carClass]) => {
        const entry: ReferenceLaptimeEntry = { key: `${trackName}_${carClass}`, trackName, carClass, patch: 'test',
          targets: { alienSec: 100, competitiveSec: 101, goodSec: 102, goodMidpackSec: 103,
            midpackSec: 104, midpackTailSec: 105, tailEnderSec: 106, offlineSec: 107 } };
        return [entry.key, entry];
      }));
      const insert = (id: string, lapTime: number, carClass = 'Hyper', venue = 'Monza', course = 'GP', wet = false) => {
        const session = makeSession(id, 1, lapTime);
        session.trackVenue = venue;
        session.trackCourse = course;
        session.trackLengthMeters = venue.includes('Curva') ? 3970 : 5793;
        session.drivers[0].carClass = carClass;
        session.drivers[0].bestLapWet = wet;
        upsertSession(db, session, session.filePath, 1, 1);
      };
      insert('hyper1', 101);
      insert('hyper2', 110);
      insert('gt1', 106, 'GT3');
      insert('gt2', 120, 'GT3');
      insert('short1', 90, 'Hyper', 'Monza Curva Grande Circuit', 'Curva Grande');
      insert('short2', 95, 'Hyper', 'Monza Curva Grande Circuit', 'Curva Grande');
      insert('wet', 80, 'Hyper', 'Monza', 'GP', true);
      insert('unrated', 70, 'Unknown');
      const read = () => queryCompactDashboard(db, { referenceEntries: entries, track: 'Spa', pageSize: 1 });
      expect(read().metrics.averageBenchmarkPacePercentage).toBeNull();
      expect(read().metrics.averageBenchmarkPaceCategory).toBeNull();

      // Canonical layout aliases share the session minimum, while classes and layouts do not.
      insert('hyper3', 120, 'Hyper', 'Autodromo Nazionale Monza', 'Grand Prix');
      insert('gt3', 110, 'GT3');
      insert('gt4', 130, 'GT3');
      expect(read().metrics).toMatchObject({ averageBenchmarkPacePercentage: 103.5, averageBenchmarkPaceCategory: 'Good' });
      insert('short3', 98, 'Hyper', 'Monza Curva Grande Circuit', 'Curva Grande');
      expect(read().metrics.averageBenchmarkPacePercentage).toBe(99);

      entries.Monza_GT3.targets.alienSec = 106;
      expect(read().metrics.averageBenchmarkPacePercentage).toBe(97);
      expect(queryCompactDashboard(db, {}).metrics.averageBenchmarkPacePercentage).toBeNull();
    } finally { db.close(); }
  });

  it('keeps best benchmark pace selection, ties, wet exclusion and layout/class targets without ingest ratings', () => {
    const db = new Database(':memory:');
    try {
      initDbSchema(db);
      const benchmark = (trackName: string, carClass: string, target100Sec: number): ReferenceLaptimeEntry => ({
        key: `${trackName}_${carClass}`, trackName, carClass, patch: 'test',
        targets: { alienSec: target100Sec, competitiveSec: target100Sec, goodSec: target100Sec,
          goodMidpackSec: target100Sec, midpackSec: target100Sec, midpackTailSec: target100Sec,
          tailEnderSec: target100Sec, offlineSec: target100Sec },
      });
      const hyper = benchmark('Monza', 'Hyper', 90);
      const gt3 = benchmark('Monza', 'GT3', 100);
      const short = benchmark('Monza Curva Grande Circuit', 'Hyper', 60);
      const entries = Object.fromEntries([hyper, gt3, short].map(entry => [entry.key, entry]));
      const tiedFirst = makeSession('tie-first', 1, 90.455);
      const tiedLast = makeSession('tie-last', 2, 90.455);
      const otherClass = makeSession('gt3', 3, 102);
      otherClass.drivers[0].carClass = 'GT3';
      const wet = makeSession('wet', 4, 80);
      wet.drivers[0].bestLapWet = true;
      const otherLayout = makeSession('short', 5, 63);
      otherLayout.trackVenue = 'Monza Curva Grande Circuit';
      otherLayout.trackCourse = 'Curva Grande';
      otherLayout.trackLengthMeters = 3970;
      for (const session of [tiedFirst, tiedLast, otherClass, wet, otherLayout]) {
        upsertSession(db, session, session.filePath, 1, 1);
      }
      const read = () => queryCompactDashboard(db, { referenceEntries: entries });
      const first = read();
      expect(first.metrics.bestTrackRefLaps).toMatchObject([
        { sessionId: 'tie-first', percentage: 100.51, category: 'Competitive' },
        { sessionId: 'short', percentage: 105, category: 'Midpack' },
      ]);
      expect(first.metrics.averageBenchmarkPacePercentage).toBeNull();
      expect(first.trends.recentPaceTrend.map(point => point.id)).not.toContain('wet');
      // A slower raw lap can have the best benchmark pace for its class after a target refresh.
      gt3.targets.alienSec = 102;
      expect(read().metrics.bestTrackRefLaps).toMatchObject([
        { sessionId: 'gt3', percentage: 100, category: 'Alien' },
        { sessionId: 'short', percentage: 105, category: 'Midpack' },
      ]);
      expect(read().metrics.averageBenchmarkPacePercentage).toBeNull();

      // Preserve the existing SQLite rounding of dashboard history at a binary rounding tie.
      // JS display/trend rounding historically differs here; centralizing it must not change
      // which percentage/category the dashboard history reports.
      const spa = benchmark('Spa', 'Hyper', 100);
      entries[spa.key] = spa;
      const rounding = makeSession('rounding', 6, 105.505);
      rounding.trackVenue = 'Spa';
      rounding.trackCourse = 'Grand Prix';
      rounding.trackLengthMeters = 7004;
      upsertSession(db, rounding, rounding.filePath, 1, 1);
      const boundary = read();
      expect(boundary.metrics.bestTrackRefLaps.find(lap => lap.sessionId === 'rounding'))
        .toMatchObject({ percentage: 105.5, category: 'Midpack' });
      expect(boundary.trends.recentPaceTrend.find(point => point.id === 'rounding')?.pacePercentage).toBe(105.51);
    } finally { db.close(); }
  });

  it('preserves unknown venue/course pairs in filter options and dashboard page scope', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const short = makeSession('short-course', 1, 95);
    short.trackVenue = 'Mod Circuit';
    short.trackCourse = 'Short Course';
    const long = makeSession('long-course', 2, 90);
    long.trackVenue = 'Mod Circuit';
    long.trackCourse = 'Long Course';
    upsertSession(db, short, 'short-course.xml', 1, 10);
    upsertSession(db, long, 'long-course.xml', 2, 10);

    const result = queryCompactDashboard(db, { track: 'Mod Circuit', trackVenue: 'Mod Circuit', trackCourse: 'Short Course' });

    expect(result.total).toBe(1);
    expect(result.sessions.map(session => session.id)).toEqual(['short-course']);
    expect(result.tracks).toEqual([
      { track: 'Mod Circuit (Long Course)', trackVenue: 'Mod Circuit', trackCourse: 'Long Course' },
      { track: 'Mod Circuit (Short Course)', trackVenue: 'Mod Circuit', trackCourse: 'Short Course' },
    ]);
    db.close();
  });

  it('aggregates the complete history while returning only the requested compact page and current-target pace order', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    upsertSession(db, makeSession('slower', 1, 95), 'slower.xml', 1, 10);
    upsertSession(db, makeSession('faster', 2, 90), 'faster.xml', 2, 10);
    const benchmark = { key: 'Monza_HY', trackName: 'Monza', carClass: 'Hyper', patch: 'test',
      targets: { alienSec: 90, competitiveSec: 90, goodSec: 90, goodMidpackSec: 90, midpackSec: 90, midpackTailSec: 90, tailEnderSec: 90, offlineSec: 90 } };
    db.prepare(`INSERT INTO reference_laptimes (key,track_name,car_class,data_json,updated_at) VALUES (?,?,?,?,?)`)
      .run(benchmark.key, benchmark.trackName, benchmark.carClass, JSON.stringify(benchmark), 1);

    const result = queryCompactDashboard(db, { sort: 'pace-asc', page: 1, pageSize: 1, referenceEntries: { [benchmark.key]: benchmark } });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe('faster');
    expect(result.sessions[0].playerDriver).not.toHaveProperty('laps');
    expect(result.sessions[0].playerDriver?.driverOrdinal).toBe(0);
    expect(result.sessions[0].playerDriver?.bestLapOrdinal).toBe(0);
    expect(result.metrics).toMatchObject({
      sessionsCount: 2, totalLaps: 2, cleanLaps: 2, cleanLapsPercentage: 100,
      raceSessionsCount: 2, raceWinsCount: 2, racePodiumsCount: 2,
      maxTopSpeed: 250, maxTopSpeedTrack: 'Monza', maxTopSpeedCar: 'Ferrari 499P',
      rankedTracks: [{ track: 'Monza', laps: 2, km: 11.586 }],
      rankedCars: [{ car: 'Ferrari 499P', laps: 2, km: 11.586 }],
      bestTrackRefLaps: [{ sessionId: 'faster', percentage: 100, category: 'Alien', track: 'Monza', car: 'Ferrari 499P' }],
    });
    expect(result.trends.hasData).toBe(true);
    expect(result.trends.latestOuting?.id).toBe('faster');
    expect(result.trends.latestOuting?.driverOrdinal).toBe(0);
    expect(result.tracks).toContainEqual({ track: 'Monza', trackVenue: 'Monza', trackCourse: 'GP' });
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
