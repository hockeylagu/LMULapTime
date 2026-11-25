import { describe, expect, it } from 'vitest';
import { lockPageScroll } from '../../../src/components/common/pageScrollLock.js';

describe('lockPageScroll', () => {
  it('gives the scroll bar back when nested layers release parent first', () => {
    const inspector = lockPageScroll();
    const map = lockPageScroll();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    inspector();
    expect(document.body.style.overflow).toBe('hidden');
    map();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('ignores a second release from the same holder', () => {
    const outer = lockPageScroll();
    const inner = lockPageScroll();
    inner();
    inner();
    expect(document.body.style.overflow).toBe('hidden');
    outer();
    expect(document.body.style.overflow).toBe('');
  });
});
