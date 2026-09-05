import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { PointComparison } from '../../utils/replayComparison.js';

export interface DeltaGradientStop {
  offset: string;
  color: string;
  opacity: number;
}

export interface TelemetryChartPathsResult {
  speedPath: string;
  throttlePath: string;
  throttleArea: string;
  brakePath: string;
  brakeArea: string;
  steerPath: string;
  gearPath: string;
  baselineSpeedPath: string;
  baselineThrottlePath: string;
  baselineBrakePath: string;
  baselineSteerPath: string;
  baselineGearPath: string;
  deltaTimePath: string;
  deltaTimeArea: string;
  deltaGainArea: string;
  deltaLossArea: string;
  deltaGradientStops: DeltaGradientStop[];
  maxDeltaSec: number;
}

export function computeTelemetryChartPaths(
  points: ReplayTrajectoryPoint[],
  pointComparisons: PointComparison[],
  viewStart: number,
  viewEnd: number,
  viewSpan: number
): TelemetryChartPathsResult {
  if (points.length === 0) {
    return {
      speedPath: '',
      throttlePath: '',
      throttleArea: '',
      brakePath: '',
      brakeArea: '',
      steerPath: '',
      gearPath: '',
      baselineSpeedPath: '',
      baselineThrottlePath: '',
      baselineBrakePath: '',
      baselineSteerPath: '',
      baselineGearPath: '',
      deltaTimePath: '',
      deltaTimeArea: '',
      deltaGainArea: '',
      deltaLossArea: '',
      deltaGradientStops: [],
      maxDeltaSec: 1,
    };
  }

  const maxSpd = Math.max(
    260,
    ...points.map(p => p.speedKmh || 0),
    ...(pointComparisons.map(c => c.baseline.speedKmh) || [])
  );

  let spd = '';
  let thr = '';
  let brk = '';
  let str = '';
  let gr = '';

  let bSpd = '';
  let bThr = '';
  let bBrk = '';
  let bStr = '';
  let bGr = '';

  let maxDelta = 1.0;
  const rates = new Map<number, number>();

  if (pointComparisons.length > 0) {
    const visibleComps = pointComparisons.slice(viewStart, viewEnd + 1);
    const deltas = visibleComps
      .map(c => Math.abs(c.deltaTimeSec))
      .filter(d => !isNaN(d) && isFinite(d));
    const rawMax = Math.max(0.5, ...deltas);
    maxDelta = Math.min(8, Math.max(1.0, Math.ceil(rawMax * 2) / 2));

    // Pre-calculate smoothed rate of change using a centered window (+/- 3 points)
    // Rate < 0: gaining time (becoming faster). Rate > 0: losing time (becoming slower).
    const W = 3;
    for (let i = viewStart; i <= viewEnd; i++) {
      if (!pointComparisons[i]) continue;
      const iPrev = Math.max(viewStart, i - W);
      const iNext = Math.min(viewEnd, i + W);
      const cPrev = pointComparisons[iPrev] || pointComparisons[i];
      const cNext = pointComparisons[iNext] || pointComparisons[i];
      const dtDiff = cNext.deltaTimeSec - cPrev.deltaTimeSec;
      const tDiff = Math.max(0.04, (points[iNext]?.timeSec ?? 0) - (points[iPrev]?.timeSec ?? 0));
      rates.set(i, dtDiff / tDiff);
    }
  }

  let dtPath = '';
  let dtGainArea = '';
  let dtLossArea = '';
  let prevDtX = 0;
  let prevDtY = 50;
  let firstDtX: number | null = null;
  let lastDtX = 0;
  let prevComp: PointComparison | null = null;

  for (let i = viewStart; i <= viewEnd; i++) {
    const p = points[i];
    const x = ((i - viewStart) / viewSpan) * 1000;
    const isFirst = i === viewStart;

    // Speed: 0 to maxSpd km/h -> 95 to 10 in SVG Y
    const spdNorm = Math.min(1, Math.max(0, (p.speedKmh || 0) / maxSpd));
    const sy = 95 - spdNorm * 85;
    spd += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${sy.toFixed(1)} `;

    // Throttle: 0 to 100% -> 95 to 10 in SVG Y
    const thrNorm = Math.min(1, Math.max(0, (p.throttle || 0) / 100));
    const ty = 95 - thrNorm * 85;
    thr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${ty.toFixed(1)} `;

    // Brake: 0 to 100% -> 95 to 10 in SVG Y
    const brkNorm = Math.min(1, Math.max(0, (p.brake || 0) / 100));
    const by = 95 - brkNorm * 85;
    brk += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${by.toFixed(1)} `;

    // Steering: -180 to +180 deg -> 10 to 90, center at 50
    const st = Math.min(180, Math.max(-180, p.steerYaw || 0));
    const sty = 50 + (st / 180) * 40;
    str += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${sty.toFixed(1)} `;

    // Gear: 1 to 7 -> 95 to 15 in SVG Y
    const gear = Math.min(7, Math.max(1, p.speedKmh && p.speedKmh > 5 ? Math.min(7, Math.floor(p.speedKmh / 38) + 1) : 1));
    const gy = 95 - (gear / 7) * 80;
    if (isFirst) {
      gr += `M ${x.toFixed(1)} ${gy.toFixed(1)} `;
    } else {
      const prevP = points[i - 1];
      const prevGear = Math.min(7, Math.max(1, prevP.speedKmh && prevP.speedKmh > 5 ? Math.min(7, Math.floor(prevP.speedKmh / 38) + 1) : 1));
      const prevGy = 95 - (prevGear / 7) * 80;
      gr += `L ${x.toFixed(1)} ${prevGy.toFixed(1)} L ${x.toFixed(1)} ${gy.toFixed(1)} `;
    }

    // Baseline comparisons
    if (pointComparisons[i]) {
      const comp = pointComparisons[i];
      const bp = comp.baseline;

      const bSpdNorm = Math.min(1, Math.max(0, (bp.speedKmh || 0) / maxSpd));
      const bsy = 95 - bSpdNorm * 85;
      bSpd += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bsy.toFixed(1)} `;

      const bThrNorm = Math.min(1, Math.max(0, (bp.throttle || 0) / 100));
      const bty = 95 - bThrNorm * 85;
      bThr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bty.toFixed(1)} `;

      const bBrkNorm = Math.min(1, Math.max(0, (bp.brake || 0) / 100));
      const bby = 95 - bBrkNorm * 85;
      bBrk += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bby.toFixed(1)} `;

      const bst = Math.min(180, Math.max(-180, bp.steerYaw || 0));
      const bsty = 50 + (bst / 180) * 40;
      bStr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bsty.toFixed(1)} `;

      const bGy = 95 - (bp.gear / 7) * 80;
      if (isFirst) {
        bGr += `M ${x.toFixed(1)} ${bGy.toFixed(1)} `;
      } else {
        const prevBp = pointComparisons[i - 1]?.baseline || bp;
        const prevBgy = 95 - (prevBp.gear / 7) * 80;
        bGr += `L ${x.toFixed(1)} ${prevBgy.toFixed(1)} L ${x.toFixed(1)} ${bGy.toFixed(1)} `;
      }

      // Delta time: negative is faster (above zero line, Y < 50), positive is slower (below, Y > 50)
      const dtNorm = Math.max(-1, Math.min(1, comp.deltaTimeSec / maxDelta));
      const dty = 50 + dtNorm * 40;
      dtPath += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${dty.toFixed(1)} `;

      if (firstDtX === null) firstDtX = x;
      lastDtX = x;

      if (!isFirst && prevComp) {
        // Suppress jitter in steady/flat zones: only assign to gain/loss trapezoids when rate exceeds deadband
        const rate = rates.get(i) ?? 0;
        const trapezoid = `M ${prevDtX.toFixed(1)} 50 L ${prevDtX.toFixed(1)} ${prevDtY.toFixed(1)} L ${x.toFixed(1)} ${dty.toFixed(1)} L ${x.toFixed(1)} 50 Z `;
        if (rate < -0.015) {
          dtGainArea += trapezoid;
        } else if (rate > 0.015) {
          dtLossArea += trapezoid;
        }
      }

      prevDtX = x;
      prevDtY = dty;
      prevComp = comp;
    }
  }

  // Generate smooth horizontal gradient stops with dynamic intensity and deadband fading
  const dtStops: DeltaGradientStop[] = [];
  if (pointComparisons.length > 0) {
    const totalComps = viewEnd - viewStart + 1;
    const step = Math.max(1, Math.floor(totalComps / 100));
    let prevColor: string | null = null;

    for (let i = viewStart; i <= viewEnd; i += step) {
      if (!pointComparisons[i]) continue;
      const pct = Math.max(0, Math.min(100, ((i - viewStart) / viewSpan) * 100));
      const rate = rates.get(i) ?? 0;
      const absRate = Math.abs(rate);

      let opacity = 0;
      const color = rate < 0 ? '#10b981' : '#ef4444';

      if (absRate >= 0.015) {
        // High delta rate of change -> rich vibrant color (opacity up to 0.75)
        const norm = Math.min(1.0, (absRate - 0.015) / (0.16 - 0.015));
        const smooth = norm * norm * (3 - 2 * norm);
        opacity = 0.08 + 0.67 * smooth;
      }

      // If transitioning between green and red, insert zero-opacity stops to prevent color bleed
      if (prevColor && prevColor !== color && opacity > 0) {
        dtStops.push({
          offset: `${Math.max(0, pct - 0.2).toFixed(1)}%`,
          color: prevColor,
          opacity: 0,
        });
        dtStops.push({
          offset: `${pct.toFixed(1)}%`,
          color,
          opacity: 0,
        });
      }

      dtStops.push({
        offset: `${pct.toFixed(1)}%`,
        color,
        opacity: Number(opacity.toFixed(2)),
      });
      prevColor = color;
    }

    if (dtStops.length > 0 && parseFloat(dtStops[dtStops.length - 1].offset) < 99.5) {
      const lastStop = dtStops[dtStops.length - 1];
      dtStops.push({
        offset: '100%',
        color: lastStop.color,
        opacity: lastStop.opacity,
      });
    }
  }

  return {
    speedPath: spd,
    throttlePath: thr,
    throttleArea: `${thr} L 1000 95 L 0 95 Z`,
    brakePath: brk,
    brakeArea: `${brk} L 1000 95 L 0 95 Z`,
    steerPath: str,
    gearPath: gr,
    baselineSpeedPath: bSpd,
    baselineThrottlePath: bThr,
    baselineBrakePath: bBrk,
    baselineSteerPath: bStr,
    baselineGearPath: bGr,
    deltaTimePath: dtPath,
    deltaTimeArea: dtPath && firstDtX !== null ? `${dtPath} L ${lastDtX.toFixed(1)} 50 L ${firstDtX.toFixed(1)} 50 Z` : '',
    deltaGainArea: dtGainArea,
    deltaLossArea: dtLossArea,
    deltaGradientStops: dtStops,
    maxDeltaSec: maxDelta,
  };
}
