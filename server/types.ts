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

export interface ReferenceLaptimesCache {
  lastUpdated: string; // ISO string timestamp
  sourceUrl: string;
  entriesCount: number;
  entries: Record<string, ReferenceLaptimeEntry>;
}

export interface TireWear {
  fl: number; // Front Left tire wear % remaining (0-100)
  fr: number; // Front Right tire wear % remaining (0-100)
  rl: number; // Rear Left tire wear % remaining (0-100)
  rr: number; // Rear Right tire wear % remaining (0-100)
  avg: number; // 4-wheel average wear % remaining (0-100)
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
  isValid: boolean;
  paceCategory?: PaceCategory | null;
  pacePercentage?: number | null;
  target100Sec?: number | null;
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
  top3LapsCount?: number;
  lapsCount: number;
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
  };
}

export interface DetailedSession extends SessionMetadata {
  drivers: DriverData[];
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
