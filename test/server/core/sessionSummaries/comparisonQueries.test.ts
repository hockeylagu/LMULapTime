import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import type { DetailedSession, DriverData, LapData } from '../../../../shared/types/index.js';
import { initDbSchema } from '../../../../server/core/dbSchema.js';
import { persistSessionProjection } from '../../../../server/core/sessionSummaries/store.js';
import { queryCompactComparableLaps, queryTelemetryComparableLaps } from '../../../../server/core/sessionSummaries/comparisonQueries.js';
import { extractComparableLaps } from '../../../helpers/legacySessionAnalytics.js';
import { toComparableLap } from '../../../../server/sessions/sessionAnalytics.js';
import * as comparisonRows from '../../../../server/core/sessionSummaries/comparisonLapRows.js';
import { recordedCondition } from '../../../../shared/domain/compareLapScope.js';
import { readSession } from '../../../../server/core/sessionRows/reader.js';
import { retainSessionReplay } from '../../../helpers/retainedReplayFixture.js';
import { queryCompactLeaderboard } from '../../../../server/core/sessionSummaries/leaderboardQueries.js';

const paceTarget = vi.hoisted(() => ({ percentage: 67 }));
vi.mock('../../../../server/benchmarks/referenceLaptimes.js', () => ({
  createPaceCalculator: () => () => ({ category: 'Alien', percentage: paceTarget.percentage }),
}));

