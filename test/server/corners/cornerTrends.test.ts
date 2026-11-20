import { describe, expect, it } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { layoutPassKey, mapRuleHash, placeLayout } from '../../../server/corners/cornerPassService.js';
import { minTrendPasses, readCornerTrends, type CornerTrendReader } from '../../../server/corners/cornerTrends.js';
import { listCornerTrendPasses, listCornerTrendSessions } from '../../../server/core/replay/dbCornerTrendStore.js';
import type { StoredSequenceMap } from '../../../server/core/replay/dbSequenceMapStore.js';
import { memoryDatabase } from '../../helpers/memoryDatabase.js';

// A square of 100 m sides with its start line 50 m along the centre line.
const SQUARE: Array<[number, number]> = [];
for (let i = 0; i < 400; i += 5) {
  const side = Math.floor(i / 100), along = i % 100;
  SQUARE.push(side === 0 ? [along, 0] : side === 1 ? [100, along] : side === 2 ? [100 - along, 100] : [0, 100 - along]);
}
const loadTrack = () => ({ centerline: SQUARE, projectionRevision: 'rev1', timingGates: { startFinish: { stationM: 50 } } });
const layout = placeLayout('square', loadTrack);
if (!layout) throw new Error('no layout');
const TURN = layout.turns[0].id;
const PREFIX = layoutPassKey(layout);

interface Lap { lap: number; sec: number; valid?: 0 | 1; pit?: 1; reason?: string; wet?: true }

/** Fills an in-memory database: sessions at the square, each with its drivers, laps and replay passes. */
class Fixture {
  readonly db: DatabaseType = memoryDatabase().getDb();
  private vehicles = new Map<string, number>();
  private driverIds = new Map<string, number>();

  session(id: string, timestamp: number, sessionType: string, replay: { file: string; key: string } | null): this {
    this.db.prepare(`INSERT INTO sessions (id, filename, file_path, file_mtime_ms, file_size_bytes, timestamp, track_venue, track_course,
      session_type, session_name, updated_at, layout_key) VALUES (?, ?, '', 0, 0, ?, 'Square', 'Square', ?, ?, 0, 'square')`)
      .run(id, `${id}.xml`, timestamp, sessionType, `${sessionType} ${id}`);
    if (replay) {
      this.db.prepare('INSERT INTO session_recordings (session_id, recording_name) VALUES (?, ?)').run(id, replay.file);
      for (const table of ['replay_corner_pass_builds', 'replay_sequence_pass_builds']) {
        this.db.prepare(`INSERT INTO ${table} (filename, version_key, layout_key, pass_count, built_at) VALUES (?, ?, 'square', 0, 0)`).run(replay.file, replay.key);
      }
    }
    return this;
  }

  car(sessionId: string, file: string | null, ordinal: number, name: string, opts: { player?: boolean; human?: boolean; carType?: string; carClass?: string },
    laps: Lap[]): this {
    const carType = opts.carType ?? 'Car A', carClass = opts.carClass ?? 'GT3';
    const vehicleKey = `${carType}|${carClass}`;
    if (!this.vehicles.has(vehicleKey)) {
      this.vehicles.set(vehicleKey, this.vehicles.size + 1);
      this.db.prepare('INSERT INTO vehicles (vehicle_id, car_type, car_class) VALUES (?, ?, ?)').run(this.vehicles.size, carType, carClass);
    }
    if (!this.driverIds.has(name)) {
      this.driverIds.set(name, this.driverIds.size + 1);
      this.db.prepare('INSERT INTO drivers (driver_id, name, normalized_name) VALUES (?, ?, ?)').run(this.driverIds.size, name, name.toLowerCase());
    }
    this.db.prepare(`INSERT INTO session_drivers (session_id, driver_ordinal, driver_id, vehicle_id, is_player, is_human, driver_class)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(sessionId, ordinal, this.driverIds.get(name), this.vehicles.get(vehicleKey),
      opts.player ? 1 : 0, opts.human === false ? 0 : 1, carClass);
    const slot = ordinal + 10;
    if (file) this.db.prepare('INSERT INTO replay_driver_roster (filename, driver_name, driver_slot) VALUES (?, ?, ?)').run(file, name, slot);
    laps.forEach((lap, index) => {
      this.db.prepare(`INSERT INTO session_laps (session_id, driver_ordinal, lap_ordinal, lap_number, is_valid, is_pit_stop, is_out_lap,
        non_representative_reason, condition_group) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
        .run(sessionId, ordinal, index, lap.lap, lap.valid ?? 1, lap.pit ?? 0, lap.reason ?? null, lap.wet ? 'wet' : 'dry');
      if (!file) return;
      for (const table of ['replay_corner_passes', 'replay_sequence_passes']) {
        this.db.prepare(`INSERT INTO ${table} (filename, driver_slot, lap_number, segment, entry_ms, duration_ms)
          VALUES (?, ?, ?, ?, 0, ?)`).run(file, slot, lap.lap, TURN, Math.round(lap.sec * 1000));
      }
    });
    return this;
  }

  reader(map: StoredSequenceMap | null = null): CornerTrendReader {
    return {
      getSequenceMap: () => map,
      listCornerTrendSessions: scope => listCornerTrendSessions(this.db, scope),
      listCornerTrendPasses: scope => listCornerTrendPasses(this.db, scope),
    };
  }
}

