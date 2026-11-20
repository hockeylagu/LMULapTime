import { Database as DatabaseType } from 'better-sqlite3';
import type { MapSequence } from '../../../shared/domain/cornerSequences/sequenceMap.js';
import type { SequenceMapSummary } from '../../../shared/types/corners/sequenceMaps.js';

/** A lap a sequence map was built from or checked against. */
export interface MapLapRef {
  filename: string;
  slot: number;
  lapNumber: number;
  lapTimeSec: number;
  driver: string;
}

export interface StoredMapSequence extends MapSequence {
  /** The driver's own laps against the map: same grouping, and how far their start sits (metres); null without a check. */
  check: { same: boolean; offsetM: number | null } | null;
}

/** A layout and class's turn sequence map as stored (corner_sequence_maps, its sequences and its laps). */
export interface StoredSequenceMap {
  layoutKey: string;
  carClass: string;
  mapKey: string;
  lengthM: number;
  sequences: StoredMapSequence[];
  laps: MapLapRef[];
  checkLaps: MapLapRef[];
}

const ids = (text: string): number[] => text ? text.split(',').map(Number) : [];
const dm = (m: number): number => Math.round(m * 10);

export function getSequenceMap(db: DatabaseType, layoutKey: string, carClass: string): StoredSequenceMap | null {
  const map = db.prepare('SELECT map_key, length_m FROM corner_sequence_maps WHERE layout_key = ? AND car_class = ?')
    .get(layoutKey, carClass) as { map_key: string; length_m: number } | undefined;
  if (!map) return null;
  const sequences = (db.prepare(`
    SELECT turn_ids, exit_turn_ids, start_dm, min_dm, spread_median_dm, spread_max_dm, lap_count, check_same, check_offset_dm
    FROM corner_sequence_map_sequences WHERE layout_key = ? AND car_class = ? ORDER BY start_dm
  `).all(layoutKey, carClass) as Array<{ turn_ids: string; exit_turn_ids: string; start_dm: number; min_dm: number; spread_median_dm: number;
    spread_max_dm: number; lap_count: number; check_same: number | null; check_offset_dm: number | null }>).map((row): StoredMapSequence => ({
    turnIds: ids(row.turn_ids), exitTurnIds: ids(row.exit_turn_ids), startM: row.start_dm / 10, minM: row.min_dm / 10,
    startSpreadM: { median: row.spread_median_dm / 10, max: row.spread_max_dm / 10 }, lapCount: row.lap_count,
    check: row.check_same === null ? null : { same: row.check_same === 1, offsetM: row.check_offset_dm === null ? null : row.check_offset_dm / 10 },
  }));
  const laps = db.prepare(`
    SELECT role, filename, driver_slot slot, lap_number lapNumber, lap_time_ms, driver_name driver FROM corner_sequence_map_laps
    WHERE layout_key = ? AND car_class = ? ORDER BY lap_time_ms
  `).all(layoutKey, carClass) as Array<Omit<MapLapRef, 'lapTimeSec'> & { role: string; lap_time_ms: number }>;
  const refs = (role: string) => laps.filter(lap => lap.role === role)
    .map(({ filename, slot, lapNumber, lap_time_ms, driver }) => ({ filename, slot, lapNumber, lapTimeSec: lap_time_ms / 1000, driver }));
  return { layoutKey, carClass, mapKey: map.map_key, lengthM: map.length_m, sequences, laps: refs('map'), checkLaps: refs('check') };
}