function fixture(id: string, timestamp: number, track: string, drivers: Array<{name: string; player: boolean; laps: LapData[]}>): DetailedSession {
  const mapped = drivers.map((source, driverOrdinal) => ({
    name: source.name, driverName: source.name, carType: 'Ferrari 499P', carClass: 'Hyper', carNumber: `${driverOrdinal + 1}`,
    teamName: 'Test Team', isPlayer: source.player, driverOrdinal, position: driverOrdinal + 1,
    classPosition: driverOrdinal + 1, bestLapTime: Math.min(...source.laps.map(lap => lap.lapTime ?? Infinity)),
 bestLapNumber: source.laps.find(lap => lap.isValid)?.lapNumber, lapsCount: source.laps.length,
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
  db.prepare(`INSERT INTO sessions (id,filename,file_path,file_mtime_ms,file_size_bytes,timestamp,track_venue,track_course,
    session_type,session_name,updated_at,layout_key,recording_name,session_kind,is_empty)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(session.id, session.filename, session.filePath, session.timestamp, 1,
    session.timestamp, venue, course, 'Race', 'R1', session.timestamp, layout, session.matchingReplayFile?.name ?? null, 'race', 0);
  // The rows and their derived columns come from the writer, as in ingestion.
  persistSessionProjection(db, session);
  retainSessionReplay(db, session);
}

const lap = (lapNumber: number, lapTime: number, conditions?: LapData['conditions']): LapData => ({
  lapNumber, lapTime, position: 1, s1: 30, s2: 40, s3: lapTime - 70,
  isValid: true, isInferred: false, isOutLap: false, isPitStop: false, conditions,
} as LapData);

describe('SQL comparison query', () => {
  it('hides missing driver laps before pagination and disables their telemetry without replacing the official best', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    try {
      const session = fixture('partial-replay', 100, 'Spa', [
        { name: 'Élodie', player: true, laps: [lap(2, 90), lap(3, 91), lap(4, 92)] },
        { name: 'Missing driver', player: false, laps: [lap(2, 89)] },
      ]);
      session.matchingReplayFile = { name: 'partial.Vcr', path: 'deleted', fileSizeBytes: 1 };
      session.drivers[1].carType = 'Unavailable car';
      addSession(db, session);
      db.prepare('DELETE FROM replay_trajectories WHERE filename=? AND (driver_slot=1 OR lap_key=2)').run('partial.Vcr');
      const filters = { trackName: 'Spa', carClass: 'Hyper', playerOnly: false };
      const first = queryTelemetryComparableLaps(db, filters, { pageSize: 1 });
      const second = queryTelemetryComparableLaps(db, filters, { pageSize: 1, page: 2 });
      expect(first.total).toBe(2);
      expect(first.laps.map(item => item.lapNumber)).toEqual([3]);
      expect(second.laps.map(item => item.lapNumber)).toEqual([4]);
      expect(first.carTypes).toEqual(['Ferrari 499P']);
      expect(queryTelemetryComparableLaps(db, { ...filters, carType: 'Unavailable car' }).carTypes).toEqual(['Ferrari 499P']);
      const comparison = queryCompactComparableLaps(db, filters);
      expect(comparison.laps.filter(item => item.telemetryAvailable).map(item => item.lapNumber)).toEqual([3, 4]);
      expect(comparison.overallTrackBestLap).toMatchObject({ driverName: 'Missing driver', lapTime: 89, telemetryAvailable: false });
      const board = queryCompactLeaderboard(db, { layoutKey: 'spa_gp', carClass: 'Hyper' });
      expect(board.entries).toHaveLength(1);
      expect(board.entries.every(item => !item.bestLap.telemetryAvailable)).toBe(true);
      expect(board.entries.find(item => item.driverName === 'Élodie')?.bestLap.lapTime).toBe(90);
      // New reads see cache deletion immediately, without a summary rebuild.
      db.prepare('DELETE FROM replay_trajectories').run();
      expect(queryTelemetryComparableLaps(db, filters).total).toBe(0);
    } finally { db.close(); }
  });
  it('marks driver PBs across the page with stable ties, normalized names and full filter scope', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    try {
      const sessions = [
        fixture('z-first', 100, 'Spa', [
          { name: ' ALICE ', player: true, laps: [lap(1, 100), lap(2, 100)] },
          { name: 'Bob', player: false, laps: [lap(1, 110)] },
          { name: 'Rival', player: false, laps: [{ ...lap(1, 90), isPitStop: true }, lap(2, 95)] },
        ]),
        fixture('a-second', 100, 'Spa', [
          { name: 'alice', player: true, laps: [lap(1, 100)] },
          { name: 'Bob', player: false, laps: [lap(1, 105)] },
          { name: 'Rival', player: false, laps: [lap(1, 96)] },
        ]),
        fixture('other-layout', 50, 'Silverstone', [{ name: 'alice', player: true, laps: [lap(1, 80)] }]),
      ];
      for (const session of sessions) {
        session.matchingReplayFile = { name: `${session.id}.Vcr`, path: 'retained', fileSizeBytes: 1 };
        addSession(db, session);
      }
      const filters = { trackName: 'Spa', carClass: 'Hyper' };
      const pbIds = (laps: Array<{ id: string; isAllTimePB?: boolean }>) => laps.filter(item => item.isAllTimePB).map(item => item.id);
      expect(pbIds(queryCompactComparableLaps(db, filters).laps)).toEqual([
        'z-first_driver_0_lap_0', 'z-first_driver_2_lap_0', 'a-second_driver_1_lap_0',
      ]);
      // A valid in-lap still wins the historical badge, but is absent from the flying-lap picker.
      expect(pbIds(queryTelemetryComparableLaps(db, filters).laps)).toEqual([
        'z-first_driver_0_lap_0', 'a-second_driver_1_lap_0',
      ]);
      expect(pbIds(queryTelemetryComparableLaps(db, filters, { page: 2, pageSize: 1 }).laps)).toEqual([]);
      expect(queryTelemetryComparableLaps(db, { ...filters, sessionId: 'a-second', driverOrdinal: 0, lapOrdinal: 0 }).laps[0].isAllTimePB).toBe(false);
      const sessionBestFilters = { ...filters, sessionId: 'z-first', driverOrdinal: 1, lapOrdinal: 0 };
      expect(queryTelemetryComparableLaps(db, sessionBestFilters).laps[0]).toMatchObject({ isSessionBest: true, isAllTimePB: false });
      expect(queryCompactComparableLaps(db, sessionBestFilters).laps[0].isAllTimePB).toBe(false);
      expect(queryTelemetryComparableLaps(db, { ...filters, driverOrdinal: 0, lapOrdinal: 0 }, { page: 2, pageSize: 1 }).laps[0].isAllTimePB).toBe(false);
      expect(queryTelemetryComparableLaps(db, filters, { page: 99 }).laps).toEqual([]);
    } finally { db.close(); }
  });

  it('gives the gold PB to the class best: any car, any condition, with or without a replay', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    try {
      const recorded = fixture('recorded', 200, 'Spa', [{ name: 'alice', player: true, laps: [lap(1, 100)] }]);
      recorded.matchingReplayFile = { name: 'recorded.Vcr', path: 'retained', fileSizeBytes: 1 };
      const otherCarWet = fixture('other-car-wet', 100, 'Spa', [{ name: 'alice', player: true, laps: [lap(1, 95, { wetTyres: true })] }]);
      otherCarWet.drivers[0].carType = 'Toyota GR010';
      for (const session of [recorded, otherCarWet]) addSession(db, session);
      const filters = { trackName: 'Spa', carClass: 'Hyper' };
      // The faster lap is in another car, wet and without a replay: the recorded lap is not the class best.
      expect(queryTelemetryComparableLaps(db, filters).laps.map(item => [item.id, item.isAllTimePB])).toEqual([['recorded_driver_0_lap_0', false]]);
      expect(queryTelemetryComparableLaps(db, { ...filters, carType: 'Ferrari 499P' }).laps[0].isAllTimePB).toBe(false);
      expect(queryCompactComparableLaps(db, filters).laps.find(item => item.sessionId === 'other-car-wet')?.isAllTimePB).toBe(true);
    } finally { db.close(); }
  });

  it('reads at most the page and three best laps from a thousand-lap session', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const source = fixture('large', 100, 'Spa', [{ name: 'Player', player: true,
      laps: Array.from({ length: 1000 }, (_, index) => lap(index + 1, 100 - index / 1000)) }]);
    addSession(db, source);
    const reads = vi.spyOn(comparisonRows, 'readComparisonLapRows');
    const queries = vi.spyOn(db, 'prepare');
    const result = queryCompactComparableLaps(db, { trackName: 'Spa', playerOnly: true }, { pageSize: 50 });
    expect(result.total).toBe(1000);
    expect(result.laps).toHaveLength(50);
    expect(result.playerBestLap?.lapNumber).toBe(1000);
    expect(reads).toHaveBeenCalledTimes(1);
    const read = reads.mock.results[0];
    if (read.type !== 'return') throw new Error('Comparison row query did not return');
    expect(read.value.size).toBe(51);
    expect(queries.mock.calls.some(([sql]) => sql.includes('session_events') || sql.includes('session_lap_passes'))).toBe(false);
    reads.mockRestore();
    queries.mockRestore();
    db.close();
  });

  it('preserves complete lap display fields from normalized rows and rates only valid selected laps', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const source = fixture('fields', 100, 'Spa', [{ name: 'Player', player: true, laps: [{
      ...lap(1, 100), s1: null, s2: 40, s3: null, isInferred: true, isOutLap: true, isPitStop: true,
      fCompound: 'Soft', rCompound: 'Medium', flCompound: 'FL', frCompound: 'FR', rlCompound: 'RL', rrCompound: 'RR',
      tireWear: { fl: 0.9, fr: 0.8, rl: 0.7, rr: 0.6, avg: 0.75 }, fuel: 20, fuelUsed: 2,
      virtualEnergy: 40, virtualEnergyUsed: 3, elapsedSeconds: 100, 
 
    }, { ...lap(2, 0), lapTime: null, isValid: false }] }]);
    source.matchingReplayFile = { name: 'archived.Vcr', path: 'missing', fileSizeBytes: 1, hasRain: true, weatherCondition: 'Wet' };
    addSession(db, source);
    const rows = comparisonRows.readComparisonLapRows(db, [0, 1].map(lapOrdinal => ({ session_id: source.id, driver_ordinal: 0, lap_ordinal: lapOrdinal })));
    const stored = readSession(db, source.id)!;
    const driver = stored.drivers[0];
    const ratedLap = { ...driver.laps[0], lapOrdinal: 0, paceCategory: 'Alien' as const, pacePercentage: paceTarget.percentage };
    expect(rows.get('fields_driver_0_lap_0')).toEqual(toComparableLap(stored, driver, ratedLap, { isPlayer: true, isSessionBest: true, telemetryAvailable: true }));
    expect(rows.get('fields_driver_0_lap_1')).toMatchObject({ lapTime: null, isValid: false, paceCategory: null, pacePercentage: null });
    db.close();
  });

  it('paginates available flying telemetry laps after filtering unavailable sessions and scopes the current session first', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const older = fixture('unavailable', 100, 'Spa', [{ name: 'Player', player: true, laps: Array.from({ length: 60 }, (_, i) => lap(i + 1, 100)) }]);
    const linked = fixture('linked', 200, 'Spa', [{ name: 'Player', player: true, laps: [
      { ...lap(1, 100), isValid: false }, { ...lap(2, 100), isPitStop: true }, { ...lap(3, 100), isOutLap: true },
      ...Array.from({ length: 52 }, (_, i) => lap(i + 4, 100)),
    ] }]);
    const newest = fixture('newest', 300, 'Spa', [{ name: 'Player', player: true, laps: [lap(1, 99)] }]);
    linked.matchingReplayFile = { name: 'linked.Vcr', path: 'linked.Vcr', fileSizeBytes: 1 };
    newest.matchingReplayFile = { name: 'newest.Vcr', path: 'newest.Vcr', fileSizeBytes: 1 };
    const sessions = [older, linked, newest];
    sessions.forEach(session => addSession(db, session));
    const filters = { trackName: 'Spa', playerOnly: true, telemetryOnly: true };
    const first = queryCompactComparableLaps(db, filters, { pageSize: 50 });
    expect(first.total).toBe(53);
    expect(first.laps).toHaveLength(50);
    expect(first.laps.every(item => item.sessionId === 'linked' && (item.lapNumber ?? 0) >= 4)).toBe(true);
    const second = queryCompactComparableLaps(db, filters, { page: 2, pageSize: 50 });
    expect(second.laps.map(item => item.sessionId)).toEqual(['linked', 'linked', 'newest']);
    const scoped = queryCompactComparableLaps(db, { ...filters, sessionId: 'newest' }, { pageSize: 50 });
    expect(scoped.total).toBe(1);
    expect(scoped.laps[0].sessionId).toBe('newest');
    const pickerFirst = queryTelemetryComparableLaps(db, filters, { pageSize: 50 });
    const pickerSecond = queryTelemetryComparableLaps(db, filters, { page: 2, pageSize: 50 });
    expect(pickerFirst.total).toBe(first.total);
    // The picker lists the fastest laps first; the leaderboard compare keeps session order.
    expect(pickerFirst.laps[0].id).toBe('newest_driver_0_lap_0');
    expect([...pickerFirst.laps, ...pickerSecond.laps].map(item => item.id).sort())
      .toEqual([...first.laps, ...second.laps].map(item => item.id).sort());
    expect(queryTelemetryComparableLaps(db, { ...filters, sessionId: 'newest', driverOrdinal: 0, lapOrdinal: 0 }).laps)
      .toHaveLength(1);
    db.close();
  });

  it('reads picker identities, weather and best badges directly, preserving layout and driver scope', () => {
    const db = new Database(':memory:');
    initDbSchema(db);
    const sessions = [
      fixture('older', 100, 'Spa', [{ name: 'Player', player: true, laps: [lap(1, 98)] }]),
      fixture('current', 200, 'Spa', [
        { name: 'Player', player: true, laps: [lap(1, 100), lap(2, 99)] },
        { name: 'Rival', player: false, laps: [lap(1, 97)] },
      ]),
      fixture('wrong-layout', 300, 'Silverstone', [{ name: 'Player', player: true, laps: [lap(1, 80)] }]),
    ];
    for (const session of sessions) {
      session.matchingReplayFile = { name: `${session.id}.Vcr`, path: 'retained', fileSizeBytes: 1,
        hasRain: true, weatherCondition: 'Dynamic Weather' };
      session.timeString = `Date ${session.id}`;
      addSession(db, session);
    }
    const filters = { trackName: 'Spa', carClass: 'Hyper', playerOnly: false, telemetryOnly: true };
    const legacy = queryCompactComparableLaps(db, filters);
    const picker = queryTelemetryComparableLaps(db, filters);
    expect(picker.total).toBe(4);
    for (const row of picker.laps) {
      const expected = legacy.laps.find(item => item.id === row.id);
      expect(row).toMatchObject({
        sessionId: expected?.sessionId, driverOrdinal: expected?.driverOrdinal, lapOrdinal: expected?.lapOrdinal,
        driverName: expected?.driverName, carType: expected?.carType, carClass: expected?.carClass,
        lapTime: expected?.lapTime, timeString: expected?.timeString,
        matchingReplayFile: expected?.matchingReplayFile, isAllTimePB: expected?.isAllTimePB,
        isSessionBest: expected?.isSessionBest, isPlayer: expected?.isPlayer,
        hasRain: true, weatherCondition: 'Dynamic Weather', isValid: true, isOutLap: false, isPitStop: false,
      });
      expect(row).not.toHaveProperty('pacePercentage');
    }
    expect(queryTelemetryComparableLaps(db, { ...filters, playerOnly: true }).total).toBe(3);
    expect(queryTelemetryComparableLaps(db, { ...filters, sessionId: 'current', driverOrdinal: 1, lapNumber: 1 }).laps[0])
      .toMatchObject({ driverName: 'Rival', isPlayer: false, lapOrdinal: 0 });
    expect(queryTelemetryComparableLaps(db, { ...filters, carClass: 'GT3' }).total).toBe(0);
    db.close();
  });

  describe('telemetry picker ordering and filters', () => {
    function build() {
      const db = new Database(':memory:');
      initDbSchema(db);
      // Four sessions, newest last; times are chosen so every sort gives a different order.
      const specs = [
        { id: 's1', ts: 100, type: 'Practice', weather: 'Dry' as const, drivers: [
          { name: 'Zed', car: 'BMW M4 LMGT3', laps: [lap(1, 90), lap(2, 91)] },
          { name: 'amy', car: 'Lexus RCF LMGT3', laps: [lap(1, 85)] }] },
        { id: 's2', ts: 200, type: 'Qualifying', weather: 'Wet' as const, drivers: [
          { name: 'Zed', car: 'BMW M4 LMGT3', laps: [lap(1, 88)] }] },
        { id: 's3', ts: 300, type: 'Race', weather: 'Dynamic Weather' as const, drivers: [
          { name: 'Bob', car: 'Ferrari 296 LMGT3', laps: [lap(1, 86), lap(2, 87)] }] },
        { id: 's4', ts: 400, type: 'Warmup', weather: undefined, drivers: [
          { name: 'Bob', car: 'Ferrari 296 LMGT3', laps: [lap(1, 89)] }] },
      ];
      for (const spec of specs) {
        const session = fixture(spec.id, spec.ts, 'Spa', spec.drivers.map(d => ({ name: d.name, player: true, laps: d.laps })));
        session.drivers.forEach((driver, index) => { driver.carType = spec.drivers[index].car; });
        session.matchingReplayFile = { name: `${spec.id}.Vcr`, path: 'x', fileSizeBytes: 1,
          hasRain: spec.weather === 'Wet' || spec.weather === 'Dynamic Weather', weatherCondition: spec.weather };
        addSession(db, session);
        db.prepare('UPDATE sessions SET session_type=? WHERE id=?').run(spec.type, spec.id);
      }
      return db;
    }
    const base = { trackName: 'Spa', carClass: 'Hyper', playerOnly: false, telemetryOnly: true };
    const times = (laps: Array<{ lapTime?: number | null }>) => laps.map(item => item.lapTime);

    it('orders by fastest lap by default, newest session, or driver name', () => {
      const db = build();
      try {
        expect(times(queryTelemetryComparableLaps(db, base).laps)).toEqual([85, 86, 87, 88, 89, 90, 91]);
        expect(times(queryTelemetryComparableLaps(db, base, { sort: 'lap' }).laps)).toEqual([85, 86, 87, 88, 89, 90, 91]);
        expect(queryTelemetryComparableLaps(db, base, { sort: 'recent' }).laps.map(item => item.sessionId))
          .toEqual(['s4', 's3', 's3', 's2', 's1', 's1', 's1']);
        const byDriver = queryTelemetryComparableLaps(db, base, { sort: 'driver' }).laps;
        expect(byDriver.map(item => [item.driverName, item.lapTime])).toEqual([
          ['amy', 85], ['Bob', 86], ['Bob', 87], ['Bob', 89], ['Zed', 88], ['Zed', 90], ['Zed', 91]]);
      } finally { db.close(); }
    });

    it('slices one ordered list across pages', () => {
      const db = build();
      try {
        const pages = [1, 2, 3, 4].map(page => queryTelemetryComparableLaps(db, base, { page, pageSize: 2, sort: 'lap' }));
        expect(pages.every(result => result.total === 7)).toBe(true);
        expect(pages.flatMap(result => times(result.laps))).toEqual([85, 86, 87, 88, 89, 90, 91]);
        expect(pages[1].laps[0].lapTime!).toBeGreaterThanOrEqual(pages[0].laps[1].lapTime!);
      } finally { db.close(); }
    });

    it('filters by session type bucket, condition and car with a consistent total', () => {
      const db = build();
      try {
        const sessionsOf = (extra: object) => {
          const result = queryTelemetryComparableLaps(db, { ...base, ...extra });
          return [...new Set(result.laps.map(item => item.sessionId))].sort((a, b) => (a ?? '').localeCompare(b ?? '')).concat(String(result.total));
        };
        expect(sessionsOf({ sessionKind: 'practice' })).toEqual(['s1', '3']);
        expect(sessionsOf({ sessionKind: 'quali' })).toEqual(['s2', '1']);
        expect(sessionsOf({ sessionKind: 'race' })).toEqual(['s3', '2']);
        expect(sessionsOf({ condition: 'Dry' })).toEqual(['s1', 's4', '4']);
        expect(sessionsOf({ condition: 'Wet' })).toEqual(['s2', '1']);
        expect(sessionsOf({ condition: 'Dynamic Weather' })).toEqual(['s3', '2']);
        expect(sessionsOf({ carType: 'Ferrari 296 LMGT3' })).toEqual(['s3', 's4', '3']);
        expect(sessionsOf({ carType: 'BMW M4 LMGT3', condition: 'Dry', sessionKind: 'practice' })).toEqual(['s1', '2']);
        const all = queryTelemetryComparableLaps(db, base).laps;
        const wet = queryTelemetryComparableLaps(db, { ...base, condition: 'Wet' }).laps;
        expect(all.filter(item => recordedCondition(item.weatherCondition, item.hasRain) === 'Wet').map(item => item.id))
          .toEqual(wet.map(item => item.id));
      } finally { db.close(); }
    });

    it('lists every car of the scope ignoring the car filter and the page', () => {
      const db = build();
      try {
        const cars = ['BMW M4 LMGT3', 'Ferrari 296 LMGT3', 'Lexus RCF LMGT3'];
        expect(queryTelemetryComparableLaps(db, base, { pageSize: 1 }).carTypes).toEqual(cars);
        expect(queryTelemetryComparableLaps(db, { ...base, carType: 'Lexus RCF LMGT3' }).carTypes).toEqual(cars);
        expect(queryTelemetryComparableLaps(db, { ...base, sessionKind: 'race' }).carTypes).toEqual(['Ferrari 296 LMGT3']);
      } finally { db.close(); }
    });

    it('lists the car types on the first page only', () => {
      const db = build();
      try {
        expect(queryTelemetryComparableLaps(db, base, { page: 2, pageSize: 2 }).carTypes).toBeUndefined();
        expect(queryTelemetryComparableLaps(db, base, { page: 1, pageSize: 2 }).carTypes).toHaveLength(3);
      } finally { db.close(); }
    });

    it('matches a driver name exactly, ignoring case, when asked, and leaves out the excluded lap', () => {
      const db = build();
      try {
        expect(queryTelemetryComparableLaps(db, { ...base, driverName: 'bo' }).laps.every(item => item.driverName === 'Bob')).toBe(true);
        expect(queryTelemetryComparableLaps(db, { ...base, driverName: 'bo', driverNameExact: true }).laps).toEqual([]);
        const bob = queryTelemetryComparableLaps(db, { ...base, driverName: 'BOB', driverNameExact: true }).laps;
        expect(bob.length).toBeGreaterThan(1);
        expect(bob.every(item => item.driverName === 'Bob')).toBe(true);
        const fastest = bob[0];
        const without = queryTelemetryComparableLaps(db, {
          ...base, driverName: 'BOB', driverNameExact: true, representativeOnly: true,
          excludeLap: { sessionId: fastest.sessionId!, lapOrdinal: fastest.lapOrdinal! },
        });
        expect(without.laps.map(item => item.id)).not.toContain(fastest.id);
        expect(without.total).toBe(bob.length - 1);
      } finally { db.close(); }
    });

    it('can skip laps the parser marked non-representative', () => {
      const db = build();
      try {
        db.prepare("UPDATE session_laps SET non_representative_reason='offPace' WHERE session_id='s1' AND driver_ordinal=1").run();
        expect(times(queryTelemetryComparableLaps(db, base).laps)).toContain(85);
        expect(times(queryTelemetryComparableLaps(db, { ...base, representativeOnly: true }).laps)).toEqual([86, 87, 88, 89, 90, 91]);
        expect(queryTelemetryComparableLaps(db, { ...base, representativeOnly: true }).total).toBe(6);
      } finally { db.close(); }
    });

    it('keeps the ordered picker query off full scans of the lap tables', () => {
      const db = build();
      try {
        const plan = (db.prepare(`EXPLAIN QUERY PLAN SELECT l.lap_time FROM sessions s JOIN session_drivers d ON d.session_id=s.id
          LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
          JOIN session_laps l ON l.session_id=d.session_id AND l.driver_ordinal=d.driver_ordinal
          LEFT JOIN session_recordings r ON r.session_id=s.id
          WHERE s.layout_key=? AND s.recording_name IS NOT NULL ORDER BY l.lap_time LIMIT 50`).all('spa_gp') as Array<{ detail: string }>).map(row => row.detail);
        expect(plan.some(detail => /^SCAN (d|l|session_drivers|session_laps|r|session_recordings) /.test(detail))).toBe(false);
      } finally { db.close(); }
    });
  });

  it('matches the extraction oracle across layouts, duplicate names, wet laps and selected locators using stored lap rows', () => {
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
    const comparePlan = (db.prepare(`EXPLAIN QUERY PLAN SELECT count(*) FROM sessions s JOIN session_drivers d ON d.session_id=s.id
      LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
      JOIN session_laps l ON l.session_id=d.session_id AND l.driver_ordinal=d.driver_ordinal WHERE s.layout_key=? AND d.is_human=1`).all('spa_gp') as Array<{ detail: string }>).map(r => r.detail);
    expect(comparePlan.some(detail => /^SCAN (d|l|session_drivers|session_laps) /.test(detail))).toBe(false);
    const filters = { trackName: 'Spa', playerOnly: false, humansOnly: true };
    const actual = queryCompactComparableLaps(db, filters, { page: 2, pageSize: 2 });
    const expected = extractComparableLaps(sessions.filter(session => session.trackVenue === 'Spa'), filters);
    // The extraction helper infers player identity from the duplicated name; the SQL contract uses
    // the persisted is_player fact, so drop that known false-positive from its display oracle.
    const expectedVisible = expected.laps.filter(item => !(item.sessionId === 'spa-a' && item.driverOrdinal === 1));
    expect(actual.total).toBe(expectedVisible.length);
    expect(actual.laps.map(item => [item.sessionId, item.driverOrdinal, item.lapOrdinal, item.lapTime]))
      .toEqual(expectedVisible.slice(2, 4).map(item => [item.sessionId, item.driverOrdinal, item.lapOrdinal, item.lapTime]));
    expect(actual.overallTrackBestLap?.sessionId).toBe('spa-b');
    expect(actual.laps.some(item => item.sessionId === 'silverstone')).toBe(false);

    const selected = queryCompactComparableLaps(db, { ...filters, humansOnly: false, sessionId: 'spa-a', driverOrdinal: 1, lapOrdinal: 0 }, { pageSize: 1 });
    expect(selected.laps.map(item => [item.sessionId, item.driverOrdinal, item.lapOrdinal])).toEqual([['spa-a', 1, 0]]);
    expect(selected.laps[0].isPlayer).toBe(false);
    paceTarget.percentage = 83;
    const reread = queryCompactComparableLaps(db, { ...filters, sessionId: 'spa-a', driverOrdinal: 0, lapOrdinal: 0 }, { pageSize: 1 });
    expect(reread.laps[0].pacePercentage).toBe(83);
    db.close();
  });
});
