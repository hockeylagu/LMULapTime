import { bool, int, orNull, real, text, type Field } from './fields.js';

/** Scalars of the session that have no column on `sessions` before normalization. */
export const SESSION_FIELDS: readonly Field[] = [
  text('trackEvent', 'track_event'),
  orNull(real('trackLengthMeters', 'track_length_meters')),
  text('timeString', 'time_string'),
  text('weatherInfo', 'weather_info'),
  text('gameVersion', 'game_version'),
  int('totalLapsCount', 'total_laps_count'),
  bool('hasDuckDbTelemetry', 'has_duckdb_telemetry'),
  text('duckdbFilename', 'duckdb_filename'),
];

export const WEATHER_FIELDS: readonly Field[] = [
  text('condition', 'weather_condition'),
  text('timeOfDay', 'weather_time_of_day'),
  text('weatherString', 'weather_string'),
];

export const SETTINGS_FIELDS: readonly Field[] = [
  text('modeSetting', 'settings_mode_setting'),
  text('serverName', 'settings_server_name'),
  real('damageMultiplier', 'settings_damage_multiplier'),
  real('fuelMultiplier', 'settings_fuel_multiplier'),
  real('tireMultiplier', 'settings_tire_multiplier'),
  bool('tireWarmers', 'settings_tire_warmers'),
  bool('fixedSetups', 'settings_fixed_setups'),
  real('freeSettings', 'settings_free_settings'),
  bool('fixedUpgrades', 'settings_fixed_upgrades'),
  real('parcFerme', 'settings_parc_ferme'),
  real('mechFailRate', 'settings_mech_fail_rate'),
  real('durationMinutes', 'settings_duration_minutes'),
  real('raceLaps', 'settings_race_laps'),
  real('raceTimeMinutes', 'settings_race_time_minutes'),
  text('vehiclesAllowed', 'settings_vehicles_allowed'),
];

export const BEST_SESSION_LAP_FIELDS: readonly Field[] = [
  text('driverName', 'best_session_lap_driver'),
  text('carType', 'best_session_lap_car_type'),
  real('lapTime', 'best_session_lap_time'),
  text('lapTimeString', 'best_session_lap_time_string'),
];

/**
 * The replay link. Its DuckDB flag and file are not stored here: the session's main file lives on
 * `sessions` (has_duckdb_telemetry, duckdb_filename) and the reader puts it back on the link.
 */
export const RECORDING_FIELDS: readonly Field[] = [
  text('name', 'recording_name'),
  text('path', 'path'),
  real('sizeBytes', 'size_bytes'),
  text('eventTitle', 'event_title'),
  int('splitNo', 'split_no'),
  text('eventType', 'event_type'),
  real('durationSec', 'duration_sec'),
  bool('hasRain', 'has_rain'),
  real('maxRainIntensity', 'max_rain_intensity'),
  text('weatherCondition', 'weather_condition'),
  real('ambientTemp', 'ambient_temp'),
  real('trackTemp', 'track_temp'),
];

/**
 * Driver text kept once in a dictionary (drivers, vehicles, teams) and referenced by id; a NULL id is
 * an absent property. Names are exact: a name is a dictionary key, never a person.
 */
/** The two link properties that mirror the session's DuckDB attachment (not columns of session_recordings). */
export const LINK_TELEMETRY_FIELDS: readonly Field[] = [
  bool('hasDuckDbTelemetry', 'has_duckdb_telemetry'),
  text('duckdbFilename', 'duckdb_filename'),
];

export const DRIVER_DICTIONARY_FIELDS: readonly Field[] = [
  text('name', 'name'),
  text('carType', 'car_type'),
  text('carClass', 'car_class'),
  text('teamName', 'team_name'),
];

/** The driver scalars stored as columns of session_drivers. */
export const DRIVER_FIELDS: readonly Field[] = [
  text('carNumber', 'car_number'),
  bool('isPlayer', 'is_player'),
  int('position', 'position'),
  int('classPosition', 'class_position'),
  orNull(real('bestLapTime', 'best_lap_time')),
  text('bestLapTimeString', 'best_lap_time_string'),
  int('bestLapNum', 'best_lap_num'),
  text('driverName', 'driver_name'),
  orNull(real('bestS1', 'best_s1')),
  orNull(real('bestS2', 'best_s2')),
  orNull(real('bestS3', 'best_s3')),
  orNull(real('theoreticalBest', 'theoretical_best')),
  text('theoreticalBestString', 'theoretical_best_string'),
  bool('bestLapWet', 'best_lap_wet'),
  real('avgLapTime', 'avg_lap_time'),
  text('avgLapTimeString', 'avg_lap_time_string'),
  real('avgFuelPerLap', 'avg_fuel_per_lap'),
  real('estFuelStintLaps', 'est_fuel_stint_laps'),
  real('avgVePerLap', 'avg_ve_per_lap'),
  real('estVeStintLaps', 'est_ve_stint_laps'),
  int('gridPosition', 'grid_position'),
  int('classGridPosition', 'class_grid_position'),
  int('positionGain', 'position_gain'),
  int('classPositionGain', 'class_position_gain'),
  text('finishStatus', 'finish_status'),
  text('dnfReason', 'dnf_reason'),
  int('pitStopsCount', 'pit_stops_count'),
  int('lapsLedCount', 'laps_led_count'),
  int('highestPosition', 'highest_position'),
  int('lowestPosition', 'lowest_position'),
  text('finishGapToLeaderString', 'finish_gap_to_leader_string'),
  int('top3LapsCount', 'top3_laps_count'),
  int('lapsCount', 'laps_count'),
  int('totalIncidents', 'total_incidents'),
  int('totalTrackLimits', 'total_track_limits'),
  int('totalPenalties', 'total_penalties'),
];