/** Replaces a layout and class's map, its sequences and laps in one transaction; its last check goes with the old map. */
export function replaceSequenceMap(db: DatabaseType, map: StoredSequenceMap): void {
  const { layoutKey, carClass } = map;
  db.transaction(() => {
    for (const table of ['corner_sequence_maps', 'corner_sequence_map_sequences', 'corner_sequence_map_laps', 'corner_sequence_map_checks']) {
      db.prepare(`DELETE FROM ${table} WHERE layout_key = ? AND car_class = ?`).run(layoutKey, carClass);
    }
    db.prepare('INSERT INTO corner_sequence_maps (layout_key, car_class, map_key, length_m, lap_count, built_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(layoutKey, carClass, map.mapKey, map.lengthM, map.laps.length, Date.now());
    const sequence = db.prepare(`
      INSERT INTO corner_sequence_map_sequences (layout_key, car_class, first_turn, turn_ids, exit_turn_ids, start_dm, min_dm,
        spread_median_dm, spread_max_dm, lap_count, check_same, check_offset_dm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of map.sequences) {
      sequence.run(layoutKey, carClass, item.turnIds[0], item.turnIds.join(','), item.exitTurnIds.join(','), dm(item.startM), dm(item.minM),
        dm(item.startSpreadM.median), dm(item.startSpreadM.max), item.lapCount,
        item.check === null ? null : item.check.same ? 1 : 0, item.check?.offsetM == null ? null : dm(item.check.offsetM));
    }
    const lap = db.prepare(`
      INSERT INTO corner_sequence_map_laps (layout_key, car_class, role, filename, driver_slot, lap_number, lap_time_ms, driver_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [role, laps] of [['map', map.laps], ['check', map.checkLaps]] as const) {
      for (const item of laps) lap.run(layoutKey, carClass, role, item.filename, item.slot, item.lapNumber, Math.round(item.lapTimeSec * 1000), item.driver);
    }
  })();
}

/**
 * A replay's laps a map may be built from, with how many turn passes each has: timed laps the parser counts as clean
 * and dry, its session's results lap of the car's driver (matched by name); for a lap no matched session holds, the
 * replay's own flags (valid, not lap 1 or an out-lap).
 */
export function listSequenceCandidateLaps(db: DatabaseType, filename: string): Array<{ slot: number; lapNumber: number; lapTimeSec: number; passes: number }> {
  return db.prepare(`
    WITH car_driver AS MATERIALIZED (
      SELECT r.driver_slot slot, sd.session_id, sd.driver_ordinal
      FROM replay_driver_roster r
      JOIN session_recordings rec ON rec.recording_name = r.filename
      JOIN session_drivers sd ON sd.session_id = rec.session_id
      JOIN drivers d ON d.driver_id = sd.driver_id AND d.normalized_name = r.driver_name
      WHERE r.filename = $filename
    )
    SELECT slot, lapNumber, lapTimeSec, passes FROM (
      SELECT l.driver_slot slot, l.lap_number lapNumber, l.lap_time_sec lapTimeSec, l.is_valid, l.is_out_lap,
        (SELECT COUNT(*) FROM replay_corner_passes p WHERE p.filename = l.filename AND p.driver_slot = l.driver_slot AND p.lap_number = l.lap_number) passes,
        (SELECT MIN(sl.is_clean = 1 AND sl.condition_group = 'dry') FROM car_driver c
          JOIN session_laps sl ON sl.session_id = c.session_id AND sl.driver_ordinal = c.driver_ordinal AND sl.lap_number = l.lap_number
          WHERE c.slot = l.driver_slot) parser_clean
      FROM replay_laps l
      WHERE l.filename = $filename AND l.lap_time_sec > 0
    )
    WHERE CASE WHEN parser_clean IS NULL THEN lapNumber > 1 AND is_valid = 1 AND COALESCE(is_out_lap, 0) = 0 ELSE parser_clean = 1 END
  `).all({ filename }) as Array<{ slot: number; lapNumber: number; lapTimeSec: number; passes: number }>;
}

/** The fastest laps of the map's last check (role 'fresh'); none before its first. */
export function getSequenceMapFreshLaps(db: DatabaseType, layoutKey: string, carClass: string): MapLapRef[] {
  return (db.prepare(`
    SELECT filename, driver_slot slot, lap_number lapNumber, lap_time_ms, driver_name driver FROM corner_sequence_map_laps
    WHERE layout_key = ? AND car_class = ? AND role = 'fresh' ORDER BY lap_time_ms
  `).all(layoutKey, carClass) as Array<Omit<MapLapRef, 'lapTimeSec'> & { lap_time_ms: number }>)
    .map(({ lap_time_ms, ...lap }) => ({ ...lap, lapTimeSec: lap_time_ms / 1000 }));
}

/** Records a map's check against the class's fastest laps of the day, and those laps, in one transaction. */
export function recordSequenceMapCheck(
  db: DatabaseType, layoutKey: string, carClass: string, check: { agrees: boolean; detail: string }, freshLaps: readonly MapLapRef[]
): void {
  db.transaction(() => {
    db.prepare(`
      INSERT INTO corner_sequence_map_checks (layout_key, car_class, checked_at, agrees, detail) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(layout_key, car_class) DO UPDATE SET checked_at = excluded.checked_at, agrees = excluded.agrees, detail = excluded.detail
    `).run(layoutKey, carClass, Date.now(), check.agrees ? 1 : 0, check.detail);
    db.prepare(`DELETE FROM corner_sequence_map_laps WHERE layout_key = ? AND car_class = ? AND role = 'fresh'`).run(layoutKey, carClass);
    const lap = db.prepare(`
      INSERT INTO corner_sequence_map_laps (layout_key, car_class, role, filename, driver_slot, lap_number, lap_time_ms, driver_name)
      VALUES (?, ?, 'fresh', ?, ?, ?, ?, ?)
    `);
    for (const item of freshLaps) lap.run(layoutKey, carClass, item.filename, item.slot, item.lapNumber, Math.round(item.lapTimeSec * 1000), item.driver);
  })();
}

/** Every map with its counts and checks, by layout and class. */
export function listSequenceMaps(db: DatabaseType): SequenceMapSummary[] {
  const rows = db.prepare(`
    SELECT m.layout_key, m.car_class, m.lap_count, m.built_at,
      (SELECT COUNT(*) FROM corner_sequence_map_sequences s WHERE s.layout_key = m.layout_key AND s.car_class = m.car_class) sequence_count,
      (SELECT COUNT(*) FROM corner_sequence_map_sequences s WHERE s.layout_key = m.layout_key AND s.car_class = m.car_class
        AND s.check_same IS NOT NULL) own_checked,
      (SELECT COUNT(*) FROM corner_sequence_map_sequences s WHERE s.layout_key = m.layout_key AND s.car_class = m.car_class
        AND s.check_same = 1) own_same,
      (SELECT COUNT(*) FROM corner_sequence_map_sequences s WHERE s.layout_key = m.layout_key AND s.car_class = m.car_class
        AND ABS(s.check_offset_dm) > 100) own_off,
      c.checked_at, c.agrees, c.detail
    FROM corner_sequence_maps m
    LEFT JOIN corner_sequence_map_checks c ON c.layout_key = m.layout_key AND c.car_class = m.car_class
    ORDER BY m.layout_key, m.car_class
  `).all() as Array<{ layout_key: string; car_class: string; lap_count: number; built_at: number; sequence_count: number; own_checked: number;
    own_same: number; own_off: number; checked_at: number | null; agrees: number | null; detail: string | null }>;
  return rows.map(row => ({
    layoutKey: row.layout_key, carClass: row.car_class, lapCount: row.lap_count, sequenceCount: row.sequence_count, builtAt: row.built_at,
    ownCheck: { checked: row.own_checked, same: row.own_same, startOff: row.own_off },
    check: row.checked_at === null ? null : { checkedAt: row.checked_at, agrees: row.agrees === 1, detail: row.detail ?? '' },
  }));
}