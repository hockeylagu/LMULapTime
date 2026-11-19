import { useEffect, useEffectEvent, type RefObject } from 'react';
import type { ReplayTrajectoryPoint } from '../../shared/types/index.js';

// The element focus last reached with the mouse: a button or slider focused with the mouse (or one focus came back to after
// a mouse pick, as a dropdown's trigger) leaves the keys to the replay: Space plays rather than pressing it again, the arrows
// step the replay. One reached with a key (Tab, or focus given back when Escape closed a dialog) keeps its keys (Chrome
// reports :focus-visible for both once a key is down, so it cannot tell them apart). A chart or map clicked with the mouse is
// marked data-pointer-focus, so its keyboard focus ring stays off (SURFACE_FOCUS_RING) until focus leaves it or Tab is pressed.
let pointerFocused: Element | null = null;
// Whether the mouse, rather than a key, was the last thing used: focus moving now moved with it.
let pointerLast = false;
const POINTER_CONTROLS = 'button, input[type="range"]';
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', event => {
    pointerLast = true;
    const target = event.target instanceof Element ? event.target : null;
    // Pressing the control that already has focus moves no focus.
    const control = target?.closest(POINTER_CONTROLS);
    if (control && control === document.activeElement) pointerFocused = control;
    const surface = target?.closest<HTMLElement>('[data-replay-surface]');
    if (surface) surface.dataset.pointerFocus = '';
  }, true);
  document.addEventListener('focusin', event => {
    pointerFocused = pointerLast && event.target instanceof Element ? event.target : null;
  }, true);
  document.addEventListener('keydown', event => {
    pointerLast = false;
    if (event.key !== 'Tab') return;
    pointerFocused = null;
    document.querySelectorAll<HTMLElement>('[data-pointer-focus]').forEach(element => { delete element.dataset.pointerFocus; });
  }, true);
  document.addEventListener('focusout', event => {
    if (event.target instanceof HTMLElement) delete event.target.dataset.pointerFocus;
  }, true);
}

function pointerFocusedButton(element: Element | null): boolean {
  return element !== null && pointerFocused === element && document.activeElement === element;
}

/**
 * Keep analysis shortcuts out of native controls, typing, open dropdowns, browser commands and dialogs. `withCtrl`: a Ctrl
 * shortcut of the replay's own. A key another listener already took (default prevented) is not taken again, so a key acts once.
 */
export function replayShortcutBlocked(event: KeyboardEvent, withCtrl = false): boolean {
  if (event.defaultPrevented || (event.ctrlKey && !withCtrl) || event.metaKey || event.altKey) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[aria-haspopup][aria-expanded="true"], [role="listbox"], [role="menu"]')) return true;
  const control = target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"], details[open]') ?? null;
  if (control && !pointerFocusedButton(control.closest(POINTER_CONTROLS))) return true;
  return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
    .some(dialog => !dialog.matches('[data-replay-surface]') && !dialog.querySelector('[data-replay-surface]'));
}

/**
 * Nothing holds the keys: nothing focused (after a view switch or a fresh load), or a button or slider outside the charts and
 * maps that the mouse focused. The page's keys are then the replay's.
 */
export function isPageTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (target === document.body || target === document.documentElement) return true;
  return target instanceof Element && !target.closest('[data-replay-surface]') && pointerFocusedButton(target.closest(POINTER_CONTROLS));
}

/** Keys for the replay: on a chart or map, anywhere while the map is fullscreen, or when nothing holds the keys. */
export function isReplaySurfaceTarget(event: KeyboardEvent): boolean {
  if (document.querySelector('[data-map-expanded]') || isPageTarget(event)) return true;
  return event.target instanceof Element && Boolean(event.target.closest('[data-replay-surface]'));
}

/**
 * Where a key works. 'page': anywhere on the page. 'replay': `isReplaySurfaceTarget`. An element (a chart, a map): on it or when
 * nothing holds the keys, while it is shown and no map outside it is fullscreen (the keys of a view kept loaded but hidden stay off).
 */
export type ReplayKeyScope = 'page' | 'replay' | RefObject<HTMLElement | null>;

export interface ReplayKey {
  /** Returns false to leave the key alone (not handled, not prevented). */
  run: (event: KeyboardEvent) => void | false;
  /** Held keys repeat (arrows, pan, zoom); others act once per press. */
  repeat?: boolean;
  /** Ctrl is part of this key (Ctrl + arrows). */
  ctrl?: boolean;
  /** Shift + this key is not this key. */
  noShift?: boolean;
}

/** Whether this element's keys are live: shown, and no map outside it fullscreen. */
export function keysLive(element: Element | null): element is Element {
  const expanded = document.querySelector('[data-map-expanded]');
  return Boolean(element && !element.closest('[inert], [hidden]') && (!expanded || expanded.contains(element)));
}

function inScope(event: KeyboardEvent, scope: ReplayKeyScope): boolean {
  if (scope === 'page') return true;
  if (scope === 'replay') return isReplaySurfaceTarget(event);
  const element = scope.current;
  if (!keysLive(element)) return false;
  return isPageTarget(event) || (event.target instanceof Node && element.contains(event.target));
}

/**
 * One view's keys, with the replay's shared rules: `keys` maps `event.key` (letters in lower case) to its action (undefined: no
 * such key here). Typing, open dropdowns, browser commands and dialogs keep their keys (`replayShortcutBlocked`), then `scope`
 * says where the keys work. Off while `enabled` is false.
 */
export function useReplayKeys(keys: Record<string, ReplayKey['run'] | ReplayKey | undefined>, scope: ReplayKeyScope, enabled = true): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    const entry = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!entry) return;
    const key = typeof entry === 'function' ? { run: entry } : entry;
    if ((event.repeat && !key.repeat) || (key.noShift && event.shiftKey) || replayShortcutBlocked(event, key.ctrl) || !inScope(event, scope)) return;
    if (key.run(event) !== false) event.preventDefault();
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => handle(event);
    window.addEventListener('keydown', listener);
    liveKeySets++;
    return () => { window.removeEventListener('keydown', listener); liveKeySets--; };
  }, [enabled]);
}

let liveKeySets = 0;
/** Whether any replay keys are on the page (a dropdown then leaves its keys to them once the mouse picked). */
export function replayKeysOn(): boolean {
  return liveKeySets > 0;
}

/** The sample a step lands on: the next or previous one, or with `far` the one 0.5 s away (the chart's and map's Left / Right). */
export function steppedIndex(points: readonly ReplayTrajectoryPoint[], index: number, direction: -1 | 1, far: boolean): number {
  const last = points.length - 1;
  if (!far) return Math.max(0, Math.min(last, index + direction));
  const target = (points[index]?.timeSec ?? index / 40) + direction * 0.5;
  let lo = 0, hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((points[mid]?.timeSec ?? mid / 40) <= target) lo = mid; else hi = mid - 1;
  }
  return lo;
}
