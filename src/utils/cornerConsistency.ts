import type { CornerPass, CornerTurn } from '../../shared/types/corners/cornerPasses.js';

export interface LapMetricSample {
  lapNumber: number;
  value: number;
}

export interface ConsistencyMetricStat {
  count: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  consistencyPct: number;
  // Raw per-lap values (sorted by lap number) - lets the UI drill down into exactly how a
  // metric varied lap to lap, not just its aggregate spread.
  samples: LapMetricSample[];
}

export function computeMetricStat(samples: LapMetricSample[]): ConsistencyMetricStat | null {
  if (samples.length < 2) return null;
  const values = samples.map(s => s.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg,
    stdDev,
    consistencyPct: avg !== 0 ? (stdDev / Math.abs(avg)) * 100 : 0,
    samples: [...samples].sort((a, b) => a.lapNumber - b.lapNumber),
  };
}

function findSampleValue(samples: LapMetricSample[], lapNumber: number): number | undefined {
  return samples.find(s => s.lapNumber === lapNumber)?.value;
}

/**
 * Overrides a metric's Best/Worst to be its value on the lap that had the best/worst CORNER
 * TIME (rather than that metric's own independent extremes), so Best/Worst across a corner's
 * whole row set - Brake Pt, Throttle Pt, Entry, Apex, Exit - all describe the same two laps:
 * the driver's best and worst pass through that corner.
 */
export function applyTimeRelativeBestWorst(
  stat: ConsistencyMetricStat | null,
  bestLapNumber: number,
  worstLapNumber: number
): ConsistencyMetricStat | null {
  if (!stat) return null;
  const bestValue = findSampleValue(stat.samples, bestLapNumber);
  const worstValue = findSampleValue(stat.samples, worstLapNumber);
  return {
    ...stat,
    min: bestValue ?? stat.min,
    max: worstValue ?? stat.max,
  };
}

export function bestAndWorstTimeLaps(timeStat: ConsistencyMetricStat): { bestLapNumber: number; worstLapNumber: number } {
  let best = timeStat.samples[0];
  let worst = timeStat.samples[0];
  for (const sample of timeStat.samples) {
    if (sample.value < best.value) best = sample;
    if (sample.value > worst.value) worst = sample;
  }
  return { bestLapNumber: best.lapNumber, worstLapNumber: worst.lapNumber };
}

/** The metrics a corner's passes are compared on, each relative to the pass's own slowest point. */
const METRICS = ['brakingDistM', 'turnInDistM', 'throttleOnDistM', 'entrySpeedKmh', 'apexSpeedKmh', 'exitSpeedKmh'] as const;
type CornerMetric = typeof METRICS[number];

export interface CornerConsistencyStat extends Record<CornerMetric, ConsistencyMetricStat | null> {
  /** The official turn (`CornerTurn.id`) the passes went through. */
  turnId: number;
  label: string;
  title: string;
  /** The turn's apex, metres from the start line along the centre line. */
  apexM: number;
  lapsSampled: number;
  time: ConsistencyMetricStat;
  /** Where the turn's apex is on the displayed lap (its own distance), and the corner detected there; set by placeStatsOnLap. */
  lapDistM?: number | null;
  cornerNumber?: number | null;
}

/**
 * The displayed lap's own distance at a centre-line station, between the two samples around it; null when the lap
 * has no stations or never passes it. `stationM` and the samples' stations share the centre line's frame.
 */
export function lapDistanceAtStation(points: ReadonlyArray<{ stationM?: number }>, dists: readonly number[], stationM: number): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].stationM, b = points[i].stationM;
    // A sample pair across the lap's seam (station back to 0) holds no station between them.
    if (a === undefined || b === undefined || b < a) continue;
    if (stationM < a || stationM > b) continue;
    const f = b > a ? (stationM - a) / (b - a) : 0;
    return dists[i - 1] + (dists[i] - dists[i - 1]) * f;
  }
  return null;
}

/**
 * Places each turn's stats on the displayed lap: the apex's lap distance (for its mini map) and the corner the lap's
 * own detection finds there (where a click on the turn opens). Turn apexes are from the start line; `startStationM`
 * puts them on the centre line.
 */
