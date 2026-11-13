import React, { useSyncExternalStore } from 'react';
import { Flag } from 'lucide-react';
import type { RaceReplayOverview, ReplayDriverEntry, ReplayMetadata } from '../../../../shared/types/index.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { ReplayHeaderShell } from '../inspector/ReplayHeaderShell.js';
import { RACE_SPEEDS, type RaceClock } from './raceClock.js';
import { lapAt } from './raceLaps.js';

interface Props {
  onClose: () => void;
  metadata: ReplayMetadata | null;
  overview?: RaceReplayOverview;
  clock?: RaceClock;
  followSlot?: number | null;
  onFollow?: (slot: number) => void;
  onOpenLap?: (driverOrdinal: number, lapOrdinal: number) => void;
}

const IDLE = () => () => {};
const NOT_PLAYING = () => false;
const REAL_TIME = () => 1;

/** The lap view's header without its lap and comparison controls: the driver picker follows a car; playback runs the session clock. */
export const RaceReplayHeader: React.FC<Props> = ({ onClose, metadata, overview, clock, followSlot = null, onFollow, onOpenLap }) => {
  const playing = useSyncExternalStore(clock?.subscribe ?? IDLE, clock ? () => clock.getState().playing : NOT_PLAYING);
  const speed = useSyncExternalStore(clock?.subscribe ?? IDLE, clock ? () => clock.getState().speed : REAL_TIME);
  // The replay's own entries carry each car's model for the title; the race overview lists every car either way.
  const inRace = new Set(overview?.cars.map(car => car.slot));
  const drivers: ReplayDriverEntry[] = metadata?.drivers.filter(driver => typeof driver.slot === 'number' && (!overview || inRace.has(driver.slot)))
    ?? overview?.cars ?? [];
  const followed = overview?.cars.find(car => car.slot === followSlot);
  const canOpenLap = Boolean(followed?.sessionDriverOrdinal !== undefined && followed?.sessionLapOrdinals);
  const openLap = () => {
    if (!overview || !clock || !onOpenLap) return;
    const lap = lapAt(overview, followSlot, clock.getState().timeSec);
    if (lap) onOpenLap(lap.driverOrdinal, lap.lapOrdinal);
  };
  return (
    <ReplayHeaderShell
      onClose={onClose} metadata={metadata} trajectory={null}
      titleActions={overview && (
        <button type="button" onClick={openLap} disabled={!canOpenLap}
          title={canOpenLap ? `Open ${followed!.name}'s lap at this time in the lap view` : 'Select a car of this session to open its lap'}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-lmu-border bg-lmu-bg px-2.5 text-xs text-lmu-text-soft hover:bg-lmu-card disabled:opacity-40 ${FOCUS_RING}`}>
          <Flag aria-hidden="true" className="h-3.5 w-3.5 text-lmu-accent-text" />Lap view
        </button>
      )}
      drivers={drivers} selectedDriverSlot={followSlot} onSelectDriver={slot => onFollow?.(slot)}
      busy={!overview && !metadata} loadingDrivers={!overview && !metadata}
      playback={{
        disabled: !clock, isPlaying: playing, onTogglePlay: () => clock?.setPlaying(!clock.getState().playing),
        onRewind: () => clock?.seek(clock.startSec), speed, speeds: RACE_SPEEDS, onSelectSpeed: value => clock?.setSpeed(value),
      }}
    />
  );
};
