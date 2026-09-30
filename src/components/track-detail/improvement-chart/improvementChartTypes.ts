import { PaceCategory } from '../../../../shared/types/index.js';

/** One session on the improvement chart: the server's progression point plus its benchmark pace category. */
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
  bestLapWet?: boolean; // The best lap was wet: no rating against the dry benchmark
  bestS1: number | null;
  bestS2: number | null;
  bestS3: number | null;
  theoreticalBest: number | null;
  benchmarkCategory?: PaceCategory | null;
  benchmarkPercentage?: number | null;
  cleanLapsCount: number;
  totalLapsCount: number;
  avgLapTime: number | null;
  top3AvgLapTime?: number | null;
  consistencyScore?: number | null;
  theoreticalGap?: number | null;
  matchingReplayFile?: string;
}

export interface ImprovementChartPoint {
  chartKey: string;
  shortSession: string;
  axisLabel?: string; // Date and session, e.g. "09/25 R1"
  fullDate: string;
  sessionId: string;
  session: string;
  car: string;
  weather?: string;
  bestLap: number | null;
  top3Avg: number | null;
  top3AvgStr: string | null;
  movingAvg: number | null;
  avgLap: number | null;
  bestPr: number | null;
  lapPrDelta: number | null;
  personalBestImproved: boolean;
  benchmarkCategory?: PaceCategory | null;
  personalBestBenchmarkCategory?: PaceCategory | null;
  benchmarkPercentage: number | null;
  theoretical: number | null;
  theoreticalGap: number | null;
  consistencyScore: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  lapStr: string;
  theoreticalStr: string;
  avgLapStr: string;
  cleanLaps: number;
  replay?: string;
}

export interface ImprovementTooltipPayloadEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
  payload: ImprovementChartPoint;
}
