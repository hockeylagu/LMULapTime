export type PaceCategory = 'Alien' | 'Competitive' | 'Good' | 'Midpack' | 'Tail-ender' | 'Offline';

export interface PaceCategoryInfo {
  category: PaceCategory;
  percentage: number; // e.g. 101.2 for 101.2%
  target100Sec: number | null;
  deltaToTargetSec: number | null;
}

export interface ReferenceLaptimeEntry {
  key: string;              // e.g. "Bahrain (wec)_LMGT3"
  trackName: string;        // e.g. "Bahrain (wec)"
  carClass: string;         // e.g. "LMGT3"
  patch: string;            // e.g. "1.4+"
  target100Sec: number;     // ~100% reference time in seconds
  targets: {
    alienSec: number;       // ~100%
    competitiveSec: number; // 101%
    goodSec: number;        // 102%
    goodMidpackSec: number; // 103%
    midpackSec: number;     // 104%
    midpackTailSec: number; // 105%
    tailEnderSec: number;   // 106%
    offlineSec: number;     // 107%
  };
  fastestCar?: string;
  recordLaptimeSec?: number;
}

export interface ReferenceBenchmarkDiffItem {
  key: string;
  trackName: string;
  carClass: string;
  patch: string;
  type: 'added' | 'updated' | 'removed';
  oldAlienSec?: number;
  newAlienSec?: number;
  oldAlienTimeString?: string;
  newAlienTimeString?: string;
  diffSec?: number;
  oldPatch?: string;
  newPatch?: string;
}

export interface ReferenceBenchmarkDiff {
  timestamp: string;
  hasChanges: boolean;
  addedCount: number;
  updatedCount: number;
  removedCount: number;
  totalEntries: number;
  added: ReferenceBenchmarkDiffItem[];
  updated: ReferenceBenchmarkDiffItem[];
  removed: ReferenceBenchmarkDiffItem[];
}

export interface ReferenceLaptimesCache {
  lastUpdated: string; // ISO string timestamp
  sourceUrl: string;
  entriesCount: number;
  entries: Record<string, ReferenceLaptimeEntry>;
  lastUpdateDiff?: ReferenceBenchmarkDiff | null;
}

export interface TireWear {
  fl: number; // Front Left tire wear % remaining (0-100)
  fr: number; // Front Right tire wear % remaining (0-100)
  rl: number; // Rear Left tire wear % remaining (0-100)
  rr: number; // Rear Right tire wear % remaining (0-100)
  avg: number; // 4-wheel average wear % remaining (0-100)
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
  elapsedSeconds?: number | null; // Session elapsed seconds at lap finish (et)
  elapsedTimeString?: string; // Formatted MM:SS or HH:MM:SS
  pitStopDuration?: number | null; // Estimated pit lane / stop time in seconds
  pitStopDurationString?: string; // Formatted pit duration (e.g. "32.4s")
  gapToLeader?: number | null; // Gap to session leader at lap finish (seconds)
  gapToLeaderString?: string; // Formatted gap (e.g. "+4.215s" or "LEADER")
  isPitStop: boolean;
  isOutLap?: boolean; // Out-lap immediately following a pit stop
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
  bestLapPaceCategory?: PaceCategory | null;
  bestLapPacePercentage?: number | null;
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
  condition: 'Dry' | 'Wet';
  timeOfDay: 'Morning' | 'Daytime' | 'Evening' | 'Night';
  weatherString: string;
}

export interface SessionSettings {
  modeSetting?: string;       // e.g. "Race Weekend", "Multiplayer", "Single Player"
  serverName?: string;        // Server name for multiplayer
  damageMultiplier?: number;  // e.g. 50 (%) or 100 (%)
  fuelMultiplier?: number;    // e.g. 1 (1x)
  tireMultiplier?: number;    // e.g. 1 (1x)
  tireWarmers?: boolean;      // true if TireWarmers === 1
  fixedSetups?: boolean;      // true if FixedSetups === 1
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
  };
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
}

export interface TrackSummary {
  trackVenue: string;
  sessionsCount: number;
  totalLaps: number;
  bestLapTime: number | null;
  bestLapDriver: string;
  bestLapCar: string;
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  carsUsed: string[];
}

export interface AppStatus {
  resultsDir: string;
  resultsExist: boolean;
  replaysDir: string;
  replaysExist: boolean;
  playerName?: string;
  sessionsCount: number;
  tracksCount: number;
  referenceLaptimes?: {
    lastUpdated: string | null;
    entriesCount: number;
    lastUpdateDiff?: ReferenceBenchmarkDiff | null;
  };
  sqliteCache?: {
    enabled: boolean;
    dbPath: string;
    sessionsCount: number;
    lastSyncedAt: string | null;
    dbSizeBytes: number;
  };
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
}

