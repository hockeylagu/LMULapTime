import { ReplayTrajectoryPoint } from '../../../../server/types.js';
import { PointComparison, getTrajectoryDistances } from '../../../utils/replayComparison.js';

// Neutral (0) and reverse (-1) are clamped to 1 since this chart's Y-scale only spans
// forward gears 1-7.
function resolveGear(p: ReplayTrajectoryPoint): number {
  return Math.min(7, Math.max(1, p.gear ?? 1));
}

export interface DeltaGradientStop {
  offset: string;
  color: string;
  opacity: number;
}

export interface CornerPaths {
  fl: string;
  fr: string;
  rl: string;
  rr: string;
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

  // Extended telemetry channels
  rpmPath: string;
  rpmArea: string;
  baselineRpmPath: string;
  maxRpm: number;

  tireTempsPaths: CornerPaths;
  baselineTireTempsPaths: CornerPaths;
  hasTireTemps: boolean;
  minTireTemp: number;
  maxTireTemp: number;

  tireWearPaths: CornerPaths;
  baselineTireWearPaths: CornerPaths;
  hasTireWear: boolean;
  minTireWearPct: number;
  maxTireWearPct: number;

  brakeTempsPaths: CornerPaths;
  baselineBrakeTempsPaths: CornerPaths;
  hasBrakeTemps: boolean;
  maxBrakeTemp: number;

  lateralOffsetPath: string;
  baselineLateralOffsetPath: string;
  hasLateralOffset: boolean;
}

