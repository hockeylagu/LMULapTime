import { ReplayTelemetryPoint } from '../../../../shared/types/index.js';
import { interpolatePointAtDistance } from '../../../utils/replayComparison.js';
import { findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { TrackBoundaryGeometry } from './useTrackBoundaryGeometry.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import { BRAKE_ON_THRESHOLD_PCT } from '../../../utils/cornerAnalysis/index.js';

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

/**
 * Colour steps per gradient. The racing line is drawn as one path per run of equal colour
 * (buildTrackLineRuns), so a continuous gradient would give every sample its own path; 32 steps
 * (~9 km/h each in speed mode) look continuous on a 2 px line.
 */
const GRADIENT_LEVELS = 32;

function sampleGradient(stops: Array<[number, [number, number, number]]>, t: number): string {
  const clamped = Math.round(Math.min(1, Math.max(0, t)) * GRADIENT_LEVELS) / GRADIENT_LEVELS;
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
const COAST_COLOR = TELEMETRY_COLORS.neutral; // slate-600, neither pedal is applied
const DELTA_NEUTRAL_COLOR = TELEMETRY_COLORS.neutral;

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
    return TELEMETRY_COLORS.primary;
  }

  if (colorBy === 'pedal') {
    const th = p.throttle || 0;
    const brk = p.brake || 0;
    // Braking dominates when both are non-trivial (trail-braking overlap). It starts at the
    // same threshold as the brake markers and at a clearly red tone (not the coast grey), so a
    // gradual brake build-up is visible exactly where the brake marker says braking begins.
    if (brk >= BRAKE_ON_THRESHOLD_PCT && brk >= th) {
      return sampleGradient([[0, [153, 27, 27]], [1, [239, 68, 68]]], (brk - BRAKE_ON_THRESHOLD_PCT) / (100 - BRAKE_ON_THRESHOLD_PCT));
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
      if (isLineBreak(svgPoints[i - 1], p)) {
        d += ` M ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
      } else {
        d += ` L ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
      }
    }
  }
  return d;
}

/** True where the line must not be drawn from `prev` to `p` (a teleport or a recording gap). */
export function isLineBreak(prev: { sx: number; sy: number; x: number; z: number }, p: { sx: number; sy: number; x: number; z: number; isTeleport?: boolean }): boolean {
  return Boolean(p.isTeleport) || Math.hypot(p.x - prev.x, p.z - prev.z) > 20 || Math.hypot(p.sx - prev.sx, p.sy - prev.sy) > 30;
}

export interface TrackLineRun {
  /** SVG path through the run's vertices. */
  d: string;
  color: string;
  isHighlighted: boolean;
  /** Positions in the projected points of the run's first and last vertex. */
  from: number;
  to: number;
  minSx?: number;
  maxSx?: number;
  minSy?: number;
  maxSy?: number;
}

export interface ViewBoxRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function parseViewBox(viewBox?: string | null, marginRatio = 1.2): ViewBoxRect | null {
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) return null;
  const [vx, vy, vw, vh] = parts;
  const marginX = vw * marginRatio;
  const marginY = vh * marginRatio;
  return {
    minX: vx - marginX,
    minY: vy - marginY,
    maxX: vx + vw + marginX,
    maxY: vy + vh + marginY,
  };
}

export function isRunInViewBox(run: TrackLineRun, box: ViewBoxRect | null): boolean {
  if (!box || run.minSx === undefined || run.maxSx === undefined || run.minSy === undefined || run.maxSy === undefined) return true;
  return !(run.maxSx < box.minX || run.minSx > box.maxX || run.maxSy < box.minY || run.minSy > box.maxY);
}

export function isPointInViewBox(sx: number, sy: number, box: ViewBoxRect | null): boolean {
  if (!box) return true;
  return sx >= box.minX && sx <= box.maxX && sy >= box.minY && sy <= box.maxY;
}

/**
 * The racing line as runs of consecutive segments sharing a colour and highlight state, one path
 * each, instead of one SVG element per sample (tens of thousands at full resolution, which the
 * browser re-rasterises on every pan or zoom). A segment takes the style of its end sample.
 */
