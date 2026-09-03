import { PaceCategory, ReferenceLaptimeEntry, TireWear } from '../../server/types.js';
import { formatTime } from './formatters.js';
import { matchesCarClass } from './paceCategory.js';

export interface ComparableLap {
  id: string; // Unique key e.g. "session123_lap_4" or "benchmark_alien"
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
  tag?: string; // e.g. "Session Best", "All-Time Best", "Theoretical Best", "Alien Benchmark"
}

export interface LapDeltaResult {
  lapTimeDelta: number | null;
  lapTimeDeltaFormatted: string;
  lapTimeDeltaClass: string;
  s1Delta: number | null;
  s1DeltaFormatted: string;
  s1DeltaClass: string;
  s2Delta: number | null;
  s2DeltaFormatted: string;
  s2DeltaClass: string;
  s3Delta: number | null;
  s3DeltaFormatted: string;
  s3DeltaClass: string;
  speedDelta: number | null;
  speedDeltaFormatted: string;
  speedDeltaClass: string;
  isFasterOverall: boolean | null;
}

/**
 * Computes deltas comparing targetLap against baselineLap.
 * Positive time delta means targetLap is SLOWER than baseline (+0.320s).
 * Negative time delta means targetLap is FASTER than baseline (-0.140s).
 * Positive speed delta means targetLap is FASTER in top speed (+4.2 km/h).
 */
export function computeLapDeltas(baseline: ComparableLap, target: ComparableLap): LapDeltaResult {
  // Delta helper for time (in seconds)
  const computeTimeDelta = (baseVal: number | null | undefined, targetVal: number | null | undefined) => {
    if (baseVal === null || baseVal === undefined || targetVal === null || targetVal === undefined) {
      return { delta: null, formatted: '--', deltaClass: 'text-lmu-muted' };
    }
    const delta = parseFloat((targetVal - baseVal).toFixed(3));
    if (Math.abs(delta) < 0.0005) {
      return { delta: 0, formatted: '±0.000s', deltaClass: 'text-white font-semibold' };
    }
    if (delta < 0) {
      // Faster than baseline (motorsport purple or green)
      return { delta, formatted: `${delta.toFixed(3)}s`, deltaClass: 'text-lmu-green font-bold' };
    }
    // Slower than baseline (red / orange / yellow)
    return { delta, formatted: `+${delta.toFixed(3)}s`, deltaClass: 'text-rose-400 font-medium' };
  };

  // Delta helper for speed (in km/h)
  const computeSpeedDelta = (baseVal: number | null | undefined, targetVal: number | null | undefined) => {
    if (baseVal === null || baseVal === undefined || targetVal === null || targetVal === undefined) {
      return { delta: null, formatted: '--', deltaClass: 'text-lmu-muted' };
    }
    const delta = parseFloat((targetVal - baseVal).toFixed(1));
    if (Math.abs(delta) < 0.05) {
      return { delta: 0, formatted: '±0.0 km/h', deltaClass: 'text-white font-semibold' };
    }
    if (delta > 0) {
      // Higher top speed
      return { delta, formatted: `+${delta.toFixed(1)} km/h`, deltaClass: 'text-lmu-cyan font-bold' };
    }
    // Lower top speed
    return { delta, formatted: `${delta.toFixed(1)} km/h`, deltaClass: 'text-rose-400 font-medium' };
  };

  const lapRes = computeTimeDelta(baseline.lapTime, target.lapTime);
  const s1Res = computeTimeDelta(baseline.s1, target.s1);
  const s2Res = computeTimeDelta(baseline.s2, target.s2);
  const s3Res = computeTimeDelta(baseline.s3, target.s3);
  const spdRes = computeSpeedDelta(baseline.topSpeed, target.topSpeed);

  const isFasterOverall = lapRes.delta !== null ? lapRes.delta < -0.0005 : null;

  return {
    lapTimeDelta: lapRes.delta,
    lapTimeDeltaFormatted: lapRes.formatted,
    lapTimeDeltaClass: lapRes.deltaClass,
    s1Delta: s1Res.delta,
    s1DeltaFormatted: s1Res.formatted,
    s1DeltaClass: s1Res.deltaClass,
    s2Delta: s2Res.delta,
    s2DeltaFormatted: s2Res.formatted,
    s2DeltaClass: s2Res.deltaClass,
    s3Delta: s3Res.delta,
    s3DeltaFormatted: s3Res.formatted,
    s3DeltaClass: s3Res.deltaClass,
    speedDelta: spdRes.delta,
    speedDeltaFormatted: spdRes.formatted,
    speedDeltaClass: spdRes.deltaClass,
    isFasterOverall,
  };
}

