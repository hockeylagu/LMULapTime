import { ReplayTrajectoryPoint } from '../../shared/types/index.js';
import { CornerSegmentComparison } from './cornerAnalysis/index.js';
import { PointComparison } from './replayComparison.js';
import { getTrajectoryDistances } from './lapAlignment.js';
import { evaluateHandlingEvidence, handlingAdvice, SIGNIFICANT_HANDLING_LOSS_SEC } from './handlingBalance/evidence.js';

export type HandlingBalanceType = 'understeer' | 'oversteer';
export type HandlingBalancePhase = 'E' | 'M' | 'X' | 'EM' | 'MX';

export interface HandlingBalanceEvent {
  id: string;
  type: HandlingBalanceType;
  phase: HandlingBalancePhase;
  label: string; // e.g. "US M", "SCRUB M", "OS M", "OS MX"
  startIdx: number;
  endIdx: number;
  startDistM: number;
  endDistM: number;
  startTimeSec: number;
  endTimeSec: number;
  peakDeg: number;
  avgDeg: number;
  peakSpeedKmh: number;
  isCountersteer: boolean;
  isTireScrub: boolean;
  scrubSeverityPct: number;
  timeLossSec: number | null;
  evidence: string;
  advice: string;
}

export interface VisibleHandlingBand {
  id: string;
  type: HandlingBalanceType;
  phase: HandlingBalancePhase;
  label: string;
  xStart: number; // 0 to 1000 in SVG coordinates
  xEnd: number;   // 0 to 1000 in SVG coordinates
  width: number;
  peakDeg: number;
  avgDeg: number;
  isCountersteer: boolean;
  isTireScrub: boolean;
  scrubSeverityPct: number;
  timeLossSec: number | null;
  evidence: string;
  advice: string;
}

const MIN_SPEED_KMH = 35;
const MIN_EVENT_DURATION_SEC = 0.30; // Time-based at every telemetry resolution, including 100 Hz
const MERGE_GAP_DURATION_SEC = 0.15; // Bridge brief threshold flicker, not separate corrections
const UNDERSTEER_THRESHOLD_DEG = 2.0; // Point-level entry threshold for understeer
const UNDERSTEER_PEAK_MIN_DEG = 3.2;   // Event must reach at least 3.2° push to be classified as genuine understeer
const OVERSTEER_THRESHOLD_DEG = -1.0;  // Point-level entry threshold for oversteer
const OVERSTEER_PEAK_MIN_DEG = -1.6;   // Event must reach at least -1.6° or opposite lock

/**
 * Derives dynamic handling balance (deg) if not pre-computed on the point.
 */
function getOrComputeBalanceDeg(p: ReplayTrajectoryPoint): number {
  if (p.understeerDeg !== undefined && Number.isFinite(p.understeerDeg)) return p.understeerDeg;

  const spd = p.speedKmh ?? 0;
  const steer = p.steerYaw ?? 0;
  const yaw = p.yawRateDeg ?? 0;
  if (spd < MIN_SPEED_KMH || (Math.abs(steer) < 3 && Math.abs(yaw) < 3)) {
    return 0;
  }

  const vMs = spd / 3.6;
  const wheelAngleDeg = steer / 11.0;
  const yawRateRad = (yaw * Math.PI) / 180;
  const kinematicAngleDeg = ((2.7 * yawRateRad) / Math.max(1, vMs)) * (180 / Math.PI);
  const turnDir = Math.abs(yaw) >= 3 ? (yaw > 0 ? 1 : -1) : (steer > 0 ? 1 : -1);

  return (wheelAngleDeg - kinematicAngleDeg) * turnDir;
}

/**
 * Resolves whether the vehicle is in an understeer or oversteer handling limit state.
 */
