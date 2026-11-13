import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

const STORAGE_KEY = 'lmu-inspector-panel-width-v1';
/** App assumption: the telemetry charts keep at least this much width beside the panel. */
const CHARTS_MIN_PX = 560;
/** Arrow-key step. */
const STEP_PX = 32;

type PanelMode = 'single' | 'double';
type Stored = Partial<Record<PanelMode, number>>;

function readStored(): Stored {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

/**
 * The inspector panel's width, dragged by the user and remembered per layout (map only, or map beside analysis); null is the
 * default width. The panel's breakpoint widths stay its minimum, so it only grows from today's size.
 */
export function usePanelWidth(mode: PanelMode): [number | null, (width: number | null) => void] {
  const [stored, setStored] = useState(readStored);
  const setWidth = useCallback((width: number | null) => setStored(current => {
    const next = {...current};
    if (width === null) delete next[mode]; else next[mode] = Math.round(width);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
    return next;
  }), [mode]);
  return [stored[mode] ?? null, setWidth];
}

interface Props {
  panel: RefObject<HTMLDivElement | null>;
  onResize: (width: number | null) => void;
  onDragging: (dragging: boolean) => void;
}

/** The divider on the panel's left edge: drag or arrow keys to widen the panel over the charts; double-click resets it. */
export function PanelResizeHandle({panel, onResize, onDragging}: Props) {
  const drag = useRef<{x: number; width: number} | null>(null);
  const [width, setWidth] = useState<number>();
  const bounds = () => {
    const element = panel.current;
    if (!element) return null;
    const min = parseFloat(getComputedStyle(element).minWidth) || 0, max = (element.parentElement?.clientWidth ?? Infinity) - CHARTS_MIN_PX;
    return {min, max: Math.max(min, max), now: element.getBoundingClientRect().width};
  };
  const apply = (next: number) => {
    const limits = bounds();
    if (!limits) return;
    const clamped = Math.min(limits.max, Math.max(limits.min, next));
    setWidth(Math.round(clamped));
    onResize(clamped <= limits.min ? null : clamped);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const limits = bounds();
    if (!limits || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {x: event.clientX, width: limits.now};
    onDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    // The panel is on the right: dragging left widens it.
    if (drag.current) apply(drag.current.width + drag.current.x - event.clientX);
  };
  const endDrag = () => { if (drag.current) { drag.current = null; onDragging(false); } };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const limits = bounds();
    if (!limits) return;
    const next = event.key === 'ArrowLeft' ? limits.now + STEP_PX : event.key === 'ArrowRight' ? limits.now - STEP_PX
      : event.key === 'Home' ? limits.min : event.key === 'End' ? limits.max : null;
    if (next === null) return;
    event.preventDefault();
    apply(next);
  };
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize map panel" tabIndex={0}
      aria-valuenow={width} title="Drag to resize the map panel · double-click to reset"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
      onDoubleClick={() => { setWidth(undefined); onResize(null); }} onKeyDown={onKeyDown}
      className="group absolute inset-y-0 left-0 z-40 hidden w-1.5 cursor-col-resize touch-none outline-none md:block">
      <div className="h-full w-px bg-lmu-border transition-colors group-hover:w-0.5 group-hover:bg-lmu-info group-focus-visible:w-0.5 group-focus-visible:bg-lmu-info group-active:bg-lmu-info" />
    </div>
  );
}
