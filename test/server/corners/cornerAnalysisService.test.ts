import { describe, expect, it } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { layoutPassKey, placeLayout } from '../../../server/corners/cornerPassService.js';
import {
  pinnedCornerTurns, readCornerHabitTrends, readSessionCornerAnalysis, type CornerAnalysisReader,
} from '../../../server/corners/cornerAnalysisService.js';
import { addHabitFocusPin, listHabitFocusPins, removeHabitFocusPins } from '../../../server/core/dbHabitFocusStore.js';
import {
  getAnalysisSession, listAnalysisSessions, listPlayerAnalysisPasses, listReferenceAnalysisPasses, TARGET_CANDIDATES,
} from '../../../server/core/replay/dbCornerAnalysisStore.js';
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
const KEY = `${layoutPassKey(layout)}|sig`;

/** Sessions at the square, each car with counted laps 2..n through the first turn, braking at `brakeM`; its true pace is its lap time over 3 laps. */
function fixture(): { db: DatabaseType; add: (session: string, ordinal: number, name: string, player: boolean, brakeM: number, toApexMs: number[], lapTime?: number, vehicle?: number) => void } {
  const db = memoryDatabase().getDb();
  db.prepare("INSERT INTO vehicles (vehicle_id, car_type, car_class) VALUES (1, 'Car A', 'GT3'), (2, 'Car B', 'GT3')").run();
  const names = new Map<string, number>();
  const sessions = new Set<string>();
  return {
    db,
    add(session, ordinal, name, player, brakeM, toApexMs, lapTime, vehicle = 1) {
      const file = `${session}.Vcr`;
      if (!sessions.has(session)) {
        sessions.add(session);
        db.prepare(`INSERT INTO sessions (id, filename, file_path, file_mtime_ms, file_size_bytes, timestamp, track_venue, track_course,
          session_type, session_name, updated_at, layout_key) VALUES (?, ?, '', 0, 0, ?, 'Square', 'Square', 'Race', 'R', 0, 'square')`)
          .run(session, `${session}.xml`, Number(session.replace(/\D/g, '')) * 1000);
        db.prepare('INSERT INTO session_recordings (session_id, recording_name) VALUES (?, ?)').run(session, file);
        db.prepare("INSERT INTO replay_corner_pass_builds (filename, version_key, layout_key, pass_count, built_at) VALUES (?, ?, 'square', 0, 0)").run(file, KEY);
      }
      if (!names.has(name)) {
        names.set(name, names.size + 1);
        db.prepare('INSERT INTO drivers (driver_id, name, normalized_name) VALUES (?, ?, ?)').run(names.size, name, name.toLowerCase());
      }
      db.prepare(`INSERT INTO session_drivers (session_id, driver_ordinal, driver_id, vehicle_id, is_player, is_human, driver_class)
        VALUES (?, ?, ?, ?, ?, 1, 'GT3')`).run(session, ordinal, names.get(name), vehicle, player ? 1 : 0);
      db.prepare('INSERT INTO replay_driver_roster (filename, driver_name, driver_slot) VALUES (?, ?, ?)').run(file, name.toLowerCase(), ordinal + 10);
      const paced = Math.min(3, toApexMs.length);
      db.prepare(`INSERT INTO session_driver_condition_summaries (session_id, driver_ordinal, condition_group, clean_count, clean_time_sum,
        clean_time_square_sum, fastest_three_count, fastest_three_time_sum) VALUES (?, ?, 'dry', ?, 0, 0, ?, ?)`)
        .run(session, ordinal, toApexMs.length, paced, paced * (lapTime ?? 100));
      toApexMs.forEach((ms, index) => {
        db.prepare(`INSERT INTO session_laps (session_id, driver_ordinal, lap_ordinal, lap_number, lap_time, is_valid, is_pit_stop, is_out_lap, condition_group)
          VALUES (?, ?, ?, ?, ?, 1, 0, 0, 'dry')`).run(session, ordinal, index, index + 2, lapTime ?? 100);
        db.prepare(`INSERT INTO replay_corner_passes (filename, driver_slot, lap_number, segment, entry_ms, min_speed_after_ms, duration_ms,
          entry_speed_dkmh, min_speed_dkmh, exit_speed_dkmh, min_speed_dm, brake_dm, min_speed_gear, peak_brake_pm, brake_ms,
          part_throttle_ms, abs_ms) VALUES (?, ?, ?, ?, 0, ?, ?, 1500, 800, 1200, 1000, ?, 3, 900, 1000, 500, 0)`)
          .run(file, ordinal + 10, index + 2, TURN, ms, ms + 2000, brakeM * 10);
      });
    },
  };
}

