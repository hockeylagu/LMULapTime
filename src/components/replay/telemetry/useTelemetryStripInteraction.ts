import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReplayTrajectoryPoint } from '../../../../server/core/types';
import { getTrajectoryDistances, findIndexAtDistance } from '../../../utils/replayComparison.js';

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
}: UseTelemetryStripInteractionArgs) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const rectRef = useRef<{ left: number; width: number } | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
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
  const indexAtRatio = useCallback((ratio: number): number => {
    const targetDist = distStart + Math.max(0, Math.min(1, ratio)) * distSpan;
    return Math.max(0, Math.min(totalPoints - 1, findIndexAtDistance(cumDists, targetDist)));
  }, [cumDists, distStart, distSpan, totalPoints]);

  const safeIndex = Math.max(0, Math.min(currentIndex, totalPoints - 1));
  const pctForIndex = useCallback((i: number): number => (
    Math.max(0, Math.min(100, ((cumDists[i] ?? distStart) - distStart) / distSpan * 100))
  ), [cumDists, distStart, distSpan]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    rectRef.current = { left: rect.left, width: rect.width };
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const pct = rect.width > 0 ? (x / rect.width) * 100 : 0;
    if (interactionMode === 'zoom' || e.shiftKey) {
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
  };

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
