import { describe, expect, it, vi } from 'vitest';
import { placeGhostMarker, toggleGhostMarker, type GhostSyncState } from '../../../../src/components/replay/inspector/ghostSyncContext.js';
import type { GhostSyncMode } from '../../../../src/components/replay/map/ghostSync.js';

const state = (mode: GhostSyncMode, markerDistM: number | null): GhostSyncState =>
  ({ mode, setMode: vi.fn(), markerDistM, setMarkerDistM: vi.fn() });

describe('ghost marker A', () => {
  it('runs the ghost from a new marker and goes back to Distance when it is cleared', () => {
    const scrubbing = state('distance', null);
    placeGhostMarker(scrubbing, 420);
    expect(scrubbing.setMarkerDistM).toHaveBeenCalledWith(420);
    expect(scrubbing.setMode).toHaveBeenCalledWith('anchored');

    const fromA = state('anchored', 420);
    placeGhostMarker(fromA, null);
    expect(fromA.setMarkerDistM).toHaveBeenCalledWith(null);
    expect(fromA.setMode).toHaveBeenCalledWith('distance');

    const onTime = state('time', 420);
    placeGhostMarker(onTime, null);
    expect(onTime.setMode).not.toHaveBeenCalled();
  });

  it('moves the marker to the cursor, or clears it when the cursor is on it', () => {
    const elsewhere = state('anchored', 420);
    toggleGhostMarker(elsewhere, 600);
    expect(elsewhere.setMarkerDistM).toHaveBeenCalledWith(600);
    expect(elsewhere.setMode).not.toHaveBeenCalled();

    const onIt = state('anchored', 420);
    toggleGhostMarker(onIt, 420.2);
    expect(onIt.setMarkerDistM).toHaveBeenCalledWith(null);
    expect(onIt.setMode).toHaveBeenCalledWith('distance');
  });
});