/**
 * Creates a synthetic theoretical best lap item from best sectors.
 */
export function createTheoreticalBestLap(
  s1: number | null,
  s2: number | null,
  s3: number | null,
  driverName = 'Theoretical Optimal',
  carClass = 'Class Best',
  carType = 'Optimal Sectors',
  tag = 'Theoretical Best',
  paceCategory?: PaceCategory | null,
  pacePercentage?: number | null
): ComparableLap {
  const lapTime = s1 !== null && s2 !== null && s3 !== null ? parseFloat((s1 + s2 + s3).toFixed(3)) : null;
  return {
    id: `theoretical_${carClass}_${Date.now()}`,
    driverName,
    carType,
    carClass,
    lapTime,
    lapTimeString: formatTime(lapTime),
    s1,
    s2,
    s3,
    s1String: formatTime(s1),
    s2String: formatTime(s2),
    s3String: formatTime(s3),
    topSpeed: null,
    isValid: true,
    isTheoreticalBest: true,
    paceCategory: paceCategory || null,
    pacePercentage: pacePercentage !== undefined ? pacePercentage : null,
    tag,
  };
}

/**
 * Creates synthetic benchmark lap items from a ReferenceLaptimeEntry.
 */
export function createBenchmarkLaps(refEntry: ReferenceLaptimeEntry): ComparableLap[] {
  const benchmarks: ComparableLap[] = [];

  if (refEntry.targets.alienSec) {
    benchmarks.push({
      id: `benchmark_alien_${refEntry.carClass}`,
      driverName: 'Alien Benchmark (100%)',
      carType: refEntry.fastestCar || `${refEntry.carClass} Reference`,
      carClass: refEntry.carClass,
      lapTime: refEntry.targets.alienSec,
      lapTimeString: formatTime(refEntry.targets.alienSec),
      s1: null,
      s2: null,
      s3: null,
      topSpeed: null,
      isValid: true,
      isBenchmarkTarget: true,
      benchmarkCategory: 'Alien',
      paceCategory: 'Alien',
      pacePercentage: 100,
      tag: '👾 Alien (100%)',
    });
  }

  if (refEntry.targets.competitiveSec) {
    benchmarks.push({
      id: `benchmark_competitive_${refEntry.carClass}`,
      driverName: 'Competitive Benchmark (101%)',
      carType: refEntry.fastestCar || `${refEntry.carClass} Reference`,
      carClass: refEntry.carClass,
      lapTime: refEntry.targets.competitiveSec,
      lapTimeString: formatTime(refEntry.targets.competitiveSec),
      s1: null,
      s2: null,
      s3: null,
      topSpeed: null,
      isValid: true,
      isBenchmarkTarget: true,
      benchmarkCategory: 'Competitive',
      paceCategory: 'Competitive',
      pacePercentage: 101,
      tag: '🏆 Competitive (101%)',
    });
  }

  if (refEntry.targets.goodSec) {
    benchmarks.push({
      id: `benchmark_good_${refEntry.carClass}`,
      driverName: 'Good Pace Benchmark (102%)',
      carType: refEntry.fastestCar || `${refEntry.carClass} Reference`,
      carClass: refEntry.carClass,
      lapTime: refEntry.targets.goodSec,
      lapTimeString: formatTime(refEntry.targets.goodSec),
      s1: null,
      s2: null,
      s3: null,
      topSpeed: null,
      isValid: true,
      isBenchmarkTarget: true,
      benchmarkCategory: 'Good',
      paceCategory: 'Good',
      pacePercentage: 102,
      tag: '⭐ Good (102%)',
    });
  }

  return benchmarks;
}

/**
 * Filter comparable laps strictly by matching vehicle class/category.
 */
export function filterLapsByCarCategory(
  laps: ComparableLap[],
  targetCarClass: string,
  targetCarModel?: string
): ComparableLap[] {
  if (!targetCarClass || targetCarClass === 'All') return laps;

  return laps.filter(lap => {
    const classMatches = matchesCarClass(lap.carClass, lap.carType, targetCarClass);
    if (!classMatches) return false;

    if (targetCarModel && targetCarModel !== 'All') {
      return lap.carType.toLowerCase().trim() === targetCarModel.toLowerCase().trim();
    }
    return true;
  });
}

export interface LapToLapDeltaResult {
  delta: number | null;
  formatted: string;
  deltaClass: string;
  isFaster: boolean | null;
}

/**
 * Computes difference from previous completed lap to current lap (Lap N - Lap N-1).
 * Negative delta = faster than previous lap (improvement).
 * Positive delta = slower than previous lap.
 */
