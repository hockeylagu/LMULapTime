import { describe, expect, it } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { layoutPassKey, placeLayout } from '../../../server/corners/cornerPassService.js';
import { readCornerHabitTrends, readSessionCornerAnalysis, type CornerAnalysisReader } from '../../../server/corners/cornerAnalysisService.js';
import {
  getAnalysisSession, listAnalysisSessions, listPlayerAnalysisPasses, listReferenceAnalysisPasses, REFERENCE_OVERALL,
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

/** Sessions at the square, each car with counted laps 2..n through the first turn, braking at `brakeM`. */
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
});

describe('readSessionCornerAnalysis', () => {
  it("compares the player's counted laps with the session's quickest other driver of the class", () => {
    const { db, add } = fixture();
    add('s1', 0, 'Ann', true, 90, [2100, 2100, 2100, 2100]);
    add('s1', 1, 'Bob', false, 100, [2000, 2000, 2000]);
    // Quicker, but in another session; and the player's own other session is never a reference.
    add('s0', 0, 'Ann', true, 100, [1500, 1500, 1500]);
    add('s0', 1, 'Dee', false, 100, [1900, 1900, 1900]);
    const analysis = readSessionCornerAnalysis(reader(db), 's1', loadTrack);
    expect(analysis).toMatchObject({ layoutKey: 'square', carClass: 'GT3', driverOrdinal: 0, laps: 4 });
    const corner = analysis?.corners.find(item => item.id === TURN);
    expect(corner?.reference).toMatchObject({ name: 'Bob', sameSession: true, laps: 3 });
    expect(analysis?.habits.map(habit => [habit.turnId, habit.rule, habit.gap])).toEqual([[TURN, 'brakeEarly', 10]]);
    // Against the player's session before: braking 10 m earlier than then, a habit that session did not have.
    expect(analysis?.sinceLast?.session).toEqual({ sessionId: 's0', timestamp: 0, sessionType: 'Race' });
    expect(analysis?.sinceLast?.habits).toMatchObject([{ turnId: TURN, rule: 'brakeEarly', isNew: true, cue: 'brake 10 m earlier' }]);
  });

  it("follows each corner's habit over the player's latest sessions: how often it showed, and one fixed since", () => {
    const { db, add } = fixture();
    add('s1', 0, 'Ann', true, 90, [2100, 2100, 2100, 2100]);
    add('s1', 1, 'Bob', false, 100, [2000, 2000, 2000]);
    add('s2', 0, 'Ann', true, 92, [2080, 2080, 2080, 2080]);
    add('s2', 1, 'Bob', false, 100, [2000, 2000, 2000]);
    add('s3', 0, 'Ann', true, 100, [2000, 2000, 2000, 2000]);
    add('s3', 1, 'Bob', false, 100, [2000, 2000, 2000]);
    const improving = readSessionCornerAnalysis(reader(db), 's2', loadTrack)?.sinceLast?.progress;
    const resolved = readSessionCornerAnalysis(reader(db), 's3', loadTrack)?.sinceLast?.progress;
    expect(improving).toMatchObject([{ turnId: TURN, rule: 'brakeEarly', status: 'improving', cue: 'brake 2 m later' }]);
    expect(resolved).toMatchObject([{ turnId: TURN, rule: 'brakeEarly', status: 'resolved', cue: 'brake 8 m later' }]);
    const trend = readCornerHabitTrends(reader(db), 'square', 'GT3', '', loadTrack).get(TURN);
    expect(trend).toMatchObject({ session: { sessionId: 's3' }, habit: null, seen: 0, of: 3, since: { sessionId: 's2' }, change: null });
    expect(trend?.fixed).toMatch(/^Brake 8 m later/);
    // Up to s2: the habit showed in both sessions read, and the brake point moved 2 m later since s1.
    db.prepare("DELETE FROM session_drivers WHERE session_id = 's3'").run();
    const before = readCornerHabitTrends(reader(db), 'square', 'GT3', 'car a', loadTrack).get(TURN);
    expect(before).toMatchObject({ habit: { rule: 'brakeEarly' }, seen: 2, of: 2, change: { isNew: false, cue: 'brake 2 m later' }, fixed: null });
    expect(readCornerHabitTrends(reader(db), 'square', 'GT3', 'car b', loadTrack).size).toBe(0);
  });

  it('is null without the session or its counted passes', () => {
    const { db } = fixture();
    expect(readSessionCornerAnalysis(reader(db), 'missing', loadTrack)).toBeNull();
  });
});

describe('listReferenceAnalysisPasses', () => {
  it('reads the quickest drivers by usual lap time: overall, in each car and in each analysed session', () => {
    const { db, add } = fixture();
    add('s1', 0, 'Ann', true, 90, [2100, 2100], 100);
    // The analysed session's three quickest and each car's quickest there, however slow; its fourth in car A is left out.
    ['Slow', 'Slower', 'Slowest', 'Last'].forEach((name, i) => add('s1', i + 1, name, false, 100, [2000, 2000], 200 + i));
    add('s1', 5, 'Slow B', false, 100, [2000, 2000], 300, 2);
    // Other sessions: twelve drivers in car A, one in car B slower than all of them, one on a single lap.
    for (let i = 0; i < 12; i++) add(`s${10 + i}`, 1, `A${i}`, false, 100, [2000, 2000, 2000], 90 + i);
    add('s30', 1, 'B0', false, 100, [2000, 2000, 2000], 150, 2);
    add('s31', 1, 'Once', false, 100, [2000], 50);
    const names = (minLaps: number) => new Set(listReferenceAnalysisPasses(db, {
      layoutKey: 'square', carClass: 'GT3', buildPrefix: layoutPassKey(layout), sessionIds: ['s1'],
    }, minLaps).map(row => row.driverName));
    const quickest = Array.from({ length: REFERENCE_OVERALL }, (_, i) => `A${i}`);
    expect([...names(2)].toSorted()).toEqual(['B0', 'Slow', 'Slow B', 'Slower', 'Slowest', ...quickest].toSorted());
    // A driver under the minimum laps has no usual and is never shortlisted; at a minimum of one lap, Once is.
    expect(names(2).has('Once')).toBe(false);
    expect(names(1).has('Once')).toBe(true);
  });
});
