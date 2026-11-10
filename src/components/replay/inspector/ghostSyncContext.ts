import { createContext, useContext, useMemo, useState } from 'react';
import type { GhostSyncMode } from '../map/ghostSync.js';

/**
 * How the ghost follows the primary car, and telemetry marker A (a primary-frame lap distance,
 * the anchored mode's start). Shared by the telemetry strips, the 2D map and the 3D view; the
 * inspector page provides it (the mode lives in the URL).
 */
export interface GhostSyncState {
  mode: GhostSyncMode;
  setMode: (mode: GhostSyncMode) => void;
  markerDistM: number | null;
  setMarkerDistM: (distM: number | null) => void;
}

export const GhostSyncContext = createContext<GhostSyncState | null>(null);

/** The inspector's shared state, or this component's own outside an inspector. */
export function useGhostSync(): GhostSyncState {
  const shared = useContext(GhostSyncContext);
  const [mode, setMode] = useState<GhostSyncMode>('distance');
  const [markerDistM, setMarkerDistM] = useState<number | null>(null);
  const local = useMemo(() => ({ mode, setMode, markerDistM, setMarkerDistM }), [mode, markerDistM]);
  return shared ?? local;
}

/** The mode bar's ghost sync toggle props. */
export function ghostSyncControls({ mode, setMode, markerDistM }: GhostSyncState) {
  return { ghostSync: mode, onChangeGhostSync: setMode, ghostAnchorSet: markerDistM !== null };
}

/**
 * Drops marker A (X, Alt-click or the A button) and runs the ghost from it, or clears it and
 * goes back to Distance: scrub on distance, mark before a corner, then play both cars from there.
 */
export function placeGhostMarker({ mode, setMode, setMarkerDistM }: GhostSyncState, distM: number | null): void {
  setMarkerDistM(distM);
  if (distM !== null) { if (mode !== 'anchored') setMode('anchored'); }
  else if (mode === 'anchored') setMode('distance');
}

/** X: marker A at this distance, or no marker when A is already here (within half a metre). */
export function toggleGhostMarker(state: GhostSyncState, distM: number): void {
  placeGhostMarker(state, state.markerDistM !== null && Math.abs(state.markerDistM - distM) < 0.5 ? null : distM);
}
