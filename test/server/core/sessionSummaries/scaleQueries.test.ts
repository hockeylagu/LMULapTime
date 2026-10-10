import Database from 'better-sqlite3';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DetailedSession, ReferenceLaptimeEntry } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { queryCompactDashboard } from '../../../../server/core/sessionSummaries/dashboardQueries.js';
import { persistSessionAggregate } from '../../../../server/core/sessionSummaries/aggregateStore.js';
import { buildSessionSummaryProjection } from '../../../../shared/domain/sessionSummaries/index.js';
import { SESSION_SUMMARY_PROJECTION_VERSION } from '../../../../shared/types/sessionSummaries.js';
import { NORMALIZED_SESSION_VERSION } from '../../../../server/core/sessionRows/schema.js';
import { writeSessionRows } from '../../../../server/core/sessionRows/writer.js';
import { queryCompactLeaderboard, queryCompactLeaderboardLayouts } from '../../../../server/core/sessionSummaries/leaderboardQueries.js';
import { querySessionPage } from '../../../../server/core/sessionSummaries/pageQueries.js';
import { queryCompactComparableLaps } from '../../../../server/core/sessionSummaries/comparisonQueries.js';
import { DRIVER_WITH_DICTIONARIES } from '../../../../server/core/sessionRows/reader.js';
import { queryTrackDetailSummary } from '../../../../server/core/sessionSummaries/trackQueries.js';

const SESSION_COUNT = 10_000;
const LAPS_PER_SESSION = 20;

function pageStorageBytes(db: Database.Database): number {
  const pages = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
  const size = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
  return pages * size;
}