const reader = (db: DatabaseType): CornerAnalysisReader => ({
  getAnalysisSession: sessionId => getAnalysisSession(db, sessionId),
  listAnalysisSessions: (layoutKey, carClass) => listAnalysisSessions(db, layoutKey, carClass),
  getSequenceMap: () => null,
  listPlayerAnalysisPasses: scope => listPlayerAnalysisPasses(db, scope),
  listReferenceAnalysisPasses: (scope, minLaps) => listReferenceAnalysisPasses(db, scope, minLaps),
  listHabitFocusPins: scope => listHabitFocusPins(db, scope),
});

const PIN = { layoutKey: 'square', carClass: 'GT3' };
/** The benchmark target of the square for GT3: 99 s. */
const targetSecOf = (layoutKey: string, carClass: string) => (layoutKey === 'square' && carClass === 'GT3' ? 99 : null);
const noTarget = () => null;

describe('readSessionCornerAnalysis', () => {
  it("compares the player's counted laps with the layout's target: the best true pace of the class, in any session", () => {
    const { db, add } = fixture();
    add('s1', 0, 'Ann', true, 90, [2100, 2100, 2100, 2100]);
    // The session's own quickest through the turn, on a slower pace than Bob's in another session.
    add('s1', 1, 'Dee', false, 100, [1900, 1900, 1900], 101);
    // The player's own other session is never a target, whatever its pace.
    add('s0', 0, 'Ann', true, 100, [1500, 1500, 1500], 90);
    add('s0', 1, 'Bob', false, 100, [2000, 2000, 2000], 99);
    const analysis = readSessionCornerAnalysis(reader(db), 's1', noTarget, loadTrack);
    expect(analysis).toMatchObject({ layoutKey: 'square', carClass: 'GT3', car: 'Car A', driverOrdinal: 0, laps: 4, target: { name: 'Bob', sessionId: 's0', paceSec: 99 } });
    const corner = analysis?.corners.find(item => item.id === TURN);
    expect(corner?.reference).toMatchObject({ name: 'Bob', sessionId: 's0', laps: 3 });
    // The same target for the player's other session.
    expect(readSessionCornerAnalysis(reader(db), 's0', noTarget, loadTrack)?.corners.find(item => item.id === TURN)?.reference).toMatchObject({ name: 'Bob', sessionId: 's0' });
    expect(analysis?.habits.map(habit => [habit.turnId, habit.rule, habit.gap])).toEqual([[TURN, 'brakeEarly', 10]]);
    // The habit's first session, after one without it: a one-off does not pick the focus yet.
    expect(analysis?.focus).toEqual({ sessions: 2, corners: [], progress: [] });
    // No benchmark target stored for the layout and class: no goal.
    expect(analysis?.goal).toBeNull();
  });

  it("puts the session's true pace against the benchmark target of its layout and class, whoever is the target driver", () => {
    const { db, add } = fixture();
    add('s1', 0, 'Ann', true, 90, [2100, 2100, 2100, 2100]);
    // The quickest driver in the database is 3 s under the benchmark target: the goal does not follow them.
    add('s1', 1, 'Bob', false, 100, [2000, 2000, 2000], 96);
    const goal = readSessionCornerAnalysis(reader(db), 's1', targetSecOf, loadTrack)?.goal;
    // A true pace of 100 s against a benchmark target of 99: 101.01%, Competitive; Alien starts at 100.5% (99.495 s).
    expect(goal).toMatchObject({ benchmarkSec: 99, percent: 101.01, level: 'Competitive', next: { level: 'Alien', maxPercent: 100.5 } });
    expect(goal?.next?.toFindSec).toBeCloseTo(0.505);
    // Two clean laps are a true pace in qualifying only (a qualifying lap is not a lucky lap).
    add('s20', 0, 'Ann', true, 90, [2100, 2100]);
    expect(readSessionCornerAnalysis(reader(db), 's20', targetSecOf, loadTrack)?.goal).toBeNull();
    db.prepare("UPDATE sessions SET session_type = 'Qualifying' WHERE id = 's20'").run();
    expect(readSessionCornerAnalysis(reader(db), 's20', targetSecOf, loadTrack)?.goal).toMatchObject({ percent: 101.01, level: 'Competitive' });
  });

  it('walks the focus over the sessions of any kind in the car, with the progress on its corners', () => {
    const { db, add } = fixture();
    for (const [session, brakeM, toApex] of [['s1', 90, 2100], ['s2', 92, 2080], ['s3', 100, 2000]] as const) {
      add(session, 0, 'Ann', true, brakeM, [toApex, toApex, toApex, toApex]);
      add(session, 1, 'Bob', false, 100, [2000, 2000, 2000]);
    }
    db.prepare("UPDATE sessions SET session_type = 'Qualifying' WHERE id = 's2'").run();
    // The first session's habit is its focus, with nothing before it to compare with.
    expect(readSessionCornerAnalysis(reader(db), 's1', noTarget, loadTrack)?.focus).toMatchObject({ sessions: 1, corners: [{ cornerId: TURN, pinTurnId: TURN, pinned: false, habit: { rule: 'brakeEarly' } }], progress: [] });
    // The brake point moved 2 m later: under a step, nothing tried yet.
    const second = readSessionCornerAnalysis(reader(db), 's2', noTarget, loadTrack)?.focus;
    expect(second?.progress).toMatchObject([{ cornerId: TURN, state: 'focus', since: { sessionId: 's1' }, gap: { rule: 'brakeEarly', unit: 'm', before: 10, now: 8 }, tried: null }]);
    expect(second?.progress[0].view).not.toBeNull();
    // Level with Bob in the third: the corner stays the focus while its last sessions named a habit, with what the try did;
    // "then" is the session before (s2), the span the try reads.
    const third = readSessionCornerAnalysis(reader(db), 's3', noTarget, loadTrack)?.focus;
    expect(third).toMatchObject({ sessions: 3, corners: [{ cornerId: TURN, habit: null }] });
    expect(third?.corners[0].costSec).toBeCloseTo(0);
    expect(third?.progress).toMatchObject([{ since: { sessionId: 's2' }, gap: null, tried: { action: 'brakeLater', did: 'braked 8 m later', worked: true } }]);
    expect(third?.progress[0].costThenSec).toBeCloseTo(0.08);
    // Another car in the same class continues the same habit history.
    add('s4', 0, 'Ann', true, 90, [2100, 2100, 2100, 2100], undefined, 2);
    expect(readSessionCornerAnalysis(reader(db), 's4', noTarget, loadTrack)).toMatchObject({ car: 'Car B', focus: { sessions: 4 } });
  });


  it('is null without the session or its counted passes', () => {
    const { db } = fixture();
    expect(readSessionCornerAnalysis(reader(db), 'missing', noTarget, loadTrack)).toBeNull();
  });
});

