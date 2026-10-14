import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const GAP = 4;
const EDGE = 8;
const MAX_HEIGHT = 288;

/**
 * Where a floating panel mounts: inside the open modal layer (a dialog or the expanded map), so focus traps
 * and inert siblings keep treating it as part of that layer, or else on the body.
 */
export function panelHost(anchor: Element | null): HTMLElement {
  return anchor?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? document.body;
}

/**
 * Pins an open panel under its trigger in viewport coordinates, so scroll containers and clipped toolbars
 * cannot cut it off. It opens upward when there is more room above, and stays inside the viewport.
 * The panel must be `fixed` from its first render: in normal flow it would shift the trigger it measures.
 */
export function useAnchoredPanel(open: boolean, anchorRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, align: 'start' | 'end' = 'start') {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setHost(open ? panelHost(anchorRef.current) : null);
  }, [open, anchorRef]);

  useLayoutEffect(() => {
    if (!open || !host) return;
    const place = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      const wanted = Math.min(panel.scrollHeight || MAX_HEIGHT, MAX_HEIGHT);
      const upward = below < wanted && above > below;
      panel.style.minWidth = `${rect.width}px`;
      panel.style.maxHeight = `${Math.max(96, Math.min(MAX_HEIGHT, upward ? above : below))}px`;
      const width = panel.offsetWidth;
      const left = align === 'end' ? rect.right - width : rect.left;
      panel.style.left = `${Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE))}px`;
      if (upward) {
        panel.style.top = 'auto';
        panel.style.bottom = `${window.innerHeight - rect.top + GAP}px`;
      } else {
        panel.style.bottom = 'auto';
        panel.style.top = `${rect.bottom + GAP}px`;
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, host, anchorRef, panelRef, align]);

  return host;
}

/** Closes on a pointer press outside every given element. Capture: map overlays stop bubbling pointer events. */
export function useOutsidePress(open: boolean, refs: ReadonlyArray<RefObject<HTMLElement | null>>, onOutside: () => void) {
  const latest = useRef({ refs, onOutside });
  latest.current = { refs, onOutside };
  useEffect(() => {
    if (!open) return;
    const press = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && latest.current.refs.every(ref => !ref.current?.contains(target))) latest.current.onOutside();
    };
    document.addEventListener('pointerdown', press, true);
    return () => document.removeEventListener('pointerdown', press, true);
  }, [open]);
}
