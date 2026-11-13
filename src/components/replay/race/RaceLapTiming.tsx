import React, { useMemo, useSyncExternalStore } from 'react';
import type { RaceReplayCar, RaceReplayLap } from '../../../../shared/types/index.js';
import { formatElapsedSeconds } from '../../../../shared/domain/formatters.js';
import { GpsMapLapTimingPanel } from '../map/display/GpsMapLapTimingPanel.js';
import type { RaceClock } from './raceClock.js';
import { raceLapTimingAt } from './raceLaps.js';

interface Props {
  clock: RaceClock;
  car: RaceReplayCar | undefined;
  /** Every car's laps; the panel times the followed car's. */
  laps: RaceReplayLap[];
  /** The race's laps: the most any car ran. */
  totalLaps: number;
  className?: string;
}

/** The lap map's timing panel for the followed car: its lap so far and its sectors, the one it is in highlighted. */
export const RaceLapTiming: React.FC<Props> = ({ clock, car, laps, totalLaps, className }) => {
  // As often as the standings tower.
  const tenth = useSyncExternalStore(clock.subscribe, () => Math.floor(clock.getState().timeSec * 10));
  const own = useMemo(() => laps.filter(lap => lap.slot === car?.slot), [laps, car?.slot]);
  if (!car) return null;
  const timeSec = tenth / 10;
  const timing = raceLapTimingAt(own, timeSec);
  // The lap it is on, else the last it finished.
  const lapNumber = timing?.summary.lapNumber;
  return (
    <GpsMapLapTimingPanel primaryLapSummary={timing?.summary} liveSplit={timing?.sector ? { sector: timing.sector, deltaSec: null } : null}
      heading={<div className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs text-lmu-muted" data-testid="race-lap-heading">
        <span className="inline-flex items-baseline gap-2">Session <span className="font-mono tabular-nums font-semibold text-lmu-text">{formatElapsedSeconds(Math.max(0, timeSec - clock.startSec))}</span></span>
        <span className="inline-flex items-baseline gap-2 tabular-nums">Lap <span><span className="font-mono font-semibold text-lmu-text">{lapNumber ?? '—'}</span><span className="font-mono"> / {totalLaps || '—'}</span></span></span>
      </div>}
      className={className} />
  );
};
