import React from 'react';
import { Users } from 'lucide-react';
import type { ReplayDriverEntry, ReplayMetadata, ReplayTrajectoryData } from '../../../../shared/types/index.js';
import { ReplayInspectorTitle } from './ReplayInspectorTitle.js';
import { Select } from '../../common/dropdown/Select.js';

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
  /** After the driver picker: the lap view's lap and comparison controls. */
  children?: React.ReactNode;
}

/**
 * The replay header shared by the lap view and the race replay: back, track and Info; the driver. Playback sits with the timeline
 * it moves (the lap view's telemetry toolbar or fullscreen trace, the race's playback bar), never here.
 */
export const ReplayHeaderShell: React.FC<ReplayHeaderShellProps> = ({
  onClose, metadata, trajectory, titleActions, drivers, selectedDriverSlot, onSelectDriver, busy, loadingDrivers = false, children,
}) => {
  const selectedDriver = drivers.find(driver => driver.slot === selectedDriverSlot);
  const label = (driver: ReplayDriverEntry) => `${driver.carNumber ? `#${driver.carNumber} ` : ''}${driver.name}${driver.isPlayer ? ' (You)' : ''}`;
  const driverLabel = selectedDriver ? label(selectedDriver) : '';
  return (
    <header data-replay-header className="relative min-h-14 py-1.5 px-4 bg-lmu-strip border-b border-lmu-border grid grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] gap-4 items-center shrink-0 z-[80]">
      {/* Title, Info and the mode switch at the left, the driver at the right: both views share them in the same spots. The lap
          view's lap and compare controls take the centre, empty in the race replay. */}
      <ReplayInspectorTitle onClose={onClose} metadata={metadata} trajectory={trajectory} selectedDriver={selectedDriver} actions={titleActions} />
      <div className="flex min-w-0 items-center justify-center gap-2">{children}</div>
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
          className="w-[220px] shrink-0 justify-self-end"
        />
    </header>
  );
};
