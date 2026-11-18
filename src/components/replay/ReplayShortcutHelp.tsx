import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { isReplaySurfaceTarget, replayShortcutBlocked } from '../../utils/replayShortcuts.js';
import { useModalFocus } from '../common/useModalFocus.js';
import { FOCUS_RING } from '../common/buttonStyles.js';
import { CAMERA_MODES } from './view3d/camera/cameraModes.js';

const shortcuts = [
  ['Shift + wheel', 'Zoom around the mouse'], ['Shift + drag', 'Zoom into a range'],
  ['Alt + drag', 'Pan the zoomed chart'], ['X', 'Marker A at the cursor: delta to it, ghost runs from A (again: clear)'],
  ['Alt + click', 'Marker A where you click'], ['Backspace', 'Back to marker A and play'], ['Esc / dbl-click', 'Remove marker A'], ['← / →', 'Previous / next recorded sample'],
  ['Shift + ← / →', 'Move cursor by 0.5 seconds'], ['Space', 'Play / pause'],
  [', / .', 'Slower / faster playback (0.25× to 2×)'],
  ['Home / End', 'Lap start / end'], ['+ / −', 'Zoom around the cursor'],
  ['0 / R / dbl-click', 'Show full lap / reset map view'], ['C', 'Center map on car, keep zoom'],
  ['F', 'Toggle follow car'], ['G', 'Toggle G-force arrow'], ['V', 'Ghost sync: distance / time (/ from A with a marker)'], ['Minimap drag', 'Pan camera to circuit sector'],
  ['M', 'Toggle fullscreen map'], ['E', 'Switch to the 3D view'], ['T', 'Hide / show fullscreen trace'], ['L', 'Session replay at the cursor\'s moment'],
  ['W / A / S / D', 'Pan map up / left / down / right'],
  ['Esc', 'Exit fullscreen / cancel gesture / close help'], ['?', 'Show shortcuts'],
];
const shortcuts3d = [
  ...CAMERA_MODES.map(option => [option.shortcut, `${option.label} camera`]),
  ['Drag / right drag', 'Orbit / pan camera'], ['Wheel / + / −', 'Zoom camera'],
  ['← / →', 'Previous / next recorded sample'], ['Shift + ← / →', 'Move cursor by 0.5 seconds'],
  ['Home / End', 'Lap start / end'], ['Space', 'Play / pause'], [', / .', 'Slower / faster playback (0.25× to 2×)'],
  ['W / A / S / D', 'Pan camera up / left / down / right'], ['C', 'Center on car, keep zoom'],
  ['F', 'Toggle follow car'], ['V', 'Ghost sync: distance / time (/ from A with a marker)'],
  ['X', 'Marker A at the car: ghost runs from A (again: clear)'], ['Backspace', 'Back to marker A and play'], ['0 / R', 'Reset camera'], ['M', 'Toggle fullscreen map'], ['E', 'Back to the 2D map'],
  ['L', 'Session replay at the cursor\'s moment'], ['Esc', 'Exit fullscreen / close help'], ['?', 'Show shortcuts'],
];

const shortcutsRace = [
  ['Space', 'Play / pause'], ['← / →', 'Back / forward 5 seconds'], ['Shift + ← / →', 'Back / forward 30 seconds'], ['Ctrl + ← / →', 'Back / forward 1 second'],
  [', / .', 'Slower / faster playback (1× to 16×)'], ['Home / End', 'Session start / end'],
  ['+ / −', 'Zoom map'], ['0 / R / dbl-click', 'Show the whole circuit'], ['C', 'Center map on the followed car, keep zoom'],
  ['F', 'Toggle follow car'], ['W / A / S / D', 'Pan map up / left / down / right'],
  ['E', 'Switch to the 3D view'], ['L', 'The followed car\'s lap in the lap view, at this moment'], ['Click a car or row', 'Follow that car'], ['?', 'Show shortcuts'],
];
const shortcutsRace3d = [
  ...CAMERA_MODES.map(option => [option.shortcut, `${option.label} camera`]),
  ['Drag / right drag', 'Orbit / pan camera'], ['Wheel / + / −', 'Zoom camera'],
  ['Space', 'Play / pause'], ['← / →', 'Back / forward 5 seconds'], ['Shift + ← / →', 'Back / forward 30 seconds'], ['Ctrl + ← / →', 'Back / forward 1 second'],
  [', / .', 'Slower / faster playback (1× to 16×)'], ['Home / End', 'Session start / end'],
  ['W / A / S / D', 'Pan camera up / left / down / right'], ['C', 'Center on the followed car, keep zoom'],
  ['F', 'Toggle follow car'], ['0 / R', 'Reset camera'], ['E', 'Back to the 2D map'],
  ['L', 'The followed car\'s lap in the lap view, at this moment'], ['Click a row', 'Follow that car'], ['?', 'Show shortcuts'],
];
type ShortcutView = 'telemetry' | '3d' | 'race' | 'race3d';
const SHORTCUTS: Record<ShortcutView, string[][]> = { telemetry: shortcuts, '3d': shortcuts3d, race: shortcutsRace, race3d: shortcutsRace3d };
const TITLES: Record<ShortcutView, string> = { telemetry: 'Telemetry shortcuts', '3d': '3D replay shortcuts', race: 'Race replay shortcuts', race3d: 'Race 3D shortcuts' };
const NOTES = {
  telemetry: 'Click the chart to use chart shortcuts. C, F, M and Space work from the chart or map. Dragging the map pauses following.',
  '3d': 'Follow is the default. Drag, pan or zoom without leaving Follow. Choose a mode with 1–6; camera controls and typing keep their own keys.',
  race: 'The keys work anywhere on the race replay. Dragging the map pauses following.',
  race3d: 'The keys work anywhere on the race replay; choose a camera with 1–8 on the 3D view. Chase is the default.',
};

/** The help button and dialog of a view; `enabled` false (a view kept loaded, hidden) leaves ? to the view shown. */
export function ReplayShortcutHelp({view = 'telemetry', enabled = true}: {view?: ShortcutView; enabled?: boolean} = {}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocus(open, () => setOpen(false));
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key !== '?' || !enabled || replayShortcutBlocked(event)) return;
      // The race replay shows one view at a time: its ? works anywhere on the page.
      const race = view === 'race' || view === 'race3d';
      const on3d = Boolean(document.querySelector('[data-map-expanded][data-replay-view="3d"]')
        || event.target instanceof Element && event.target.closest('[data-replay-view="3d"]'));
      if (!race && ((view === '3d') !== on3d || !isReplaySurfaceTarget(event))) return;
      event.preventDefault(); setOpen(true);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [view, enabled]);
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
        <div className="flex justify-between items-center mb-4"><h2 id="replay-shortcut-title" className="text-sm font-bold">{TITLES[view]}</h2>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close shortcuts" className={`px-2 py-1 rounded hover:bg-lmu-raised/70 transition-colors cursor-pointer ${FOCUS_RING}`}><X className="w-4 h-4" /></button></div>
        <dl className="grid grid-cols-[150px_1fr] gap-x-3 gap-y-2 text-xs">{SHORTCUTS[view].map(([key, action]) =>
          <div key={key} className="contents"><dt className="font-mono text-lmu-text-soft">{key}</dt><dd className="text-lmu-muted">{action}</dd></div>)}</dl>
        <p className="mt-4 text-xs text-lmu-muted">{NOTES[view]}</p>
      </section>
    </div>, document.body)}
  </>;
}
