import type { PaceCategory } from './reference.js';
import type { LapTraffic } from './raceTraffic.js';
import type { PitService } from './pitStops.js';

export interface TireWear {
  fl: number; // Front Left tire wear % remaining (0-100)
  fr: number; // Front Right tire wear % remaining (0-100)
  rl: number; // Rear Left tire wear % remaining (0-100)
  rr: number; // Rear Right tire wear % remaining (0-100)
  avg: number; // 4-wheel average wear % remaining (0-100)
}

/** Why a racing lap does not show the driver's pace: contact or damage, overtaking or following, or far off their median lap. */
export type NonRepresentativeReason = 'contact' | 'traffic' | 'offPace';

/**
 * What set a lap apart from dry running (shared/domain/lapConditions.ts). Absent on a dry lap: dry
 * is the default. A lap with conditions is judged against the driver's other laps in the same
 * conditions (off pace, consistency), not against their dry laps.
 */
export interface LapConditions {
  wetTyres?: boolean; // On wet tyres (the XML compound)
  rain?: number; // Peak rain during the lap from the linked replay (raw, 0-255); only from RAIN_WET_MIN
}

export interface LapIncident {
  type: 'contact' | 'damage' | 'other';
  description: string;
  details?: string;
  lapNum?: number;
  elapsedSeconds?: number;
  force?: number;
  otherVehicle?: string;
  isWallImpact?: boolean;
}

export interface LapTrackLimit {
  description: string;
  lapNum?: number;
  elapsedSeconds?: number;
  warningPoints?: number;
  currentPoints?: number;
  action?: string; // e.g. "Warning", "No Further Action"
}

export interface LapPenalty {
  penalty: string; // e.g. "Drive Thru", "Stop and Go"
  reason: string; // e.g. "Speeding", "Jumped the start"
  lapNum?: number;
  elapsedSeconds?: number;
  description: string;
}

export interface LapData {
  lapNum: number;
  position: number;
  lapTime: number | null; // seconds, null if incomplete/invalid
  lapTimeString: string;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  topSpeed: number | null;
  fCompound: string;
  rCompound: string;
  flCompound?: string;
  frCompound?: string;
  rlCompound?: string;
  rrCompound?: string;
  tireWear?: TireWear;
  fuel?: number | null; // Remaining fuel % (0-100)
  fuelUsed?: number | null; // Fuel consumed in lap %
  virtualEnergy?: number | null; // Remaining Virtual Energy % (0-100) for Hypercar
  virtualEnergyUsed?: number | null; // Virtual Energy consumed in lap %
  elapsedSeconds?: number | null; // Session elapsed seconds when the lap starts (et): the previous lap's line crossing
  elapsedTimeString?: string; // Formatted MM:SS or HH:MM:SS
  pitStopDuration?: number | null; // Estimated pit lane / stop time in seconds
  pitStopDurationString?: string; // Formatted pit duration (e.g. "32.4s")
  pitService?: PitService; // The stop on this in-lap, from the linked replay, added when the session is read
  gapToLeader?: number | null; // Gap to session leader at lap finish (seconds)
  gapToLeaderString?: string; // Formatted gap (e.g. "+4.215s" or "LEADER")
  isPitStop: boolean;
  isOutLap?: boolean; // Out-lap immediately following a pit stop
  nonRepresentativeReason?: NonRepresentativeReason; // Set by the parser; left out of averages and consistency
  traffic?: LapTraffic; // Set by the parser from every car's line crossings
  conditions?: LapConditions; // Wet tyres or rain on the lap; absent when dry
  isValid: boolean;
  isInferred?: boolean; // Inferred from session elapsed time for incomplete laps
  paceCategory?: PaceCategory | null;
  pacePercentage?: number | null;
  target100Sec?: number | null;
  incidents?: LapIncident[];
  trackLimits?: LapTrackLimit[];
  penalties?: LapPenalty[];
  incidentCount?: number;
  trackLimitCount?: number;
  penaltyCount?: number;
}

