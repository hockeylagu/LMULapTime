let holders = 0;
let saved = { body: '', root: '' };

/**
 * Stop the page scrolling while a full-screen layer is open; the returned release undoes it once every holder let go.
 * Counted, not saved per caller: nested layers (the replay inspector, its expanded map, a dialog) unmount parent first,
 * so a per-caller save/restore let the child put back the parent's `hidden` and the page lost its scroll bar.
 */
export function lockPageScroll(): () => void {
  if (holders === 0) {
    saved = { body: document.body.style.overflow, root: document.documentElement.style.overflow };
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0) return;
    document.body.style.overflow = saved.body;
    document.documentElement.style.overflow = saved.root;
  };
}
