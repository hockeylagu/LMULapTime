import type { LapData } from '../core/types.js';
import { isCompletedPitStop } from '../../shared/domain/lapComparison.js';
import { formatTime } from '../../shared/domain/formatters.js';
import { computeAverageLapTime } from './sessionAnalytics.js';

/**
 * The parser's lap timing steps for one driver, in the order that matters: infer the missing lap
 * times, mark the out-laps (after the inference, so an in-lap whose time was inferred still makes
 * the next lap an out-lap), then work out each stop's pit loss against the clean-lap average
 * (taken once the out-laps are marked, so the slow out-lap is not in the reference).
 * `bestLapTime` is the best valid lap before any inference.
 */
export function applyLapTiming(laps: LapData[], bestLapTime: number | null): void {
  inferMissingLapTimes(laps, bestLapTime);
  markOutLaps(laps);
  applyPitLoss(laps, bestLapTime);
}

/** Fills a missing lap time from the sectors or from the elapsed time since the previous lap, when that is plausible. */
function inferMissingLapTimes(laps: LapData[], bestLapTime: number | null): void {
  for (let i = 0; i < laps.length; i++) {
    const curLap = laps[i];
    if (curLap.lapTime !== null && curLap.lapTime > 0) continue;
    let inferredTime: number | null = null;

    // Case 1: All 3 sectors are present (sometimes LMU logs sectors but omits body time on cut tracks)
    if (curLap.s1 !== null && curLap.s2 !== null && curLap.s3 !== null && curLap.s1 > 0 && curLap.s2 > 0 && curLap.s3 > 0) {
      inferredTime = parseFloat((curLap.s1 + curLap.s2 + curLap.s3).toFixed(3));
    }

    // Case 2: Infer from session elapsed time delta vs previous lap
    if (inferredTime === null && typeof curLap.elapsedSeconds === 'number' && curLap.elapsedSeconds > 0) {
      const prevLapEt = i > 0 ? laps[i - 1].elapsedSeconds : null;
      if (typeof prevLapEt === 'number' && prevLapEt > 0) {
        const deltaEt = parseFloat((curLap.elapsedSeconds - prevLapEt).toFixed(3));

        if (deltaEt > 0) {
          const knownSectors = (curLap.s1 || 0) + (curLap.s2 || 0) + (curLap.s3 || 0);
          const passesSectorCheck = knownSectors === 0 || deltaEt >= knownSectors;

          // Reasonable lap duration threshold:
          // Cap at 3.5x bestLapTime or 600s (10 minutes) to avoid counting extended garage idle time
          const maxAllowed = bestLapTime ? Math.max(bestLapTime * 3.5, 300) : 600;
          const minAllowed = 10;

          if (passesSectorCheck && deltaEt >= minAllowed && deltaEt <= maxAllowed) {
            inferredTime = deltaEt;

            // If S1 and S2 are present but S3 is missing, deduce S3
            if (curLap.s1 !== null && curLap.s2 !== null && (curLap.s3 === null || curLap.s3 <= 0)) {
              const s3Est = parseFloat((deltaEt - curLap.s1 - curLap.s2).toFixed(3));
              if (s3Est > 0) {
                curLap.s3 = s3Est;
              }
            }
          }
        }
      }
    }

    if (inferredTime !== null && inferredTime > 0) {
      curLap.lapTime = inferredTime;
      curLap.lapTimeString = formatTime(inferredTime);
      curLap.isInferred = true;
    }
  }
}

/** Any lap immediately following a completed pit stop (in-lap) is an out-lap. */
function markOutLaps(laps: LapData[]): void {
  for (let i = 1; i < laps.length; i++) {
    if (isCompletedPitStop(laps[i - 1]) && !laps[i].isPitStop) laps[i].isOutLap = true;
  }
}

/**
 * Pit stop loss against the driver's clean reference lap time, kept on the in-lap. A stop spans
 * two laps (the drive in and, past the line, the box and the drive out), so the out-lap counts too.
 */
function applyPitLoss(laps: LapData[], bestLapTime: number | null): void {
  const refLapTime = computeAverageLapTime(laps) || bestLapTime;
  laps.forEach((lap, i) => {
    const outLap = laps[i + 1]?.isOutLap && laps[i + 1].lapTime ? laps[i + 1] : null;
    const stopTime = (lap.lapTime ?? 0) + (outLap?.lapTime ?? 0);
    const normalTime = refLapTime ? refLapTime * (outLap ? 2 : 1) : 0;
    if (lap.isPitStop && lap.lapTime && refLapTime && stopTime > normalTime) {
      const pitLoss = parseFloat((stopTime - normalTime).toFixed(1));
      if (pitLoss > 0) {
        lap.pitStopDuration = pitLoss;
        lap.pitStopDurationString = `+${pitLoss}s`;
      }
    }
  });
}