export interface ReplayCacheSummary {
  filename: string;
  fileSizeBytes: number;
  compressedSizeBytes: number;
  updatedAt: number;
  // The .Vcr file's on-disk modification time - the closest proxy we have for when the
  // replay/session actually took place, as opposed to `updatedAt` (when it was cached).
  replayDateMs: number;
  trackName?: string;
  driversCount: number;
  durationSec?: number;
  eventTitle?: string;
  trajectoriesCached: number;
  parserVersion?: string;
  replayVersion?: string;
  isOnDisk?: boolean;
}

export interface DriverData {
  name: string;
  carType: string;
  carClass: string;
  carNumber: string;
  teamName: string;
  isPlayer: boolean;
  position: number;
  classPosition: number;
  bestLapTime: number | null;
  bestLapTimeString: string;
  bestLapNum?: number | null;
  driverName?: string;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  theoreticalBestString: string;
  bestLapPaceCategory?: PaceCategory | null; // The best lap against the dry benchmark; absent when it was wet
  bestLapPacePercentage?: number | null;
  bestLapWet?: boolean; // The best lap was run in the wet (it carries conditions), so it is not rated against the dry benchmark
  avgLapTime?: number | null;
  avgLapTimeString?: string;
  avgFuelPerLap?: number | null; // Avg fuel consumed per clean lap (%)
  estFuelStintLaps?: number | null; // Estimated laps on full tank
  avgVePerLap?: number | null; // Avg Virtual Energy consumed per clean lap (%)
  estVeStintLaps?: number | null; // Estimated laps per full VE allocation (Hypercar)
  gridPosition?: number | null;
  classGridPosition?: number | null;
  positionGain?: number | null;
  classPositionGain?: number | null;
  finishStatus?: string; // e.g. "Finished Normally", "DNF", "DQ", "DNS"
  dnfReason?: string;
  pitStopsCount?: number;
  lapsLedCount?: number;
  highestPosition?: number | null;
  lowestPosition?: number | null;
  finishGapToLeaderString?: string;
  top3LapsCount?: number;
  lapsCount: number;
  totalIncidents?: number;
  totalTrackLimits?: number;
  totalPenalties?: number;
  incidents?: LapIncident[];
  trackLimits?: LapTrackLimit[];
  penalties?: LapPenalty[];
  laps: LapData[];
}

export interface SessionWeather {
  condition: 'Dry' | 'Wet' | string;
  timeOfDay: 'Morning' | 'Daytime' | 'Evening' | 'Night';
  weatherString: string;
}

export interface SessionSettings {
  modeSetting?: string;       // e.g. "Race Weekend", "Multiplayer", "Single Player"
  serverName?: string;        // Server name for multiplayer
  damageMultiplier?: number;  // e.g. 50 (%) or 100 (%)
  fuelMultiplier?: number;    // e.g. 1 (1x)
  tireMultiplier?: number;    // e.g. 1 (1x)
  tireWarmers?: boolean;      // true if tire warmers / tire blankets are enabled (false if cold tires)
  fixedSetups?: boolean;      // true if fixed setups enforced (via FixedSetups=1 or FreeSettings bitmask)
  freeSettings?: number;      // raw FreeSettings bitmask (e.g. 63, 2147483647, 11, 0)
  fixedUpgrades?: boolean;    // true if FixedUpgrades === 1
  parcFerme?: number;         // e.g. 3
  mechFailRate?: number;      // e.g. 1
  durationMinutes?: number;   // e.g. 60, 120
  raceLaps?: number;
  raceTimeMinutes?: number;
  vehiclesAllowed?: string;   // e.g. "Ferrari_488_GTE_EVO,"
}

export interface SessionMetadata {
  id: string;
  filename: string;
  filePath: string;
  trackVenue: string;
  trackCourse: string;
  trackEvent: string;
  trackLengthMeters: number | null;
  timeString: string;
  timestamp: number; // Unix timestamp in seconds or ms
  sessionType: 'Practice' | 'Qualifying' | 'Race' | 'Unknown';
  sessionName: string; // e.g. "P1", "Q1", "R1"
  weatherInfo?: string;
  weather?: SessionWeather;
  settings?: SessionSettings;
  gameVersion?: string;
  driversCount: number;
  playerDriver?: DriverData;
  bestSessionLap?: {
    driverName: string;
    carType: string;
    lapTime: number;
    lapTimeString: string;
  };
  matchingReplayFile?: {
    name: string;
    path: string;
    sizeBytes: number;
    eventTitle?: string;
    splitNo?: number;
    eventType?: string;
    durationSec?: number;
    hasDuckDbTelemetry?: boolean;
    duckdbFilename?: string;
    hasRain?: boolean;
    maxRainIntensity?: number;
    weatherCondition?: 'Dry' | 'Wet' | 'Dynamic Weather';
    ambientTemp?: number;
    trackTemp?: number;
  };
  hasDuckDbTelemetry?: boolean;
  duckdbFilename?: string;
}

