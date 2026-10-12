import type { PaceCategory, SessionProgressionPoint as BaseSessionProgressionPoint } from '../../../../shared/types/index.js';

/** One session on the improvement chart: the server's progression point plus its benchmark pace category. */
export interface SessionProgressionPoint extends BaseSessionProgressionPoint {
  bestLapWet?: boolean; // The best lap was wet: no rating against the dry benchmark
  benchmarkCategory?: PaceCategory | null;
  benchmarkPercentage?: number | null;
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
}

export interface ImprovementTooltipPayloadEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string | null;
  color?: string;
  payload: ImprovementChartPoint;
}