export function computeLapToLapDelta(
  prevLapTime: number | null | undefined,
  currentLapTime: number | null | undefined
): LapToLapDeltaResult {
  if (
    prevLapTime === null ||
    prevLapTime === undefined ||
    currentLapTime === null ||
    currentLapTime === undefined ||
    prevLapTime <= 0 ||
    currentLapTime <= 0
  ) {
    return { delta: null, formatted: '--', deltaClass: 'text-lmu-muted', isFaster: null };
  }

  const delta = parseFloat((currentLapTime - prevLapTime).toFixed(3));
  if (Math.abs(delta) < 0.0005) {
    return { delta: 0, formatted: '±0.000s', deltaClass: 'text-white font-semibold', isFaster: false };
  }
  if (delta < 0) {
    return { delta, formatted: `${delta.toFixed(3)}s`, deltaClass: 'text-emerald-400 font-bold', isFaster: true };
  }
  return { delta, formatted: `+${delta.toFixed(3)}s`, deltaClass: 'text-rose-400 font-medium', isFaster: false };
}

/**
 * Computes average of the top N cleanest/fastest flying laps in a session.
 */
export function computeTopNLapAverage(
  laps: Array<{ lapTime: number | null; isValid?: boolean; isPitStop?: boolean; isOutLap?: boolean; lapNum?: number }>,
  n = 3
): number | null {
  const completed = laps.filter(l => l.lapTime !== null && l.lapTime > 0);
  const hasMultiple = completed.length > 1;
  const validFlying = completed.filter((l, idx, arr) => {
    const prevLap = idx > 0 ? arr[idx - 1] : null;
    const prevIsValidPitStop = Boolean(prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0);
    const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
    return (l.isValid ?? true) && !l.isPitStop && !isOut && (!hasMultiple || (l.lapNum ?? 2) > 1);
  });
  const candidates = validFlying.length > 0
    ? validFlying
    : completed.filter((l, idx, arr) => {
        const prevLap = idx > 0 ? arr[idx - 1] : null;
        const prevIsValidPitStop = Boolean(prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0);
        const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
        return (l.isValid ?? true) && !l.isPitStop && !isOut;
      });

  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => (a.lapTime || 0) - (b.lapTime || 0));
  const topSlice = sorted.slice(0, n);
  const sum = topSlice.reduce((acc, l) => acc + (l.lapTime || 0), 0);
  return parseFloat((sum / topSlice.length).toFixed(3));
}

/**
 * Computes consistency rating (%) and standard deviation across clean flying laps.
 * Excludes pit stop laps (in-laps) and out-laps (laps immediately following a pit stop).
 */
export function computeConsistencyRating(
  laps: Array<{ lapTime: number | null; isValid?: boolean; isPitStop?: boolean; isOutLap?: boolean; lapNum?: number }>
): { consistencyScore: number | null; avgLapTime: number | null; stdDev: number | null } {
  const completed = laps.filter(l => l.lapTime !== null && l.lapTime > 0);
  const hasMultiple = completed.length > 1;

  // Filter out pit stops, out laps after valid pit stops, and start laps (lap 1)
  const validFlying = completed.filter((l, idx, arr) => {
    const prevLap = idx > 0 ? arr[idx - 1] : null;
    const prevIsValidPitStop = Boolean(prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0);
    const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
    return (l.isValid ?? true) && !l.isPitStop && !isOut && (!hasMultiple || (l.lapNum ?? 2) > 1);
  });

  const candidates = validFlying.length > 0
    ? validFlying
    : completed.filter((l, idx, arr) => {
        const prevLap = idx > 0 ? arr[idx - 1] : null;
        const prevIsValidPitStop = Boolean(prevLap && prevLap.isPitStop && prevLap.lapTime !== null && prevLap.lapTime > 0);
        const isOut = Boolean(l.isOutLap || prevIsValidPitStop);
        return (l.isValid ?? true) && !l.isPitStop && !isOut;
      });

  if (candidates.length === 0) return { consistencyScore: null, avgLapTime: null, stdDev: null };

  const sum = candidates.reduce((acc, l) => acc + (l.lapTime || 0), 0);
  const avg = sum / candidates.length;

  if (candidates.length <= 1) {
    return { consistencyScore: 100, avgLapTime: parseFloat(avg.toFixed(3)), stdDev: 0 };
  }

  const variance = candidates.reduce((acc, l) => acc + Math.pow((l.lapTime || 0) - avg, 2), 0) / candidates.length;
  const stdDev = Math.sqrt(variance);
  const score = Math.max(0, Math.min(100, (1 - stdDev / avg) * 100));

  return {
    consistencyScore: parseFloat(score.toFixed(1)),
    avgLapTime: parseFloat(avg.toFixed(3)),
    stdDev: parseFloat(stdDev.toFixed(3)),
  };
}

