import { useEffect, useRef } from 'react';

/** Isolate an in-place expanded map without remounting its playback/camera state. */
export function useMapFullscreenFocus(
  active: boolean,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const button = buttonRef.current;
    const map = button?.closest<HTMLElement>('[data-replay-surface="map"]');
    if (!map) return;
    map.toggleAttribute('data-map-expanded', active);
    if (!active || !button) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    const previousRole = map.getAttribute('role');
    const previousModal = map.getAttribute('aria-modal');
    const previousTabIndex = map.getAttribute('tabindex');
    map.setAttribute('role', 'dialog');
    map.setAttribute('aria-modal', 'true');
    if (previousTabIndex === null) map.tabIndex = -1;
    const siblings: Array<{ node: HTMLElement; inert: boolean }> = [];
    for (let branch: HTMLElement = map; branch.parentElement; branch = branch.parentElement) {
      for (const node of branch.parentElement.children) {
        if (node instanceof HTMLElement && node !== branch) {
          siblings.push({ node, inert: node.inert });
          node.inert = true;
        }
      }
      if (branch.parentElement === document.body) break;
    }
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Help is body-portaled above this map. Its own focus/Escape handling owns that layer.
    const hasNestedDialog = () => [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .some(dialog => dialog !== map && !map.contains(dialog));
    const controls = () => [...map.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled), [tabindex="0"]',
    )].filter(node => !node.closest('[inert]'));
    map.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasNestedDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const items = controls();
        const first = items[0] ?? map;
        const last = items[items.length - 1] ?? map;
        if (!map.contains(document.activeElement) || document.activeElement === map
          || (event.shiftKey && document.activeElement === first)
          || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!hasNestedDialog() && event.target instanceof Node && !map.contains(event.target)) {
        map.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      siblings.forEach(({ node, inert }) => { node.inert = inert; });
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      if (previousRole === null) map.removeAttribute('role'); else map.setAttribute('role', previousRole);
      if (previousModal === null) map.removeAttribute('aria-modal'); else map.setAttribute('aria-modal', previousModal);
      if (previousTabIndex === null) map.removeAttribute('tabindex');
      map.removeAttribute('data-map-expanded');
      if (previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [active, buttonRef]);
}
