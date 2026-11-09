import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { computeBaselineDeltaByIdx, computeGainLossByIdx, getHeatmapColor, type MapColorMode } from '../map/replayMapUtils.js';
import { computeLapComparisons } from '../../../utils/replayComparison.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../../utils/lapAlignment.js';
import { TELEMETRY_COLORS } from '../../../utils/themeColors.js';
import type { SurfaceHeight } from './scenery/sceneryGround.js';
import { inverseToneCurve, type DisplayTransform } from './autoExposure.js';

/** Ribbon width: wide enough to read from chase height, narrow enough to show the line through a corner. */
export const RACING_LINE_WIDTH_M = 0.6;
/** The comparison lap lies on top, narrower, so both lines stay visible where they overlap. */
export const BASELINE_LINE = {widthM: 0.3, liftM: 0.015};
const LIFT_M = 0.01;

/** Per-point line colours, the same as the 2D map's heat-map modes (deltas need a comparison lap). */
export function racingLineColors(lap: ReplayTrajectoryData, baseline: ReplayTrajectoryData | null, colorBy: MapColorMode): {primary: string[]; baseline: string[]} {
  const comparisons = baseline && (colorBy === 'delta' || colorBy === 'gainLoss') ? computeLapComparisons(lap.points, baseline.points, lap.trackLengthM) : null;
  const deltas = comparisons ? comparisons.map(c => c.deltaTimeSec) : null;
  const primaryDeltas = colorBy === 'gainLoss' ? computeGainLossByIdx(lap.points, deltas) : deltas;
  const baselineDeltas = baseline && primaryDeltas
    ? computeBaselineDeltaByIdx(primaryDeltas, getTrajectoryDistances(lap.points, lap.trackLengthM), getDistancesInReferenceFrame(baseline.points, lap.points, lap.trackLengthM))
    : null;
  return {
    primary: lap.points.map((p, i) => getHeatmapColor(p, colorBy, primaryDeltas?.[i])),
    baseline: baseline?.points.map((p, i) => colorBy === 'default' ? TELEMETRY_COLORS.baseline : getHeatmapColor(p, colorBy, baselineDeltas?.[i])) ?? [],
  };
}

/**
 * The lap as a flat ribbon draped on the scanned road, two vertices per sample so colours can change
 * without rebuilding. Gaps (teleports, time jumps, no road below) break the ribbon instead of bridging.
 */
