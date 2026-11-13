import React from 'react';
import { Pause, Play, RotateCcw, Users } from 'lucide-react';
import type { ReplayDriverEntry, ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { ReplayInspectorTitle } from './ReplayInspectorTitle.js';
import { FOCUS_RING } from '../../common/buttonStyles.js';
import { Select } from '../../common/dropdown/Select.js';

export interface ReplayHeaderPlayback {
  disabled: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRewind: () => void;
  speed: number;
  speeds: readonly number[];
  onSelectSpeed: (speed: number) => void;
}

export interface ReplayHeaderShellProps {
  onClose: () => void;
  metadata: ReplayMetadata | null;
  trajectory: ReplayTrajectoryData | null;
  /** Buttons beside the replay Info (Race, Lap view). */
  titleActions?: React.ReactNode;
  drivers: ReplayDriverEntry[];
  selectedDriverSlot: number | null;
  onSelectDriver: (slot: number) => void;
  /** The driver list or the shown lap is loading. */
  busy: boolean;
  loadingDrivers?: boolean;
  playback: ReplayHeaderPlayback;
  /** After the driver picker: the lap view's lap and comparison controls. */
  children?: React.ReactNode;
}

/** The replay header shared by the lap view and the race replay: back, track and Info; the driver; playback. */
export const ReplayHeaderShell: React.FC<ReplayHeaderShellProps> = ({
  onClose, metadata, trajectory, titleActions, drivers, selectedDriverSlot, onSelectDriver, busy, loadingDrivers = false, playback, children,
}) => {
  const selectedDriver = drivers.find(driver => driver.slot === selectedDriverSlot);
  const label = (driver: ReplayDriverEntry) => `${driver.carNumber ? `#${driver.carNumber} ` : ''}${driver.name}${driver.isPlayer ? ' (You)' : ''}`;
  const driverLabel = selectedDriver ? label(selectedDriver) : '';
  return (
    <header className="relative min-h-14 py-1.5 px-4 bg-lmu-strip border-b border-lmu-border grid grid-cols-[minmax(320px,1fr)_auto_auto] gap-6 items-center shrink-0 z-[80]">
      <ReplayInspectorTitle onClose={onClose} metadata={metadata} trajectory={trajectory} selectedDriver={selectedDriver} actions={titleActions} />

      <div className="flex items-center gap-2 justify-self-center min-w-0">
        <Select<number>
          aria-label="Select Driver"
          title={driverLabel || (loadingDrivers ? 'Loading drivers…' : 'No drivers available')}
          disabled={busy || drivers.length === 0}
          busy={busy}
          value={selectedDriverSlot}
          onChange={onSelectDriver}
          placeholder={loadingDrivers ? 'Loading drivers…' : drivers.length ? 'Select driver' : 'No drivers available'}
          icon={<Users aria-hidden="true" className="w-3.5 h-3.5 text-lmu-accent-text shrink-0" />}
          options={drivers.flatMap(driver => typeof driver.slot === 'number' ? [{ value: driver.slot, label: label(driver) }] : [])}
          className="w-[220px] shrink-0"
        />
        {children}
      </div>

      <div role="group" aria-label="Playback" className="flex items-center gap-2 justify-self-end pl-5 border-l border-lmu-border">
        <button
          onClick={playback.onRewind}
          disabled={playback.disabled}
          aria-label="Rewind to start"
          className={`p-1.5 rounded-xl bg-lmu-card hover:bg-white/10 text-lmu-muted hover:text-white border border-lmu-border transition-colors cursor-pointer disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:cursor-not-allowed disabled:hover:bg-lmu-card ${FOCUS_RING}`}
          title="Rewind to start"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={playback.onTogglePlay}
          disabled={playback.disabled}
          aria-label={playback.isPlaying ? 'Pause' : 'Play'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded bg-lmu-raised hover:bg-lmu-raised/80 text-white font-semibold text-xs transition-all cursor-pointer disabled:text-lmu-faint disabled:hover:text-lmu-faint disabled:cursor-not-allowed disabled:hover:bg-lmu-raised ${FOCUS_RING}`}
        >
          {playback.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{playback.isPlaying ? 'Pause' : 'Play'}</span>
        </button>
        <Select<number>
          aria-label="Playback speed"
          title="Playback speed: , slower, . faster"
          value={playback.speed}
          onChange={playback.onSelectSpeed}
          options={playback.speeds.map(speed => ({ value: speed, label: `${speed}×` }))}
          mono
          align="end"
        />
      </div>
    </header>
  );
};
