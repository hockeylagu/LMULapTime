export interface DistanceWindow { start: number; end: number }

export function fitDistanceWindow(start: number, span: number, fullStart: number, fullEnd: number): DistanceWindow {
  const size = Math.max(0, Math.min(span, fullEnd - fullStart));
  const left = Math.max(fullStart, Math.min(fullEnd - size, start));
  return { start: left, end: left + size };
}

/** Keep the distance beneath the pointer fixed while zooming. */
export function zoomDistanceWindow(window: DistanceWindow, factor: number, anchorRatio: number, fullStart: number, fullEnd: number): DistanceWindow {
  const ratio = Math.max(0, Math.min(1, anchorRatio));
  const oldSpan = window.end - window.start;
  const span = Math.min(fullEnd - fullStart, Math.max(Math.min(20, fullEnd - fullStart), oldSpan * factor));
  return fitDistanceWindow(window.start + ratio * oldSpan - ratio * span, span, fullStart, fullEnd);
}

export function normalizedWheelDelta(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>, height: number): number {
  const delta = event.deltaY || event.deltaX; // Shift-wheel can be reported on the horizontal axis.
  return delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
}