function racingLineGeometry(lap: ReplayTrajectoryData, origin: Vector3, heights: Array<number | null>, widthM: number, liftM: number): BufferGeometry {
  const points = lap.points, half = widthM / 2;
  const positions = new Float32Array(points.length * 6), indices: number[] = [];
  const joined = (i: number) => {
    const a = points[i - 1], b = points[i], dt = (b.timeSec ?? 0) - (a.timeSec ?? 0);
    return !b.isTeleport && dt > 0 && dt <= 1 && [a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)
      && Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) <= 20 && heights[i - 1] !== null && heights[i] !== null;
  };
  for (let i = 0; i < points.length; i++) {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    let dx = after.x - before.x, dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1; dx /= length; dz /= length;
    const y = (heights[i] ?? points[i].y) - origin.y + liftM, x = points[i].x - origin.x, z = points[i].z - origin.z;
    positions.set([x - dz * half, y, z + dx * half, x + dz * half, y, z - dx * half], i * 6);
    if (i > 0 && joined(i)) { const a = (i - 1) * 2, b = i * 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(points.length * 6), 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Road heights under each lap point. The road does not move: a height once found is kept when its chunk unloads, and only points
 * still without one are looked up again, so a re-drape after streaming costs a few lookups instead of the whole lap. */
const lineHeights = new WeakMap<Mesh, Array<number | null>>();
/** Each line's colours, the display transform they are inverted through, and the transform they were last baked for. */
const lineColours = new WeakMap<Mesh, {display: () => DisplayTransform; colors: string[]; baked: DisplayTransform | null}>();
function fillHeights(heights: Array<number | null>, lap: ReplayTrajectoryData, surfaceHeight: SurfaceHeight): boolean {
  let found = false;
  lap.points.forEach((point, i) => { if (heights[i] === null) { heights[i] = surfaceHeight(point); found ||= heights[i] !== null; } });
  return found;
}

export function makeRacingLine(lap: ReplayTrajectoryData, origin: Vector3, colors: string[], surfaceHeight: SurfaceHeight, display: () => DisplayTransform, widthM = RACING_LINE_WIDTH_M, liftM = LIFT_M): Mesh<BufferGeometry, MeshBasicMaterial> {
  const heights: Array<number | null> = lap.points.map(() => null);
  fillHeights(heights, lap, surfaceHeight);
  const geometry = racingLineGeometry(lap, origin, heights, widthM, liftM);
  // Unlit, so pedal/speed colours read exactly as on the 2D map; the offset keeps it above the road it lies on.
  const line = new Mesh(geometry, new MeshBasicMaterial({vertexColors: true, side: DoubleSide, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
  line.name = 'racing-line';
  line.renderOrder = liftM > LIFT_M ? 3 : 2;
  // Data, not lit scenery: its vertex colours are what the display transform shows as the 2D map's colours (colorRacingLine), and
  // exposure is a linear scale before the curve, so dividing it out keeps those pixels whatever auto-exposure picks. A camera
  // type with another curve re-bakes the colours before the line draws.
  line.onBeforeRender = renderer => {
    line.material.color.setScalar(1 / renderer.toneMappingExposure);
    const state = lineColours.get(line);
    if (state && state.baked !== state.display()) bakeColours(line, state);
  };
  lineHeights.set(line, heights); lineColours.set(line, {display, colors, baked: null});
  colorRacingLine(line, colors);
  return line;
}

/** Inverts each colour through the output encode and the tone curve: the exposed value the display shows as that colour. */
function bakeColours(line: Mesh<BufferGeometry, MeshBasicMaterial>, state: {display: () => DisplayTransform; colors: string[]; baked: DisplayTransform | null}): void {
  const display = state.display(), {toneCurve: curve, outputGamma} = display;
  const attribute = line.geometry.getAttribute('color') as Float32BufferAttribute, color = new Color();
  const exposed = (encoded: number) => inverseToneCurve(curve, encoded ** outputGamma);
  for (let i = 0; i < attribute.count / 2; i++) {
    color.setStyle(colors(state, i), LinearSRGBColorSpace); // the hex digits as they are: the displayed (encoded) value
    const r = exposed(color.r), g = exposed(color.g), b = exposed(color.b);
    attribute.setXYZ(i * 2, r, g, b); attribute.setXYZ(i * 2 + 1, r, g, b);
  }
  attribute.needsUpdate = true;
  state.baked = display;
}

const colors = (state: {colors: string[]}, i: number) => state.colors[i] ?? TELEMETRY_COLORS.primary;

export function colorRacingLine(line: Mesh<BufferGeometry, MeshBasicMaterial>, colors: string[]): void {
  const state = lineColours.get(line);
  if (!state) throw Error('Racing line was not built by makeRacingLine');
  state.colors = colors;
  bakeColours(line, state);
}

/** Re-drapes the ribbon on the road now resident (scenery streams in after the line was built), keeping its colours. */
export function refreshRacingLine(line: Mesh<BufferGeometry, MeshBasicMaterial>, lap: ReplayTrajectoryData, origin: Vector3, colors: string[], surfaceHeight: SurfaceHeight, widthM = RACING_LINE_WIDTH_M, liftM = LIFT_M): void {
  const heights = lineHeights.get(line);
  if (!heights) throw Error('Racing line was not built by makeRacingLine');
  if (!fillHeights(heights, lap, surfaceHeight)) return;
  line.geometry.dispose();
  line.geometry = racingLineGeometry(lap, origin, heights, widthM, liftM);
  colorRacingLine(line, colors);
}