describe('readCornerHabitTrends', () => {
  it("follows each corner over the class's sessions (or a single car when filtered), with the focus of the same walk and the driver's pins", () => {
    const { db, add } = fixture();
    for (const [session, brakeM, toApex] of [['s1', 90, 2100], ['s2', 92, 2080], ['s3', 100, 2000]] as const) {
      add(session, 0, 'Ann', true, brakeM, [toApex, toApex, toApex, toApex]);
      add(session, 1, 'Bob', false, 100, [2000, 2000, 2000]);
    }
    const trends = readCornerHabitTrends(reader(db), 'square', 'GT3', '', loadTrack);
    const trend = trends.get(TURN);
    expect(trend).toMatchObject({ session: { sessionId: 's3' }, habit: null, focus: 'focus', pinTurnId: TURN, slipping: false, gap: null });
    expect(trend?.series.map(point => [point.session.sessionId, Number(point.costSec.toFixed(2)), point.gap])).toEqual([['s1', 0.1, null], ['s2', 0.08, null], ['s3', 0, null]]);
    expect(trend?.view).toMatchObject({ lap: { sessionId: 's3' }, reference: { name: 'Bob' } });
    // Up to s2 the habit stands, and its gap is followed over the sessions.
    db.prepare("DELETE FROM session_drivers WHERE session_id = 's3'").run();
    const before = readCornerHabitTrends(reader(db), 'square', 'GT3', 'car a', loadTrack).get(TURN);
    expect(before).toMatchObject({ habit: { rule: 'brakeEarly' }, gap: { rule: 'brakeEarly', unit: 'm' }, series: [{ gap: 10 }, { gap: 8 }] });
    // Pinned by the driver.
    addHabitFocusPin(db, { ...PIN, turnId: TURN }, 1);
    expect(readCornerHabitTrends(reader(db), 'square', 'GT3', '', loadTrack).get(TURN)?.focus).toBe('pinned');
    expect(readSessionCornerAnalysis(reader(db), 's2', noTarget, loadTrack)?.focus.corners).toMatchObject([{ cornerId: TURN, pinned: true }]);
    expect(readCornerHabitTrends(reader(db), 'square', 'GT3', 'car b', loadTrack)).toEqual(new Map());
  });
});