function classifyPointBalance(p: ReplayTrajectoryPoint): {
  type: HandlingBalanceType | null;
  balanceDeg: number;
  isCountersteer: boolean;
} {
  const spd = p.speedKmh ?? 0;
  if (spd < MIN_SPEED_KMH || !Number.isFinite(spd) || !Number.isFinite(p.timeSec) ||
      !Number.isFinite(p.steerYaw) || !Number.isFinite(p.yawRateDeg) || p.isOffTrack) {
    return { type: null, balanceDeg: 0, isCountersteer: false };
  }

  const steer = p.steerYaw ?? 0;
  const yaw = p.yawRateDeg ?? 0;
  const slipAngle = Math.abs(p.slipAngleDeg ?? 0);
  const latG = Math.abs(p.accelLatG ?? 0);
  const balance = getOrComputeBalanceDeg(p);

  // 1. Countersteer / Catching opposite lock: steering opposes vehicle rotation
  const isCountersteer = steer * yaw < 0 && Math.abs(steer) >= 8 && Math.abs(yaw) >= 8;

  // 2. Oversteer check (countersteer, negative balance, or rear slide)
  if (
    isCountersteer ||
    balance <= OVERSTEER_THRESHOLD_DEG ||
    (slipAngle >= 2.5 && latG >= 0.40 && balance < 0)
  ) {
    return { type: 'oversteer', balanceDeg: balance, isCountersteer };
  }

  // 3. Understeer check (front push / driver turning more than Ackermann requirement)
  const isCornering = Math.abs(steer) >= 5 || latG >= 0.35 || Math.abs(yaw) >= 3.0;
  if (balance >= UNDERSTEER_THRESHOLD_DEG && isCornering) {
    return { type: 'understeer', balanceDeg: balance, isCountersteer: false };
  }

  return { type: null, balanceDeg: balance, isCountersteer: false };
}

/**
 * Determines corner phase ('E', 'M', 'X', 'EM', 'MX') for a distance range.
 */
function determinePhase(
  startDistM: number,
  endDistM: number,
  points: ReplayTrajectoryPoint[],
  startIdx: number,
  endIdx: number,
  cornerSegments?: CornerSegmentComparison[]
): HandlingBalancePhase {
  if (cornerSegments && cornerSegments.length > 0) {
    const centerDistM = (startDistM + endDistM) / 2;
    // Find matching corner segment containing or nearest to the event
    const corner = cornerSegments.find(
      (c) =>
        (startDistM >= c.entryDistM - 10 && endDistM <= c.exitDistM + 10) ||
        (centerDistM >= c.entryDistM && centerDistM <= c.exitDistM)
    );

    if (corner) {
      const cornerLen = Math.max(10, corner.exitDistM - corner.entryDistM);
      const apexMargin = cornerLen * 0.10;
      const apexStart = corner.minDistM - apexMargin;
      const apexEnd = corner.minDistM + apexMargin;

      const startsInEntry = startDistM < apexStart;
      const startsInMid = startDistM >= apexStart && startDistM <= apexEnd;
      const endsInMid = endDistM >= apexStart && endDistM <= apexEnd;
      const endsInExit = endDistM > apexEnd;

      if (startsInEntry) {
        if (endsInExit || (endsInMid && endDistM >= corner.minDistM)) return 'EM';
        return 'E';
      }

      if (startsInMid) {
        if (endsInExit) return 'MX';
        return 'M';
      }

      return 'X';
    }
  }

  // Fallback: evaluate pedals across the event window
  let avgThrottle = 0;
  let avgBrake = 0;
  const count = Math.max(1, endIdx - startIdx + 1);

  for (let i = startIdx; i <= endIdx; i++) {
    avgThrottle += points[i].throttle ?? 0;
    avgBrake += points[i].brake ?? 0;
  }
  avgThrottle /= count;
  avgBrake /= count;

  if (avgBrake > 15) return 'E';
  if (avgThrottle > 60) return 'X';
  return 'M';
}

/**
 * Evaluates whether an understeer event constitutes true excessive tire scrub
 * (where steering angle was increased but car rotation collapsed or tires dragged).
 */
export function evaluateTireScrub(
  points: ReplayTrajectoryPoint[],
  startIdx: number,
  endIdx: number,
  peakDeg: number,
  pointComparisons?: PointComparison[]
): { isTireScrub: boolean; scrubSeverityPct: number } {
  // A large Ackermann residual alone does not establish tyre scrub.
  if (peakDeg < 5.5) return { isTireScrub: false, scrubSeverityPct: 0 };
  const evidence = evaluateHandlingEvidence(points, startIdx, endIdx, pointComparisons);
  const isTireScrub = evidence.responseCollapse || evidence.scrubDrag;
  // Proxy index retained for callers; it is not a measured percentage of grip lost.
  const scrubSeverityPct = isTireScrub ? Math.min(100, Math.round(peakDeg / 12 * 100)) : 0;
  return { isTireScrub, scrubSeverityPct };
}
/**
 * Deterministically detects understeer and oversteer handling limit events from trajectory points.
 */
