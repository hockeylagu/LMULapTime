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
