import React, { useEffect, useId, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useReplayKeys } from '../../../../utils/replayShortcuts.js';
import { FOCUS_RING } from '../../../common/buttonStyles.js';
import { DROPDOWN_CONTENT_INSET, DROPDOWN_PANEL } from '../../../common/dropdown/dropdownStyles.js';
import { isDriverCamera } from './driverCameras.js';
import type { SceneryCameraType } from '../../../../../shared/types/scenes/scenery.js';
import type { ShadowCascadeSet } from '../shadows/shadowCascades.js';

export type CameraMode = 'follow' | 'chase' | 'cockpit' | 'hood' | 'roof' | 'orbit' | 'trackside' | 'top';
export const CAMERA_MODES: ReadonlyArray<{value: CameraMode; label: string; shortcut: string}> = [
  {value: 'follow', label: 'Follow', shortcut: '1'}, {value: 'chase', label: 'Chase', shortcut: '2'},
  {value: 'cockpit', label: 'Cockpit', shortcut: '3'}, {value: 'hood', label: 'Hood', shortcut: '4'},
  {value: 'roof', label: 'Roof', shortcut: '5'}, {value: 'orbit', label: 'Orbit', shortcut: '6'},
  {value: 'trackside', label: 'Trackside', shortcut: '7'}, {value: 'top', label: 'Overhead', shortcut: '8'},
];

/** Cameras that move with the car (the follow toggle turns them off). */
export const followsCar = (mode: CameraMode): boolean => mode === 'follow' || mode === 'chase' || isDriverCamera(mode);
/** Cameras locked on the car: a keyboard pan hands them over to free orbit. */
export const carLockedCamera = (mode: CameraMode): boolean => followsCar(mode) || mode === 'trackside';

/** The package camera type whose exposure and tone a view uses: the cockpit is onboard, trackside is TV, every other view external. */
export function exposureType(mode: CameraMode): SceneryCameraType {
  switch (mode) {
    case 'cockpit': return 'onboard';
    case 'trackside': return 'tv';
    case 'follow': case 'chase': case 'hood': case 'roof': case 'orbit': case 'top': return 'external';
  }
}

/**
 * The package's sun shadow cascade set a view samples: the cockpit set onboard, the TV set trackside, the chase set for every other
 * view (the free views are not game cameras). A car-mounted view's own game camera may set keys over it (`shadowCameraOf`).
 */
export function shadowCascadeSet(mode: CameraMode): ShadowCascadeSet {
  switch (mode) {
    case 'cockpit': return 'cockpit';
    case 'trackside': return 'tv';
    case 'follow': case 'chase': case 'hood': case 'roof': case 'orbit': case 'top': return 'chase';
  }
}

/** Mode keys belong to the active 3D map, with the same typing/dialog guards as replay keys. */
export function useCameraModeShortcuts(map: React.RefObject<HTMLElement | null>, onMode: (mode: CameraMode) => void): void {
  useReplayKeys(Object.fromEntries(CAMERA_MODES.map(option => [option.shortcut, () => onMode(option.value)])), map);
}

interface CameraModeControlProps {
  mode: CameraMode;
  onChange: (mode: CameraMode) => void;
  /** The whole circuit from the air (key 9): an orbit view placed once, so it stands under the modes, never pressed. */
  onOverview: () => void;
}

/** Camera picker in the map controls column: a disclosure like the Layers control, one pressed button per mode. */
export const CameraModeControl: React.FC<CameraModeControlProps> = ({ mode, onChange, onOverview }) => {
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
  const pick = (act: () => void) => { act(); setOpen(false); trigger.current?.focus(); };

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
            {CAMERA_MODES.map(opt => (
              <CameraOption key={opt.value} label={opt.label} shortcut={opt.shortcut} pressed={opt.value === mode} onPick={() => pick(() => onChange(opt.value))} />
            ))}
            <div aria-hidden="true" className="my-1 border-t border-lmu-border" />
            <CameraOption label="Whole circuit" shortcut="9" onPick={() => pick(onOverview)} />
          </div>
        </div>
      )}
    </div>
  );
};

/** One row of the camera menu: its label and key; `pressed` only on the modes. */
function CameraOption({label, shortcut, pressed, onPick}: {label: string; shortcut: string; pressed?: boolean; onPick: () => void}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPick}
      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
        pressed ? 'bg-lmu-raised text-white font-semibold' : 'text-lmu-text-soft hover:text-white hover:bg-lmu-raised/50'
      } ${FOCUS_RING}`}
    >
      <span>{label}</span>
      <kbd className="text-[10px] font-mono text-lmu-muted bg-lmu-deep/60 px-1 py-0.5 rounded border border-lmu-border">{shortcut}</kbd>
    </button>
  );
}
