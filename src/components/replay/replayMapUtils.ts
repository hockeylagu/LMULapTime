import { ReplayTelemetryPoint } from '../../../server/types.js';
import { interpolatePointAtDistance } from '../../utils/replayComparison.js';

export type MapColorMode = 'speed' | 'pedal' | 'delta' | 'default';

// Continuous thermal gradient stops (0..1): blue -> cyan -> green -> amber -> orange -> purple.
const SPEED_GRADIENT: Array<[number, [number, number, number]]> = [
  [0, [2, 132, 199]],     // blue (apex/slow)
  [0.35, [16, 185, 129]], // emerald (mid)
  [0.65, [245, 158, 11]], // amber (high)
  [1, [192, 38, 211]],    // purple/fuchsia (top speed)
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleGradient(stops: Array<[number, [number, number, number]]>, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const localT = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0;
      const r = Math.round(lerp(c0[0], c1[0], localT));
      const g = Math.round(lerp(c0[1], c1[1], localT));
      const b = Math.round(lerp(c0[2], c1[2], localT));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  const last = stops[stops.length - 1][1];
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

const MAX_SPEED_KMH = 280;
const COAST_COLOR = '#475569'; // slate-600, neither pedal is applied
const DELTA_NEUTRAL_COLOR = '#475569';

/**
 * Returns a color string for a telemetry point based on the selected heatmap metric.
 * `deltaTimeSec` (positive = losing time vs baseline, negative = gaining time) is only
 * used when colorBy === 'delta' and must be supplied by the caller (requires a baseline lap).
 */
export function getHeatmapColor(
  p: ReplayTelemetryPoint,
  colorBy: MapColorMode = 'speed',
  deltaTimeSec?: number
): string {
  if (colorBy === 'default') {
    return '#38bdf8';
  }

  if (colorBy === 'pedal') {
    const th = p.throttle || 0;
    const brk = p.brake || 0;
    // Braking dominates when both are non-trivial (trail-braking overlap).
    if (brk > 5 && brk >= th) {
      return sampleGradient([[0, [71, 85, 105]], [1, [239, 68, 68]]], brk / 100);
    }
    if (th > 5) {
      return sampleGradient([[0, [71, 85, 105]], [1, [16, 185, 129]]], th / 100);
    }
    return COAST_COLOR;
  }

  if (colorBy === 'delta') {
    if (deltaTimeSec === undefined || Number.isNaN(deltaTimeSec) || Math.abs(deltaTimeSec) < 0.02) {
      return DELTA_NEUTRAL_COLOR;
    }
    const maxDelta = 0.6; // seconds at which the gradient saturates
    const t = Math.min(1, Math.abs(deltaTimeSec) / maxDelta);
    return deltaTimeSec < 0
      ? sampleGradient([[0, [71, 85, 105]], [1, [16, 185, 129]]], t) // gaining time -> green
      : sampleGradient([[0, [71, 85, 105]], [1, [239, 68, 68]]], t); // losing time -> red
  }

  // Speed: continuous thermal heatmap, Blue (slow) -> Green -> Amber -> Purple (top speed)
  const spd = p.speedKmh || 0;
  return sampleGradient(SPEED_GRADIENT, spd / MAX_SPEED_KMH);
}

export interface ProjectedPoint extends ReplayTelemetryPoint {
  sx: number;
  sy: number;
  idx: number;
}

export function projectTrajectoryPoints(
  points: ReplayTelemetryPoint[],
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number },
  viewBoxSize: number,
  padding: number
): ProjectedPoint[] {
  if (!points || points.length === 0) return [];
  const { minX, minZ, spanX, spanZ } = bounds;
  const maxSpan = Math.max(spanX, spanZ, 1);
  const scale = (viewBoxSize - 2 * padding) / maxSpan;
  const offsetX = padding + ((viewBoxSize - 2 * padding) - spanX * scale) / 2;
  const offsetZ = padding + ((viewBoxSize - 2 * padding) - spanZ * scale) / 2;

  return points.map((p, idx) => ({
    ...p,
    sx: offsetX + (p.x - minX) * scale,
    sy: viewBoxSize - (offsetZ + (p.z - minZ) * scale),
    idx,
  }));
}

export function buildContinuousSvgPath(svgPoints: Array<{ sx: number; sy: number; x: number; z: number; isTeleport?: boolean }>): string {
  if (svgPoints.length === 0) return '';
  let d = '';
  for (let i = 0; i < svgPoints.length; i++) {
    const p = svgPoints[i];
    if (i === 0) {
      d += `M ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
    } else {
      const prev = svgPoints[i - 1];
      const dist = Math.hypot(p.sx - prev.sx, p.sy - prev.sy);
      const worldDist = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (p.isTeleport || worldDist > 20 || dist > 30) {
        d += ` M ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
      } else {
        d += ` L ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
      }
    }
  }
  return d;
}

export function computeGhostPosition(
  primaryDists: number[],
  baseDists: number[],
  baselinePoints: ReplayTelemetryPoint[],
  currentIndex: number,
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number },
  viewBoxSize: number,
  padding: number
) {
  if (
    !baselinePoints || baselinePoints.length === 0 ||
    !primaryDists || primaryDists.length === 0 ||
    !baseDists || baseDists.length === 0
  ) {
    return null;
  }

  const { minX, minZ, spanX, spanZ } = bounds;
  const maxSpan = Math.max(spanX, spanZ, 1);
  const scale = (viewBoxSize - 2 * padding) / maxSpan;
  const offsetX = padding + ((viewBoxSize - 2 * padding) - spanX * scale) / 2;
  const offsetZ = padding + ((viewBoxSize - 2 * padding) - spanZ * scale) / 2;

  const totalPrimary = Math.max(1, primaryDists[primaryDists.length - 1]);
  const totalBase = Math.max(1, baseDists[baseDists.length - 1]);

  const safeIdx = Math.max(0, Math.min(currentIndex, primaryDists.length - 1));
  const fraction = primaryDists[safeIdx] / totalPrimary;
  const targetDist = fraction * totalBase;
  const ghostPt = interpolatePointAtDistance(baselinePoints, baseDists, targetDist);

  return {
    sx: offsetX + (ghostPt.x - minX) * scale,
    sy: viewBoxSize - (offsetZ + (ghostPt.z - minZ) * scale),
    point: ghostPt,
  };
}