function insertScaleFixture(db: Database.Database): number {
  const venue = 'Autodromo Nazionale Monza';
  const course = 'GP';
  const carType = 'Ferrari 499P';
  const driverName = 'Scale Test Driver';
  const lapFacts = Array.from({ length: LAPS_PER_SESSION }, (_, lapOrdinal) => {
    const lapTime = Number((100 + lapOrdinal * 0.05).toFixed(3));
    return { lapNum: lapOrdinal + 1, lapNumber: lapOrdinal + 1, lapTime, lapTimeString: `${lapTime}`,
      s1: 30, s2: 40, s3: lapTime - 70, topSpeed: 300, fCompound: '0,Medium', rCompound: '0,Medium',
      isPitStop: false, isValid: true, isInferred: false, isOutLap: false, position: 0 };
  });
  const cardFor = (index: number): string => {
    const id = `scale-${String(index).padStart(5, '0')}`;
    const timestamp = 1_700_000_000_000 + index * 60_000;
    const timeString = new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19);
    return JSON.stringify({ id, filename: `${id}.xml`, filePath: `${id}.xml`, trackVenue: venue, trackCourse: course,
      trackLengthMeters: 5793, timeString, timestamp, sessionType: 'Race', sessionName: 'R1', driversCount: 1, isEmpty: false,
      playerDriver: { name: driverName, carType, carClass: 'LMH', carNumber: '1', isPlayer: true,
        bestLapTime: 100 + (index % 50) / 100, bestLapTimeString: '1:40.000', bestLapNum: 1, bestLapOrdinal: 0, driverOrdinal: 0,
        bestS1: 30, bestS2: 40, bestS3: 30, theoreticalBest: 100, theoreticalBestString: '1:40.000',
        position: 1, gridPosition: 1, positionGain: 0, lapsCount: LAPS_PER_SESSION, completedLapsCount: LAPS_PER_SESSION,
        cleanLapsCount: LAPS_PER_SESSION, drivingTimeSeconds: 2_000, pitStopsCount: 0, maxTopSpeed: 300,
        consistencyScore: 99, topThreeAverage: 100.1, bestLapWet: false }, hasDuckDbTelemetry: false });
  };
  const insertSession = db.prepare(`INSERT INTO sessions (
    id,filename,file_path,file_mtime,file_size,timestamp,track_venue,track_course,session_type,session_name,
    player_driver_name,player_car_class,player_car_type,player_best_lap_time,player_laps_count,drivers_count,
    metadata_json,data_json,updated_at,layout_key,source_revision,projection_revision,projection_version,
    summary_json,recording_name,session_kind,primary_driver_ordinal,is_empty
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertCondition = db.prepare(`INSERT INTO session_driver_condition_summaries VALUES
    (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(() => {
    for (let index = 0; index < SESSION_COUNT; index++) {
      const id = `scale-${String(index).padStart(5, '0')}`;
      const timestamp = 1_700_000_000_000 + index * 60_000;
      const bestLap = 100 + (index % 50) / 100;
      const card = cardFor(index);
      const cardData = JSON.parse(card) as DetailedSession;
      const detailed: DetailedSession = { ...cardData,
        playerDriver: { ...cardData.playerDriver!, laps: lapFacts } as DetailedSession['playerDriver'],
        drivers: [{ ...cardData.playerDriver!, laps: lapFacts } as NonNullable<DetailedSession['drivers']>[number]],
      };
      insertSession.run(id, `${id}.xml`, `${id}.xml`, timestamp, 1, timestamp, venue, course, 'Race', 'R1',
        driverName, 'LMH', carType, bestLap, LAPS_PER_SESSION, 1, '{}', JSON.stringify(detailed), timestamp,
        'monza_gp', 1, 1, SESSION_SUMMARY_PROJECTION_VERSION, card, null, 'race', 0, 0);
    }
  })();
  const sourceBytes = pageStorageBytes(db);
  db.transaction(() => {
    for (let index = 0; index < SESSION_COUNT; index++) {
      const id = `scale-${String(index).padStart(5, '0')}`;
      const lapTimes = lapFacts.map(lap => lap.lapTime);
      insertCondition.run(id, 0, 'dry', LAPS_PER_SESSION, lapTimes.reduce((sum, time) => sum + time, 0),
        lapTimes.reduce((sum, time) => sum + time * time, 0), 0, lapTimes[0], 30, 40, 30, 3,
        lapTimes.slice(0, 3).reduce((sum, time) => sum + time, 0));
      const card = JSON.parse(cardFor(index)) as DetailedSession;
      const detailed: DetailedSession = { ...card, drivers: [{ ...card.playerDriver!, laps: lapFacts }] };
      const projection = buildSessionSummaryProjection(detailed, 1);
      writeSessionRows(db, detailed, projection);
      persistSessionAggregate(db, detailed, projection);
    }
    db.prepare('UPDATE sessions SET normalized_version = ?').run(NORMALIZED_SESSION_VERSION);
  })();
  return sourceBytes;
}

describe('10k session query scale fixture', () => {
  it('keeps returned pages and DTOs bounded while querying realistic per-session lap facts', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const sourceBytes = insertScaleFixture(db);
    const benchmark = { key: 'Monza_LMH', trackName: 'Monza', carClass: 'LMH', patch: 'scale', target100Sec: 100,
      targets: { alienSec: 100, competitiveSec: 101, goodSec: 102, goodMidpackSec: 103, midpackSec: 104,
        midpackTailSec: 105, tailEnderSec: 106, offlineSec: 107 } } as ReferenceLaptimeEntry;

    const measure = <T,>(run: () => T): { value: T; elapsedMs: number } => {
      const started = performance.now(); const value = run(); return { value, elapsedMs: performance.now() - started };
    };
    const page = measure(() => querySessionPage(db, { page: 1, pageSize: 25 }));
    const pageWarm = Math.min(...Array.from({ length: 5 }, () => measure(() => querySessionPage(db, { page: 1, pageSize: 25 })).elapsedMs));
    const dashboard = measure(() => queryCompactDashboard(db, { page: 1, pageSize: 25, referenceEntries: { [benchmark.key]: benchmark } }));
    const board = measure(() => queryCompactLeaderboard(db, { layoutKey: 'monza_gp', carClass: 'LMH' }));
    const layouts = measure(() => queryCompactLeaderboardLayouts(db));
    const track = measure(() => queryTrackDetailSummary(db, 'Monza', 'LMH'));
    const hydratedIds: string[] = [];
    const compare = measure(() => queryCompactComparableLaps(db, id => {
      hydratedIds.push(id);
      const row = db.prepare('SELECT data_json FROM sessions WHERE id=?').get(id) as { data_json: string } | undefined;
      return row ? JSON.parse(row.data_json) as DetailedSession : null;
    }, { trackName: 'Monza', playerOnly: false }, { page: 2, pageSize: 5 }));
    const totalStorageBytes = pageStorageBytes(db);
    const pagePlan = db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM sessions
      WHERE layout_key=? ORDER BY timestamp DESC,id DESC LIMIT 25`).all('monza_gp') as Array<{ detail: string }>;
    const boardPlan = db.prepare(`EXPLAIN QUERY PLAN SELECT s.id,c.best_lap_time FROM session_driver_condition_summaries c
      JOIN session_drivers d ON d.session_id=c.session_id AND d.driver_ordinal=c.driver_ordinal
      JOIN sessions s ON s.id=d.session_id WHERE s.layout_key=? AND d.driver_class=? AND c.condition_group='dry' AND d.is_human=1`)
      .all('monza_gp', 'LMH') as Array<{ detail: string }>;
    const planOf = (sql: string, ...args: unknown[]) => (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as Array<{ detail: string }>).map(row => row.detail);
    const cardDriversPlan = planOf(`${DRIVER_WITH_DICTIONARIES} WHERE d.session_id IN (?,?) AND (d.is_player_driver = 1
      OR d.driver_ordinal = (SELECT player_driver_ordinal FROM sessions WHERE id = d.session_id))`, 'scale-00001', 'scale-00002');
    const comparePlan = planOf(`SELECT count(*) FROM sessions s JOIN session_drivers d ON d.session_id=s.id
      LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_laps l ON l.session_id=d.session_id AND l.driver_ordinal=d.driver_ordinal WHERE s.layout_key=? AND d.is_human=1`, 'monza_gp');
    const report = {
      sessions: SESSION_COUNT, laps: SESSION_COUNT * LAPS_PER_SESSION,
      sourceBytes, projectionAndIndexBytes: totalStorageBytes - sourceBytes, totalStorageBytes,
      pageMs: Number(page.elapsedMs.toFixed(1)), pageWarmMs: Number(pageWarm.toFixed(1)), pagePayloadBytes: JSON.stringify(page.value).length,
      dashboardMs: Number(dashboard.elapsedMs.toFixed(1)), dashboardPayloadBytes: JSON.stringify(dashboard.value).length,
      boardMs: Number(board.elapsedMs.toFixed(1)), boardPayloadBytes: JSON.stringify(board.value).length,
      layoutsMs: Number(layouts.elapsedMs.toFixed(1)), trackMs: Number(track.elapsedMs.toFixed(1)),
      compareMs: Number(compare.elapsedMs.toFixed(1)), comparePayloadBytes: JSON.stringify(compare.value).length,
      comparePageCount: compare.value.laps.length, compareTotal: compare.value.total, compareHydratedSessions: hydratedIds.length,
      pagePlan: pagePlan.map(row => row.detail), boardPlan: boardPlan.map(row => row.detail), cardDriversPlan, comparePlan,
    };
    console.info(`10k session SQLite scale: ${JSON.stringify(report)}`);
    if (process.env.LMU_PROFILE_SUMMARIES) writeFileSync(process.env.LMU_PROFILE_SUMMARIES, JSON.stringify(report, null, 2));

    expect(page.value.total).toBe(SESSION_COUNT);
    expect(page.value.sessions).toHaveLength(25);
    expect(page.value.sessions[0].playerDriver).not.toHaveProperty('laps');
    expect(dashboard.value.sessions).toHaveLength(25);
    expect(dashboard.value.metrics.sessionsCount).toBe(SESSION_COUNT);
    expect(board.value.entries).toHaveLength(1);
    expect(board.value.entries[0].representativeLaps).toBe(SESSION_COUNT * LAPS_PER_SESSION);
    expect(board.value.entries[0].bestLap).not.toHaveProperty('laps');
    expect(layouts.value).toHaveLength(1);
    expect(track.value?.sessionsCount).toBe(SESSION_COUNT);
    expect(track.value?.totalLaps).toBe(SESSION_COUNT * LAPS_PER_SESSION);
    expect(compare.value.total).toBe(SESSION_COUNT * LAPS_PER_SESSION);
    expect(compare.value.laps).toHaveLength(5);
    expect(new Set(hydratedIds).size).toBe(hydratedIds.length);
    expect(hydratedIds.length).toBeLessThanOrEqual(5 + 3);
    expect(pagePlan.some(row => row.detail.includes('idx_sessions_layout_timestamp'))).toBe(true);
    expect(boardPlan.some(row => row.detail.includes('session_driver_condition_summaries'))).toBe(true);
    expect(totalStorageBytes).toBeGreaterThan(sourceBytes);
    // Cards read driver rows by their key, never by scanning the table; the comparison walks laps through the key too.
    expect(cardDriversPlan.some(detail => detail.includes('PRIMARY KEY'))).toBe(true);
    expect(comparePlan.some(detail => /^SCAN (d|l|session_drivers|session_laps)/.test(detail))).toBe(false);
    db.close();
  }, 120_000);
});
