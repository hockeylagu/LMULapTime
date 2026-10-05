import { useEffect, useRef } from 'react';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { replayShortcutBlocked } from '../../../utils/replayShortcuts.js';

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
}

/**
 * Handles keyboard shortcuts on the GPS track map (only when it is focused or expanded, never for keys
 * pressed on the telemetry chart), matching the telemetry strip interactions:
 * - ArrowLeft / ArrowRight: Step by 1 sample (or Shift + Arrow: jump by 0.5s)
 * - Home / End: Lap start / end
 * - + / = / -: Zoom in / zoom out
 * - 0: Reset zoom to show full track
 * - Space: Toggle playback
 * - G: Toggle G-force arrow
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
}: UseGpsMapShortcutsOptions): void {
  const optionsRef = useRef({
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
  });
  optionsRef.current = {
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
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (replayShortcutBlocked(event)) return;
      const {
        isExpanded: expanded,
        containerRef: contRef,
        points: pts,
        currentIndex: idx,
        onSelectIndex: selectIndex,
        onZoomIn: zoomIn,
        onZoomOut: zoomOut,
        onResetZoom: resetZoom,
        onTogglePlay: togglePlay,
        onToggleGForce: toggleGForce,
      } = optionsRef.current;

      const container = contRef.current;
      const isTargetOnMap = Boolean(container && event.target instanceof Node && container.contains(event.target));
      // Map keys act only on the map: focused on it, or expanded over everything. The telemetry
      // chart handles its own arrows, Home/End, zoom and reset, so a key pressed on it must not
      // also move the map (each press acts once).
      if (!expanded && !isTargetOnMap) return;
      const otherSurface = event.target instanceof Element ? event.target.closest('[data-replay-surface]') : null;
      if (otherSurface && otherSurface !== container) return;

      const total = pts.length;
      if (total === 0) return;
      const safeIndex = Math.max(0, Math.min(total - 1, idx));

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        if (!event.shiftKey) {
          selectIndex?.(Math.max(0, Math.min(total - 1, safeIndex + direction)));
        } else {
          const currentTime = pts[safeIndex]?.timeSec ?? safeIndex / 40;
          const target = currentTime + direction * 0.5;
          let lo = 0;
          let hi = total - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if ((pts[mid]?.timeSec ?? mid / 40) <= target) lo = mid;
            else hi = mid - 1;
          }
          selectIndex?.(lo);
        }
      } else if (event.key === 'Home') {
        event.preventDefault();
        selectIndex?.(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        selectIndex?.(total - 1);
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomIn();
      } else if (event.key === '-') {
        event.preventDefault();
        zoomOut();
      } else if (event.key === '0' || event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetZoom();
      } else if (event.key === ' ' && expanded) {
        event.preventDefault();
        togglePlay?.();
      } else if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        toggleGForce?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
