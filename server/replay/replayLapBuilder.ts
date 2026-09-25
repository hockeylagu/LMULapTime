import { ReplayLapSummary, ReplayPitEvent } from '../core/types.js';

export interface RawTrajectoryPoint {
  sTime: number;
  x: number;
  y: number;
  z: number;
  rotX?: number;
  rotY: number;
  rotZ?: number;
  steerYaw?: number;
  rawThrottle?: number;
  rawBrake?: number;
  tcActive?: boolean;
  absActive?: boolean;
  pitLimiter?: boolean;
  inPit?: boolean;
  isOffTrack?: boolean;
  gearRaw?: number;
  speedKmhRaw?: number;
  detachablePartState?: number;
  engineRpm?: number;
  wheelSpeeds?: [number, number, number, number];
  brakeTemps?: [number, number, number, number];
  fuel?: number;
}

export interface VcrTimingEvent {
  sTime: number;
  drv: number;
  splitSec: number;
  sector: number;
  lapIdx: number;
}

export interface DetectedLapInternal {
  lapNumber: number;
  startIdx: number;
  endIdx: number;
  lapTimeSec: number;
  lapDistMeters: number;
  s1Sec: number;
  s2Sec: number;
  s3Sec: number;
  s1Idx: number;
  s2Idx: number;
  isOutlap: boolean;
  isBest: boolean;
  isValid?: boolean;
}

export interface LapDetectionResult {
  detectedLaps: DetectedLapInternal[];
  cumDist: number[];
  garageIntervals: Array<{ start: number; end: number }>;
  pitIntervals: Array<{ start: number; end: number }>;
  lapsSummary: ReplayLapSummary[];
}

/**
 * Computes cumulative distance along the vehicle path, ignoring teleport anomalies (>200m per step).
 */
export function calculateCumulativeDistance(rawPts: RawTrajectoryPoint[]): number[] {
  const cumDist: number[] = [0];
  for (let i = 1; i < rawPts.length; i++) {
    const d = Math.hypot(rawPts[i].x - rawPts[i - 1].x, rawPts[i].z - rawPts[i - 1].z);
    if (d < 200) {
      cumDist.push(cumDist[cumDist.length - 1] + d);
    } else {
      cumDist.push(cumDist[cumDist.length - 1]);
    }
  }
  return cumDist;
}

export function isTimeInIntervals(t: number, intervals: Array<{ start: number; end: number }>): boolean {
  for (const inv of intervals) {
    if (t >= inv.start && t <= inv.end) return true;
  }
  return false;
}

/**
 * Synthesizes garage and pit intervals from recorded replay pit events.
 */
export function buildPitAndGarageIntervals(
  targetPitEvents: ReplayPitEvent[]
): { garageIntervals: Array<{ start: number; end: number }>; pitIntervals: Array<{ start: number; end: number }> } {
  const garageIntervals: Array<{ start: number; end: number }> = [];
  const pitIntervals: Array<{ start: number; end: number }> = [];

  // Check if vehicle started in the garage (prior to first garage exit event)
  const firstGarageExit = targetPitEvents.find(e => e.code === 16);
  if (firstGarageExit && firstGarageExit.timeSec > 0) {
    garageIntervals.push({ start: 0, end: firstGarageExit.timeSec });
  }

  for (let p = 0; p < targetPitEvents.length; p++) {
    const ev = targetPitEvents[p];
    // Garage returns (code 21 or code 49)
    if (ev.code === 21 || ev.code === 49) {
      const nextExit = targetPitEvents.slice(p + 1).find(e => e.code === 16);
      garageIntervals.push({
        start: ev.timeSec,
        end: nextExit ? nextExit.timeSec : Infinity,
      });
    }
    // Pit lane entries (code 34)
    if (ev.code === 34) {
      const nextPitExit = targetPitEvents.slice(p + 1).find(e => e.code === 32);
      pitIntervals.push({
        start: ev.timeSec,
        end: nextPitExit ? nextPitExit.timeSec : ev.timeSec + 120,
      });
    }
  }

  return { garageIntervals, pitIntervals };
}

/**
 * Detects laps and 3 sectors per lap from simulation timing loops and telemetry points.
 */
