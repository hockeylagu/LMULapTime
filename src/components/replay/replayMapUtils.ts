import { ReplayTelemetryPoint } from '../../../server/types.js';
import { computeCumulativeDistances, interpolatePointAtDistance } from '../../utils/replayComparison.js';

export type MapColorMode = 'speed' | 'throttle' | 'brake' | 'steering' | 'default';

/**
 * Returns a hexadecimal color string for a telemetry point based on the selected metric.
 */
export function getHeatmapColor(
  p: ReplayTelemetryPoint,
  colorBy: MapColorMode = 'speed'
): string {
  if (colorBy === 'throttle') {
    const th = p.throttle || 0;
    if (th > 75) return '#10b981'; // Green
    if (th > 20) return '#f59e0b'; // Amber
    return '#64748b';
  }

  if (colorBy === 'brake') {
    const brk = p.brake || 0;
    if (brk > 50) return '#ef4444'; // Red
    if (brk > 10) return '#f97316'; // Orange
    return '#64748b';
  }

  if (colorBy === 'steering') {
    const st = p.steerYaw || 0;
    if (st < -25) return '#818cf8'; // Indigo
    if (st > 25) return '#f97316';  // Orange
    return '#64748b';
  }

  if (colorBy === 'default') {
    return '#38bdf8';
  }

  // Thermal Speed heatmap: Blue = Apex/Slow -> Green = Exit -> Orange = Fast -> Purple = Top Speed
  const spd = p.speedKmh || 0;
  if (spd > 230) return '#c026d3'; // Purple (Top Speed)
  if (spd > 160) return '#f59e0b'; // Amber/Orange (High Speed)
  if (spd > 90) return '#10b981';  // Emerald Green (Mid Speed)
  return '#0284c7';                 // Blue (Apex / Low Speed)
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

export function computeBaselinePath(
  baselinePoints: ReplayTelemetryPoint[],
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number },
  viewBoxSize: number,
  padding: number
): string {
  if (!baselinePoints || baselinePoints.length === 0) return '';
  const { minX, minZ, spanX, spanZ } = bounds;
  const maxSpan = Math.max(spanX, spanZ, 1);
  const scale = (viewBoxSize - 2 * padding) / maxSpan;
  const offsetX = padding + ((viewBoxSize - 2 * padding) - spanX * scale) / 2;
  const offsetZ = padding + ((viewBoxSize - 2 * padding) - spanZ * scale) / 2;

  const bSvgPts = baselinePoints.map(p => ({
    sx: offsetX + (p.x - minX) * scale,
    sy: viewBoxSize - (offsetZ + (p.z - minZ) * scale),
    x: p.x,
    z: p.z,
    isTeleport: p.isTeleport,
  }));
  return buildContinuousSvgPath(bSvgPts);
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

export function computeGhostProjection(
  points: ReplayTelemetryPoint[],
  baselinePoints: ReplayTelemetryPoint[],
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number },
  currentIndex: number,
  viewBoxSize: number,
  padding: number
) {
  if (!baselinePoints || baselinePoints.length === 0 || !points || points.length === 0) {
    return { baselinePathD: '', baselineGhostPos: null };
  }

  const baselinePathD = computeBaselinePath(baselinePoints, bounds, viewBoxSize, padding);
  const primaryDists = computeCumulativeDistances(points);
  const baseDists = computeCumulativeDistances(baselinePoints);
  const baselineGhostPos = computeGhostPosition(
    primaryDists,
    baseDists,
    baselinePoints,
    currentIndex,
    bounds,
    viewBoxSize,
    padding
  );

  return { baselinePathD, baselineGhostPos };
}
