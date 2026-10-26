import type { ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import type { PointComparison } from '../replayComparison.js';

export const SIGNIFICANT_HANDLING_LOSS_SEC = 0.10;
const MIN_EVIDENCE_SEC = 0.25;

/** Evidence must persist in time, independently of the selected telemetry resolution. */
function sustainedSeconds(points: ReplayTrajectoryPoint[], start: number, end: number, matches: (index: number) => boolean): number {
  let longest = 0;
  let run = 0;
  for (let i = start + 1; i <= end; i++) {
    const dt = (points[i].timeSec ?? NaN) - (points[i - 1].timeSec ?? NaN);
    if (dt > 0 && dt <= 0.30 && matches(i - 1) && matches(i)) {
      run += dt;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return longest;
}

function alignedComparison(points: ReplayTrajectoryPoint[], comparisons: PointComparison[] | undefined, index: number): PointComparison | undefined {
  const comp = comparisons?.[index];
  // Comparisons are indexed by primary sample, never by the baseline's sample number.
  return comp && comp.primary.timeSec === points[index].timeSec && Number.isFinite(comp.deltaTimeSec) ? comp : undefined;
}

export interface HandlingEvidence {
  responseCollapse: boolean;
  measuredResponseCollapse: boolean;
  scrubDrag: boolean;
  excessSteering: boolean;
  rearSlide: boolean;
  timeLossSec: number | null;
}

/**
 * The fixed-ratio Ackermann residual is a proxy, not a tyre slip measurement.
 * Require a loss of response or a reference-relative deficit before coaching.
 * Local delta growth is observed during the event; it is not causal attribution.
 */
export function evaluateHandlingEvidence(points: ReplayTrajectoryPoint[], start: number, end: number, comparisons?: PointComparison[]): HandlingEvidence {
  const steer = (i: number) => Math.abs(points[i].steerYaw ?? 0);
  const curvature = (i: number) => Math.abs(points[i].yawRateDeg ?? 0) / Math.max(5, (points[i].speedKmh ?? 0) / 3.6);
  // a_y / v² measures turning response independently of the replay's interpolated heading.
  // Convert to the same degree-based scale as yaw / v. Native G is often only 10 Hz;
  // persistence is measured in seconds, never in the number of upsampled chart points.
  const measuredCurvature = (i: number): number | undefined => {
    const p = points[i];
    if (p.accelerationProvenance?.lateral !== 'telemetry' || !Number.isFinite(p.accelLatG)) return undefined;
    const speed = Math.max(5, (p.speedKmh ?? 0) / 3.6);
    return Math.abs(p.accelLatG!) * 9.80665 * (180 / Math.PI) / (speed * speed);
  };
  let responseCollapse = false;
  let measuredResponseCollapse = false;
  let anchor = start;
  let collapseStart: number | undefined;
  let measuredCollapseStart: number | undefined;
  for (let i = start + 1; i <= end; i++) {
    const sampleGap = (points[i].timeSec ?? NaN) - (points[i - 1].timeSec ?? NaN);
    // A turn reversal is not the front tyres losing their response.
    if (!(sampleGap > 0 && sampleGap <= 0.30) ||
        (points[i].steerYaw ?? 0) * (points[anchor].steerYaw ?? 0) <= 0 ||
        (points[i].yawRateDeg ?? 0) * (points[anchor].yawRateDeg ?? 0) <= 0) {
      anchor = i;
      collapseStart = undefined;
      measuredCollapseStart = undefined;
      continue;
    }
    if (steer(i) < steer(anchor)) {
      anchor = i;
      collapseStart = undefined;
      measuredCollapseStart = undefined;
    }
    const dt = (points[i].timeSec ?? NaN) - (points[anchor].timeSec ?? NaN);
    const nativeStart = measuredCurvature(anchor);
    const nativeNow = measuredCurvature(i);
    const hasMeasuredResponse = nativeStart !== undefined && nativeNow !== undefined;
    const startResponse = hasMeasuredResponse ? nativeStart : curvature(anchor);
    const currentResponse = hasMeasuredResponse ? nativeNow : curvature(i);
    if (dt >= MIN_EVIDENCE_SEC && dt <= 1.5 && steer(i) - steer(anchor) >= 10 &&
        startResponse > 0.45 && currentResponse < startResponse * 0.80 &&
        (!hasMeasuredResponse || (points[i].accelLatG! * points[anchor].accelLatG! > 0)) &&
        Math.abs(points[i].accelLatG ?? 0) >= 0.5) {
      collapseStart ??= points[i].timeSec;
      if (hasMeasuredResponse) measuredCollapseStart ??= points[i].timeSec;
      else measuredCollapseStart = undefined;
      if ((points[i].timeSec ?? NaN) - (collapseStart ?? NaN) >= MIN_EVIDENCE_SEC - 1e-9) responseCollapse = true;
      if ((points[i].timeSec ?? NaN) - (measuredCollapseStart ?? NaN) >= MIN_EVIDENCE_SEC - 1e-9) measuredResponseCollapse = true;
    } else {
      collapseStart = undefined;
      measuredCollapseStart = undefined;
    }
    if (dt > 1.5) anchor = i;
  }

  const scrubDrag = sustainedSeconds(points, start, end, i => {
    const p = points[i];
    return (p.throttle ?? 0) >= 40 && (p.brake ?? 0) <= 2 && (p.accelLonG ?? 0) < -0.15 &&
      Math.abs(p.accelLatG ?? 0) >= 0.8 && steer(i) >= 30 && !p.isOffTrack && !p.tcActive;
  }) >= MIN_EVIDENCE_SEC;

  const excessSteering = sustainedSeconds(points, start, end, i => {
    const c = alignedComparison(points, comparisons, i);
    if (!c || c.baseline.steerYaw * (points[i].steerYaw ?? 0) <= 0) return false;
    // Magnitudes make left/right turns symmetric; signed deltaSteer did not.
    return steer(i) - Math.abs(c.baseline.steerYaw) >= 12 && c.deltaSpeedKmh <= -3 &&
      c.baseline.yawRateDeg !== undefined &&
      Math.abs(points[i].yawRateDeg ?? 0) <= Math.abs(c.baseline.yawRateDeg) * 1.1;
  }) >= MIN_EVIDENCE_SEC;

  const rearSlide = sustainedSeconds(points, start, end, i => {
    const p = points[i];
    return Math.abs(p.slipAngleDeg ?? 0) >= 3 && Math.abs(p.yawRateDeg ?? 0) >= 8 &&
      Math.abs(p.accelLatG ?? 0) >= 0.4;
  }) >= MIN_EVIDENCE_SEC;

  let timeLossSec: number | null = null;
  if (comparisons?.length) {
    let complete = true;
    for (let i = start; i <= end; i++) {
      if (!alignedComparison(points, comparisons, i)) complete = false;
    }
    const first = alignedComparison(points, comparisons, start);
    const last = alignedComparison(points, comparisons, end);
    const speedDeficit = sustainedSeconds(points, start, end, i => {
      const c = alignedComparison(points, comparisons, i);
      return c !== undefined && c.deltaSpeedKmh <= -3;
    }) >= MIN_EVIDENCE_SEC;
    if (complete && first && last) {
      timeLossSec = speedDeficit ? Math.max(0, last.deltaTimeSec - first.deltaTimeSec) : 0;
    }
  }
  return { responseCollapse, measuredResponseCollapse, scrubDrag, excessSteering, rearSlide, timeLossSec };
}

export function handlingAdvice(type: 'understeer' | 'oversteer', phase: string, scrub: boolean): string {
  if (type === 'oversteer') return phase.includes('X')
    ? 'Try a gentler throttle ramp as you unwind the steering.'
    : 'Try a smoother brake release and steering input to settle the rear.';
  if (scrub) return 'Try less steering lock and delay throttle until the car starts to unwind.';
  return phase.includes('X')
    ? 'Try unwinding the steering before adding more throttle.'
    : 'Try a slightly slower entry and less steering lock; compare the exit speed.';
}
