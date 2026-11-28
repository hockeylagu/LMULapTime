import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import type { PointComparison } from '../../../../utils/replayComparison.js';
import { trackHoverRows } from '../../../../utils/trackHoverRows.js';
import { TELEMETRY_COLORS } from '../../../../utils/themeColors.js';
import type { DockChannel } from '../../map/telemetry/dockChannel.js';
import type { ChannelScale } from '../../telemetry/telemetryChannels.js';
import type { ReplaySceneHandle, TracePick } from './replayScene.js';
import { traceReadout } from './traceReadout.js';
import { setTrackHover } from '../../map/telemetry/trackHover.js';

interface Props {
  /** The element the scene draws into: the pointer is followed over it. */
  host: RefObject<HTMLDivElement | null>;
  scene: RefObject<Pick<ReplaySceneHandle, 'pickTrace' | 'hoverTrace'> | null>;
  trajectory: ReplayTrajectoryData;
  baseline: ReplayTrajectoryData | null;
  comparisons: PointComparison[] | null;
  /** The lap's distance per sample, the strip's axis. */
  distances: number[];
  /** The shown trace and the scale its curtains stand on (null: the racing lines). */
  trace: {id: DockChannel; scale: ChannelScale} | null;
  onSelectIndex: (index: number) => void;
  /** False while the view is kept loaded behind the 2D map. */
  active: boolean;
}

interface Hover extends TracePick {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pixels between the pointer and the tooltip, the room it needs right of and below the pointer, and a click's most travel. */
const OFFSET_PX = 14, ROOM_X_PX = 240, ROOM_Y_PX = 110, CLICK_SLOP_PX = 4;

/**
 * The 3D lap view's hover on a lap's curtain or racing ribbon: the 2D map's line tooltip (`trackHoverRows`) and the trace's value for
 * both laps at that lap distance, with a hover line on the curtain there and on the strip charts (`trackHover.ts`; the car stays); a
 * click (not a drag that orbits the camera) moves the cursor there. As the race view's car hover
 * (`RaceCarHover.tsx`), one look runs at a time and a pointer that moved meanwhile is looked at once it ends.
 */
export function TraceHover({host, scene, trajectory, baseline, comparisons, distances, trace, onSelectIndex, active}: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  const select = useEffectEvent((index: number) => onSelectIndex(index));
  // The hover line on the curtain and the charts, wherever the tooltip is.
  const mark = useEffectEvent((pick: TracePick | null) => {
    scene.current?.hoverTrace(pick);
    setTrackHover(pick ? distances[pick.primaryIndex] ?? null : null);
  });
  useEffect(() => {
    const element = host.current;
    if (!element || !active) return;
    let pointer: {x: number; y: number} | null = null, looking = false, again = false, live = true, down: {x: number; y: number} | null = null;
    let shown: TracePick | null = null;
    const look = () => {
      const at = pointer;
      if (!at) { shown = null; setHover(null); mark(null); return; }
      if (looking) { again = true; return; }
      const picking = scene.current?.pickTrace(at.x, at.y);
      if (!picking) return;
      looking = true;
      void picking.catch(() => null).then(pick => {
        looking = false;
        if (!live) return;
        const now = pointer;
        shown = now ? pick : null;
        setHover(pick && now ? {...pick, ...now, width: element.clientWidth, height: element.clientHeight} : null);
        mark(shown);
        if (again) { again = false; look(); }
      });
    };
    const point = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    };
    const move = (event: PointerEvent) => {
      const at = point(event);
      // A press keeps the pick through a click's jitter (`release` selects it); a drag (orbit, pan) takes it away.
      if (event.buttons && down && Math.hypot(at.x - down.x, at.y - down.y) <= CLICK_SLOP_PX) return;
      pointer = event.buttons ? null : at;
      look();
    };
    const press = (event: PointerEvent) => { down = point(event); };
    const release = (event: PointerEvent) => {
      const at = point(event), from = down;
      down = null;
      if (from && shown && Math.hypot(at.x - from.x, at.y - from.y) <= CLICK_SLOP_PX) select(shown.primaryIndex);
      pointer = at; look();
    };
    const leave = () => { pointer = null; look(); };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerdown', press);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointerleave', leave);
    return () => {
      live = false;
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerdown', press);
      element.removeEventListener('pointerup', release);
      element.removeEventListener('pointerleave', leave);
      setHover(null); mark(null);
    };
  }, [host, scene, active]);
  if (!hover) return null;
  const onBaseline = hover.lap === 'baseline' && baseline;
  const point = onBaseline ? baseline.points[hover.index] : trajectory.points[hover.index];
  const comparison = comparisons?.[hover.primaryIndex] ?? null;
  const rows = trackHoverRows(point ?? {}, comparison?.deltaTimeSec, distances[hover.primaryIndex]);
  const lapValue = trace && traceReadout(trace.id, trace.scale, trajectory.points[hover.primaryIndex], comparison?.deltaTimeSec);
  const baseValue = trace && trace.id !== 'delta' && comparison ? traceReadout(trace.id, trace.scale, comparison.baseline) : null;
  const right = hover.x < hover.width - ROOM_X_PX, below = hover.y < hover.height - ROOM_Y_PX;
  return (
    <div data-testid="trace-hover-tooltip" className="pointer-events-none absolute z-20 rounded-md border border-lmu-border bg-lmu-badge/95 px-2 py-1 font-mono text-[11px] shadow-marker-lift"
      style={{
        ...(right ? {left: hover.x + OFFSET_PX} : {right: hover.width - hover.x + OFFSET_PX}),
        ...(below ? {top: hover.y + OFFSET_PX} : {bottom: hover.height - hover.y + OFFSET_PX}),
      }}>
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{color: onBaseline ? TELEMETRY_COLORS.baseline : TELEMETRY_COLORS.primary}}>
        {onBaseline ? 'Baseline' : 'Lap'}
      </div>
      <div className="flex justify-between gap-3">
        <span className="font-bold text-lmu-text">{rows.speed}</span>
        {rows.delta && <span className="font-bold" style={{color: rows.delta.colour}}>{rows.delta.text}</span>}
      </div>
      <div className="text-lmu-muted">
        <span className={rows.pedal.bold ? 'font-bold' : ''} style={{color: rows.pedal.colour}}>{rows.pedal.text}</span>
        {rows.distance ? ` · ${rows.distance}` : ''}
      </div>
      {lapValue && <div className="text-lmu-text-soft">{lapValue}</div>}
      {baseValue && <div style={{color: TELEMETRY_COLORS.baseline}}>B: {baseValue}</div>}
    </div>
  );
}
