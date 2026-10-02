import { useCallback, useEffect, useRef, useState } from 'react';

export interface InlineConfirmControl {
  isOpen: boolean;
  /** Attach to the button that opens the confirm, so focus can return to it. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  open: () => void;
  cancel: () => void;
  /** Closes the confirm, then runs the action. */
  confirm: (action: () => void) => void;
}

/**
 * State for an inline confirm plus focus handling: when the confirm closes (confirmed or cancelled) the
 * trigger button gets focus back. If the action has disabled the trigger by then (it is running), focus goes
 * to the section heading instead, so the keyboard never falls back to the top of the page.
 */
export function useInlineConfirm(headingId: string): InlineConfirmControl {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (isOpen || !restoreFocus.current) return;
    restoreFocus.current = false;
    const trigger = triggerRef.current;
    if (trigger && !trigger.disabled) trigger.focus();
    else document.getElementById(headingId)?.focus({ preventScroll: true });
  }, [isOpen, headingId]);

  const open = useCallback(() => setIsOpen(true), []);
  const cancel = useCallback(() => {
    restoreFocus.current = true;
    setIsOpen(false);
  }, []);
  const confirm = useCallback((action: () => void) => {
    restoreFocus.current = true;
    setIsOpen(false);
    action();
  }, []);

  return { isOpen, triggerRef, open, cancel, confirm };
}
