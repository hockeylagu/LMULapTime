import { useEffect, useEffectEvent } from 'react';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { isReplaySurfaceTarget, replayShortcutBlocked } from '../../../utils/replayShortcuts.js';

export interface UseGpsMapShortcutsOptions {
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
  onPan?: (horizontal: number, vertical: number) => void;
  onToggleExpanded?: () => void;
  /** Fullscreen only: hide or show the telemetry trace under the map. */
  onToggleTrace?: () => void;
}

/**
 * Handles keyboard shortcuts on the GPS track map (only when it is focused or isExpanded, never for keys
 * pressed on the telemetry chart), matching the telemetry strip interactions:
 * - ArrowLeft / ArrowRight: Step by 1 sample (or Shift + Arrow: jump by 0.5s)
 * - Home / End: Lap start / end
 * - + / = / -: Zoom in / zoom out
 * - 0: Reset zoom to show full track
 * - Space: Toggle playback
 * - G: Toggle G-force arrow
 * - W/A/S/D: Pan up/left/down/right without changing the scrub cursor
 * - M: Toggle the fullscreen map, also from the telemetry chart
 * - T: Hide / show the fullscreen telemetry trace, also from that trace
 */
export function useGpsMapShortcuts({
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
  onPan,
  onToggleExpanded,
  onToggleTrace,
}: UseGpsMapShortcutsOptions): void {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (replayShortcutBlocked(event)) return;
    const container = containerRef.current;
    if (event.key.toLowerCase() === 'm' && onToggleExpanded) {
      // M works from any replay surface, but only for this live map and never while another map is expanded.
      if (event.repeat || !container || container.closest('[inert]') || !isReplaySurfaceTarget(event)) return;
      const expandedMap = document.querySelector('[data-map-expanded]');
      if (expandedMap && expandedMap !== container) return;
      event.preventDefault();
      onToggleExpanded();
      return;
    }
    if (event.key.toLowerCase() === 't' && isExpanded && onToggleTrace) {
      // Expanded, focus is trapped in the map, so T works from the map and from its trace alike.
      if (!event.repeat) { event.preventDefault(); onToggleTrace(); }
      return;
    }
    const isTargetOnMap = Boolean(container && event.target instanceof Node && container.contains(event.target));
    // Map keys act only on the map: focused on it, or expanded over everything. The telemetry
    // chart handles its own arrows, Home/End, zoom and reset, so a key pressed on it must not
    // also move the map (each press acts once).
    if (!isExpanded && !isTargetOnMap) return;
    const otherSurface = event.target instanceof Element ? event.target.closest('[data-replay-surface]') : null;
    if (otherSurface && otherSurface !== container) return;

    const total = points.length;
    if (total === 0) return;
    const safeIndex = Math.max(0, Math.min(total - 1, currentIndex));

    const panDirections: Record<string, [number, number]> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };
    const panDirection = panDirections[event.key.toLowerCase()];
    if (onPan && panDirection) {
      event.preventDefault();
      onPan(...panDirection);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (!event.shiftKey) {
        onSelectIndex?.(Math.max(0, Math.min(total - 1, safeIndex + direction)));
      } else {
        const currentTime = points[safeIndex]?.timeSec ?? safeIndex / 40;
        const target = currentTime + direction * 0.5;
        let lo = 0;
        let hi = total - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if ((points[mid]?.timeSec ?? mid / 40) <= target) lo = mid;
          else hi = mid - 1;
        }
        onSelectIndex?.(lo);
      }
    } else if (event.key === 'Home') {
      event.preventDefault();
      onSelectIndex?.(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      onSelectIndex?.(total - 1);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onZoomIn();
    } else if (event.key === '-') {
      event.preventDefault();
      onZoomOut();
    } else if (event.key === '0' || event.key.toLowerCase() === 'r') {
      event.preventDefault();
      onResetZoom();
    } else if (event.key === ' ' && isExpanded) {
      event.preventDefault();
      onTogglePlay?.();
    } else if (event.key.toLowerCase() === 'g') {
      event.preventDefault();
      onToggleGForce?.();
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