export interface ReplayEventInfo {
  eventId?: string;
  eventTitle?: string;
  eventType?: string;
  sceneDesc?: string;
  seriesId?: string;
  session?: string;
  splitNo?: number;
  [key: string]: unknown;
}

export interface ReplayDriverEntry {
  slot?: number;
  name: string;
  vehicleId?: string;
  carModel?: string;
  carClass?: string;
  team?: string;
  carNumber?: string;
  livery?: string;
  entryTime?: number;
  exitTime?: number;
  isPlayer?: boolean;
}

export interface ReplayMetadata {
  filename: string;
  filePath: string;
  fileSizeBytes: number;
  mtimeMs: number;
  eventInfo?: ReplayEventInfo | null;
  eventTitle?: string;
  sessionType?: string;
  privateSession?: boolean;
  scn?: string;
  aiw?: string;
  trackName?: string;
  trackVersion?: string;
  modUid?: string;
  trackPath?: string;
  timeSliceCount: number;
  totalEvents: number;
  durationSec: number;
  startTimeSec?: number;
  endTimeSec?: number;
  drivers: ReplayDriverEntry[];
  laps?: ReplayLapSummary[];
}

export interface ReplayTrajectoryPoint {
  x: number;
  y: number;
  z: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  speedKmh?: number;
  throttle?: number;
  brake?: number;
  steerYaw?: number;
  rpm?: number;
  inPit?: boolean;
  inGarage?: boolean;
  isTeleport?: boolean;
  timeSec?: number;
  tcActive?: boolean;
  absActive?: boolean;
  pitLimiter?: boolean;
  isOffTrack?: boolean;
  detachablePartState?: number;
}

export interface ReplayPenaltyEvent {
  driverSlot: number;
  driverName?: string;
  timeSec: number;
  penaltyText: string;
  penaltyType?: string;
  action: 'given' | 'served' | 'removed';
}

export interface ReplayPitEvent {
  driverSlot: number;
  driverName?: string;
  timeSec: number;
  code: number;
  action: string;
  details?: string;
}

export type ReplayTelemetryPoint = ReplayTrajectoryPoint;

export interface ReplayLapSummary {
  lapNumber: number;
  lapTimeSec: number;
  lapDistMeters?: number;
  s1Sec: number;
  s2Sec: number;
  s3Sec: number;
  isOutlap?: boolean;
  isBest?: boolean;
  isValid?: boolean;
  startFrame?: number;
  endFrame?: number;
  // Validation info from matched session log (if available)
  validatedTimeSec?: number | null;
  validatedS1Sec?: number | null;
  validatedS2Sec?: number | null;
  validatedS3Sec?: number | null;
  timeDiffSec?: number | null;
}

export interface ReplayTrajectoryValidation {
  matchedSessionId: string;
  sessionType?: string;
  trackName?: string;
  driverName?: string;
  totalSessionLaps: number;
  officialBestLapTime?: number | null;
  officialLaps?: Array<{
    lapNumber: number;
    lapTimeSec?: number | null;
    s1Sec?: number | null;
    s2Sec?: number | null;
    s3Sec?: number | null;
    isValid?: boolean;
  }>;
}

export interface ReplayTrajectoryData {
  replayName: string;
  driverSlot?: number;
  driverName?: string;
  pointsCount: number;
  rawPointsCount?: number;
  rawSampleRateHz?: number;
  maxPoints?: number;
  isFullResolution?: boolean;
  currentLap?: number;
  laps?: ReplayLapSummary[];
  sectors?: {
    s1Frame: number;
    s2Frame: number;
  };
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    spanX: number;
    spanZ: number;
  };
  points: ReplayTrajectoryPoint[];
  penalties?: ReplayPenaltyEvent[];
  pitEvents?: ReplayPitEvent[];
  sessionRunningOrder?: number[];
  validation?: ReplayTrajectoryValidation | null;
}

export interface ReplaySummary {
  name: string;
  path: string;
  sizeBytes: number;
  fileSizeBytes?: number;
  mtime: number;
  mtimeMs?: number;
  trackName?: string;
  sessionCode?: string;
  durationSec?: number;
  eventTitle?: string;
  splitNo?: number;
  eventType?: string;
  driversCount?: number;
  matchedSessionId?: string;
}
