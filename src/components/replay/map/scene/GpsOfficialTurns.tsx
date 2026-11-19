import { useMemo } from 'react';
import { placeTurns } from '../../../../../shared/domain/circuitTurns/placeTurns.js';
import { LAYOUT_TURN_LISTS } from '../../../../../shared/domain/circuitTurns/turnLists.js';
import { describeTurn } from '../../../../../shared/domain/circuitTurns/turnLabel.js';
import type { TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { LMU_COLORS, MAP_COLORS } from '../../../../utils/themeColors.js';

type Point = { sx: number; sy: number };
/** Badge offset from the centre line, outside the bend (viewBox units before markerScale). */
const BADGE_OFFSET = 24;
/** Half the chord used to tell a bend's outside (metres). */
const OUTSIDE_CHORD_M = 30;
/** Half the length of a segment boundary tick (viewBox units before markerScale). */
const TICK_HALF = 9;
const CHAR_WIDTH = 6.2;

export interface OfficialTurnMark {
  id: number;
  label: string;
  title: string;
  filled: boolean;
  apex: Point;
  /** Unit vector of the badge's side of the track (outside the bend). */
  outside: Point;
}
export interface OfficialTurnTick { id: number; at: Point; normal: Point }

/**
 * The layout's official turns (docs/plans/proposed/CORNER_INSIGHT.md, layer 1) projected on the map's centre line:
 * a badge outside each apex and a tick at each segment's start. `centerSvg` is the centre line projected point for point.
 */
export function projectOfficialTurns(geometry: TrackBoundaryGeometry | null | undefined, centerSvg: readonly Point[]):
  { marks: OfficialTurnMark[]; ticks: OfficialTurnTick[] } {
  const centerline = geometry?.centerline;
  if (!centerline || centerline.length < 3 || centerSvg.length !== centerline.length) return { marks: [], ticks: [] };
  const startM = geometry.timingGates?.startFinish?.stationM ?? 0;
  const { lengthM, turns } = placeTurns(centerline, LAYOUT_TURN_LISTS[geometry.layoutKey ?? ''] ?? null, startM);
  if (!turns.length) return { marks: [], ticks: [] };
  const count = centerline.length;
  const cumulative = new Float64Array(count + 1);
  for (let i = 1; i <= count; i++) {
    const a = centerline[i - 1], b = centerline[i % count];
    cumulative[i] = cumulative[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  // The projection is affine, so interpolating projected points is the projection of the interpolated point.
  const at = (fromStartM: number): { point: Point; along: Point } => {
    const s = (((startM + fromStartM) % lengthM) + lengthM) % lengthM;
    let lo = 0, hi = count;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cumulative[mid] <= s) lo = mid; else hi = mid; }
    const a = centerSvg[lo], b = centerSvg[(lo + 1) % count];
    const f = (s - cumulative[lo]) / Math.max(1e-9, cumulative[lo + 1] - cumulative[lo]);
    const dx = b.sx - a.sx, dy = b.sy - a.sy, length = Math.hypot(dx, dy) || 1;
    return { point: { sx: a.sx + dx * f, sy: a.sy + dy * f }, along: { sx: dx / length, sy: dy / length } };
  };
  const marks = turns.map((turn): OfficialTurnMark => {
    const apex = at(turn.apexM).point;
    const before = at(turn.apexM - OUTSIDE_CHORD_M).point, after = at(turn.apexM + OUTSIDE_CHORD_M).point;
    // The chord's midpoint lies inside the bend; the apex is on its outside.
    let ox = apex.sx - (before.sx + after.sx) / 2, oy = apex.sy - (before.sy + after.sy) / 2;
    let length = Math.hypot(ox, oy);
    if (length < 1e-6) { const { along } = at(turn.apexM); ox = -along.sy; oy = along.sx; length = 1; }
    const outside = { sx: ox / length, sy: oy / length };
    return { id: turn.id, ...describeTurn(turn), apex, outside };
  });
  const ticks = turns.filter(turn => turn.startM > 0).map(turn => {
    const { point, along } = at(turn.startM);
    return { id: turn.id, at: point, normal: { sx: -along.sy, sy: along.sx } };
  });
  return { marks, ticks };
}

/** Official turn badges and segment boundary ticks: the Official turns map layer. */
export function GpsOfficialTurns({ geometry, centerSvg, markerScale }: {
  geometry: TrackBoundaryGeometry | null | undefined; centerSvg: readonly Point[]; markerScale: number;
}) {
  const { marks, ticks } = useMemo(() => projectOfficialTurns(geometry, centerSvg), [geometry, centerSvg]);
  if (!marks.length) return null;
  const color = LMU_COLORS.muted;
  return <g aria-label="Official turns" className="pointer-events-none select-none">
    {ticks.map(tick => <line key={`tick-${tick.id}`} data-testid="official-turn-boundary"
      x1={tick.at.sx - tick.normal.sx * TICK_HALF * markerScale} y1={tick.at.sy - tick.normal.sy * TICK_HALF * markerScale}
      x2={tick.at.sx + tick.normal.sx * TICK_HALF * markerScale} y2={tick.at.sy + tick.normal.sy * TICK_HALF * markerScale}
      stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
    {/* A turn with neither number nor name keeps its tick; the card names it by position. */}
    {marks.filter(mark => mark.label).map(mark => {
      const halfWidth = (mark.label.length * CHAR_WIDTH + 8) / 2;
      // Reach past the badge's own extent along the outside direction.
      const reach = BADGE_OFFSET + halfWidth * Math.abs(mark.outside.sx) + 8 * Math.abs(mark.outside.sy);
      const x = mark.apex.sx + mark.outside.sx * reach * markerScale, y = mark.apex.sy + mark.outside.sy * reach * markerScale;
      return <g key={mark.id} data-testid="official-turn" data-filled={mark.filled ? '' : undefined}>
        <line x1={mark.apex.sx} y1={mark.apex.sy} x2={x} y2={y} stroke={color} strokeWidth="1" strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke" />
        {/* Only the badge takes the pointer, for its tooltip; presses still reach the map (pan, zoom). */}
        <g transform={`translate(${x}, ${y}) scale(${markerScale})`} className="pointer-events-auto cursor-help">
          <title>{mark.title}</title>
          <rect x={-halfWidth} y="-8" width={halfWidth * 2} height="16" rx="3" fill={MAP_COLORS.markerBg} stroke={color}
            strokeDasharray={mark.filled ? '3 2' : undefined} />
          <text textAnchor="middle" dominantBaseline="central" fill={LMU_COLORS.text} fontSize="10"
            fontFamily="Consolas, monospace" fontStyle={mark.filled ? 'italic' : undefined}>{mark.label}</text>
        </g>
      </g>;
    })}
  </g>;
}
