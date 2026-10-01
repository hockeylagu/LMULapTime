import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { getTrajectoryDistances, findIndexAtDistance } from '../../../utils/lapAlignment.js';
import { replayShortcutBlocked } from '../../../utils/replayShortcuts.js';
import { DistanceWindow, fitDistanceWindow, normalizedWheelDelta, zoomDistanceWindow } from './telemetryViewport.js';

export interface TelemetryDragSelection {
  startX: number;
  currentX: number;
  startPct: number;
  currentPct: number;
}

export interface UseTelemetryStripInteractionArgs {
  points: ReplayTrajectoryPoint[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  zoomRange?: { start: number; end: number } | null;
  onZoomRangeChange?: (range: { start: number; end: number } | null) => void;
  trackLengthM?: number;
  enabled?: boolean;
}

/**
 * Encapsulates pointer scrubbing/drag-to-zoom interaction and distance-based
 * frame lookup for the telemetry strip, decoupled from chart rendering.
 */
export function useTelemetryStripInteraction({
  points,
  currentIndex,
  onSelectIndex,
  zoomRange,
  onZoomRangeChange,
  trackLengthM,
  enabled = true,
}: UseTelemetryStripInteractionArgs) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const rectRef = useRef<{ left: number; width: number } | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const viewportRef = useRef<DistanceWindow | null>(null);
  const publishedRangeRef = useRef<{ start: number; end: number } | null>(null);
  const viewportRafRef = useRef<number | null>(null);
  const panRef = useRef<{ x: number; width: number; window: DistanceWindow } | null>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const [internalZoomRange, setInternalZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<'scrub' | 'zoom'>('scrub');
  const [dragSelection, setDragSelection] = useState<TelemetryDragSelection | null>(null);

  const activeZoomRange = zoomRange !== undefined ? zoomRange : internalZoomRange;
  const updateZoomRange = useCallback((range: { start: number; end: number } | null) => {
    setInternalZoomRange(range);
    onZoomRangeChange?.(range);
  }, [onZoomRangeChange]);
  const handleResetZoom = useCallback(() => updateZoomRange(null), [updateZoomRange]);

  useEffect(() => {
    if (activeZoomRange && (points.length === 0 || activeZoomRange.end >= points.length)) updateZoomRange(null);
  }, [points.length, activeZoomRange, updateZoomRange]);

  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
  }, []);

  const totalPoints = points.length;
  const isZoomed = !!(activeZoomRange && totalPoints > 0 && activeZoomRange.end > activeZoomRange.start);
  const viewStart = isZoomed ? Math.max(0, Math.min(activeZoomRange.start, totalPoints - 2)) : 0;
  const viewEnd = isZoomed ? Math.min(totalPoints - 1, Math.max(activeZoomRange.end, viewStart + 1)) : Math.max(0, totalPoints - 1);
  const cumDists = useMemo(() => getTrajectoryDistances(points, trackLengthM), [points, trackLengthM]);
  const distStart = cumDists[viewStart] ?? 0;
  const distEnd = cumDists[viewEnd] ?? distStart;
  const distSpan = Math.max(1e-6, distEnd - distStart);
  if (activeZoomRange !== publishedRangeRef.current) {
    viewportRef.current = { start: distStart, end: distEnd };
    publishedRangeRef.current = activeZoomRange ?? null;
  }
  useEffect(() => { viewportRef.current = null; }, [cumDists]);
  useEffect(() => () => {
    if (viewportRafRef.current !== null) cancelAnimationFrame(viewportRafRef.current);
  }, []);
  const setViewport = (window: DistanceWindow) => {
    viewportRef.current = window;
    if (viewportRafRef.current !== null) return;
    viewportRafRef.current = requestAnimationFrame(() => {
      viewportRafRef.current = null;
      const next = viewportRef.current;
      if (!next || cumDists.length < 4) return;
      const first = cumDists[0];
      const last = cumDists[cumDists.length - 1];
      const start = Math.min(cumDists.length - 4, findIndexAtDistance(cumDists, next.start));
      const end = Math.max(start + 3, findIndexAtDistance(cumDists, next.end));
      const range = next.end - next.start >= last - first - 1e-6 ? null : { start, end };
      publishedRangeRef.current = range;
      updateZoomRange(range);
    });
  };
  const zoomBy = (factor: number, ratio: number) => {
    if (cumDists.length < 4) return;
    setViewport(zoomDistanceWindow(viewportRef.current ?? { start: distStart, end: distEnd }, factor, ratio,
      cumDists[0], cumDists[cumDists.length - 1]));
  };
  const wheelRef = useRef<(event: WheelEvent) => void>(() => {});
  wheelRef.current = event => {
    if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || cumDists.length < 4) return;
    if (event.target instanceof Element && event.target.closest('button, input, select, a')) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const delta = normalizedWheelDelta(event, rect.height);
    if (!delta) return;
    event.preventDefault(); event.stopPropagation();
    zoomBy(Math.exp(Math.max(-1, Math.min(1, delta * 0.002))), (event.clientX - rect.left) / rect.width);
  };
  useEffect(() => {
    if (!enabled) return;
    const element = containerRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => wheelRef.current(event);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [points.length, enabled]);
  const indexAtRatio = useCallback((ratio: number): number => {
    const targetDist = distStart + Math.max(0, Math.min(1, ratio)) * distSpan;
    return Math.max(0, Math.min(totalPoints - 1, findIndexAtDistance(cumDists, targetDist)));
  }, [cumDists, distStart, distSpan, totalPoints]);

  const safeIndex = Math.max(0, Math.min(currentIndex, totalPoints - 1));
  const pctForIndex = useCallback((i: number): number => (
    Math.max(0, Math.min(100, ((cumDists[i] ?? distStart) - distStart) / distSpan * 100))
  ), [cumDists, distStart, distSpan]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
    if (!containerRef.current || points.length === 0) return;
    containerRef.current.focus?.({ preventScroll: true });
    const rect = containerRef.current.getBoundingClientRect();
    rectRef.current = { left: rect.left, width: rect.width };
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;
    if (e.altKey) {
      if (!isZoomed) return;
      panRef.current = { x: e.clientX, width: rect.width, window: viewportRef.current ?? { start: distStart, end: distEnd } };
    } else if (interactionMode === 'zoom' || e.shiftKey) {
      setDragSelection({ startX: x, currentX: x, startPct: pct, currentPct: pct });
      isDraggingRef.current = false;
    } else {
      isDraggingRef.current = true;
      setDragSelection(null);
      onSelectIndex(indexAtRatio(rect.width > 0 ? x / rect.width : 0));
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || points.length === 0) return;
    if (panRef.current) {
      const pan = panRef.current;
      const span = pan.window.end - pan.window.start;
      setViewport(fitDistanceWindow(pan.window.start - (e.clientX - pan.x) / Math.max(1, pan.width) * span,
        span, cumDists[0], cumDists[cumDists.length - 1]));
      return;
    }
    const rect = rectRef.current || containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;
    if (dragSelection) {
      setDragSelection(prev => (prev ? { ...prev, currentX: x, currentPct: pct } : null));
    } else if (isDraggingRef.current) {
      const nextIdx = indexAtRatio(rect.width > 0 ? x / rect.width : 0);
      pendingIndexRef.current = nextIdx;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (pendingIndexRef.current !== null) onSelectIndex(pendingIndexRef.current);
        });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    panRef.current = null;
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    if (pendingIndexRef.current !== null) { onSelectIndex(pendingIndexRef.current); pendingIndexRef.current = null; }
    rectRef.current = null;
    if (dragSelection && containerRef.current) {
      const dist = Math.abs(dragSelection.currentX - dragSelection.startX);
      if (dist >= 10) {
        const newStart = indexAtRatio(Math.min(dragSelection.startPct, dragSelection.currentPct) / 100);
        const newEnd = indexAtRatio(Math.max(dragSelection.startPct, dragSelection.currentPct) / 100);
        if (newEnd - newStart >= 3) {
          updateZoomRange({ start: newStart, end: newEnd });
          if (safeIndex < newStart || safeIndex > newEnd) onSelectIndex(newStart);
        }
      } else {
        const rect = containerRef.current.getBoundingClientRect();
        const ratio = rect.width > 0 ? dragSelection.startX / rect.width : 0;
        onSelectIndex(indexAtRatio(ratio));
      }
      setDragSelection(null);
    }
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const handlePointerCancel = () => {
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    rectRef.current = null;
    setDragSelection(null);
    isDraggingRef.current = false;
    pendingIndexRef.current = null;
    panRef.current = null;
  };

  const onStepIndex = useCallback((delta: number) => {
    if (totalPoints === 0) return;
    const newIdx = Math.max(0, Math.min(totalPoints - 1, safeIndex + delta));
    onSelectIndex(newIdx);
  }, [totalPoints, safeIndex, onSelectIndex]);

  // Keyboard navigation for Left and Right arrow keys to move the scrub line
  keyHandlerRef.current = (e: KeyboardEvent) => {
      if (!enabled || points.length === 0) return;
      if (replayShortcutBlocked(e)) return;
      const element = containerRef.current;
      if (element && e.target instanceof Node && !element.contains(e.target)) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const direction = e.key === 'ArrowLeft' ? -1 : 1;
        if (!e.shiftKey) onStepIndex(direction);
        else {
          const target = (points[safeIndex]?.timeSec ?? safeIndex / 40) + direction * 0.5;
          let lo = 0; let hi = points.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if ((points[mid].timeSec ?? mid / 40) <= target) lo = mid; else hi = mid - 1;
          }
          onSelectIndex(lo);
        }
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault(); onSelectIndex(e.key === 'Home' ? 0 : totalPoints - 1);
      } else if (e.key === '+' || e.key === '=' || e.key === '-') {
        e.preventDefault(); zoomBy(e.key === '-' ? 1.25 : 0.8, pctForIndex(safeIndex) / 100);
      } else if (e.key === '0') {
        e.preventDefault(); viewportRef.current = null; handleResetZoom();
      } else if (e.key === 'Escape') {
        e.preventDefault(); handlePointerCancel();
      }
    };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    containerRef,
    interactionMode,
    setInteractionMode,
    dragSelection,
    isZoomed,
    viewStart,
    viewEnd,
    cumDists,
    safeIndex,
    pctForIndex,
    onStepIndex,
    onJumpToDistance: useCallback((distM: number) => {
      if (cumDists.length === 0) return;
      onSelectIndex(findIndexAtDistance(cumDists, distM));
    }, [cumDists, onSelectIndex]),
    handleResetZoom,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
