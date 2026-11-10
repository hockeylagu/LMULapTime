// The button last pressed with the mouse, until the keyboard moves focus. Space on it should play,
// not press it again; a button reached with Tab keeps Space and Enter (Chrome reports :focus-visible
// for both once a key is down, so it cannot tell them apart).
// A chart or map clicked with the mouse is marked data-pointer-focus, so its keyboard focus ring
// stays off (SURFACE_FOCUS_RING) until focus leaves it or Tab is pressed.
let pointerButton: Element | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target : null;
    pointerButton = target?.closest('button') ?? null;
    const surface = target?.closest<HTMLElement>('[data-replay-surface]');
    if (surface) surface.dataset.pointerFocus = '';
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    pointerButton = null;
    document.querySelectorAll<HTMLElement>('[data-pointer-focus]').forEach(element => { delete element.dataset.pointerFocus; });
  }, true);
  document.addEventListener('focusout', event => {
    if (event.target instanceof HTMLElement) delete event.target.dataset.pointerFocus;
  }, true);
}

function pointerFocusedButton(element: Element | null): boolean {
  return element !== null && element === pointerButton && document.activeElement === element;
}

/** Keep analysis shortcuts out of native controls, typing, browser commands and dialogs. */
export function replayShortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return true;
  const target = event.target instanceof Element ? event.target : null;
  const control = target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"], details[open]') ?? null;
  if (control && !pointerFocusedButton(control)) return true;
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .some(dialog => !dialog.matches('[data-replay-surface]') && !dialog.querySelector('[data-replay-surface]'));
}

/** Keys for the replay: on a chart or map, anywhere while the map is fullscreen, or on a button just clicked. */
export function isReplaySurfaceTarget(event: KeyboardEvent): boolean {
  if (document.querySelector('[data-map-expanded]')) return true;
  const target = event.target instanceof Element ? event.target : null;
  return Boolean(target?.closest('[data-replay-surface]')) || pointerFocusedButton(target?.closest('button') ?? null);
}
