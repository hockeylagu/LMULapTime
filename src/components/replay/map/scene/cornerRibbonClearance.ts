interface Point { sx: number; sy: number }
export interface MarkerObstacle { x: number; y: number; hw: number; hh: number }

const GRID_CELLS = 96;
/** Simplification tolerance as a share of the drawing extent: ~0.02 units on the 800-unit map, ~2 px at 100x. */
const SIMPLIFY_TOLERANCE = 2.5e-5;

/**
 * Road edges and racing lines bucketed into a uniform grid, built once per track so the badge search
 * on every zoom step only visits segments near the candidate point (a full scan per step lagged the wheel).
 */
export interface RibbonIndex {
  /** Segment endpoints as ax, ay, bx, by. */
  segments: Float64Array;
  /** Ring segments come first; only they toggle the evenodd fill. */
  ringSegmentCount: number;
  vertices: readonly Point[];
  minX: number; minY: number; cellSize: number; cols: number; rows: number;
  /** Segment ids per grid cell, for the clearance query. */
  cells: number[][];
  /** Ring segment ids per grid row, for the evenodd inside test. */
  ringRows: number[][];
  /** Per cell, how many rings of cells around it are empty, so clear spots skip straight past them. */
  emptyRings: Int32Array;
  stamps: Uint32Array;
  stamp: number;
  /** Ray crossings per apex and direction; they do not depend on the zoom. */
  crossings: Map<string, number[]>;
}

/** Douglas-Peucker: drop vertices within `tolerance` of the simplified line (iterative, so long laps cannot overflow). */
function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const a = points[first], b = points[last];
    const dx = b.sx - a.sx, dy = b.sy - a.sy, lengthSq = dx * dx + dy * dy;
    let worst = -1, worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((p.sx - a.sx) * dx + (p.sy - a.sy) * dy) / lengthSq)) : 0;
      const distance = Math.hypot(p.sx - a.sx - t * dx, p.sy - a.sy - t * dy);
      if (distance > worstDistance) { worst = i; worstDistance = distance; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([first, worst], [worst, last]); }
  }
  return points.filter((_, i) => keep[i]);
}

export function buildRibbonIndex(
  rawLeft: readonly Point[], rawRight: readonly Point[], rawTrajectories: ReadonlyArray<readonly Point[]> = [],
): RibbonIndex {
  // Road edges carry about a point per metre; badge clearance needs far less, and every query pays per segment.
  let extent = 0;
  for (const line of [rawLeft, rawRight, ...rawTrajectories]) for (const p of line) extent = Math.max(extent, Math.abs(p.sx), Math.abs(p.sy));
  const tolerance = Math.max(extent, 1) * SIMPLIFY_TOLERANCE;
  const left = simplify(rawLeft, tolerance), right = simplify(rawRight, tolerance);
  const trajectories = rawTrajectories.map(line => simplify(line, tolerance));
  const rings = left.length >= 3 && right.length >= 3 ? [left, right] : [];
  const coords: number[] = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    coords.push(a.sx, a.sy, b.sx, b.sy);
  }
  const ringSegmentCount = coords.length / 4;
  for (const line of trajectories) for (let i = 0; i + 1 < line.length; i++) {
    coords.push(line[i].sx, line[i].sy, line[i + 1].sx, line[i + 1].sy);
  }
  const vertices = [...rings, ...trajectories].flat();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of vertices) {
    minX = Math.min(minX, p.sx); minY = Math.min(minY, p.sy);
    maxX = Math.max(maxX, p.sx); maxY = Math.max(maxY, p.sy);
  }
  if (!vertices.length) { minX = minY = 0; maxX = maxY = 1; }
  const cellSize = Math.max(maxX - minX, maxY - minY, 1e-6) / GRID_CELLS;
  const cols = Math.floor((maxX - minX) / cellSize) + 1, rows = Math.floor((maxY - minY) / cellSize) + 1;
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  const ringRows: number[][] = Array.from({ length: rows }, () => []);
  const segments = Float64Array.from(coords);
  for (let s = 0; s < segments.length / 4; s++) {
    const ax = segments[s * 4], ay = segments[s * 4 + 1], bx = segments[s * 4 + 2], by = segments[s * 4 + 3];
    const c0 = Math.floor((Math.min(ax, bx) - minX) / cellSize), c1 = Math.floor((Math.max(ax, bx) - minX) / cellSize);
    const r0 = Math.floor((Math.min(ay, by) - minY) / cellSize), r1 = Math.floor((Math.max(ay, by) - minY) / cellSize);
    for (let r = r0; r <= r1; r++) {
      if (s < ringSegmentCount) ringRows[r].push(s);
      for (let c = c0; c <= c1; c++) cells[r * cols + c].push(s);
    }
  }
  // Chessboard distance transform (two passes) to the nearest occupied cell.
  const emptyRings = new Int32Array(cols * rows);
  for (let i = 0; i < emptyRings.length; i++) emptyRings[i] = cells[i].length ? 0 : cols + rows;
  const relax = (r: number, c: number, i: number) => {
    if (r >= 0 && r < rows && c >= 0 && c < cols) emptyRings[i] = Math.min(emptyRings[i], emptyRings[r * cols + c] + 1);
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c;
    relax(r - 1, c - 1, i); relax(r - 1, c, i); relax(r - 1, c + 1, i); relax(r, c - 1, i);
  }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
    const i = r * cols + c;
    relax(r + 1, c + 1, i); relax(r + 1, c, i); relax(r + 1, c - 1, i); relax(r, c + 1, i);
  }
  return { segments, ringSegmentCount, vertices, minX, minY, cellSize, cols, rows, cells, ringRows, emptyRings,
    stamps: new Uint32Array(segments.length / 4), stamp: 0, crossings: new Map() };
}