/** Every scalar of a driver, for the canonical form. */
export const DRIVER_ALL_FIELDS: readonly Field[] = [...DRIVER_DICTIONARY_FIELDS, ...DRIVER_FIELDS];

export const TIRE_WEAR_FIELDS: readonly Field[] = [
  real('fl', 'tire_wear_fl'),
  real('fr', 'tire_wear_fr'),
  real('rl', 'tire_wear_rl'),
  real('rr', 'tire_wear_rr'),
  real('avg', 'tire_wear_avg'),
];

export const CONDITION_FIELDS: readonly Field[] = [
  bool('wetTyres', 'condition_wet_tyres'),
  real('rain', 'condition_rain'),
];

export const LAP_FIELDS: readonly Field[] = [
  int('lapNum', 'lap_num'),
  int('position', 'position'),
  orNull(real('lapTime', 'lap_time')),
  text('lapTimeString', 'lap_time_string'),
  orNull(real('s1', 's1')),
  orNull(real('s2', 's2')),
  orNull(real('s3', 's3')),
  orNull(real('topSpeed', 'top_speed')),
  text('fCompound', 'f_compound'),
  text('rCompound', 'r_compound'),
  text('flCompound', 'fl_compound'),
  text('frCompound', 'fr_compound'),
  text('rlCompound', 'rl_compound'),
  text('rrCompound', 'rr_compound'),
  real('fuel', 'fuel'),
  real('fuelUsed', 'fuel_used'),
  real('virtualEnergy', 'virtual_energy'),
  real('virtualEnergyUsed', 'virtual_energy_used'),
  real('elapsedSeconds', 'elapsed_seconds'),
  text('elapsedTimeString', 'elapsed_time_string'),
  real('pitStopDuration', 'pit_stop_duration'),
  text('pitStopDurationString', 'pit_stop_duration_string'),
  real('gapToLeader', 'gap_to_leader'),
  text('gapToLeaderString', 'gap_to_leader_string'),
  bool('isPitStop', 'is_pit_stop'),
  bool('isOutLap', 'is_out_lap'),
  text('nonRepresentativeReason', 'non_representative_reason'),
  bool('isValid', 'is_valid'),
  bool('isInferred', 'is_inferred'),
  int('incidentCount', 'incident_count'),
  int('trackLimitCount', 'track_limit_count'),
  int('penaltyCount', 'penalty_count'),
];

/** Properties of a lap and of a driver that are not stored: filled at read time. */
export const READ_TIME_LAP_PROPS = ['paceCategory', 'pacePercentage', 'target100Sec', 'pitService'] as const;
export const READ_TIME_DRIVER_PROPS = ['bestLapPaceCategory', 'bestLapPacePercentage'] as const;

export type EventKind = 'incident' | 'trackLimit' | 'penalty';
export interface EventListSpec { kind: EventKind; prop: 'incidents' | 'trackLimits' | 'penalties'; bit: number; fields: readonly Field[] }

const incidentFields: readonly Field[] = [
  text('type', 'incident_type'), text('description', 'description'), text('details', 'details'), int('lapNum', 'lap_num'),
  real('elapsedSeconds', 'elapsed_seconds'), real('force', 'force'), text('otherVehicle', 'other_vehicle'), bool('isWallImpact', 'is_wall_impact'),
];
const trackLimitFields: readonly Field[] = [
  text('description', 'description'), int('lapNum', 'lap_num'), real('elapsedSeconds', 'elapsed_seconds'),
  real('warningPoints', 'warning_points'), real('currentPoints', 'current_points'), text('action', 'limit_action'),
];
const penaltyFields: readonly Field[] = [
  text('penalty', 'penalty_name'), text('reason', 'penalty_reason'), int('lapNum', 'lap_num'),
  real('elapsedSeconds', 'elapsed_seconds'), text('description', 'description'),
];

/** The three event lists of a driver (and of a lap), in the order their rows are numbered. */
export const EVENT_LISTS: readonly EventListSpec[] = [
  { kind: 'incident', prop: 'incidents', bit: 1, fields: incidentFields },
  { kind: 'trackLimit', prop: 'trackLimits', bit: 2, fields: trackLimitFields },
  { kind: 'penalty', prop: 'penalties', bit: 4, fields: penaltyFields },
];

/** Every event column once, for the table definition. */
export const EVENT_COLUMNS: readonly Field[] = (() => {
  const seen = new Map<string, Field>();
  for (const list of EVENT_LISTS) for (const field of list.fields) if (!seen.has(field.col)) seen.set(field.col, field);
  return [...seen.values()];
})();
