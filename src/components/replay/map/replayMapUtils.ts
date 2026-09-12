import { ReplayTelemetryPoint } from '../../../../server/types.js';
import { findIndexAtDistance, interpolatePointAtDistance } from '../../../utils/replayComparison.js';

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
  colorBy: MapColorMode = 'pedal',
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

export interface DispersedCornerMarker {
  cornerNumber: number;
  sx: number;
  sy: number;
  idx: number;
  actualSx: number;
  actualSy: number;
}

// Pedal-marker badge geometry, shared with GpsSceneMarkers so corner-flag placement
// stays in sync with where pedal badges are actually rendered.
export const PEDAL_MARKER_LINE_HALF_LEN = 17;
export const PEDAL_MARKER_TAG_BASE_OFFSET = 9;
export const PEDAL_MARKER_TAG_STAGGER_OFFSET = 26;

function distanceToPolyline(
  px: number,
  py: number,
  points: ProjectedPoint[],
  step = 3
): number {
  if (!points || points.length === 0) return Infinity;
  let minDistSq = Infinity;
  for (let i = 0; i < points.length; i += step) {
    const pt = points[i];
    const dx = px - pt.sx;
    const dy = py - pt.sy;
    const dSq = dx * dx + dy * dy;
    if (dSq < minDistSq) {
      minDistSq = dSq;
    }
  }
  return Math.sqrt(minDistSq);
}

/**
 * Calculates corner flag positions on the 2D map with trajectory clearance checking
 * so flags are never placed on top of either the primary racing line or the baseline racing line.
 */
export function computeDispersedCornerMarkers(
  corners: Array<{ cornerNumber: number; minDistM: number }> | undefined,
  primaryDists: number[],
  baselineDists: number[],
  svgPoints: ProjectedPoint[],
  baselineSvgPoints?: ProjectedPoint[],
  pedalMarkers?: Array<{ sx: number; sy: number; nx?: number; ny?: number; isStaggered?: boolean }>
): DispersedCornerMarker[] {
  if (!corners || corners.length === 0 || svgPoints.length === 0) return [];
  const totalPrimaryDist = primaryDists[primaryDists.length - 1] || 0;
  const totalBaselineDist = baselineDists[baselineDists.length - 1] || 0;
  const canRescale = totalPrimaryDist > 0 && totalBaselineDist > 0;

  const markers: DispersedCornerMarker[] = [];
  const candidateDistances = [38, 46, 54, 62, 70];

  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const targetDist = canRescale ? (c.minDistM / totalBaselineDist) * totalPrimaryDist : c.minDistM;
    const idx = findIndexAtDistance(primaryDists, targetDist);
    const pt = svgPoints[Math.min(idx, svgPoints.length - 1)];
    if (!pt) continue;

    const prev = svgPoints[Math.max(0, pt.idx - 3)] ?? pt;
    const next = svgPoints[Math.min(svgPoints.length - 1, pt.idx + 3)] ?? pt;
    const dx = next.sx - prev.sx;
    const dy = next.sy - prev.sy;
    const headingLen = Math.hypot(dx, dy) || 1;
    const nx = -dy / headingLen;
    const ny = dx / headingLen;

    // Cross product to find the outside of the turn
    const cross = (pt.sx - prev.sx) * (next.sy - pt.sy) - (pt.sy - prev.sy) * (next.sx - pt.sx);
    const outsideSign = cross >= 0 ? -1 : 1;
    const sides = [outsideSign, -outsideSign];

    let bestCand = {
      sx: pt.sx + nx * outsideSign * 42,
      sy: pt.sy + ny * outsideSign * 42,
      score: -Infinity,
    };

    for (const side of sides) {
      for (const dist of candidateDistances) {
        const candX = pt.sx + nx * side * dist;
        const candY = pt.sy + ny * side * dist;

        const distPrim = distanceToPolyline(candX, candY, svgPoints, 3);
        const distBase = baselineSvgPoints && baselineSvgPoints.length > 0
          ? distanceToPolyline(candX, candY, baselineSvgPoints, 3)
          : Infinity;
        const clearance = Math.min(distPrim, distBase);

        const distToExisting = markers.length === 0
          ? 100
          : markers.reduce((minD, m) => Math.min(minD, Math.hypot(candX - m.sx, candY - m.sy)), Infinity);

        // Clearance to nearby pedal marker badges
        const distToPedal = pedalMarkers && pedalMarkers.length > 0
          ? pedalMarkers.reduce((minD, pm) => {
              const pmNx = pm.nx ?? 0;
              const pmNy = pm.ny ?? 1;
              const tagDist = PEDAL_MARKER_LINE_HALF_LEN + (pm.isStaggered ? PEDAL_MARKER_TAG_STAGGER_OFFSET : PEDAL_MARKER_TAG_BASE_OFFSET);
              const tagX = pm.sx + pmNx * tagDist;
              const tagY = pm.sy + pmNy * tagDist;
              return Math.min(minD, Math.hypot(candX - tagX, candY - tagY));
            }, Infinity)
          : Infinity;

        let score = 0;
        if (clearance < 26) {
          score = -1000 + clearance * 10;
        } else if (distToPedal < 30) {
          // Massive penalty if candidate overlaps with a pedal marker badge
          score = -1500 + distToPedal * 10;
        } else {
          score = Math.min(clearance, 60) * 4;
          if (side === outsideSign) score += 30; // prefer outside runoff area
          score += Math.min(distToExisting, 40);
          if (distToPedal < 42) {
            score -= (42 - distToPedal) * 10;
          }
          score -= dist * 0.25; // slight preference for reasonable distance
        }

        if (score > bestCand.score) {
          bestCand = { sx: candX, sy: candY, score };
        }
      }
    }

    markers.push({
      cornerNumber: c.cornerNumber,
      sx: bestCand.sx,
      sy: bestCand.sy,
      idx: pt.idx,
      actualSx: pt.sx,
      actualSy: pt.sy,
    });
  }

  // Multi-pass collision repulsion relaxation to ensure no two markers ever overlap
  const MIN_SEPARATION = 32;
  for (let pass = 0; pass < 6; pass++) {
    let hadCollision = false;
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const m1 = markers[i];
        const m2 = markers[j];
        const dX = m2.sx - m1.sx;
        const dY = m2.sy - m1.sy;
        const dist = Math.hypot(dX, dY);
        if (dist < MIN_SEPARATION) {
          hadCollision = true;
          const overlap = MIN_SEPARATION - dist;
          const pushX = dist > 0.001 ? dX / dist : (i % 2 === 0 ? 1 : -1);
          const pushY = dist > 0.001 ? dY / dist : 0;
          const half = overlap / 2;
          m1.sx -= pushX * half;
          m1.sy -= pushY * half;
          m2.sx += pushX * half;
          m2.sy += pushY * half;
        }
      }
    }

    // Anchor tether constraint: prevent markers from collapsing onto the track line
    for (const m of markers) {
      const dX = m.sx - m.actualSx;
      const dY = m.sy - m.actualSy;
      const tetherDist = Math.hypot(dX, dY);
      if (tetherDist < 30) {
        const scale = tetherDist > 0.001 ? 38 / tetherDist : 1;
        m.sx = m.actualSx + (tetherDist > 0.001 ? dX * scale : 38);
        m.sy = m.actualSy + (tetherDist > 0.001 ? dY * scale : 0);
      }
    }

    if (!hadCollision) break;
  }

  return markers;
}
