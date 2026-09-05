import { ReplayTrajectoryPoint } from '../../../server/types.js';
import { PointComparison } from '../../utils/replayComparison.js';

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
  if (pointComparisons.length > 0) {
    const visibleComps = pointComparisons.slice(viewStart, viewEnd + 1);
    const deltas = visibleComps
      .map(c => Math.abs(c.deltaTimeSec))
      .filter(d => !isNaN(d) && isFinite(d));
    const rawMax = Math.max(0.5, ...deltas);
    maxDelta = Math.min(8, Math.max(1.0, Math.ceil(rawMax * 2) / 2));
  }

  let dtPath = '';

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
    deltaTimeArea: dtPath ? `${dtPath} L 1000 50 L 0 50 Z` : '',
    maxDeltaSec: maxDelta,
  };
}
