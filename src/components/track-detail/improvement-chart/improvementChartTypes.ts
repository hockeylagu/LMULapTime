import { PaceCategory } from '../../../../shared/types/index.js';

export interface ImprovementChartPoint {
  chartKey: string;
  shortSession: string;
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
