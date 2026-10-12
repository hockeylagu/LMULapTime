import type { Database } from 'better-sqlite3';
import type { ComparableLap, DetailedSession, LapData } from '../../../shared/types/index.js';
import { unpackFields, type Row } from '../sessionRows/fields.js';
import { LAP_FIELDS, TIRE_WEAR_FIELDS } from '../sessionRows/specs.js';
import { group } from '../sessionRows/reader.js';
import { createPaceCalculator } from '../../benchmarks/referenceLaptimes.js';
import { toComparableLap } from '../../sessions/sessionAnalytics.js';

export interface ComparisonLapLocator {
  session_id: string;
  driver_ordinal: number;
  lap_ordinal: number;
}

interface ComparisonLapRow extends Row, ComparisonLapLocator {
  session_name: string; session_type: DetailedSession['sessionType']; time_string: string; timestamp: number;
  track_venue: string; track_course: string; track_length_meters: number | null;
  driver_name: string; car_type: string; car_class: string; best_lap_time: number | null; is_player: number;
  recording_name: string | null; path: string | null; size_bytes: number | null;
  has_rain: number | null; weather_condition: NonNullable<DetailedSession['matchingReplayFile']>['weatherCondition'] | null;
}

export function comparisonLapKey(lap: ComparisonLapLocator): string {
  return `${lap.session_id}_driver_${lap.driver_ordinal}_lap_${lap.lap_ordinal}`;
}

/** Read only the page's exact laps and best-lap locators, without driver histories or event lists. */
export function readComparisonLapRows(db: Database, locators: ComparisonLapLocator[]): Map<string, ComparableLap> {
  const unique = new Map(locators.map(lap => [comparisonLapKey(lap), lap]));
  if (!unique.size) return new Map();
  const rows = db.prepare(`SELECT l.session_id,l.driver_ordinal,l.lap_ordinal,
      ${[...LAP_FIELDS, ...TIRE_WEAR_FIELDS].map(field => `l.${field.col}`).join(',')},
      s.session_name,s.session_type,s.time_string,s.timestamp,
      s.track_venue,s.track_course,s.track_length_meters,
      dn.name driver_name,v.car_type,v.car_class,d.best_lap_time,d.is_player_driver is_player,
      r.recording_name,r.path,r.size_bytes,r.has_rain,r.weather_condition
    FROM json_each(?) picked
    JOIN session_laps l ON l.session_id=json_extract(picked.value,'$.session_id')
      AND l.driver_ordinal=json_extract(picked.value,'$.driver_ordinal')
      AND l.lap_ordinal=json_extract(picked.value,'$.lap_ordinal')
    JOIN sessions s ON s.id=l.session_id
    JOIN session_drivers d ON d.session_id=l.session_id AND d.driver_ordinal=l.driver_ordinal
    LEFT JOIN drivers dn ON dn.driver_id=d.driver_id LEFT JOIN vehicles v ON v.vehicle_id=d.vehicle_id
    LEFT JOIN session_recordings r ON r.session_id=s.id`).all(JSON.stringify([...unique.values()])) as ComparisonLapRow[];
  const paceFor = createPaceCalculator();
  return new Map(rows.map(row => {
    const lap = unpackFields(row, LAP_FIELDS) as unknown as LapData;
    const tireWear = group(row, TIRE_WEAR_FIELDS);
    if (tireWear) lap.tireWear = tireWear as unknown as LapData['tireWear'];
    lap.lapOrdinal = row.lap_ordinal;
    const pace = lap.isValid && lap.lapTime ? paceFor(lap.lapTime, row.track_venue, row.track_course,
      row.car_class, row.car_type, row.track_length_meters) : null;
    lap.paceCategory = pace?.category;
    lap.pacePercentage = pace?.percentage;
    const dto = toComparableLap({
      id: row.session_id, sessionName: row.session_name, sessionType: row.session_type,
      timeString: row.time_string, timestamp: row.timestamp,
      matchingReplayFile: row.recording_name === null ? undefined : {
        name: row.recording_name, path: row.path ?? '', sizeBytes: row.size_bytes ?? 0,
        hasRain: row.has_rain === null ? undefined : Boolean(row.has_rain),
        weatherCondition: row.weather_condition ?? undefined,
      },
    }, { name: row.driver_name, carType: row.car_type, carClass: row.car_class, driverOrdinal: row.driver_ordinal }, lap, {
      isPlayer: Boolean(row.is_player),
      isSessionBest: lap.lapTime !== null && row.best_lap_time !== null && Math.abs(lap.lapTime - row.best_lap_time) < 0.0005,
    });
    return [comparisonLapKey(row), dto];
  }));
}