export function placeStatsOnLap(
  stats: CornerConsistencyStat[],
  lap: { points: ReadonlyArray<{ stationM?: number }>; dists: readonly number[] },
  startStationM: number,
  trackLengthM: number,
  corners: ReadonlyArray<{ cornerNumber: number; entryDistM: number; exitDistM: number }>
): CornerConsistencyStat[] {
  return stats.map(stat => {
    const station = ((startStationM + stat.apexM) % trackLengthM + trackLengthM) % trackLengthM;
    const lapDistM = lapDistanceAtStation(lap.points, lap.dists, station);
    const corner = lapDistM === null ? undefined : corners.find(c => c.entryDistM <= lapDistM && lapDistM <= c.exitDistM);
    return { ...stat, lapDistM, cornerNumber: corner?.cornerNumber ?? null };
  });
}

/** How a turn is named on a card or a row: its label, else where it is ("km 4.1"). */
export function turnDisplayName(turn: Pick<CornerTurn, 'label' | 'apexM'>): string {
  return turn.label || `km ${(turn.apexM / 1000).toFixed(1)}`;
}

/** A pass's metrics: brake and turn-in points in metres before its slowest point, throttle in metres after it (negative before). */
export function passMetrics(pass: CornerPass): Record<CornerMetric, number | null> {
  const apex = pass.minSpeedM;
  const before = (m: number | null) => apex === null || m === null ? null : apex - m;
  return {
    brakingDistM: before(pass.brakeM),
    turnInDistM: before(pass.turnInM),
    throttleOnDistM: apex === null || pass.throttleM === null ? null : pass.throttleM - apex,
    entrySpeedKmh: pass.entrySpeedKmh,
    apexSpeedKmh: pass.minSpeedKmh,
    exitSpeedKmh: pass.exitSpeedKmh,
  };
}

function statFor(turn: CornerTurn, time: LapMetricSample[], metrics: Record<CornerMetric, LapMetricSample[]>): CornerConsistencyStat | null {
  const timeStat = computeMetricStat(time);
  if (!timeStat) return null;
  const { bestLapNumber, worstLapNumber } = bestAndWorstTimeLaps(timeStat);
  const stat = {
    turnId: turn.id, label: turnDisplayName(turn), title: turn.title, apexM: turn.apexM,
    lapsSampled: timeStat.count, time: timeStat,
  } as CornerConsistencyStat;
  for (const metric of METRICS) stat[metric] = applyTimeRelativeBestWorst(computeMetricStat(metrics[metric]), bestLapNumber, worstLapNumber);
  return stat;
}

/**
 * How repeatably a driver takes each official turn: their passes on `lapNumbers` (the laps that count),
 * turn by turn in driving order. A turn needs two passes.
 */
export function computeCornerConsistencyStats(passes: CornerPass[], turns: CornerTurn[], lapNumbers: ReadonlySet<number>): CornerConsistencyStat[] {
  const byTurn = new Map<number, CornerPass[]>();
  for (const pass of passes) {
    if (!lapNumbers.has(pass.lapNumber)) continue;
    const list = byTurn.get(pass.segment);
    if (list) list.push(pass); else byTurn.set(pass.segment, [pass]);
  }
  return turns.flatMap(turn => {
    const turnPasses = byTurn.get(turn.id) ?? [];
    const metrics = Object.fromEntries(METRICS.map(metric => [metric, [] as LapMetricSample[]])) as Record<CornerMetric, LapMetricSample[]>;
    for (const pass of turnPasses) {
      const values = passMetrics(pass);
      for (const metric of METRICS) {
        const value = values[metric];
        if (value !== null) metrics[metric].push({ lapNumber: pass.lapNumber, value });
      }
    }
    const time = turnPasses.map(pass => ({ lapNumber: pass.lapNumber, value: pass.exitSec - pass.entrySec }));
    const stat = statFor(turn, time, metrics);
    return stat ? [stat] : [];
  });
}