export function detectHandlingBalanceEvents(
  points: ReplayTrajectoryPoint[],
  cornerSegments?: CornerSegmentComparison[],
  trackLengthM?: number,
  pointComparisons?: PointComparison[]
): HandlingBalanceEvent[] {
  if (!points || points.length < 3) return [];

  const cumDists = getTrajectoryDistances(points, trackLengthM);
  const rawEvents: Array<{
    type: HandlingBalanceType;
    startIdx: number;
    endIdx: number;
    isCountersteer: boolean;
    balanceVals: number[];
    speeds: number[];
  }> = [];

  let currentType: HandlingBalanceType | null = null;
  let currentStartIdx = 0;
  let currentCountersteer = false;
  let currentBalances: number[] = [];
  let currentSpeeds: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const { type, balanceDeg, isCountersteer } = classifyPointBalance(p);

    const sampleGap = i > 0 ? (p.timeSec ?? NaN) - (points[i - 1].timeSec ?? NaN) : 0;
    if (type !== currentType || sampleGap > 0.30 || sampleGap < 0) {
      if (currentType !== null) {
        rawEvents.push({
          type: currentType,
          startIdx: currentStartIdx,
          endIdx: i - 1,
          isCountersteer: currentCountersteer,
          balanceVals: currentBalances,
          speeds: currentSpeeds,
        });
      }
      currentType = type;
      currentStartIdx = i;
      currentCountersteer = isCountersteer;
      currentBalances = type !== null ? [balanceDeg] : [];
      currentSpeeds = type !== null ? [p.speedKmh ?? 0] : [];
    } else if (currentType !== null) {
      if (isCountersteer) currentCountersteer = true;
      currentBalances.push(balanceDeg);
      currentSpeeds.push(p.speedKmh ?? 0);
    }
  }

  if (currentType !== null) {
    rawEvents.push({
      type: currentType,
      startIdx: currentStartIdx,
      endIdx: points.length - 1,
      isCountersteer: currentCountersteer,
      balanceVals: currentBalances,
      speeds: currentSpeeds,
    });
  }

  // Filter out short noise blips (< MIN_EVENT_DURATION_SEC) and mild normal cornering
  const filteredEvents = rawEvents.filter((ev) => {
    const tStart = points[ev.startIdx].timeSec ?? 0;
    const tEnd = points[ev.endIdx].timeSec ?? tStart;
    const durationOk = tEnd - tStart >= MIN_EVENT_DURATION_SEC - 1e-9;
    if (!durationOk) return false;

    // Reject normal cornering slip angles: require peak handling limit deficit
    if (ev.type === 'understeer') {
      const peak = Math.max(0, ...ev.balanceVals);
      return peak >= UNDERSTEER_PEAK_MIN_DEG;
    }
    if (ev.type === 'oversteer') {
      if (ev.isCountersteer) return true;
      const peak = Math.min(0, ...ev.balanceVals);
      return peak <= OVERSTEER_PEAK_MIN_DEG;
    }
    return true;
  });

  // Merge nearby events of the same type separated by <= MERGE_GAP_DURATION_SEC
  const mergedEvents: typeof filteredEvents = [];
  for (const ev of filteredEvents) {
    const last = mergedEvents[mergedEvents.length - 1];
    if (last && last.type === ev.type) {
      const gapSec = (points[ev.startIdx].timeSec ?? 0) - (points[last.endIdx].timeSec ?? 0);
      const sameTurn = (points[last.endIdx].steerYaw ?? 0) * (points[ev.startIdx].steerYaw ?? 0) > 0;
      const uninterrupted = points.slice(last.endIdx + 1, ev.startIdx).every(p =>
        !p.isOffTrack && Number.isFinite(p.timeSec) &&
        [null, ev.type].includes(classifyPointBalance(p).type));
      if (gapSec >= 0 && gapSec <= MERGE_GAP_DURATION_SEC && sameTurn && uninterrupted) {
        last.endIdx = ev.endIdx;
        last.isCountersteer = last.isCountersteer || ev.isCountersteer;
        last.balanceVals.push(...ev.balanceVals);
        last.speeds.push(...ev.speeds);
        continue;
      }
    }
    mergedEvents.push({ ...ev });
  }

  // Construct structured handling balance events
  return mergedEvents.flatMap((ev, idx): HandlingBalanceEvent[] => {
    const startDistM = cumDists[ev.startIdx] ?? 0;
    const endDistM = cumDists[ev.endIdx] ?? startDistM;
    const startTimeSec = points[ev.startIdx].timeSec ?? 0;
    const endTimeSec = points[ev.endIdx].timeSec ?? startTimeSec;

    const phase = determinePhase(startDistM, endDistM, points, ev.startIdx, ev.endIdx, cornerSegments);
    const avgDeg =
      ev.balanceVals.length > 0
        ? Number((ev.balanceVals.reduce((a, b) => a + b, 0) / ev.balanceVals.length).toFixed(2))
        : 0;

    const peakDeg =
      ev.type === 'understeer'
        ? Math.max(0, ...ev.balanceVals)
        : Math.min(0, ...ev.balanceVals);

    const peakSpeedKmh = Math.round(Math.max(0, ...ev.speeds));

    const evidence = evaluateHandlingEvidence(points, ev.startIdx, ev.endIdx, pointComparisons);
    if (ev.type === 'understeer' && !evidence.responseCollapse && !evidence.scrubDrag && !evidence.excessSteering) return [];
    if (ev.type === 'oversteer' && !evidence.rearSlide) return [];
    // A comparison supplies significance, never a lap-wide accumulated deficit.
    // Missing/partial comparisons cannot establish time cost and are suppressed.
    if (pointComparisons?.length && (evidence.timeLossSec === null || evidence.timeLossSec < SIGNIFICANT_HANDLING_LOSS_SEC - 1e-9)) return [];

    const { isTireScrub, scrubSeverityPct } =
      ev.type === 'understeer'
        ? evaluateTireScrub(points, ev.startIdx, ev.endIdx, peakDeg, pointComparisons)
        : { isTireScrub: false, scrubSeverityPct: 0 };

    const prefix = ev.type === 'understeer' ? (isTireScrub ? 'SCRUB' : 'US') : 'OS';
    const label = `${prefix} ${phase}`;

    return [{
      id: `balance-${ev.type}-${idx}-${ev.startIdx}`,
      type: ev.type,
      phase,
      label,
      startIdx: ev.startIdx,
      endIdx: ev.endIdx,
      startDistM,
      endDistM,
      startTimeSec,
      endTimeSec,
      peakDeg: Number(peakDeg.toFixed(2)),
      avgDeg,
      peakSpeedKmh,
      isCountersteer: ev.isCountersteer,
      isTireScrub,
      scrubSeverityPct,
      timeLossSec: evidence.timeLossSec === null ? null : Number(evidence.timeLossSec.toFixed(3)),
      evidence: ev.type === 'oversteer' ? (ev.isCountersteer ? 'Rear slide with opposite lock' : 'Sustained rear slide')
        : evidence.responseCollapse ? 'More steering but less rotation'
        : evidence.scrubDrag ? 'Speed falling on throttle without braking'
        : 'More steering and less speed than the baseline',
      advice: handlingAdvice(ev.type, phase, isTireScrub),
    }];
  });
}

