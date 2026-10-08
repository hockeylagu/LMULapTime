import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { isReplaySurfaceTarget, replayShortcutBlocked } from '../../utils/replayShortcuts.js';
import { useModalFocus } from '../common/useModalFocus.js';
import { FOCUS_RING } from '../common/buttonStyles.js';

const shortcuts = [
  ['Shift + wheel', 'Zoom around the mouse'], ['Shift + drag', 'Zoom into a range'],
  ['Alt + drag', 'Pan the zoomed chart'], ['← / →', 'Previous / next recorded sample'],
  ['Shift + ← / →', 'Move cursor by 0.5 seconds'], ['Space', 'Play / pause'],
  ['Home / End', 'Lap start / end'], ['+ / −', 'Zoom around the cursor'],
  ['0 / R / dbl-click', 'Show full lap / reset map view'], ['C', 'Center map on car, keep zoom'],
  ['F', 'Toggle follow car'], ['G', 'Toggle G-force arrow'], ['Minimap drag', 'Pan camera to circuit sector'],
  ['W / A / S / D', 'Pan map up / left / down / right'],
  ['Esc', 'Cancel gesture / close help'], ['?', 'Show shortcuts'],
];

export function ReplayShortcutHelp() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus(open, () => setOpen(false));
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === '?' && isReplaySurfaceTarget(event) && !replayShortcutBlocked(event)) {
        event.preventDefault(); setOpen(true);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  return <>
    <button type="button" onClick={() => setOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts"
      className={`h-7 w-7 shrink-0 text-xs font-mono text-lmu-muted hover:text-lmu-text rounded-lg hover:bg-lmu-raised/70 transition-colors cursor-pointer ${FOCUS_RING}`}>?</button>
    {open && createPortal(<div ref={dialogRef} className="fixed inset-0 z-[1100] bg-black/60 flex items-center justify-center" onClick={() => setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-labelledby="replay-shortcut-title"
        className="w-[440px] max-w-[90vw] rounded-xl border border-lmu-border bg-lmu-strip p-5 shadow-xl"
        onClick={event => event.stopPropagation()} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
        }}>
        <div className="flex justify-between items-center mb-4"><h2 id="replay-shortcut-title" className="text-sm font-bold">Telemetry shortcuts</h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close shortcuts" className={`px-2 py-1 rounded hover:bg-lmu-raised/70 transition-colors cursor-pointer ${FOCUS_RING}`}><X className="w-4 h-4" /></button></div>
        <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2 text-xs">{shortcuts.map(([key, action]) =>
          <div key={key} className="contents"><dt className="font-mono text-lmu-text-soft">{key}</dt><dd className="text-lmu-muted">{action}</dd></div>)}</dl>
        <p className="mt-4 text-xs text-lmu-muted">Click the chart to use chart shortcuts. C, F and Space work from the chart or map. Dragging the map pauses following.</p>
      </section>
    </div>, document.body)}
  </>;
}