/**
 * Why a replay cannot be a session's recording. 'owned-by-other-session': LMU saved one replay for
 * a run of sessions and it records a different one of them.
 */
export type ReplayLinkRejectionReason = 'session-type' | 'time-window' | 'layout' | 'owned-by-other-session';

export interface RejectedReplayLink {
  replayName: string;
  reason: ReplayLinkRejectionReason;
  rejectedAt: number;
}

export interface DetailedSession extends SessionMetadata {
  drivers: DriverData[];
  totalLapsCount?: number;
}

export interface SessionProgressionPoint {
  sessionId: string;
  timestamp: number;
  dateString: string;
  sessionType: string;
  sessionName?: string;
  trackVenue: string;
  trackCourse?: string;
  displayTrack?: string;
  weatherInfo?: string;
  carType: string;
  carClass: string;
  driverName: string;
  bestLapTime: number | null;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  cleanLapsCount: number;
  totalLapsCount: number;
  avgLapTime: number | null;
  top3AvgLapTime?: number | null;
  consistencyScore?: number | null;
  theoreticalGap?: number | null;
  matchingReplayFile?: string;
  settings?: { serverName?: string };
}

export interface TrackSummary {
  trackVenue: string;
  sessionsCount: number;
  totalLaps: number;
  bestLapTime: number | null;
  bestLapDriver: string;
  bestLapCar: string;
  bestLapClass?: string;
  bestLapWet?: boolean; // The track best was run in the wet: no rating against the dry benchmark
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  carsUsed: string[];
  lastSessionTimestamp?: number;
}

export interface FuelStrategyData {
  avgFuel: number;
  estFuelLaps: number | null;
  avgVe: number | null;
  estVeLaps: number | null;
  optimalRatio: number | null;
  zeroWasteFuelPct: number | null;
  limiter: 've' | 'fuel' | 'balanced' | null;
  lapDelta: number;
  surplusFuelPct: number;
}

export interface ComparableLap {
  id: string;
  sessionId?: string;
  sessionName?: string;
  sessionType?: string;
  dateString?: string;
  timestamp?: number;
  driverName: string;
  carType: string;
  carClass: string;
  lapNum?: number;
  lapTime: number | null;
  lapTimeString: string;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  s1String?: string;
  s2String?: string;
  s3String?: string;
  topSpeed: number | null;
  fCompound?: string;
  rCompound?: string;
  flCompound?: string;
  frCompound?: string;
  rlCompound?: string;
  rrCompound?: string;
  tireWear?: TireWear;
  fuel?: number | null;
  fuelUsed?: number | null;
  virtualEnergy?: number | null;
  virtualEnergyUsed?: number | null;
  elapsedSeconds?: number | null;
  elapsedTimeString?: string;
  pitStopDurationString?: string;
  gapToLeaderString?: string;
  isPitStop?: boolean;
  isOutLap?: boolean;
  nonRepresentativeReason?: NonRepresentativeReason;
  isValid: boolean;
  isInferred?: boolean;
  paceCategory?: PaceCategory | null;
  pacePercentage?: number | null;
  isTheoreticalBest?: boolean;
  isSessionBest?: boolean;
  isAllTimePB?: boolean;
  isOverallTrackBest?: boolean;
  isBenchmarkTarget?: boolean;
  benchmarkCategory?: string;
  isPlayer?: boolean;
  tag?: string;
  matchingReplayFile?: string;
  hasRain?: boolean;
  weatherCondition?: 'Dry' | 'Wet' | 'Dynamic Weather';
}
