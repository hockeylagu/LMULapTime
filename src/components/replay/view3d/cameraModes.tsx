import React, { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { replayShortcutBlocked } from '../../../utils/replayShortcuts.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { DROPDOWN_CONTENT_INSET, DROPDOWN_PANEL } from '../../common/dropdown/dropdownStyles.js';

export type CameraMode = 'follow' | 'chase' | 'cockpit' | 'orbit' | 'trackside' | 'top';
export const CAMERA_MODES: ReadonlyArray<{value: CameraMode; label: string; shortcut: string}> = [
  {value: 'follow', label: 'Follow', shortcut: '1'}, {value: 'chase', label: 'Chase', shortcut: '2'},
  {value: 'cockpit', label: 'Cockpit', shortcut: '3'}, {value: 'orbit', label: 'Orbit', shortcut: '4'},
  {value: 'trackside', label: 'Trackside', shortcut: '5'}, {value: 'top', label: 'Overhead', shortcut: '6'},
];

/** Mode keys belong to the active 3D map, with the same typing/dialog guards as replay keys. */
export function useCameraModeShortcuts(map: React.RefObject<HTMLElement | null>, onMode: (mode: CameraMode) => void): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat || replayShortcutBlocked(event)) return;
    const container = map.current, expanded = document.querySelector('[data-map-expanded]');
    if (!container || container.closest('[inert]') || expanded && expanded !== container) return;
    if (!(event.target instanceof Node && container.contains(event.target))) return;
    const mode = CAMERA_MODES.find(option => option.shortcut === event.key);
    if (mode) { event.preventDefault(); onMode(mode.value); }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

interface CameraModeControlProps {
  mode: CameraMode;
  onChange: (mode: CameraMode) => void;
}

/** Camera picker in the map controls column: a disclosure like the Layers control, one pressed button per mode. */
export const CameraModeControl: React.FC<CameraModeControlProps> = ({ mode, onChange }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    // Other map controls stop bubbling pointer events; capture still observes outside clicks.
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [open]);

  const activeOption = CAMERA_MODES.find(opt => opt.value === mode) ?? CAMERA_MODES[0];

  return (
    <div
      ref={root}
      className="relative"
      data-map-control="camera"
      // Keyboard focus leaving the control closes it; a click without a focus target (relatedTarget null) is left to `dismiss`.
      onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label="3D camera"
        title={`Camera: ${activeOption.label}`}
        onClick={() => setOpen(val => !val)}
        className={`w-7 h-7 flex items-center justify-center rounded-lg bg-lmu-raised/40 hover:bg-lmu-raised aria-expanded:bg-lmu-raised text-lmu-muted hover:text-lmu-text aria-expanded:text-lmu-text transition-colors cursor-pointer shrink-0 ${FOCUS_RING}`}
      >
        <Camera className="w-3.5 h-3.5" />
        <span className="sr-only">{activeOption.label}</span>
      </button>

      {open && (
        <div
          id={id}
          role="group"
          aria-label="Camera modes"
          className={`absolute top-full right-0 mt-1 w-44 z-40 ${DROPDOWN_PANEL} ${DROPDOWN_CONTENT_INSET}`}
        >
          <div aria-hidden="true" className="text-xs font-semibold text-lmu-text mb-1.5 px-1">Camera mode</div>
          <div className="flex flex-col gap-0.5">
            {CAMERA_MODES.map(opt => {
              const selected = opt.value === mode;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    trigger.current?.focus();
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                    selected ? 'bg-lmu-raised text-white font-semibold' : 'text-lmu-text-soft hover:text-white hover:bg-lmu-raised/50'
                  } ${FOCUS_RING}`}
                >
                  <span>{opt.label}</span>
                  <kbd className="text-[10px] font-mono text-lmu-muted bg-lmu-deep/60 px-1 py-0.5 rounded border border-lmu-border">
                    {opt.shortcut}
                  </kbd>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
