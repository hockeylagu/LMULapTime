import { clearCornerRibbon, type RibbonIndex, type MarkerObstacle } from './cornerRibbonClearance.js';

export interface MarkerPoint { sx: number; sy: number }
export interface MarkerRay {
  anchor: MarkerPoint;
  direction: MarkerPoint;
  distance: number;
}

/** Tests the complete connector, including its stroke clearance, against a badge box. */
export function markerLineHitsBox(a: MarkerPoint, b: MarkerPoint, box: MarkerObstacle, gap: number): boolean {
  let lo = 0, hi = 1;
  for (const [origin, delta, center, extent] of [[a.sx, b.sx - a.sx, box.x, box.hw + gap],
    [a.sy, b.sy - a.sy, box.y, box.hh + gap]]) {
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(origin - center) >= extent) return false;
    } else {
      const t0 = (center - extent - origin) / delta, t1 = (center + extent - origin) / delta;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    }
  }
  return lo < hi;
}

/** First unoccupied position on a ray. Expanded box intervals include both badges and the visual gap. */
export function placeMarkerBox(ray: MarkerRay, hw: number, hh: number, gap: number,
  occupied: readonly MarkerObstacle[], ribbon?: RibbonIndex): MarkerObstacle {
  const length = Math.hypot(ray.direction.sx, ray.direction.sy) || 1;
  const direction = { sx: ray.direction.sx / length, sy: ray.direction.sy / length };
  if (direction.sx === 0 && direction.sy === 0) direction.sy = -1;
  const intervals: Array<[number, number]> = [];
  for (const box of occupied) {
    let lo = -Infinity, hi = Infinity;
    for (const [origin, delta, center, extent] of [
      [ray.anchor.sx, direction.sx, box.x, box.hw + hw + gap],
      [ray.anchor.sy, direction.sy, box.y, box.hh + hh + gap],
    ]) {
      if (Math.abs(delta) < 1e-10) {
        if (Math.abs(origin - center) >= extent) { hi = -Infinity; break; }
      } else {
        const a = (center - extent - origin) / delta, b = (center + extent - origin) / delta;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
      }
    }
    if (hi >= lo && hi >= 0) intervals.push([lo, hi]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let distance = ray.distance;
  // Road clearance can advance into another label interval; reconsider those intervals after each move.
  for (let pass = 0; pass <= intervals.length + 1; pass++) {
    const before = distance;
    if (ribbon) {
      const point = clearCornerRibbon(ray.anchor, direction, distance, Math.hypot(hw, hh) + gap, ribbon);
      distance = Math.hypot(point.sx - ray.anchor.sx, point.sy - ray.anchor.sy);
    }
    for (const [lo, hi] of intervals) if (distance > lo - 1e-8 && distance < hi + 1e-8) distance = hi + 1e-6;
    if (Math.abs(distance - before) < 1e-8) break;
  }
  return { x: ray.anchor.sx + direction.sx * distance, y: ray.anchor.sy + direction.sy * distance, hw, hh };
}

const TURN_STEP = Math.PI / 6;

/**
 * Like `placeMarkerBox`, but a badge pushed well past its preferred spot (another label sits on its ray) may
 * turn around its anchor instead, so it stays beside the anchor rather than being flung away. Each 30° turn
 * costs half the preferred distance, so the preferred side wins unless it is genuinely crowded. Crossing one of
 * the `tethers` already drawn costs two preferred distances, so badges prefer leader lines that do not cross.
 */
export function placeMarkerNear(ray: MarkerRay, hw: number, hh: number, gap: number,
  occupied: readonly MarkerObstacle[], ribbon?: RibbonIndex, tethers: readonly MarkerTether[] = []): MarkerObstacle {
  const score = (box: MarkerObstacle) => {
    const end = { sx: box.x, sy: box.y };
    const crossings = tethers.filter(other => tethersCross(ray.anchor, end, other.from, other.to)).length;
    return Math.hypot(box.x - ray.anchor.sx, box.y - ray.anchor.sy) + crossings * 2 * ray.distance;
  };
  let best = placeMarkerBox(ray, hw, hh, gap, occupied, ribbon);
  let bestScore = score(best);
  if (bestScore <= ray.distance * 1.5 + 1e-8) return best;
  const angle = Math.atan2(ray.direction.sy, ray.direction.sx);
  for (let step = 1; step <= 6; step++) {
    const cost = step * ray.distance / 2;
    if (cost + ray.distance >= bestScore) break;
    for (const sign of step === 6 ? [1] : [1, -1]) {
      const turned = angle + sign * step * TURN_STEP;
      const box = placeMarkerBox({ ...ray, direction: { sx: Math.cos(turned), sy: Math.sin(turned) } },
        hw, hh, gap, occupied, ribbon);
      const total = score(box) + cost;
      if (total < bestScore) { best = box; bestScore = total; }
    }
  }
  return best;
}

/**
 * Whether a point lies inside the loop a closed lap draws (the circuit infield); `null` when the line does not close.
 * Turn badges prefer the circuit exterior, since a kink's own outside can face the infield.
 */
export function insideClosedLap(line: readonly MarkerPoint[], x: number, y: number): boolean | null {
  if (line.length < 10) return null;
  const first = line[0], last = line[line.length - 1];
  let extent = 0;
  for (const p of line) extent = Math.max(extent, Math.abs(p.sx - first.sx), Math.abs(p.sy - first.sy));
  if (Math.hypot(first.sx - last.sx, first.sy - last.sy) > extent * 0.02) return null;
  let inside = false;
  for (let i = 0, j = line.length - 1; i < line.length; j = i++) {
    const a = line[i], b = line[j];
    if ((a.sy > y) !== (b.sy > y) && x < (b.sx - a.sx) * (y - a.sy) / (b.sy - a.sy) + a.sx) inside = !inside;
  }
  return inside;
}

export interface MarkerTether { from: MarkerPoint; to: MarkerPoint }

/** Whether two leader lines properly cross (touching at a shared anchor does not count). */
export function tethersCross(a: MarkerPoint, b: MarkerPoint, c: MarkerPoint, d: MarkerPoint): boolean {
  const side = (p: MarkerPoint, q: MarkerPoint, r: MarkerPoint) => (q.sx - p.sx) * (r.sy - p.sy) - (q.sy - p.sy) * (r.sx - p.sx);
  const d1 = side(c, d, a), d2 = side(c, d, b), d3 = side(a, b, c), d4 = side(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function pointToSegment(point: MarkerPoint, a: MarkerPoint, b: MarkerPoint): number {
  const dx = b.sx - a.sx, dy = b.sy - a.sy;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.sx - a.sx) * dx + (point.sy - a.sy) * dy) / lengthSq)) : 0;
  return Math.hypot(point.sx - a.sx - t * dx, point.sy - a.sy - t * dy);
}