export function computeTelemetryChartPaths(
  points: ReplayTrajectoryPoint[],
  pointComparisons: PointComparison[],
  viewStart: number,
  viewEnd: number,
  distances?: number[]
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
      rpmPath: '',
      rpmArea: '',
      baselineRpmPath: '',
      maxRpm: 9000,
      tireTempsPaths: { fl: '', fr: '', rl: '', rr: '' },
      baselineTireTempsPaths: { fl: '', fr: '', rl: '', rr: '' },
      hasTireTemps: false,
      minTireTemp: 40,
      maxTireTemp: 140,
      tireWearPaths: { fl: '', fr: '', rl: '', rr: '' },
      baselineTireWearPaths: { fl: '', fr: '', rl: '', rr: '' },
      hasTireWear: false,
      minTireWearPct: 0,
      maxTireWearPct: 100,
      brakeTempsPaths: { fl: '', fr: '', rl: '', rr: '' },
      baselineBrakeTempsPaths: { fl: '', fr: '', rl: '', rr: '' },
      hasBrakeTemps: false,
      maxBrakeTemp: 750,
      lateralOffsetPath: '',
      baselineLateralOffsetPath: '',
      hasLateralOffset: false,
    };
  }

  const maxSpd = Math.max(
    260,
    ...points.map(p => p.speedKmh || 0),
    ...(pointComparisons.map(c => c.baseline.speedKmh) || [])
  );

  const rawMaxRpm = Math.max(
    8000,
    ...points.map(p => p.engineRpm || 0),
    ...(pointComparisons.map(c => c.baseline.engineRpm || 0))
  );
  const maxRpm = Math.ceil(rawMaxRpm / 1000) * 1000;

  const hasTireTemps = points.some(p => p.tireTemps !== undefined);
  const hasTireWear = points.some(p => p.tireWear !== undefined);
  const hasBrakeTemps = points.some(p => p.brakeTemps !== undefined);
  const hasLateralOffset = points.some(p => p.lateralOffsetM !== undefined);

  const minTireTemp = 40;
  const maxTireTemp = 130;

  const minTireWearPct = 0;
  const maxTireWearPct = 100;

  const rawMaxBrake = Math.max(
    600,
    ...points.flatMap(p => p.brakeTemps || []),
    ...pointComparisons.flatMap(c => c.baseline.brakeTemps || [])
  );
  const maxBrakeTemp = Math.ceil(rawMaxBrake / 50) * 50;

  const cumDists = distances && distances.length === points.length
    ? distances
    : getTrajectoryDistances(points);
  const distStart = cumDists[viewStart] ?? 0;
  const distEnd = cumDists[viewEnd] ?? distStart;
  const distSpan = Math.max(1e-6, distEnd - distStart);
  const xForIndex = (i: number): number => ((cumDists[i] - distStart) / distSpan) * 1000;

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

  let rpm = '';
  let bRpm = '';

  const tt = { fl: '', fr: '', rl: '', rr: '' };
  const bTt = { fl: '', fr: '', rl: '', rr: '' };

  const tw = { fl: '', fr: '', rl: '', rr: '' };
  const bTw = { fl: '', fr: '', rl: '', rr: '' };

  const bt = { fl: '', fr: '', rl: '', rr: '' };
  const bBt = { fl: '', fr: '', rl: '', rr: '' };

  let lat = '';
  let bLat = '';

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
    const x = xForIndex(i);
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
    const gear = resolveGear(p);
    const gy = 95 - (gear / 7) * 80;
    if (isFirst) {
      gr += `M ${x.toFixed(1)} ${gy.toFixed(1)} `;
    } else {
      const prevP = points[i - 1];
      const prevGear = resolveGear(prevP);
      const prevGy = 95 - (prevGear / 7) * 80;
      gr += `L ${x.toFixed(1)} ${prevGy.toFixed(1)} L ${x.toFixed(1)} ${gy.toFixed(1)} `;
    }

    // Engine RPM: 0 to maxRpm -> 95 to 10 in SVG Y
    if (p.engineRpm !== undefined) {
      const rpmNorm = Math.min(1, Math.max(0, p.engineRpm / maxRpm));
      const ry = 95 - rpmNorm * 85;
      rpm += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${ry.toFixed(1)} `;
    }

    // Tire temps: 4-corner in SVG Y
    if (p.tireTemps) {
      const [flT, frT, rlT, rrT] = p.tireTemps;
      const flY = 95 - Math.min(1, Math.max(0, (flT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
      const frY = 95 - Math.min(1, Math.max(0, (frT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, (rlT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, (rrT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
      tt.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      tt.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      tt.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      tt.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Tire wear: 4-corner in SVG Y (0-255 -> 0-100% remaining)
    if (p.tireWear) {
      const [flW, frW, rlW, rrW] = p.tireWear;
      const flY = 95 - Math.min(1, Math.max(0, flW / 255)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, frW / 255)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, rlW / 255)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, rrW / 255)) * 85;
      tw.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      tw.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      tw.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      tw.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Brake temps: 4-corner in SVG Y
    if (p.brakeTemps) {
      const [flB, frB, rlB, rrB] = p.brakeTemps;
      const flY = 95 - Math.min(1, Math.max(0, flB / maxBrakeTemp)) * 85;
      const frY = 95 - Math.min(1, Math.max(0, frB / maxBrakeTemp)) * 85;
      const rlY = 95 - Math.min(1, Math.max(0, rlB / maxBrakeTemp)) * 85;
      const rrY = 95 - Math.min(1, Math.max(0, rrB / maxBrakeTemp)) * 85;
      bt.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
      bt.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
      bt.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
      bt.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
    }

    // Lateral offset: -10m to +10m -> 90 to 10 in SVG Y (center 0 at 50)
    if (p.lateralOffsetM !== undefined) {
      const latClamped = Math.min(10, Math.max(-10, p.lateralOffsetM));
      const latY = 50 - (latClamped / 10) * 40;
      lat += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${latY.toFixed(1)} `;
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

      if (bp.engineRpm !== undefined) {
        const brpmNorm = Math.min(1, Math.max(0, bp.engineRpm / maxRpm));
        const bry = 95 - brpmNorm * 85;
        bRpm += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${bry.toFixed(1)} `;
      }

      if (bp.tireTemps) {
        const [flT, frT, rlT, rrT] = bp.tireTemps;
        const flY = 95 - Math.min(1, Math.max(0, (flT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
        const frY = 95 - Math.min(1, Math.max(0, (frT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, (rlT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, (rrT - minTireTemp) / (maxTireTemp - minTireTemp))) * 85;
        bTt.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bTt.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bTt.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bTt.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.tireWear) {
        const [flW, frW, rlW, rrW] = bp.tireWear;
        const flY = 95 - Math.min(1, Math.max(0, flW / 255)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, frW / 255)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, rlW / 255)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, rrW / 255)) * 85;
        bTw.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bTw.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bTw.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bTw.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.brakeTemps) {
        const [flB, frB, rlB, rrB] = bp.brakeTemps;
        const flY = 95 - Math.min(1, Math.max(0, flB / maxBrakeTemp)) * 85;
        const frY = 95 - Math.min(1, Math.max(0, frB / maxBrakeTemp)) * 85;
        const rlY = 95 - Math.min(1, Math.max(0, rlB / maxBrakeTemp)) * 85;
        const rrY = 95 - Math.min(1, Math.max(0, rrB / maxBrakeTemp)) * 85;
        bBt.fl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${flY.toFixed(1)} `;
        bBt.fr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${frY.toFixed(1)} `;
        bBt.rl += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rlY.toFixed(1)} `;
        bBt.rr += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${rrY.toFixed(1)} `;
      }

      if (bp.lateralOffsetM !== undefined) {
        const latClamped = Math.min(10, Math.max(-10, bp.lateralOffsetM));
        const latY = 50 - (latClamped / 10) * 40;
        bLat += `${isFirst ? 'M' : 'L'} ${x.toFixed(1)} ${latY.toFixed(1)} `;
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
      const pct = Math.max(0, Math.min(100, xForIndex(i) / 10));
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
    rpmPath: rpm,
    rpmArea: rpm ? `${rpm} L 1000 95 L 0 95 Z` : '',
    baselineRpmPath: bRpm,
    maxRpm,
    tireTempsPaths: tt,
    baselineTireTempsPaths: bTt,
    hasTireTemps,
    minTireTemp,
    maxTireTemp,
    tireWearPaths: tw,
    baselineTireWearPaths: bTw,
    hasTireWear,
    minTireWearPct,
    maxTireWearPct,
    brakeTempsPaths: bt,
    baselineBrakeTempsPaths: bBt,
    hasBrakeTemps,
    maxBrakeTemp,
    lateralOffsetPath: lat,
    baselineLateralOffsetPath: bLat,
    hasLateralOffset,
  };
}
