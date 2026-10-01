/** Keep analysis shortcuts out of native controls, typing, browser commands and dialogs. */
export function replayShortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"], details[open]')) return true;
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .some(dialog => !dialog.querySelector('[data-replay-surface]'));
}

export function isReplaySurfaceTarget(event: KeyboardEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest('[data-replay-surface]'));
}