export function markerSegmentsOverlap(a: MarkerPoint, b: MarkerPoint, gate: { left: MarkerPoint; right: MarkerPoint }, gap: number): boolean {
  const c = gate.left, d = gate.right;
  const dx = b.sx - a.sx, dy = b.sy - a.sy;
  const ex = d.sx - c.sx, ey = d.sy - c.sy;
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) > 1e-10) {
    const ax = c.sx - a.sx, ay = c.sy - a.sy;
    const t = (ax * ey - ay * ex) / denominator;
    const u = (ax * dy - ay * dx) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d),
    pointToSegment(c, a, b), pointToSegment(d, a, b)) < gap;
}



/** Farthest a turn badge may sit from its apex, in screen pixels, before it is dropped. */
const MAX_BADGE_TRAVEL_PX = 96;

interface CornerAnchor { cornerNumber: number; sx: number; sy: number; actualSx: number; actualSy: number }

/** -1 for turns whose preferred badge side points into the circuit infield; zoom-independent. */
export function cornerExteriorSigns(corners: readonly CornerAnchor[], lap: readonly MarkerPoint[]): Map<number, 1 | -1> {
  return new Map(corners.map(m => {
    const dx = m.sx - m.actualSx, dy = m.sy - m.actualSy, length = Math.hypot(dx, dy);
    const probe = length > 1e-4 ? Math.min(1, length) / length : 0;
    const inside = probe ? insideClosedLap(lap, m.actualSx + dx * probe, m.actualSy + dy * probe) : null;
    return [m.cornerNumber, inside ? -1 : 1] as const;
  }));
}

/**
 * Turn badges at constant screen size: the selected turn first, each on the circuit exterior when there is room,
 * clear of `occupied` boxes and earlier leader lines. A badge that cannot sit near its turn is hidden.
 */
export function placeCornerBadges<T extends CornerAnchor>(corners: readonly T[], options: {
  selectedCornerNumber?: number | null; zoomLevel?: number; markerScale: number;
  occupied: readonly MarkerObstacle[]; ribbon?: RibbonIndex; exteriorSigns: Map<number, 1 | -1>;
}) {
  const { selectedCornerNumber, markerScale, ribbon, exteriorSigns } = options;
  const effectiveZoom = options.zoomLevel ?? (markerScale > 0 ? 1 / markerScale : 1);
  const occupied = [...options.occupied];
  const tethers: MarkerTether[] = [];
  const ordered = [...corners].sort((a, b) => Number(b.cornerNumber === selectedCornerNumber) - Number(a.cornerNumber === selectedCornerNumber));
  return ordered.map(m => {
    const isSelected = m.cornerNumber === selectedCornerNumber;
    const dirX = m.sx - m.actualSx, dirY = m.sy - m.actualSy;
    const distWorld = Math.hypot(dirX, dirY);
    const side = exteriorSigns.get(m.cornerNumber) ?? 1;
    const direction = { sx: (distWorld > 1e-4 ? dirX / distWorld : 0) * side, sy: (distWorld > 1e-4 ? dirY / distWorld : -1) * side };
    // Keep zoomed badges near the turn, with room for the selected apex marker.
    const targetScreenDist = Math.min(distWorld * effectiveZoom, isSelected ? 38 : 32);
    const distance = Math.max(32 * markerScale, targetScreenDist / effectiveZoom);
    const radius = (isSelected ? 17.6 : 14.3) * markerScale;
    const anchor = { sx: m.actualSx, sy: m.actualSy };
    const position = placeMarkerNear({ anchor, direction, distance }, radius, radius, 14 * markerScale, occupied, ribbon, tethers);
    // Zoomed far out there is no room near the turn; drop the badge rather than strand it away from the track.
    const isHidden = !isSelected && Math.hypot(position.x - m.actualSx, position.y - m.actualSy) > MAX_BADGE_TRAVEL_PX * markerScale;
    if (!isHidden) {
      occupied.push(position);
      tethers.push({ from: anchor, to: { sx: position.x, sy: position.y } });
    }
    return { marker: m, isSelected, isHidden, x: position.x, y: position.y };
  });
}
