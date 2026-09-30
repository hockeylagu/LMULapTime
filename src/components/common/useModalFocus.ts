import { useEffect, useRef } from 'react';

/** Isolates a body-portaled dialog, traps focus, and restores its trigger and scrolling. */
export function useModalFocus(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== dialog);
    const originalInert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), [tabindex="0"]')];
    const focusFirst = () => (focusable()[0] ?? dialog).focus();
    focusFirst();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0] ?? dialog;
      const last = controls[controls.length - 1] ?? dialog;
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
      siblings.forEach((node, index) => { node.inert = originalInert[index]; });
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen]);

  return dialogRef;
}