export function buildTrackLineRuns(
  points: ProjectedPoint[],
  colorOf: (p: ProjectedPoint) => string,
  isHighlightedAt: (p: ProjectedPoint) => boolean
): TrackLineRun[] {
  const runs: TrackLineRun[] = [];
  let run: TrackLineRun | null = null;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const p = points[i];
    if (isLineBreak(prev, p)) {
      run = null;
      continue;
    }
    const color = colorOf(p);
    const isHighlighted = isHighlightedAt(p);
    if (run && run.to === i - 1 && run.color === color && run.isHighlighted === isHighlighted) {
      run.d += ` L ${p.sx.toFixed(2)} ${p.sy.toFixed(2)}`;
      run.to = i;
      run.minSx = Math.min(run.minSx!, p.sx);
      run.maxSx = Math.max(run.maxSx!, p.sx);
      run.minSy = Math.min(run.minSy!, p.sy);
      run.maxSy = Math.max(run.maxSy!, p.sy);
    } else {
      run = {
        d: `M ${prev.sx.toFixed(2)} ${prev.sy.toFixed(2)} L ${p.sx.toFixed(2)} ${p.sy.toFixed(2)}`,
        color,
        isHighlighted,
        from: i - 1,
        to: i,
        minSx: Math.min(prev.sx, p.sx),
        maxSx: Math.max(prev.sx, p.sx),
        minSy: Math.min(prev.sy, p.sy),
        maxSy: Math.max(prev.sy, p.sy),
      };
      runs.push(run);
    }
  }
  return runs;
}

/** Position (in `points`, between `from` and `to`) of the vertex nearest to (sx, sy). */
export function nearestRunVertex(points: ProjectedPoint[], from: number, to: number, sx: number, sy: number): number {
  let best = from;
  let bestDistSq = Infinity;
  for (let i = from; i <= to; i++) {
    const dSq = (points[i].sx - sx) ** 2 + (points[i].sy - sy) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = i;
    }
  }
  return best;
}

export function projectBoundaryPoints(
  points: Array<[number, number]>,
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number },
  viewBoxSize: number,
  padding: number
): Array<{ sx: number; sy: number }> {
  if (!points || points.length === 0) return [];
  const { minX, minZ, spanX, spanZ } = bounds;
  const maxSpan = Math.max(spanX, spanZ, 1);
  const scale = (viewBoxSize - 2 * padding) / maxSpan;
  const offsetX = padding + ((viewBoxSize - 2 * padding) - spanX * scale) / 2;
  const offsetZ = padding + ((viewBoxSize - 2 * padding) - spanZ * scale) / 2;

  return points.map(([x, z]) => ({
    sx: offsetX + (x - minX) * scale,
    sy: viewBoxSize - (offsetZ + (z - minZ) * scale),
  }));
}

export function buildRoadRibbonSvgPath(
  leftSvg: Array<{ sx: number; sy: number }>,
  rightSvg: Array<{ sx: number; sy: number }>
): string {
  if (leftSvg.length === 0 || rightSvg.length === 0) return '';
  // Separate closed rings form an annulus with evenodd fill: no cross-track start/finish seam.
  return `${buildClosedSvgPath(leftSvg)} ${buildClosedSvgPath(rightSvg)}`;
}

