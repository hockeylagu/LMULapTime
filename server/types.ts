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
  top3LapsCount?: number;
  lapsCount: number;
  laps: LapData[];
}

export interface SessionWeather {
  condition: 'Dry' | 'Wet' | 'Damp';
  timeOfDay: 'Morning' | 'Daytime' | 'Evening' | 'Night';
  weatherString: string;
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
