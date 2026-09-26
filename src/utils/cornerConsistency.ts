import { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import {
  interpolatePointAtDistance,
  getTrajectoryDistances,
} from './replayComparison.js';
import { unwrapAngle } from './computedTelemetry.js';
import {
  computeLapSegmentComparisons,
  CornerSegmentComparison,
  findThresholdCrossingDistM,
  getHeadingAtDistance,
  BRAKE_ON_THRESHOLD_PCT,
  THROTTLE_ON_THRESHOLD_PCT,
} from './cornerAnalysis.js';

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

function pushTo(map: Map<number, LapMetricSample[]>, key: number, lapNumber: number, value: number): void {
  const list = map.get(key);
  if (list) list.push({ lapNumber, value });
  else map.set(key, [{ lapNumber, value }]);
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

export interface CornerConsistencyStat {
  cornerNumber: number;
  lapsSampled: number;
  // Apex distance (m) along the reference lap's own path - useful for plotting this corner's
  // location on that lap's track map.
  minDistM: number;
  time: ConsistencyMetricStat;
  // Meters before the apex where braking began (see computeCornerConsistencyStats).
  brakingDistM: ConsistencyMetricStat | null;
  // Meters after the apex where throttle was reapplied.
  throttleOnDistM: ConsistencyMetricStat | null;
  entrySpeedKmh: ConsistencyMetricStat | null;
  apexSpeedKmh: ConsistencyMetricStat | null;
  exitSpeedKmh: ConsistencyMetricStat | null;
  turnInDistM?: ConsistencyMetricStat | null;
  rotationAtThrottlePct?: ConsistencyMetricStat | null;
}

export interface CornerConsistencyLapInput {
  lapNumber: number;
  points: ReplayTrajectoryPoint[];
}

/**
 * Measures how repeatably each corner is driven across multiple laps of the same replay.
 * Corner boundaries (entry/apex/exit) are detected once from a fixed reference lap (compared
 * against itself), so every lap is timed and sampled at those same reference distances -
 * each corner's time uses the same entry->exit window as computeLapSegmentComparisons' "vs
 * Baseline" corner table, so the two always agree on what that corner's time means. Brake/
 * throttle onset points are still reported relative to the apex (see below) for readability.
 */
export function computeCornerConsistencyStats(
  laps: CornerConsistencyLapInput[],
  referencePoints: ReplayTrajectoryPoint[],
  trackLengthM?: number
): CornerConsistencyStat[] {
  if (!referencePoints?.length || !laps?.length) return [];

  const canonicalCorners = computeLapSegmentComparisons(referencePoints, referencePoints, 6, trackLengthM)
    .filter((s): s is CornerSegmentComparison => s.type === 'corner')
    .sort((a, b) => a.minDistM - b.minDistM);
  if (canonicalCorners.length === 0) return [];

  const timesByCorner = new Map<number, LapMetricSample[]>();
  const brakingByCorner = new Map<number, LapMetricSample[]>();
  const throttleByCorner = new Map<number, LapMetricSample[]>();
  const entrySpeedByCorner = new Map<number, LapMetricSample[]>();
  const apexSpeedByCorner = new Map<number, LapMetricSample[]>();
  const exitSpeedByCorner = new Map<number, LapMetricSample[]>();
  const turnInByCorner = new Map<number, LapMetricSample[]>();
  const rotationByCorner = new Map<number, LapMetricSample[]>();

  for (const lap of laps) {
    if (!lap.points?.length) continue;
    const lapDists = getTrajectoryDistances(lap.points, trackLengthM);

    for (const corner of canonicalCorners) {
      // Same entry->exit window computeLapSegmentComparisons uses for the "vs Baseline" corner
      // table, so a corner's time here always agrees with what that table calls its Δ Time -
      // apex-to-apex would measure a different (overlapping but distinct) stretch of track.
      const entryT = interpolatePointAtDistance(lap.points, lapDists, corner.entryDistM).timeSec;
      const exitT = interpolatePointAtDistance(lap.points, lapDists, corner.exitDistM).timeSec;
      const cornerTimeSec = exitT - entryT;
      if (isFinite(cornerTimeSec) && cornerTimeSec > 0) pushTo(timesByCorner, corner.cornerNumber, lap.lapNumber, cornerTimeSec);

      pushTo(entrySpeedByCorner, corner.cornerNumber, lap.lapNumber, interpolatePointAtDistance(lap.points, lapDists, corner.entryDistM).speedKmh);
      pushTo(apexSpeedByCorner, corner.cornerNumber, lap.lapNumber, interpolatePointAtDistance(lap.points, lapDists, corner.minDistM).speedKmh);
      pushTo(exitSpeedByCorner, corner.cornerNumber, lap.lapNumber, interpolatePointAtDistance(lap.points, lapDists, corner.exitDistM).speedKmh);

      const brakingDistM = findThresholdCrossingDistM(lap.points, lapDists, corner.entryDistM, corner.minDistM, p => p.brake, BRAKE_ON_THRESHOLD_PCT);
      // Reported relative to the apex (meters BEFORE the minimum-speed point), not as an
      // absolute lap distance, so the number reads the same regardless of where on the track
      // this corner sits.
      if (brakingDistM !== null) pushTo(brakingByCorner, corner.cornerNumber, lap.lapNumber, corner.minDistM - brakingDistM);
      const throttleOnDistM = findThresholdCrossingDistM(lap.points, lapDists, corner.minDistM, corner.exitDistM, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT);
      // Reported relative to the apex too (meters AFTER the minimum-speed point).
      if (throttleOnDistM !== null) pushTo(throttleByCorner, corner.cornerNumber, lap.lapNumber, throttleOnDistM - corner.minDistM);

      const turnInDistM = findThresholdCrossingDistM(lap.points, lapDists, corner.entryDistM, corner.minDistM, p => Math.abs(p.steerYaw || 0), 5);
      if (turnInDistM !== null) pushTo(turnInByCorner, corner.cornerNumber, lap.lapNumber, corner.minDistM - turnInDistM);

      if (corner.cornerAngleDeg && corner.cornerAngleDeg > 5) {
        const initialThrDist = findThresholdCrossingDistM(lap.points, lapDists, corner.minDistM, corner.exitDistM, p => p.throttle, 15) ?? throttleOnDistM;
        if (initialThrDist !== null) {
          const hEntry = getHeadingAtDistance(lap.points, lapDists, corner.entryDistM);
          const hThr = getHeadingAtDistance(lap.points, lapDists, initialThrDist);
          const rotRad = Math.abs(unwrapAngle(hThr - hEntry));
          const totalRad = (corner.cornerAngleDeg * Math.PI) / 180;
          const rotPct = Math.min(100, Math.max(0, Math.round((rotRad / totalRad) * 100)));
          pushTo(rotationByCorner, corner.cornerNumber, lap.lapNumber, rotPct);
        }
      }
    }
  }

  const stats: CornerConsistencyStat[] = [];
  for (const corner of canonicalCorners) {
    const timeStat = computeMetricStat(timesByCorner.get(corner.cornerNumber) || []);
    if (!timeStat) continue;
    const { bestLapNumber, worstLapNumber } = bestAndWorstTimeLaps(timeStat);
    stats.push({
      cornerNumber: corner.cornerNumber,
      lapsSampled: timeStat.count,
      minDistM: corner.minDistM,
      time: timeStat,
      brakingDistM: applyTimeRelativeBestWorst(computeMetricStat(brakingByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      throttleOnDistM: applyTimeRelativeBestWorst(computeMetricStat(throttleByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      entrySpeedKmh: applyTimeRelativeBestWorst(computeMetricStat(entrySpeedByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      apexSpeedKmh: applyTimeRelativeBestWorst(computeMetricStat(apexSpeedByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      exitSpeedKmh: applyTimeRelativeBestWorst(computeMetricStat(exitSpeedByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      turnInDistM: applyTimeRelativeBestWorst(computeMetricStat(turnInByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
      rotationAtThrottlePct: applyTimeRelativeBestWorst(computeMetricStat(rotationByCorner.get(corner.cornerNumber) || []), bestLapNumber, worstLapNumber),
    });
  }
  return stats;
}

/**
 * Recomputes each corner's metric stats after dropping specific outlier laps, reusing the
 * already-fetched per-lap samples so no re-fetch/re-timing pass over telemetry is needed.
 * A corner is dropped entirely if fewer than 2 laps remain for its time metric.
 */
export function filterCornerConsistencyStats(
  stats: CornerConsistencyStat[],
  excludedLapNumbers: Set<number>
): CornerConsistencyStat[] {
  if (excludedLapNumbers.size === 0) return stats;

  const keep = (samples: LapMetricSample[]) => samples.filter(s => !excludedLapNumbers.has(s.lapNumber));

  const filtered: CornerConsistencyStat[] = [];
  for (const corner of stats) {
    const timeStat = computeMetricStat(keep(corner.time.samples));
    if (!timeStat) continue;
    const { bestLapNumber, worstLapNumber } = bestAndWorstTimeLaps(timeStat);
    filtered.push({
      cornerNumber: corner.cornerNumber,
      lapsSampled: timeStat.count,
      minDistM: corner.minDistM,
      time: timeStat,
      brakingDistM: applyTimeRelativeBestWorst(corner.brakingDistM ? computeMetricStat(keep(corner.brakingDistM.samples)) : null, bestLapNumber, worstLapNumber),
      throttleOnDistM: applyTimeRelativeBestWorst(corner.throttleOnDistM ? computeMetricStat(keep(corner.throttleOnDistM.samples)) : null, bestLapNumber, worstLapNumber),
      entrySpeedKmh: applyTimeRelativeBestWorst(corner.entrySpeedKmh ? computeMetricStat(keep(corner.entrySpeedKmh.samples)) : null, bestLapNumber, worstLapNumber),
      apexSpeedKmh: applyTimeRelativeBestWorst(corner.apexSpeedKmh ? computeMetricStat(keep(corner.apexSpeedKmh.samples)) : null, bestLapNumber, worstLapNumber),
      exitSpeedKmh: applyTimeRelativeBestWorst(corner.exitSpeedKmh ? computeMetricStat(keep(corner.exitSpeedKmh.samples)) : null, bestLapNumber, worstLapNumber),
      turnInDistM: applyTimeRelativeBestWorst(corner.turnInDistM ? computeMetricStat(keep(corner.turnInDistM.samples)) : null, bestLapNumber, worstLapNumber),
      rotationAtThrottlePct: applyTimeRelativeBestWorst(corner.rotationAtThrottlePct ? computeMetricStat(keep(corner.rotationAtThrottlePct.samples)) : null, bestLapNumber, worstLapNumber),
    });
  }
  return filtered;
}