/**
 * Projects full-lap handling balance events into SVG coordinate space [0, 1000] for the current view window.
 */
export function computeVisibleHandlingBands(
  events: HandlingBalanceEvent[],
  viewStart: number,
  viewEnd: number,
  cumDists: number[]
): VisibleHandlingBand[] {
  if (events.length === 0 || !cumDists || cumDists.length === 0) return [];

  const distStart = cumDists[viewStart] ?? 0;
  const distEnd = cumDists[viewEnd] ?? distStart;
  const distSpan = Math.max(1e-6, distEnd - distStart);

  const bands: VisibleHandlingBand[] = [];

  for (const ev of events) {
    // Check if event intersects visible distance window
    if (ev.endDistM < distStart || ev.startDistM > distEnd) {
      continue;
    }

    const clampedStartM = Math.max(distStart, ev.startDistM);
    const clampedEndM = Math.min(distEnd, ev.endDistM);

    const xStart = ((clampedStartM - distStart) / distSpan) * 1000;
    const xEnd = ((clampedEndM - distStart) / distSpan) * 1000;
    const width = Math.max(3, xEnd - xStart);

    bands.push({
      id: ev.id,
      type: ev.type,
      phase: ev.phase,
      label: ev.label,
      xStart: Number(xStart.toFixed(1)),
      xEnd: Number(xEnd.toFixed(1)),
      width: Number(width.toFixed(1)),
      peakDeg: ev.peakDeg,
      avgDeg: ev.avgDeg,
      isCountersteer: Boolean(ev.isCountersteer),
      isTireScrub: ev.isTireScrub,
      scrubSeverityPct: ev.scrubSeverityPct,
      timeLossSec: ev.timeLossSec,
      evidence: ev.evidence,
      advice: ev.advice,
    });
  }

  return bands;
}