/** Whether the point lies in the evenodd road fill. */
function insideRibbon(index: RibbonIndex, x: number, y: number): boolean {
  const row = Math.floor((y - index.minY) / index.cellSize);
  if (row < 0 || row >= index.rows) return false;
  const seg = index.segments;
  let inside = false;
  for (const s of index.ringRows[row]) {
    const ax = seg[s * 4], ay = seg[s * 4 + 1], bx = seg[s * 4 + 2], by = seg[s * 4 + 3];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Distance to the nearest segment, exact below `limit` and `Infinity` beyond it. */
function nearestSegment(index: RibbonIndex, x: number, y: number, limit: number): number {
  const { segments: seg, cellSize, cols, rows, cells, stamps } = index;
  const c0 = Math.max(0, Math.floor((x - limit - index.minX) / cellSize));
  const c1 = Math.min(cols - 1, Math.floor((x + limit - index.minX) / cellSize));
  const r0 = Math.max(0, Math.floor((y - limit - index.minY) / cellSize));
  const r1 = Math.min(rows - 1, Math.floor((y + limit - index.minY) / cellSize));
  const stamp = index.stamp = (index.stamp + 1) >>> 0 || 1;
  let nearest = Infinity;
  const visit = (r: number, c: number) => {
    for (const s of cells[r * cols + c]) {
      if (stamps[s] === stamp) continue;
      stamps[s] = stamp;
      const ax = seg[s * 4], ay = seg[s * 4 + 1], dx = seg[s * 4 + 2] - ax, dy = seg[s * 4 + 3] - ay;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0;
      nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  };
  // Rings of cells outward from the point: a segment first met in ring k is at least (k - 1) cells away,
  // so the search stops as soon as nothing farther can beat the nearest hit (zoomed out, `limit` spans the track).
  const cc = Math.floor((x - index.minX) / cellSize), cr = Math.floor((y - index.minY) / cellSize);
  const rings = Math.max(Math.abs(cc - c0), Math.abs(cc - c1), Math.abs(cr - r0), Math.abs(cr - r1));
  const firstRing = cc >= 0 && cc < cols && cr >= 0 && cr < rows ? index.emptyRings[cr * cols + cc]
    : Math.max(-cc, cc - cols + 1, -cr, cr - rows + 1);
  for (let k = firstRing; k <= rings; k++) {
    if (k > 0 && (k - 1) * cellSize >= Math.min(nearest, limit)) break;
    for (let r = Math.max(r0, cr - k); r <= Math.min(r1, cr + k); r++) {
      if (r === cr - k || r === cr + k) {
        for (let c = Math.max(c0, cc - k); c <= Math.min(c1, cc + k); c++) visit(r, c);
      } else {
        if (cc - k >= c0 && cc - k <= c1) visit(r, cc - k);
        if (k > 0 && cc + k >= c0 && cc + k <= c1) visit(r, cc + k);
      }
    }
  }
  return nearest < limit ? nearest : Infinity;
}

/** Distances along the ray where it crosses any indexed segment, ascending. */
function rayCrossings(index: RibbonIndex, apex: Point, direction: Point): number[] {
  const key = `${apex.sx},${apex.sy},${direction.sx},${direction.sy}`;
  const cached = index.crossings.get(key);
  if (cached) return cached;
  const seg = index.segments;
  const crossings: number[] = [];
  for (let s = 0; s < seg.length / 4; s++) {
    const ex = seg[s * 4 + 2] - seg[s * 4], ey = seg[s * 4 + 3] - seg[s * 4 + 1];
    const denominator = direction.sx * ey - direction.sy * ex;
    if (Math.abs(denominator) < 1e-10) continue;
    const ax = seg[s * 4] - apex.sx, ay = seg[s * 4 + 1] - apex.sy;
    const distance = (ax * ey - ay * ex) / denominator;
    const fraction = (ax * direction.sy - ay * direction.sx) / denominator;
    if (distance >= 0 && fraction >= 0 && fraction <= 1) crossings.push(distance);
  }
  crossings.sort((a, b) => a - b);
  index.crossings.set(key, crossings);
  return crossings;
}

/** Move along the label's chosen direction until its entire badge clears the evenodd road fill. */
export function clearCornerRibbon(
  apex: Point, direction: Point, preferredDistance: number, clearance: number,
  index: RibbonIndex, obstacles: readonly MarkerObstacle[] = [],
): Point {
  let distance = preferredDistance;
  for (let attempt = 0; attempt < 256; attempt++) {
    const point = { sx: apex.sx + direction.sx * distance, sy: apex.sy + direction.sy * distance };
    const inside = insideRibbon(index, point.sx, point.sy);
    let nearest = nearestSegment(index, point.sx, point.sy, clearance);
    for (const box of obstacles) {
      nearest = Math.min(nearest, Math.hypot(Math.max(0, Math.abs(point.sx - box.x) - box.hw),
        Math.max(0, Math.abs(point.sy - box.y) - box.hh)));
    }
    if (!inside && nearest >= clearance) return point;
    const exit = inside ? rayCrossings(index, apex, direction).find(value => value > distance + 1e-8) : undefined;
    distance = exit !== undefined ? exit + clearance : distance + Math.max(clearance / 2, clearance - nearest);
  }
  let farthest = preferredDistance;
  for (const p of index.vertices) farthest = Math.max(farthest, Math.hypot(p.sx - apex.sx, p.sy - apex.sy) + clearance);
  for (const box of obstacles) {
    farthest = Math.max(farthest, Math.hypot(box.x - apex.sx, box.y - apex.sy) + Math.hypot(box.hw, box.hh) + clearance);
  }
  return { sx: apex.sx + direction.sx * farthest, sy: apex.sy + direction.sy * farthest };
}