describe('pins and the layout goal', () => {
  it('finds the corner a pin lands on and what is pinned there', () => {
    const { db } = fixture();
    const other = layout.turns[1].id;
    expect(pinnedCornerTurns(reader(db), PIN, TURN, loadTrack)).toEqual({ cornerTurnIds: [TURN], pinnedHere: [], pinnedCorners: 0 });
    addHabitFocusPin(db, { ...PIN, turnId: TURN }, 1);
    // Stored once, however often it is asked for.
    addHabitFocusPin(db, { ...PIN, turnId: TURN }, 2);
    expect(pinnedCornerTurns(reader(db), PIN, TURN, loadTrack)).toEqual({ cornerTurnIds: [TURN], pinnedHere: [TURN], pinnedCorners: 1 });
    expect(pinnedCornerTurns(reader(db), PIN, other, loadTrack)).toEqual({ cornerTurnIds: [other], pinnedHere: [], pinnedCorners: 1 });
    // Another class's pins are its own.
    expect(listHabitFocusPins(db, { ...PIN, carClass: 'Hyper' })).toEqual([]);
    expect(pinnedCornerTurns(reader(db), PIN, 999, loadTrack)).toBeNull();
    removeHabitFocusPins(db, PIN, [TURN]);
    removeHabitFocusPins(db, PIN, []);
    expect(listHabitFocusPins(db, PIN)).toEqual([]);
  });

});

describe('listReferenceAnalysisPasses', () => {
  it('reads the best true paces of the class at the layout and the best of each car, with their pace', () => {
    const { db, add } = fixture();
    add('s1', 0, 'Ann', true, 90, [2100, 2100, 2100], 80);
    // Six drivers in car A, one in car B slower than all of them, and two with no true pace: two laps, then one.
    for (let i = 0; i < 6; i++) add(`s${10 + i}`, 1, `A${i}`, false, 100, [2000, 2000, 2000], 90 + i);
    add('s30', 1, 'B0', false, 100, [2000, 2000, 2000], 150, 2);
    add('s31', 1, 'Twice', false, 100, [2000, 2000], 50);
    add('s32', 1, 'Once', false, 100, [2000], 50);
    const rows = (minLaps: number) => listReferenceAnalysisPasses(db, { layoutKey: 'square', carClass: 'GT3', buildPrefix: layoutPassKey(layout) }, minLaps);
    const best = Array.from({ length: TARGET_CANDIDATES }, (_, i) => `A${i}`);
    // The player and a driver without three clean laps are never read, at any minimum of counted laps.
    expect([...new Set(rows(1).map(row => row.driverName))].toSorted()).toEqual(['B0', ...best].toSorted());
    expect(new Set(rows(1).filter(row => row.driverName === 'A1').map(row => row.paceSec))).toEqual(new Set([91]));
    // A driver under the minimum counted laps is no candidate.
    expect(rows(4)).toEqual([]);
  });
});
