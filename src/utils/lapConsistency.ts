import { ReplayLapSummary } from '../../server/types.js';

export interface SectorConsistencyStat {
  key: 'lapTimeSec' | 's1Sec' | 's2Sec' | 's3Sec';
  label: string;
  count: number;
  minSec: number;
  maxSec: number;
  avgSec: number;
  stdDevSec: number;
  // Std-dev as a % of the average, so sections of very different length can be compared fairly.
  consistencyPct: number;
}

export interface LapConsistencyStats {
  lapCount: number;
  stats: SectorConsistencyStat[];
  // The stat with the highest consistencyPct - the biggest opportunity to tighten up.
  leastConsistent: SectorConsistencyStat | null;
}

const SECTOR_DEFS: Array<{ key: SectorConsistencyStat['key']; label: string }> = [
  { key: 's1Sec', label: 'Sector 1' },
  { key: 's2Sec', label: 'Sector 2' },
  { key: 's3Sec', label: 'Sector 3' },
  { key: 'lapTimeSec', label: 'Full Lap' },
];

/**
 * Computes lap/sector-time variance across a set of laps to highlight where a driver is
 * inconsistent (as opposed to simply slow) - a high standard deviation on one sector while
 * the others are tight points at a specific section needing more repeatable inputs rather
 * than outright pace.
 */
export function computeLapConsistencyStats(laps: ReplayLapSummary[] | null | undefined): LapConsistencyStats {
  const validLaps = (laps || []).filter(l => l.isValid !== false && !l.isOutlap && l.lapTimeSec > 0);

  const stats: SectorConsistencyStat[] = SECTOR_DEFS.map(({ key, label }) => {
    const values = validLaps.map(l => l[key]).filter((v): v is number => typeof v === 'number' && v > 0);
    if (values.length < 2) {
      const only = values[0] ?? 0;
      return { key, label, count: values.length, minSec: only, maxSec: only, avgSec: only, stdDevSec: 0, consistencyPct: 0 };
    }
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    return {
      key,
      label,
      count: values.length,
      minSec: Math.min(...values),
      maxSec: Math.max(...values),
      avgSec: avg,
      stdDevSec: stdDev,
      consistencyPct: avg > 0 ? (stdDev / avg) * 100 : 0,
    };
  });

  const eligible = stats.filter(s => s.count >= 2);
  const leastConsistent = eligible.length > 0
    ? eligible.reduce((worst, s) => (s.consistencyPct > worst.consistencyPct ? s : worst))
    : null;

  return { lapCount: validLaps.length, stats, leastConsistent };
}