export function buildClosedSvgPath(pts: Array<{ sx: number; sy: number }>): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].sx.toFixed(1)} ${pts[0].sy.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].sx.toFixed(1)} ${pts[i].sy.toFixed(1)}`;
  }
  d += ' Z';
  return d;
}

export function computeTrackBoundaryPathD(
  centerlineSvgPoints: Array<{ sx: number; sy: number }>,
  leftSvgPoints: Array<{ sx: number; sy: number }>,
  rightSvgPoints: Array<{ sx: number; sy: number }>
): string | undefined {
  if (centerlineSvgPoints.length > 0) {
    return buildClosedSvgPath(centerlineSvgPoints);
  }
  if (leftSvgPoints.length > 0 && rightSvgPoints.length > 0 && leftSvgPoints.length === rightSvgPoints.length) {
    const midpoints = leftSvgPoints.map((pt, i) => ({
      sx: (pt.sx + rightSvgPoints[i].sx) / 2,
      sy: (pt.sy + rightSvgPoints[i].sy) / 2,
    }));
    return buildClosedSvgPath(midpoints);
  }
  if (leftSvgPoints.length > 0) {
    return buildClosedSvgPath(leftSvgPoints);
  }
  if (rightSvgPoints.length > 0) {
    return buildClosedSvgPath(rightSvgPoints);
  }
  return undefined;
}


/**
 * Where the baseline car is when the primary car is at `currentIndex`: the baseline sampled at
 * the primary's distance, with `baselineDists` already in the primary lap's frame (matched on
 * track station - see getDistancesInReferenceFrame). Both laps start on the line (the server puts
 * them there), so the ghost does too.
 */
export function computeGhostPosition(
  primaryDists: number[],
  baselineDists: number[],
  baselinePoints: ReplayTelemetryPoint[],
  currentIndex: number,
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number },
  viewBoxSize: number,
  padding: number
) {
  if (
    !baselinePoints || baselinePoints.length === 0 ||
    !primaryDists || primaryDists.length === 0 ||
    !baselineDists || baselineDists.length === 0
  ) {
    return null;
  }

  const { minX, minZ, spanX, spanZ } = bounds;
  const maxSpan = Math.max(spanX, spanZ, 1);
  const scale = (viewBoxSize - 2 * padding) / maxSpan;
  const offsetX = padding + ((viewBoxSize - 2 * padding) - spanX * scale) / 2;
  const offsetZ = padding + ((viewBoxSize - 2 * padding) - spanZ * scale) / 2;

  const safeIdx = Math.max(0, Math.min(currentIndex, primaryDists.length - 1));
  const index = Math.floor(safeIdx);
  const nextDist = primaryDists[Math.min(index + 1, primaryDists.length - 1)];
  const distance = primaryDists[index] + (nextDist - primaryDists[index]) * (safeIdx - index);
  const ghostPt = interpolatePointAtDistance(baselinePoints, baselineDists, distance);

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

export interface MappedPedalMarker {
  cornerNumber: number;
  distM: number;
  kind: 'brake' | 'throttle';
  isBaseline?: boolean;
  sx: number;
  sy: number;
  nx: number;
  ny: number;
  isStaggered: boolean;
}

export function computePedalMarkerPoints(
  showPedalMarkers: boolean,
  pedalMarkers: Array<{ cornerNumber: number; distM: number; kind: 'brake' | 'throttle'; isBaseline?: boolean }> | undefined,
  primaryDists: number[],
  baselineDists: number[],
  svgPoints: ProjectedPoint[],
  baselineSvgPoints: ProjectedPoint[],
  baselinePoints?: ReplayTelemetryPoint[]
): MappedPedalMarker[] {
  if (!showPedalMarkers || !pedalMarkers || pedalMarkers.length === 0 || svgPoints.length === 0) return [];
  const mapped: MappedPedalMarker[] = pedalMarkers
    .map(m => {
      const useBaseline = Boolean(m.isBaseline && baselinePoints && baselinePoints.length > 0 && baselineSvgPoints.length > 0);
      const dists = useBaseline ? baselineDists : primaryDists;
      const pts = useBaseline ? baselineSvgPoints : svgPoints;
      const idx = findIndexAtDistance(dists, m.distM);
      const pt = pts[Math.min(idx, pts.length - 1)];
      if (!pt) return null;
      // Place the marker at the exact distance along the line, not the nearest sample.
      const lo = dists[pt.idx] <= m.distM ? pt.idx : Math.max(0, pt.idx - 1);
      const hi = Math.min(pts.length - 1, lo + 1);
      const span = (dists[hi] ?? 0) - (dists[lo] ?? 0);
      const t = span > 0 ? Math.min(1, Math.max(0, (m.distM - dists[lo]) / span)) : 0;
      const sx = pts[lo].sx + t * (pts[hi].sx - pts[lo].sx);
      const sy = pts[lo].sy + t * (pts[hi].sy - pts[lo].sy);
      const prev = pts[Math.max(0, pt.idx - 2)] ?? pt;
      const next = pts[Math.min(pts.length - 1, pt.idx + 2)] ?? pt;
      const dx = next.sx - prev.sx;
      const dy = next.sy - prev.sy;
      const headingLen = Math.hypot(dx, dy) || 1;
      return { ...m, sx, sy, nx: -dy / headingLen, ny: dx / headingLen, isStaggered: false };
    })
    .filter((m): m is MappedPedalMarker => m !== null);

  for (const bMarker of mapped) {
    if (!bMarker.isBaseline) continue;
    const primMarker = mapped.find(p => !p.isBaseline && p.cornerNumber === bMarker.cornerNumber && p.kind === bMarker.kind);
    if (primMarker && Math.hypot(bMarker.sx - primMarker.sx, bMarker.sy - primMarker.sy) < 22) {
      bMarker.isStaggered = true;
    }
  }

  return mapped;
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
 * Corner apex distances are in the primary lap's frame (see computeLapSegmentComparisons), so
 * each flag is anchored on the primary line at that distance, whatever the baseline.
 */
export function computeDispersedCornerMarkers(
  corners: Array<{ cornerNumber: number; minDistM: number }> | undefined,
  primaryDists: number[],
  svgPoints: ProjectedPoint[],
  baselineSvgPoints?: ProjectedPoint[],
  pedalMarkers?: Array<{ sx: number; sy: number; nx?: number; ny?: number; isStaggered?: boolean }>
): DispersedCornerMarker[] {
  if (!corners || corners.length === 0 || svgPoints.length === 0) return [];

  const markers: DispersedCornerMarker[] = [];
  const candidateDistances = [38, 46, 54, 62, 70];

  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    const idx = findIndexAtDistance(primaryDists, c.minDistM);
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

export function computeEffectiveBounds(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; spanX?: number; spanZ?: number },
  trackBounds?: { minX: number; maxX: number; minZ: number; maxZ: number; spanX?: number; spanZ?: number } | null,
  baselinePoints?: Array<{ x: number; z: number }>
) {
  let minX = bounds.minX;
  let maxX = bounds.maxX;
  let minZ = bounds.minZ;
  let maxZ = bounds.maxZ;

  if (trackBounds) {
    minX = Math.min(minX, trackBounds.minX);
    maxX = Math.max(maxX, trackBounds.maxX);
    minZ = Math.min(minZ, trackBounds.minZ);
    maxZ = Math.max(maxZ, trackBounds.maxZ);
  }

  if (baselinePoints && baselinePoints.length > 0) {
    for (let i = 0; i < baselinePoints.length; i++) {
      const p = baselinePoints[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
  }

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    spanX: Math.max(maxX - minX, 1),
    spanZ: Math.max(maxZ - minZ, 1),
  };
}


/**
 * Delta colouring for the baseline line: each baseline sample takes the delta of the primary
 * sample at the same distance, `baselineDists` being in the primary lap's frame.
 */
export function computeBaselineDeltaByIdx(
  deltaByIdx: number[] | null,
  primaryDists: number[],
  baselineDists: number[]
): number[] | null {
  if (!deltaByIdx || deltaByIdx.length === 0 || primaryDists.length === 0 || baselineDists.length === 0) return null;
  return baselineDists.map(d => deltaByIdx[Math.min(findIndexAtDistance(primaryDists, d), deltaByIdx.length - 1)]);
}

export interface GpsStartFinishGateProjection {
  gateLeftSvg: { sx: number; sy: number } | null;
  gateRightSvg: { sx: number; sy: number } | null;
}

export interface TrackSceneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  spanX: number;
  spanZ: number;
}

/**
 * Projects canonical start/finish gate geometry into SVG coordinates.
 */
export function projectStartFinishGate(
  geometry: TrackBoundaryGeometry | null | undefined,
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number } | null | undefined,
  viewBoxSize: number,
  padding: number
): GpsStartFinishGateProjection {
  const gate = geometry?.timingGates?.startFinish;
  let gateLeftSvg: { sx: number; sy: number } | null = null;
  let gateRightSvg: { sx: number; sy: number } | null = null;

  if (bounds && gate && (gate.left[0] !== gate.right[0] || gate.left[1] !== gate.right[1])) {
    const [left, right] = projectBoundaryPoints([gate.left, gate.right], bounds, viewBoxSize, padding);
    gateLeftSvg = left;
    gateRightSvg = right;
  }

  return { gateLeftSvg, gateRightSvg };
}

