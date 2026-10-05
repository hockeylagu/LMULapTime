import { describe, it, expect, vi } from 'vitest';
import type React from 'react';
import { isPlainLeftClick, linkClickHandler } from '../../src/utils/linkClick.js';

function click(init: { button?: number; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) {
  return { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...init };
}
const asEvent = (e: ReturnType<typeof click>) => e as unknown as React.MouseEvent;

describe('linkClick', () => {
  it('treats only an unmodified left click as plain', () => {
    expect(isPlainLeftClick(click())).toBe(true);
    for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) expect(isPlainLeftClick(click({ [key]: true }))).toBe(false);
    expect(isPlainLeftClick(click({ button: 1 }))).toBe(false);
  });

  it('runs the handler instead of the Link navigation on a plain click', () => {
    const handler = vi.fn(); const e = click();
    linkClickHandler(handler)(asEvent(e));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('leaves modifier and middle clicks to the browser', () => {
    const handler = vi.fn();
    for (const e of [click({ ctrlKey: true }), click({ metaKey: true }), click({ button: 1 })]) {
      linkClickHandler(handler)(asEvent(e));
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops propagation for every click when asked, and works without a handler', () => {
    const plain = click(); const ctrl = click({ ctrlKey: true });
    linkClickHandler(undefined, { stop: true })(asEvent(plain));
    linkClickHandler(vi.fn(), { stop: true })(asEvent(ctrl));
    expect(plain.stopPropagation).toHaveBeenCalled();
    expect(plain.preventDefault).not.toHaveBeenCalled();
    expect(ctrl.stopPropagation).toHaveBeenCalled();
  });
});
