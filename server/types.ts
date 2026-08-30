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
  lapsCount: number;
  laps: LapData[];
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
  trackVenue: string;
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
