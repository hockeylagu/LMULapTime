import { ReplayTrajectoryPoint } from '../../server/core/types.js';

/** Clock offsets searched between the DuckDB and the VCR recording of a lap, either way. */
export const MAX_CLOCK_OFFSET_SEC = 1;
const OFFSET_STEP_SEC = 0.01;
// Every Nth DuckDB sample is compared: 100 Hz is far denser than the VCR it is matched against.
const SAMPLE_STRIDE = 5;

export interface DuckVcrClockCheck {
  /** The DuckDB sample at time t matches the VCR at t + offsetSec; positive = the VCR records it later. */
  offsetSec: number;
  /** Mean absolute speed difference (km/h) with no shift, and with offsetSec applied. */
  speedErrorKmhAtZero: number;
  speedErrorKmhAtOffset: number;
  /** DuckDB lap time before the first / after the last VCR sample: fused positions are frozen there. */
  uncoveredStartSec: number;
  uncoveredEndSec: number;
}

/**
 * Measures how well the VCR positions line up in time with the DuckDB samples they are fused onto
 * (server/telemetry/telemetryFusion.ts assumes the two clocks agree once the VCR is re-based).
 * The two speed traces are compared at every shift within MAX_CLOCK_OFFSET_SEC. On the cache of
 * 2026-09-26 (113 laps) the offset was 0-20 ms and no fused position was frozen, so fusion
 * applies no correction.
 * `vcrPoints` must already be on the DuckDB lap clock. Null when the traces don't overlap enough.
 */
export function checkDuckVcrClock(duckPoints: ReplayTrajectoryPoint[], vcrPoints: ReplayTrajectoryPoint[]): DuckVcrClockCheck | null {
  const vt = vcrPoints.map(p => p.timeSec ?? NaN);
  const vs = vcrPoints.map(p => p.speedKmh ?? NaN);
  if (vcrPoints.length < 2 || duckPoints.length < 2 || !vt.every(Number.isFinite)) return null;

  const vcrSpeedAt = (t: number): number => {
    if (t < vt[0] || t > vt[vt.length - 1]) return NaN;
    let lo = 0;
    let hi = vt.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (vt[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = vt[hi] - vt[lo];
    const f = span > 1e-6 ? (t - vt[lo]) / span : 0;
    return vs[lo] + f * (vs[hi] - vs[lo]);
  };

  const errorAt = (offset: number): number => {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < duckPoints.length; i += SAMPLE_STRIDE) {
      const speed = duckPoints[i].speedKmh;
      const t = duckPoints[i].timeSec;
      if (speed === undefined || t === undefined) continue;
      const other = vcrSpeedAt(t + offset);
      if (!Number.isFinite(other)) continue;
      sum += Math.abs(speed - other);
      count++;
    }
    // Shifts that leave too little overlap would win on a lucky short stretch.
    return count >= duckPoints.length / SAMPLE_STRIDE / 2 ? sum / count : NaN;
  };

  const atZero = errorAt(0);
  if (!Number.isFinite(atZero)) return null;
  let bestOffset = 0;
  let bestError = atZero;
  const steps = Math.round(MAX_CLOCK_OFFSET_SEC / OFFSET_STEP_SEC);
  for (let k = -steps; k <= steps; k++) {
    const error = errorAt(k * OFFSET_STEP_SEC);
    if (error < bestError) {
      bestError = error;
      bestOffset = k * OFFSET_STEP_SEC;
    }
  }

  const duckStart = duckPoints[0].timeSec ?? 0;
  const duckEnd = duckPoints[duckPoints.length - 1].timeSec ?? 0;
  return {
    offsetSec: Number(bestOffset.toFixed(2)),
    speedErrorKmhAtZero: Number(atZero.toFixed(2)),
    speedErrorKmhAtOffset: Number(bestError.toFixed(2)),
    uncoveredStartSec: Number(Math.max(0, vt[0] - duckStart).toFixed(2)),
    uncoveredEndSec: Number(Math.max(0, duckEnd - vt[vt.length - 1]).toFixed(2)),
  };
}
