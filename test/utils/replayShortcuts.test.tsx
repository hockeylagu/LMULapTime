import { afterEach, describe, expect, it } from 'vitest';
import { isReplaySurfaceTarget, replayShortcutBlocked } from '../../src/utils/replayShortcuts.js';

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
