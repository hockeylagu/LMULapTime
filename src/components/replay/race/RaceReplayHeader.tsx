import React from 'react';
import { Flag } from 'lucide-react';
import type { RaceReplayOverview, ReplayDriverEntry, ReplayMetadata } from '../../../../shared/types/index.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { ReplayHeaderShell } from '../inspector/ReplayHeaderShell.js';
import type { RaceClock } from './raceClock.js';
import { lapAt } from './raceLaps.js';
import { MODE_SWITCH_KEY, useModeSwitchKey } from './raceModeContext.js';

interface Props {
  onClose: () => void;
  metadata: ReplayMetadata | null;
  overview?: RaceReplayOverview;
  clock?: RaceClock;
  followSlot?: number | null;
  onFollow?: (slot: number) => void;
  /** Opens a lap in the lap view, `lapSec` seconds into it (the clock's moment). */
  onOpenLap?: (driverOrdinal: number, lapOrdinal: number, lapSec: number) => void;
}

/** The lap view's header without its lap and comparison controls: the driver picker follows a car (playback is in the bar under the replay). */
export const RaceReplayHeader: React.FC<Props> = ({ onClose, metadata, overview, clock, followSlot = null, onFollow, onOpenLap }) => {
  // The replay's own entries carry each car's model for the title; the race overview lists every car either way.
  const inRace = new Set(overview?.cars.map(car => car.slot));
  const drivers: ReplayDriverEntry[] = metadata?.drivers.filter(driver => typeof driver.slot === 'number' && (!overview || inRace.has(driver.slot)))
    ?? overview?.cars ?? [];
  const followed = overview?.cars.find(car => car.slot === followSlot);
  const canOpenLap = Boolean(followed?.sessionDriverOrdinal !== undefined && followed?.sessionLapOrdinals);
  const openLap = () => {
    if (!overview || !clock || !onOpenLap) return;
    const timeSec = clock.getState().timeSec, lap = lapAt(overview, followSlot, timeSec);
    if (lap) onOpenLap(lap.driverOrdinal, lap.lapOrdinal, timeSec - lap.startSec);
  };
  useModeSwitchKey(overview && canOpenLap ? openLap : null);
  return (
    <ReplayHeaderShell
      onClose={onClose} metadata={metadata} trajectory={null}
      titleActions={overview && (
        <button type="button" onClick={openLap} disabled={!canOpenLap}
          title={canOpenLap ? `Open ${followed!.name}'s lap at this time in the lap view (${MODE_SWITCH_KEY})` : 'Select a car of this session to open its lap'}
          aria-keyshortcuts={MODE_SWITCH_KEY}
          className={`inline-flex h-8 w-[6.5rem] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-lmu-border bg-lmu-bg px-2.5 text-xs text-lmu-text-soft hover:bg-lmu-card disabled:opacity-40 ${FOCUS_RING}`}>
          <Flag aria-hidden="true" className="h-3.5 w-3.5 text-lmu-accent-text" />Lap view
        </button>
      )}
      drivers={drivers} selectedDriverSlot={followSlot} onSelectDriver={slot => onFollow?.(slot)}
      busy={!overview && !metadata} loadingDrivers={!overview && !metadata}
    />
  );
};
