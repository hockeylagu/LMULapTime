import { useEffect, useMemo, useState } from 'react';
import { placeTurns } from '../../../../../shared/domain/circuitTurns/placeTurns.js';
import { LAYOUT_TURN_LISTS } from '../../../../../shared/domain/circuitTurns/turnLists.js';
import { describeTurn } from '../../../../../shared/domain/circuitTurns/turnLabel.js';
import type { LayoutCorners } from '../../../../../shared/types/corners/cornerPasses.js';
import type { TrackBoundaryGeometry } from '../../../../../shared/types/trackGeometry.js';
import { loadLayoutCorners } from '../../../../api/cornerApi.js';
import { LMU_COLORS, MAP_COLORS } from '../../../../utils/themeColors.js';

type Point = { sx: number; sy: number };
/** Badge offset from the centre line, outside the bend (viewBox units before markerScale). */
const BADGE_OFFSET = 24;
/** Half the chord used to tell a bend's outside (metres). */
const OUTSIDE_CHORD_M = 30;
/** Half the length of a segment boundary tick (viewBox units before markerScale). */
const TICK_HALF = 9;
const CHAR_WIDTH = 6.2;

export interface CornerMark {
  id: number;
  label: string;
  title: string;
  filled: boolean;
  apex: Point;
  /** Unit vector of the badge's side of the track (outside the bend). */
  outside: Point;
}
export interface CornerTick { id: number; at: Point; normal: Point }
/** A corner along the centre line: its label, its apex and where its segment starts, metres from the start line. */
export interface LineCorner { id: number; label: string; title: string; filled?: boolean; apexM: number; startM: number }

/**
 * Corners projected on the map's centre line: a badge outside each apex and a tick at each segment's start (none at the
 * start line). `centerSvg` is the centre line projected point for point; `startStationM` puts the start line on it.
 */
export function projectLineCorners(centerline: ReadonlyArray<readonly [number, number]>, centerSvg: readonly Point[],
  startStationM: number, lengthM: number, corners: readonly LineCorner[]): { marks: CornerMark[]; ticks: CornerTick[] } {
  const count = centerline.length;
  if (count < 3 || centerSvg.length !== count || !corners.length || !(lengthM > 0)) return { marks: [], ticks: [] };
  const cumulative = new Float64Array(count + 1);
  for (let i = 1; i <= count; i++) {
    const a = centerline[i - 1], b = centerline[i % count];
    cumulative[i] = cumulative[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  // The projection is affine, so interpolating projected points is the projection of the interpolated point.
  const at = (fromStartM: number): { point: Point; along: Point } => {
    const s = (((startStationM + fromStartM) % lengthM) + lengthM) % lengthM;
    let lo = 0, hi = count;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cumulative[mid] <= s) lo = mid; else hi = mid; }
    const a = centerSvg[lo], b = centerSvg[(lo + 1) % count];
    const f = (s - cumulative[lo]) / Math.max(1e-9, cumulative[lo + 1] - cumulative[lo]);
    const dx = b.sx - a.sx, dy = b.sy - a.sy, length = Math.hypot(dx, dy) || 1;
    return { point: { sx: a.sx + dx * f, sy: a.sy + dy * f }, along: { sx: dx / length, sy: dy / length } };
  };
  const marks = corners.map((corner): CornerMark => {
    const apex = at(corner.apexM).point;
    const before = at(corner.apexM - OUTSIDE_CHORD_M).point, after = at(corner.apexM + OUTSIDE_CHORD_M).point;
    // The chord's midpoint lies inside the bend; the apex is on its outside.
    let ox = apex.sx - (before.sx + after.sx) / 2, oy = apex.sy - (before.sy + after.sy) / 2;
    let length = Math.hypot(ox, oy);
    if (length < 1e-6) { const { along } = at(corner.apexM); ox = -along.sy; oy = along.sx; length = 1; }
    return { id: corner.id, label: corner.label, title: corner.title, filled: corner.filled ?? false, apex,
      outside: { sx: ox / length, sy: oy / length } };
  });
  const ticks = corners.filter(corner => corner.startM > 0).map(corner => {
    const { point, along } = at(corner.startM);
    return { id: corner.id, at: point, normal: { sx: -along.sy, sy: along.sx } };
  });
  return { marks, ticks };
}

