import type React from 'react';

/** Plain left click with no modifier: the app handles the navigation itself. */
export function isPlainLeftClick(e: Pick<React.MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}

/**
 * onClick for a Link that also has an in-app handler: a plain left click runs `handler`
 * instead of the Link's own navigation; modifier/middle clicks are left to the browser
 * (new tab/window). The click never reaches enclosing clickable rows/cards when `stop` is true.
 */
export function linkClickHandler(handler?: () => void, options?: { stop?: boolean }): (e: React.MouseEvent) => void {
  return (e) => {
    if (options?.stop) e.stopPropagation();
    if (handler && isPlainLeftClick(e)) {
      e.preventDefault();
      handler();
    }
  };
}
