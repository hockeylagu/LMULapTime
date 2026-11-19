import { fireEvent } from '@testing-library/react';

/** A Ctrl/Cmd-click. The test DOM cannot open a new tab: swallow the browser default after React has seen the click. */
export function modifierClick(el: HTMLElement, init: { ctrlKey?: boolean; metaKey?: boolean }): void {
  el.addEventListener('click', e => e.preventDefault(), { once: true });
  fireEvent.click(el, init);
}