const laps = (...secs: number[]): Lap[] => secs.map((sec, index) => ({ lap: index + 2, sec }));

describe('readCornerTrends', () => {
  it("gives the player's usual through each turn per session, the class reference, and why sessions have no point", () => {
    const current = `${PREFIX}|sig`;
    const fixture = new Fixture()
      .session('s1', 1000, 'Practice1', { file: 'r1.Vcr', key: current })
      .car('s1', 'r1.Vcr', 0, 'Ann', { player: true }, [
        { lap: 1, sec: 5 }, // the first lap never counts
        { lap: 2, sec: 10 }, { lap: 3, sec: 7, valid: 0 }, { lap: 4, sec: 7, pit: 1 }, { lap: 5, sec: 7, reason: 'contact' },
        { lap: 6, sec: 11, reason: 'traffic' }, { lap: 7, sec: 12 }, { lap: 8, sec: 13 }, { lap: 9, sec: 7, wet: true },
      ])
      .car('s1', 'r1.Vcr', 1, 'Bob', {}, laps(9, 9.5, 9.2))
      .car('s1', 'r1.Vcr', 2, 'Bot', { human: false }, laps(5, 5, 5)) // AI drivers are no reference
      .car('s1', 'r1.Vcr', 3, 'Lee', { carClass: 'LMP2' }, laps(4, 4, 4)) // nor another class
      .session('s2', 2000, 'Race', { file: 'r2.Vcr', key: 'passes v0|old|sig' })
      .car('s2', 'r2.Vcr', 0, 'Ann', { player: true }, laps(9, 9, 9))
      .session('s3', 3000, 'Race', null)
      .car('s3', null, 0, 'Ann', { player: true }, laps(9, 9, 9))
      .session('s4', 4000, 'Practice', { file: 'r4.Vcr', key: current })
      .car('s4', 'r4.Vcr', 0, 'Ann', { player: true }, laps(9, 9))
      .car('s4', 'r4.Vcr', 1, 'Bob', {}, laps(8.5, 8.6, 8.7, 8.8))
      .session('s5', 5000, 'Race', { file: 'r5.Vcr', key: current })
      .car('s5', 'r5.Vcr', 0, 'Ann', { player: true, carType: 'Car B' }, laps(8, 8, 8))
      // Qualifying: the one flying lap makes a point, but another driver's single lap is no usual for the reference.
      .session('s6', 6000, 'Qualifying', { file: 'r6.Vcr', key: current })
      .car('s6', 'r6.Vcr', 0, 'Ann', { player: true }, laps(9.9))
      .car('s6', 'r6.Vcr', 1, 'Bob', {}, laps(5));

    const trends = readCornerTrends(fixture.reader(), 'square', 'GT3', 'car a ', loadTrack);
    expect(trends).toMatchObject({ kind: 'turns', minPasses: 3, sessions: { total: 5, noReplay: 1, waiting: 1, tooFewPasses: 1 } });
    const turn = trends?.corners.find(corner => corner.id === TURN);
    expect(turn?.points).toEqual([{
      sessionId: 's1', timestamp: 1000, sessionType: 'Practice1', sessionName: 'Practice1 s1', carType: 'Car A', passCount: 4,
      usualSec: 11.5, bestSec: 10,
    }, {
      sessionId: 's6', timestamp: 6000, sessionType: 'Qualifying', sessionName: 'Qualifying s6', carType: 'Car A', passCount: 1,
      usualSec: 9.9, bestSec: 9.9,
    }]);
    // Bob's usual in s4 (8.65 s, four passes) is the class's fastest; any model of the class counts.
    expect(turn?.reference).toEqual({ usualSec: 8.65, sessionId: 's4', timestamp: 4000 });
    // Every model of the class: s5's car joins.
    expect(readCornerTrends(fixture.reader(), 'square', 'GT3', '', loadTrack)?.corners.find(corner => corner.id === TURN)?.points
      .map(point => point.sessionId)).toEqual(['s1', 's5', 's6']);
  });

  it("reads the class's sequence passes of the current map only", () => {
    const map: StoredSequenceMap = { layoutKey: 'square', carClass: 'GT3', mapKey: `${mapRuleHash(layout.turnsKey)}:aaa`, lengthM: layout.lengthM,
      laps: [], checkLaps: [], sequences: [{ turnIds: [TURN], exitTurnIds: [], startM: 20, minM: 60, startSpreadM: { median: 1, max: 2 }, lapCount: 10, check: null }] };
    const fixture = new Fixture()
      .session('s1', 1000, 'Race', { file: 'r1.Vcr', key: `${PREFIX}|sig|GT3:${map.mapKey}|LMP2:none` })
      .car('s1', 'r1.Vcr', 0, 'Ann', { player: true }, laps(10, 11, 12))
      .session('s2', 2000, 'Race', { file: 'r2.Vcr', key: `${PREFIX}|sig|GT3:${map.mapKey}x` })
      .car('s2', 'r2.Vcr', 0, 'Ann', { player: true }, laps(9, 9, 9));
    const trends = readCornerTrends(fixture.reader(map), 'square', 'GT3', '', loadTrack);
    expect(trends).toMatchObject({ kind: 'sequences', sessions: { total: 2, noReplay: 0, waiting: 1, tooFewPasses: 0 } });
    expect(trends?.corners).toHaveLength(1);
    expect(trends?.corners[0]).toMatchObject({ id: TURN, label: 'SQ1', reference: null });
    expect(trends?.corners[0].points.map(point => [point.sessionId, point.usualSec])).toEqual([['s1', 11]]);
  });

  it('takes two passes on a long layout, three elsewhere', () => {
    expect([minTrendPasses(400), minTrendPasses(9_999), minTrendPasses(10_000), minTrendPasses(13_600)]).toEqual([3, 3, 2, 2]);
    // The same square drawn 30 times larger (12 km): two passes make a point, for the driver and the reference.
    const big = SQUARE.map(([x, z]): [number, number] => [x * 30, z * 30]);
    const longTrack = () => ({ centerline: big, projectionRevision: 'rev1', timingGates: { startFinish: { stationM: 1500 } } });
    const longLayout = placeLayout('square', longTrack);
    if (!longLayout) throw new Error('no layout');
    const fixture = new Fixture()
      .session('s1', 1000, 'Race', { file: 'r1.Vcr', key: `${layoutPassKey(longLayout)}|sig` })
      .car('s1', 'r1.Vcr', 0, 'Ann', { player: true }, laps(10, 12))
      .car('s1', 'r1.Vcr', 1, 'Bob', {}, laps(9, 9.4));
    const trends = readCornerTrends(fixture.reader(), 'square', 'GT3', '', longTrack);
    expect(trends?.minPasses).toBe(2);
    const turn = trends?.corners.find(corner => corner.id === longLayout.turns[0].id);
    expect(turn?.points.map(point => [point.passCount, point.usualSec])).toEqual([[2, 11]]);
    expect(turn?.reference?.usualSec).toBe(9.2);
  });

  it('is null without a centre line', () => {
    expect(readCornerTrends(new Fixture().reader(), 'square', 'GT3', '', () => null)).toBeNull();
  });
});
