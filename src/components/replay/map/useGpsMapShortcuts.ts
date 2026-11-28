import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { keysLive, steppedIndex, useReplayKeys } from '../../../utils/replayShortcuts.js';
import { heldKeyOf } from '../view3d/camera/heldKeys.js';
import { useHeldCameraKeys, type HeldKeyActions } from '../view3d/camera/useHeldCameraKeys.js';

/** With nothing focused these keys go to the telemetry chart (or the inspector's Space), so the map leaves them: each press acts once. */
const CHART_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', '+', '=', '-', '_', '0', 'x', 'X', ' ']);
const PAN_KEYS: Record<string, [number, number]> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };

export interface UseGpsMapShortcutsOptions {
  active?: boolean;
  isExpanded: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  points: ReplayTrajectoryPoint[];
  currentIndex: number;
  onSelectIndex?: (index: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onTogglePlay?: () => void;
  onToggleGForce?: () => void;
  /** With a baseline: cycle the ghost sync (distance, time, from marker A). */
  onCycleGhostSync?: () => void;
  /** X: drop marker A at the car and run the ghost from it, or clear it when A is already there. */
  onToggleMarker?: () => void;
  onPan?: (horizontal: number, vertical: number) => void;
  onToggleExpanded?: () => void;
  /** R: switch between the 2D map and the 3D view. */
  onToggleView?: () => void;
  /** Fullscreen only: hide or show the telemetry trace under the map. */
  onToggleTrace?: () => void;
  onCenter?: () => void;
  onToggleFollow?: () => void;
  /** 9, the 3D view: the whole circuit from the air at an angle. */
  onOverview?: () => void;
  /** The 3D view's held movement and zoom controls. */
  heldKeys?: HeldKeyActions;
}

/**
 * The track map's keys (2D and 3D), on the shared rules of `useReplayKeys`: on the map, fullscreen, or when nothing holds the
 * keys (then the telemetry chart keeps the keys it shares with the map), never for keys pressed on another chart:
 * - ArrowLeft / ArrowRight: Step by 1 sample (or Shift + Arrow: jump by 0.5s)
 * - Home / End: Lap start / end
 * - + / = / -: Zoom in / zoom out
 * - 0: Reset zoom to show full track
 * - 9: The whole circuit from the air at an angle (3D)
 * - Space: Toggle playback
 * - G: Toggle G-force arrow
 * - V: Cycle the ghost sync (distance / time / from marker A)
 * - X: Drop marker A at the car (From A sync) or clear it (back to Distance)
 * - W/A/S/D: Pan up/left/down/right in 2D, move level in 3D. E/Q changes height and Shift boosts movement in 3D.
 * - C: Center on the car
 * - M: Toggle the fullscreen map, also from the telemetry chart
 * - R: Switch between the 2D map and the 3D view, also from the telemetry chart
 * - T: Hide / show the fullscreen telemetry trace, also from that trace
 */
export function useGpsMapShortcuts({
  active = true,
  isExpanded,
  containerRef,
  points,
  currentIndex,
  onSelectIndex,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onTogglePlay,
  onToggleGForce,
  onCycleGhostSync,
  onToggleMarker,
  onPan,
  onToggleExpanded,
  onToggleView,
  onToggleTrace,
  onCenter,
  onToggleFollow,
  onOverview,
  heldKeys,
}: UseGpsMapShortcutsOptions): void {
  // M, R, C, F (and T in fullscreen) work from any replay surface or the page, for this live map only.
  const live = (action?: () => void) => action && (() => (keysLive(containerRef.current) ? action() : false));
  useReplayKeys({
    m: live(onToggleExpanded), r: live(onToggleView), c: live(onCenter), f: live(onToggleFollow),
    t: isExpanded ? onToggleTrace : undefined,
  }, 'replay', active);

  // The map's own keys: on the map, fullscreen, or when nothing holds the keys. A key pressed on another surface (the
  // fullscreen trace) is that surface's; with nothing focused the chart keys stay with the telemetry chart beside the map.
  const onMap = (run?: (event: KeyboardEvent) => void, repeat = false) => run && {
    repeat,
    run: (event: KeyboardEvent) => {
      const container = containerRef.current;
      const onIt = Boolean(container && event.target instanceof Node && container.contains(event.target));
      const otherSurface = event.target instanceof Element ? event.target.closest('[data-replay-surface]') : null;
      if (points.length === 0 || (otherSurface && otherSurface !== container)) return false;
      if (!onIt && !isExpanded && CHART_KEYS.has(event.key)) return false;
      run(event);
    },
  };
  const step = (event: KeyboardEvent) => onSelectIndex?.(steppedIndex(points, Math.max(0, Math.min(points.length - 1, currentIndex)),
    event.key === 'ArrowLeft' ? -1 : 1, event.shiftKey));
  const pan = onPan && ((event: KeyboardEvent) => onPan(...PAN_KEYS[event.key.toLowerCase()]));
  // A held key's press goes through the map's rules; its release ends it wherever it happens (`useHeldCameraKeys`).
  const hold = heldKeys && ((event: KeyboardEvent) => { const key = heldKeyOf(event.key); if (key) heldKeys.onHoldKey(key, true); });
  useHeldCameraKeys(heldKeys, active);
  const panKey = hold ? onMap(hold) : onMap(pan, true);
  const zoomIn = hold ? onMap(hold) : onMap(onZoomIn, true), zoomOut = hold ? onMap(hold) : onMap(onZoomOut, true);
  useReplayKeys({
    w: panKey, a: panKey, s: panKey, d: panKey,
    ...(hold && { q: onMap(hold), e: onMap(hold), Shift: onMap(hold) }),
    ArrowLeft: onMap(step, true), ArrowRight: onMap(step, true),
    Home: onMap(() => onSelectIndex?.(0)), End: onMap(() => onSelectIndex?.(points.length - 1)),
    '+': zoomIn, '=': zoomIn, '-': zoomOut, '_': hold ? zoomOut : undefined,
    '0': onMap(onResetZoom), '9': onMap(onOverview),
    ' ': onMap(onTogglePlay), g: onMap(onToggleGForce), v: onMap(onCycleGhostSync), x: onMap(onToggleMarker),
  }, isExpanded ? 'page' : containerRef, active);
}
