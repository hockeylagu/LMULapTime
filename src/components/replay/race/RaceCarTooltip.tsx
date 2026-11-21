import React, { useMemo, useSyncExternalStore } from 'react';
import { formatTime } from '../../../../shared/domain/timing/timeFormat.js';
import { CarClassBadge } from '../../common/CarClassBadge.js';
import type { RaceClock } from './raceClock.js';
import { raceClassTone } from './raceClassTone.js';
import { raceStandingsAt, type RaceStandingsIndex } from './raceStandings.js';
import { formatRaceGap } from './RaceStandingsTower.js';

interface Props {
  index: RaceStandingsIndex;
  clock: RaceClock;
  slot: number;
}

/** A hovered car's line of the timing screen: who, place overall and in class, laps, gap and laps times. */
export const RaceCarTooltip: React.FC<Props> = ({ index, clock, slot }) => {
  // As often as the standings tower.
  const tenth = useSyncExternalStore(clock.subscribe, () => Math.floor(clock.getState().timeSec * 10));
  const row = useMemo(() => raceStandingsAt(index, tenth / 10).find(entry => entry.car.slot === slot), [index, tenth, slot]);
  if (!row) return null;
  const { car } = row;
  const gap = index.isRace ? formatRaceGap(row.gap, true) : '';
  return (
    <div role="tooltip" data-testid="race-car-tooltip"
      className="inline-block rounded-md border border-lmu-border bg-lmu-card px-2.5 py-1.5 text-xs leading-5 text-lmu-text-soft shadow-lg">
      <div className="flex items-center gap-1.5 font-semibold text-lmu-text">
        {car.carNumber && <span className={`font-mono ${raceClassTone(car.carClass).text}`}>#{car.carNumber}</span>}
        <span className="truncate">{car.name}{car.isPlayer ? ' (You)' : ''}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span>P{row.position}</span>
        {car.carClass && <><CarClassBadge carClass={car.carClass} size="xs" /><span>P{row.classPosition}</span></>}
        <span>· Lap {row.lapsDone}</span>
        {gap && <span className="font-mono">· {gap}</span>}
      </div>
      <div className="font-mono text-lmu-muted">
        Last {row.lastLapSec !== null ? formatTime(row.lastLapSec) : '--'} · Best {row.bestLapSec !== null ? formatTime(row.bestLapSec) : '--'}
      </div>
    </div>
  );
};
