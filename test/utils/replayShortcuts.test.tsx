import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { isPageTarget, isReplaySurfaceTarget, replayShortcutBlocked, useReplayKeys } from '../../src/utils/replayShortcuts.js';

const space = (target: Element) => {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
};

describe('replay shortcuts on buttons', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('lets Space play after a mouse click on a button, but not after Tab focus', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    expect(replayShortcutBlocked(space(button))).toBe(true);

    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    button.focus();
    expect(replayShortcutBlocked(space(button))).toBe(false);
    expect(isReplaySurfaceTarget(space(button))).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(replayShortcutBlocked(space(button))).toBe(true);
    expect(isReplaySurfaceTarget(space(button))).toBe(false);
  });

  it('gives a button focus came back to after a key its keys, even after an earlier mouse click', () => {
    const [clicked, help] = [document.createElement('button'), document.createElement('button')];
    document.body.append(clicked, help);
    clicked.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    clicked.focus();
    // Escape closes a dialog, which gives focus back to its opener.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    help.focus();
    expect(replayShortcutBlocked(space(help))).toBe(true);
    // A press on the focused button itself counts as the mouse's.
    help.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(replayShortcutBlocked(space(help))).toBe(false);
  });

  it('lets Space play after a mouse click on the timeline slider, but not after Tab focus', () => {
    const slider = document.createElement('input'); slider.type = 'range';
    document.body.appendChild(slider);
    expect(replayShortcutBlocked(space(slider))).toBe(true);
    slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    slider.focus();
    expect(replayShortcutBlocked(space(slider))).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(replayShortcutBlocked(space(slider))).toBe(true);
  });

  it('marks a chart clicked with the mouse so its focus ring stays off until Tab or blur', () => {
    const chart = document.createElement('div'); chart.dataset.replaySurface = 'chart';
    const inner = document.createElement('span'); chart.append(inner); document.body.append(chart);
    inner.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(chart.dataset.pointerFocus).toBe('');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(chart.dataset.pointerFocus).toBeUndefined();
    inner.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    chart.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(chart.dataset.pointerFocus).toBeUndefined();
  });
});

describe('keys after a mouse click', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('gives the page keys to the replay after a header button or a dropdown pick, and leaves an open dropdown its keys', () => {
    const header = document.createElement('button'); const option = document.createElement('div');
    const trigger = document.createElement('button'); trigger.setAttribute('aria-haspopup', 'listbox');
    document.body.append(header, option, trigger);
    const arrow = (target: Element) => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true });
      Object.defineProperty(event, 'target', { value: target });
      return event;
    };
    header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); header.focus();
    expect(isPageTarget(arrow(header))).toBe(true);
    // A pick from the list: the mouse presses an option, focus goes back to the trigger.
    trigger.setAttribute('aria-expanded', 'true'); trigger.focus();
    expect(replayShortcutBlocked(arrow(trigger))).toBe(true);
    option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    trigger.setAttribute('aria-expanded', 'false');
    expect(replayShortcutBlocked(arrow(trigger))).toBe(false);
    expect(isPageTarget(arrow(trigger))).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(isPageTarget(arrow(trigger))).toBe(false);
  });
});

describe('useReplayKeys', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const key = (target: Element, init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  it('acts once per press, leaves typing and declined keys alone, and keeps an element scope to that element or the page', () => {
    const view = document.createElement('div'); const other = document.createElement('div'); const input = document.createElement('input');
    document.body.append(view, other, input);
    const run = vi.fn(); const held = vi.fn(); const declined = vi.fn(() => false as const);
    renderHook(() => useReplayKeys({ g: run, w: { run: held, repeat: true }, x: declined, k: { run, noShift: true } }, { current: view }));
    expect(key(document.body, { key: 'G' }).defaultPrevented).toBe(true);
    key(view, { key: 'g' }); key(view, { key: 'g', repeat: true }); key(input, { key: 'g' }); key(other, { key: 'g' });
    expect(run).toHaveBeenCalledTimes(2);
    key(view, { key: 'w', repeat: true }); expect(held).toHaveBeenCalledOnce();
    expect(key(view, { key: 'x' }).defaultPrevented).toBe(false); expect(declined).toHaveBeenCalledOnce();
    key(view, { key: 'K', shiftKey: true }); expect(run).toHaveBeenCalledTimes(2);
    view.hidden = true; key(document.body, { key: 'g' }); expect(run).toHaveBeenCalledTimes(2);
  });
});