/** The layout's official turns on the centre line (placed by the turn lists). */
export function projectOfficialTurns(geometry: TrackBoundaryGeometry | null | undefined, centerSvg: readonly Point[]):
  { marks: CornerMark[]; ticks: CornerTick[] } {
  const centerline = geometry?.centerline;
  if (!centerline || centerline.length < 3) return { marks: [], ticks: [] };
  const startM = geometry.timingGates?.startFinish?.stationM ?? 0;
  const { lengthM, turns } = placeTurns(centerline, LAYOUT_TURN_LISTS[geometry.layoutKey ?? ''] ?? null, startM);
  return projectLineCorners(centerline, centerSvg, startM, lengthM, turns.map(turn => ({ ...turn, ...describeTurn(turn) })));
}

/** Corner badges and segment start ticks. */
export function GpsCornerMarks({ marks, ticks, markerScale, label }: {
  marks: readonly CornerMark[]; ticks: readonly CornerTick[]; markerScale: number; label: string;
}) {
  if (!marks.length && !ticks.length) return null;
  const color = LMU_COLORS.muted;
  return <g aria-label={label} className="pointer-events-none select-none">
    {ticks.map(tick => <line key={`tick-${tick.id}`} data-testid="corner-boundary"
      x1={tick.at.sx - tick.normal.sx * TICK_HALF * markerScale} y1={tick.at.sy - tick.normal.sy * TICK_HALF * markerScale}
      x2={tick.at.sx + tick.normal.sx * TICK_HALF * markerScale} y2={tick.at.sy + tick.normal.sy * TICK_HALF * markerScale}
      stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
    {/* A turn with neither number nor name keeps its tick; the card names it by position. */}
    {marks.filter(mark => mark.label).map(mark => {
      const halfWidth = (mark.label.length * CHAR_WIDTH + 8) / 2;
      // Reach past the badge's own extent along the outside direction.
      const reach = BADGE_OFFSET + halfWidth * Math.abs(mark.outside.sx) + 8 * Math.abs(mark.outside.sy);
      const x = mark.apex.sx + mark.outside.sx * reach * markerScale, y = mark.apex.sy + mark.outside.sy * reach * markerScale;
      return <g key={mark.id} data-testid="corner-mark" data-filled={mark.filled ? '' : undefined}>
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

/** The Corners layer's official turns: a badge per turn and a tick where each turn's segment starts. */
export function GpsOfficialTurns({ geometry, centerSvg, markerScale }: {
  geometry: TrackBoundaryGeometry | null | undefined; centerSvg: readonly Point[]; markerScale: number;
}) {
  const { marks, ticks } = useMemo(() => projectOfficialTurns(geometry, centerSvg), [geometry, centerSvg]);
  return <GpsCornerMarks marks={marks} ticks={ticks} markerScale={markerScale} label="Official turns" />;
}

/**
 * The Corners layer's sequences where no lap is shown (the race map): the class's map on the centre line, a badge at
 * each sequence's slowest point and a tick where its speed starts to drop; the official turns when the class has no map.
 */
export function GpsClassCorners({ geometry, centerSvg, carClass, markerScale }: {
  geometry: TrackBoundaryGeometry | null | undefined; centerSvg: readonly Point[]; carClass: string; markerScale: number;
}) {
  const layoutKey = geometry?.layoutKey ?? '';
  const key = `${layoutKey}|${carClass}`;
  const [loaded, setLoaded] = useState<{ key: string; corners: LayoutCorners | null } | null>(null);
  useEffect(() => {
    if (!layoutKey) return undefined;
    let live = true;
    void loadLayoutCorners(layoutKey, carClass).then(corners => { if (live) setLoaded({ key: `${layoutKey}|${carClass}`, corners }); });
    return () => { live = false; };
  }, [layoutKey, carClass]);
  const corners = loaded?.key === key ? loaded.corners : null;
  const { marks, ticks } = useMemo(() => corners && geometry?.centerline
    ? projectLineCorners(geometry.centerline, centerSvg, corners.startStationM, corners.lengthM, corners.corners)
    : { marks: [], ticks: [] }, [corners, geometry, centerSvg]);
  return <GpsCornerMarks marks={marks} ticks={ticks} markerScale={markerScale} label="Corner sequences" />;
}