export function detectLapsFromTelemetry(
  rawPts: RawTrajectoryPoint[],
  vcrTimingEvents: VcrTimingEvent[],
  targetSlot: number | undefined,
  replayPitEvents: ReplayPitEvent[],
  maxPoints: number
): LapDetectionResult {
  const cumDist = calculateCumulativeDistance(rawPts);
  let detectedLaps: DetectedLapInternal[] = [];

  const targetTimings = targetSlot !== undefined ? vcrTimingEvents.filter(e => e.drv === targetSlot) : [];
  const finishTimings = targetTimings.filter(e => e.sector === 0).sort((a, b) => a.lapIdx - b.lapIdx);

  if (finishTimings.length >= 1 && rawPts.length >= 2) {
    function findClosestIdx(sTime: number): number {
      let low = 0;
      let high = rawPts.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (rawPts[mid].sTime < sTime) low = mid + 1;
        else high = mid - 1;
      }
      if (low >= rawPts.length) return rawPts.length - 1;
      if (low === 0) return 0;
      return Math.abs(rawPts[low].sTime - sTime) < Math.abs(rawPts[low - 1].sTime - sTime) ? low : low - 1;
    }

    for (let i = 0; i < finishTimings.length; i++) {
      const ft = finishTimings[i];
      const lapNum = ft.lapIdx + 1;
      const finishTime = ft.sTime;
      const startTime = i === 0
        ? (ft.splitSec > 0 ? ft.sTime - ft.splitSec : rawPts[0].sTime)
        : finishTimings[i - 1].sTime;
      const lapTimeSec = ft.splitSec > 0 ? Number(ft.splitSec.toFixed(3)) : Number((finishTime - startTime).toFixed(3));

      const startIdx = findClosestIdx(startTime);
      const endIdx = findClosestIdx(finishTime);
      const lapDist = cumDist[endIdx] - cumDist[startIdx];

      const s1Ev = targetTimings.find(e => e.lapIdx === ft.lapIdx && e.sector === 1);
      const s2Ev = targetTimings.find(e => e.lapIdx === ft.lapIdx && e.sector === 2);

      // Skip aborted/incomplete session flush events
      if (ft.splitSec <= 0 && (!s1Ev || lapTimeSec < 20) && i > 0) {
        continue;
      }
      let s1Sec: number;
      let s2Sec: number;
      let s3Sec: number;
      let s1Idx = startIdx;
      let s2Idx = startIdx;

      const isValidSplit = (v?: number) => typeof v === 'number' && isFinite(v) && v > 0 && v < 1800;

      if (s1Ev && isValidSplit(s1Ev.splitSec)) {
        s1Sec = Number(s1Ev.splitSec.toFixed(3));
        s1Idx = findClosestIdx(s1Ev.sTime);
      } else if (s1Ev && s1Ev.sTime > startTime && (s1Ev.sTime - startTime) < lapTimeSec) {
        s1Idx = findClosestIdx(s1Ev.sTime);
        s1Sec = Number((s1Ev.sTime - startTime).toFixed(3));
      } else {
        const s1TargetDist = cumDist[startIdx] + lapDist * 0.3333;
        while (s1Idx < endIdx && cumDist[s1Idx] < s1TargetDist) s1Idx++;
        s1Sec = Number((rawPts[s1Idx].sTime - rawPts[startIdx].sTime).toFixed(3));
      }

      if (s1Ev && s2Ev && isValidSplit(s1Ev.splitSec) && isValidSplit(s2Ev.splitSec) && s2Ev.splitSec > s1Ev.splitSec && (s2Ev.splitSec - s1Ev.splitSec) < lapTimeSec) {
        s2Sec = Number((s2Ev.splitSec - s1Ev.splitSec).toFixed(3));
        s2Idx = findClosestIdx(s2Ev.sTime);
      } else if (s2Ev && s1Ev && s2Ev.sTime > s1Ev.sTime && (s2Ev.sTime - s1Ev.sTime) < lapTimeSec) {
        s2Idx = findClosestIdx(s2Ev.sTime);
        s2Sec = Number((s2Ev.sTime - s1Ev.sTime).toFixed(3));
      } else if (s2Ev && s2Ev.sTime > startTime && (s2Ev.sTime - startTime) < lapTimeSec && (s2Ev.sTime - startTime) > s1Sec) {
        s2Idx = findClosestIdx(s2Ev.sTime);
        s2Sec = Number((s2Ev.sTime - startTime - s1Sec).toFixed(3));
      } else {
        s2Idx = s1Idx;
        const s2TargetDist = cumDist[startIdx] + lapDist * 0.6667;
        while (s2Idx < endIdx && cumDist[s2Idx] < s2TargetDist) s2Idx++;
        s2Sec = Number((rawPts[s2Idx].sTime - rawPts[s1Idx].sTime).toFixed(3));
      }

      if (s2Ev && isValidSplit(ft.splitSec) && isValidSplit(s2Ev.splitSec) && ft.splitSec > s2Ev.splitSec && (ft.splitSec - s2Ev.splitSec) < lapTimeSec) {
        s3Sec = Number((ft.splitSec - s2Ev.splitSec).toFixed(3));
      } else if (s2Ev && finishTime > s2Ev.sTime && (finishTime - s2Ev.sTime) < lapTimeSec) {
        s3Sec = Number((finishTime - s2Ev.sTime).toFixed(3));
      } else if (lapTimeSec > s1Sec + s2Sec && (lapTimeSec - s1Sec - s2Sec) > 0) {
        s3Sec = Number((lapTimeSec - s1Sec - s2Sec).toFixed(3));
      } else {
        s3Sec = Number((rawPts[endIdx].sTime - rawPts[s2Idx].sTime).toFixed(3));
      }

      const isValid = ft.splitSec > 0;
      const isOutlap = i === 0 || (startIdx >= 0 && Boolean(rawPts[startIdx]?.pitLimiter));

      detectedLaps.push({
        lapNumber: lapNum,
        startIdx,
        endIdx,
        lapTimeSec,
        lapDistMeters: Math.round(lapDist),
        s1Sec,
        s2Sec,
        s3Sec,
        s1Idx,
        s2Idx,
        isOutlap,
        isBest: false,
        isValid,
      });
    }

    // Check if vehicle continued on track after last finish event and completed sectors
    if (finishTimings.length > 0 && rawPts.length > 0) {
      const lastFt = finishTimings[finishTimings.length - 1];
      const lastStartIdx = findClosestIdx(lastFt.sTime);
      const finalIdx = rawPts.length - 1;
      const inProgressDist = cumDist[finalIdx] - cumDist[lastStartIdx];
      const inProgressTime = rawPts[finalIdx].sTime - lastFt.sTime;

      if (inProgressTime > 15 && inProgressDist > 600) {
        const s1Ev = targetTimings.find(e => e.lapIdx === lastFt.lapIdx + 1 && e.sector === 1);
        const s2Ev = targetTimings.find(e => e.lapIdx === lastFt.lapIdx + 1 && e.sector === 2);
        let s1Sec = 0;
        let s2Sec = 0;
        let s3Sec = 0;
        let s1Idx = lastStartIdx;
        let s2Idx = lastStartIdx;

        if (s1Ev && s1Ev.splitSec > 0) {
          s1Sec = Number(s1Ev.splitSec.toFixed(3));
          s1Idx = findClosestIdx(s1Ev.sTime);
        } else if (s1Ev && s1Ev.sTime > lastFt.sTime) {
          s1Idx = findClosestIdx(s1Ev.sTime);
          s1Sec = Number((s1Ev.sTime - lastFt.sTime).toFixed(3));
        } else {
          const s1TargetDist = cumDist[lastStartIdx] + inProgressDist * 0.3333;
          while (s1Idx < finalIdx && cumDist[s1Idx] < s1TargetDist) s1Idx++;
          s1Sec = Number((rawPts[s1Idx].sTime - lastFt.sTime).toFixed(3));
        }

        if (s2Ev && s1Ev && s2Ev.splitSec > s1Ev.splitSec && s1Ev.splitSec > 0) {
          s2Sec = Number((s2Ev.splitSec - s1Ev.splitSec).toFixed(3));
          s2Idx = findClosestIdx(s2Ev.sTime);
        } else if (s2Ev && s1Ev && s2Ev.sTime > s1Ev.sTime) {
          s2Idx = findClosestIdx(s2Ev.sTime);
          s2Sec = Number((s2Ev.sTime - s1Ev.sTime).toFixed(3));
        } else {
          s2Idx = s1Idx;
          const s2TargetDist = cumDist[lastStartIdx] + inProgressDist * 0.6667;
          while (s2Idx < finalIdx && cumDist[s2Idx] < s2TargetDist) s2Idx++;
          s2Sec = Number((rawPts[s2Idx].sTime - rawPts[s1Idx].sTime).toFixed(3));
        }

        s3Sec = Number((rawPts[finalIdx].sTime - rawPts[s2Idx].sTime).toFixed(3));

        detectedLaps.push({
          lapNumber: lastFt.lapIdx + 2,
          startIdx: lastStartIdx,
          endIdx: finalIdx,
          lapTimeSec: Number(inProgressTime.toFixed(3)),
          lapDistMeters: Math.round(inProgressDist),
          s1Sec,
          s2Sec,
          s3Sec,
          s1Idx,
          s2Idx,
          isOutlap: Boolean(rawPts[lastStartIdx]?.pitLimiter || rawPts[lastStartIdx]?.inPit),
          isBest: false,
          isValid: false,
        });
      }
    }

    const validLaps = detectedLaps.filter(l => l.isValid && l.lapTimeSec > 30);
    const validFlying = validLaps.filter(l => !l.isOutlap);
    const pool = validFlying.length > 0 ? validFlying : validLaps;
    let minTime = Infinity;
    let bestLapNum = pool[0]?.lapNumber;
    for (const l of pool) {
      if (l.lapTimeSec < minTime) {
        minTime = l.lapTimeSec;
        bestLapNum = l.lapNumber;
      }
    }
    detectedLaps.forEach(l => {
      if (l.lapNumber === bestLapNum) l.isBest = true;
    });
  }

  if (detectedLaps.length === 0) {
    const startIdx = 0;
    const endIdx = Math.max(0, rawPts.length - 1);
    const lapDist = cumDist.length > 0 ? cumDist[endIdx] - cumDist[startIdx] : 0;
    const s1TargetDist = (cumDist[startIdx] || 0) + lapDist * 0.3333;
    const s2TargetDist = (cumDist[startIdx] || 0) + lapDist * 0.6667;
    let s1Idx = startIdx;
    while (s1Idx < endIdx && cumDist[s1Idx] < s1TargetDist) s1Idx++;
    let s2Idx = s1Idx;
    while (s2Idx < endIdx && cumDist[s2Idx] < s2TargetDist) s2Idx++;

    detectedLaps = [{
      lapNumber: 1,
      startIdx,
      endIdx,
      lapTimeSec: rawPts.length > 0 ? Number((rawPts[endIdx].sTime - rawPts[startIdx].sTime).toFixed(3)) : 0,
      lapDistMeters: Math.round(lapDist),
      s1Sec: rawPts.length > 0 ? Number((rawPts[s1Idx].sTime - rawPts[startIdx].sTime).toFixed(3)) : 0,
      s2Sec: rawPts.length > 0 ? Number((rawPts[s2Idx].sTime - rawPts[s1Idx].sTime).toFixed(3)) : 0,
      s3Sec: rawPts.length > 0 ? Number((rawPts[endIdx].sTime - rawPts[s2Idx].sTime).toFixed(3)) : 0,
      s1Idx,
      s2Idx,
      isOutlap: false,
      isBest: false,
    }];
  }

  const targetPitEvents = targetSlot !== undefined ? replayPitEvents.filter(e => e.driverSlot === targetSlot) : [];
  const { garageIntervals, pitIntervals } = buildPitAndGarageIntervals(targetPitEvents);

  const lapsSummary: ReplayLapSummary[] = detectedLaps.map(l => {
    const rawCount = Math.max(0, l.endIdx - l.startIdx + 1);
    const frameCount = maxPoints > 0 ? Math.min(rawCount, maxPoints) : rawCount;
    return {
      lapNumber: l.lapNumber,
      lapTimeSec: l.lapTimeSec,
      lapDistMeters: l.lapDistMeters,
      s1Sec: l.s1Sec,
      s2Sec: l.s2Sec,
      s3Sec: l.s3Sec,
      isOutlap: l.isOutlap,
      isBest: l.isBest,
      isValid: l.isValid ?? !l.isOutlap,
      startFrame: 0,
      endFrame: frameCount,
    };
  });

  return {
    detectedLaps,
    cumDist,
    garageIntervals,
    pitIntervals,
    lapsSummary,
  };
}
